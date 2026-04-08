/**
 * Org chart tree layout algorithm.
 * Top-to-bottom layout with automatic spacing.
 */

const CARD_W = 260;
const CARD_H = 80;
const H_GAP = 30;
const V_GAP = 60;
const GROUP_EXTRA_GAP = 24; // extra spacing between siblings in different groups
const STAGGER_V_GAP = 20; // vertical gap between two staggered lanes of leaf children
const GROUP_TITLE_SPACE = 20; // extra vertical space above grouped cards for group title
const GROUP_FRAME_PAD = 24; // horizontal padding of group overlay frames

export { CARD_W, CARD_H };

/**
 * Compute layout positions for all people in the org chart.
 * @param {Array} people - flat array of person objects
 * @param {string|null} focusedId - if set, only layout the subtree rooted at this person
 * @param {Set|null} collapsedIds - set of person IDs whose children should be hidden
 * @returns {{ nodes: Array<{person, x, y, hasChildren, isCollapsed}>, edges: Array<{from, to, type}>, bounds: {minX, minY, maxX, maxY} }}
 */
export function computeOrgLayout(people, focusedId = null, collapsedIds = null, groups = null) {
  if (!people || people.length === 0) {
    return { nodes: [], edges: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  }

  // Build a set of group IDs per person (a person can be in multiple groups)
  const personGroups = new Map(); // personId → Set of groupIds
  if (groups) {
    for (const g of groups) {
      for (const pid of g.personIds) {
        if (!personGroups.has(pid)) personGroups.set(pid, new Set());
        personGroups.get(pid).add(g.id);
      }
    }
  }

  // Check if two people share at least one group
  function shareGroup(idA, idB) {
    const ga = personGroups.get(idA);
    const gb = personGroups.get(idB);
    if (!ga || !gb) return false;
    for (const gid of ga) {
      if (gb.has(gid)) return true;
    }
    return false;
  }

  // Check if either person is in any group (for boundary detection)
  function eitherInGroup(idA, idB) {
    return personGroups.has(idA) || personGroups.has(idB);
  }

  // Gap between two adjacent siblings: add extra if they're in different groups
  function gapBetween(idA, idB) {
    if (eitherInGroup(idA, idB) && !shareGroup(idA, idB)) {
      return H_GAP + GROUP_EXTRA_GAP;
    }
    return H_GAP;
  }

  // Build adjacency: parentId → [childIds]
  const childrenMap = new Map();
  const personMap = new Map();
  for (const p of people) {
    personMap.set(p.id, p);
    if (!childrenMap.has(p.id)) childrenMap.set(p.id, []);
  }
  for (const p of people) {
    if (p.reportsTo && personMap.has(p.reportsTo)) {
      childrenMap.get(p.reportsTo).push(p.id);
    }
  }

  // Find roots (or focused person)
  let roots;
  if (focusedId && personMap.has(focusedId)) {
    roots = [focusedId];
  } else {
    roots = people
      .filter(p => !p.reportsTo || !personMap.has(p.reportsTo))
      .map(p => p.id);
  }

  if (roots.length === 0) {
    // Circular references — just pick the first person
    roots = [people[0].id];
  }

  // Compute subtree widths bottom-up
  // Each subtree also gets a contour: [{left, right}] per depth relative to node center.
  // This allows leaf siblings to be placed closer to subtrees (no overlap at shared depths).
  const subtreeWidth = new Map();
  const subtreeContour = new Map(); // id → [{left,right}, ...] per depth
  const subtreeContourBase = new Map(); // id → [{left,right}, ...] per depth (before group frame expansion)
  const childLayoutOffsets = new Map(); // id → number[] (child center offsets relative to parent center)
  const subtreeGroupMemberX = new Map(); // id → [{groupId, relX, relDepth}] — group members in subtree with position relative to this node
  const visited = new Set();
  const staggeredParents = new Set(); // parents whose leaf children use two-row layout

  // Merge right contour of all placed children so far, computing minimum separation
  function contourSeparation(mergedRight, childContour, gap) {
    let minSep = 0;
    const shared = Math.min(mergedRight.length, childContour.length);
    for (let d = 0; d < shared; d++) {
      const needed = mergedRight[d] + gap - childContour[d].left;
      if (needed > minSep) minSep = needed;
    }
    return minSep;
  }

  function mergeRightContour(mergedRight, childContour, offset) {
    const result = [];
    const len = Math.max(mergedRight.length, childContour.length);
    for (let d = 0; d < len; d++) {
      const mr = d < mergedRight.length ? mergedRight[d] : -Infinity;
      const cr = d < childContour.length ? childContour[d].right + offset : -Infinity;
      result.push(Math.max(mr, cr));
    }
    return result;
  }

  function computeWidth(id) {
    if (visited.has(id)) return CARD_W; // Cycle guard
    visited.add(id);
    const children = childrenMap.get(id) || [];

    // In focus mode, only include children that are in the focused subtree
    // If this node is collapsed, treat as having no children for layout
    const isCollapsed = collapsedIds && collapsedIds.has(id);
    const validChildren = isCollapsed
      ? []
      : focusedId
        ? children.filter(cid => isDescendantOf(cid, focusedId, childrenMap, personMap))
        : children;

    if (validChildren.length === 0) {
      subtreeWidth.set(id, CARD_W);
      subtreeContour.set(id, [{ left: -CARD_W / 2, right: CARD_W / 2 }]);
      subtreeContourBase.set(id, [{ left: -CARD_W / 2, right: CARD_W / 2 }]);
      // Track group membership for this leaf
      const leafGps = [];
      const leafGs = personGroups.get(id);
      if (leafGs) { for (const gid of leafGs) leafGps.push({ groupId: gid, relX: 0, relDepth: 0 }); }
      subtreeGroupMemberX.set(id, leafGps);
      return CARD_W;
    }

    // Compute all children widths first
    for (const cid of validChildren) {
      computeWidth(cid);
    }

    // Check for staggered layout: 4+ children, all are true leaves (no children of their own)
    if (validChildren.length >= 4 && validChildren.every(cid => {
      const isChildCollapsed = collapsedIds && collapsedIds.has(cid);
      if (isChildCollapsed) return true;
      const grandchildren = childrenMap.get(cid) || [];
      const validGrandchildren = focusedId
        ? grandchildren.filter(gc => isDescendantOf(gc, focusedId, childrenMap, personMap))
        : grandchildren;
      return validGrandchildren.length === 0;
    })) {
      staggeredParents.add(id);
      const pitch = CARD_W + H_GAP;
      const r1 = Math.ceil(validChildren.length / 2);
      const r2 = Math.floor(validChildren.length / 2);
      const row1Right = (r1 - 1) * pitch + CARD_W;
      const row2Right = pitch / 2 + (r2 - 1) * pitch + CARD_W;
      const w = Math.max(CARD_W, Math.max(row1Right, row2Right));
      subtreeWidth.set(id, w);
      // Conservative contour: full width at two child levels (two stagger rows)
      subtreeContour.set(id, [
        { left: -CARD_W / 2, right: CARD_W / 2 },
        { left: -w / 2, right: w / 2 },
        { left: -w / 2, right: w / 2 },
      ]);
      subtreeContourBase.set(id, [
        { left: -CARD_W / 2, right: CARD_W / 2 },
        { left: -w / 2, right: w / 2 },
        { left: -w / 2, right: w / 2 },
      ]);
      // Track group membership for staggered children
      const stagGps = [];
      const stagGs = personGroups.get(id);
      if (stagGs) { for (const gid of stagGs) stagGps.push({ groupId: gid, relX: 0, relDepth: 0 }); }
      for (let i = 0; i < validChildren.length; i++) {
        const cgs = personGroups.get(validChildren[i]);
        if (cgs) {
          let cx;
          if (i % 2 === 0) cx = (i / 2) * pitch + CARD_W / 2 - w / 2;
          else cx = pitch / 2 + Math.floor(i / 2) * pitch + CARD_W / 2 - w / 2;
          for (const gid of cgs) stagGps.push({ groupId: gid, relX: cx, relDepth: 1 });
        }
      }
      subtreeGroupMemberX.set(id, stagGps);
      return w;
    }

    // Contour-based child placement
    const offsets = [0];
    let mRight = subtreeContour.get(validChildren[0]).map(e => e.right);
    let mRightBase = subtreeContourBase.get(validChildren[0]).map(e => e.right);

    for (let i = 1; i < validChildren.length; i++) {
      const gap = gapBetween(validChildren[i - 1], validChildren[i]);
      // If siblings share a group, use base contours (without group frame expansion)
      // so same-group siblings are placed close together inside the shared frame
      const shared = shareGroup(validChildren[i - 1], validChildren[i]);
      const useRight = shared ? mRightBase : mRight;
      const cc = shared ? subtreeContourBase.get(validChildren[i]) : subtreeContour.get(validChildren[i]);
      const sep = contourSeparation(useRight, cc, gap);
      offsets.push(sep);
      mRight = mergeRightContour(mRight, subtreeContour.get(validChildren[i]), sep);
      mRightBase = mergeRightContour(mRightBase, subtreeContourBase.get(validChildren[i]), sep);
    }

    // Center children: midpoint of first and last child at 0
    const center = (offsets[0] + offsets[offsets.length - 1]) / 2;
    for (let i = 0; i < offsets.length; i++) offsets[i] -= center;

    // Build group member position tracking (merge children's data + self)
    const gps = [];
    const selfGs = personGroups.get(id);
    if (selfGs) { for (const gid of selfGs) gps.push({ groupId: gid, relX: 0, relDepth: 0 }); }
    for (let i = 0; i < validChildren.length; i++) {
      const cps = subtreeGroupMemberX.get(validChildren[i]) || [];
      for (const cp of cps) gps.push({ groupId: cp.groupId, relX: cp.relX + offsets[i], relDepth: cp.relDepth + 1 });
    }
    subtreeGroupMemberX.set(id, gps);

    // Build merged child contour
    const mergedChildLevels = [];
    for (let i = 0; i < validChildren.length; i++) {
      const cc = subtreeContour.get(validChildren[i]);
      for (let d = 0; d < cc.length; d++) {
        const l = cc[d].left + offsets[i];
        const r = cc[d].right + offsets[i];
        if (d >= mergedChildLevels.length) {
          mergedChildLevels.push({ left: l, right: r });
        } else {
          mergedChildLevels[d] = {
            left: Math.min(mergedChildLevels[d].left, l),
            right: Math.max(mergedChildLevels[d].right, r),
          };
        }
      }
    }

    // This node's contour: depth 0 is itself, depth 1+ are children's merged contour
    const contour = [{ left: -CARD_W / 2, right: CARD_W / 2 }];
    for (const entry of mergedChildLevels) contour.push(entry);

    // Save base contour before group frame expansion
    const baseContour = contour.map(c => ({ ...c }));

    // Expand contour only at depth levels where the group frame actually exists.
    // Uses subtreeGroupMemberX to find ALL group members in this subtree
    // (including the node itself and deep descendants), not just direct children.
    if (gps.length > 0) {
      const byGroup = new Map();
      for (const p of gps) {
        if (!byGroup.has(p.groupId)) byGroup.set(p.groupId, []);
        byGroup.get(p.groupId).push(p);
      }
      for (const [, members] of byGroup) {
        if (members.length < 2) continue;
        let minX = Infinity, maxX = -Infinity;
        let minDepth = Infinity, maxDepth = -Infinity;
        for (const m of members) {
          minX = Math.min(minX, m.relX);
          maxX = Math.max(maxX, m.relX);
          minDepth = Math.min(minDepth, m.relDepth);
          maxDepth = Math.max(maxDepth, m.relDepth);
        }
        const frameLeft = minX - CARD_W / 2 - GROUP_FRAME_PAD;
        const frameRight = maxX + CARD_W / 2 + GROUP_FRAME_PAD;
        // Only expand contour at depths the group frame spans
        for (let d = minDepth; d <= maxDepth && d < contour.length; d++) {
          contour[d] = {
            left: Math.min(contour[d].left, frameLeft),
            right: Math.max(contour[d].right, frameRight),
          };
        }
      }
    }

    subtreeContour.set(id, contour);
    subtreeContourBase.set(id, baseContour);

    // subtreeWidth: max extent at any depth
    let maxLeft = CARD_W / 2, maxRight = CARD_W / 2;
    for (const entry of contour) {
      maxLeft = Math.max(maxLeft, -entry.left);
      maxRight = Math.max(maxRight, entry.right);
    }
    subtreeWidth.set(id, maxLeft + maxRight);
    childLayoutOffsets.set(id, offsets);
    return maxLeft + maxRight;
  }

  // Check if childId is in the subtree rooted at rootId
  function isDescendantOf(childId, rootId, childrenMap) {
    if (childId === rootId) return true;
    const stack = [rootId];
    const seen = new Set();
    while (stack.length > 0) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const ch = childrenMap.get(id) || [];
      for (const c of ch) {
        if (c === childId) return true;
        stack.push(c);
      }
    }
    return false;
  }

  // Compute widths for all roots
  for (let i = 0; i < roots.length; i++) {
    computeWidth(roots[i]);
  }

  // Determine which groups are actually visible (≥2 members positioned)
  const visibleGroupIds = new Set();
  if (groups) {
    for (const g of groups) {
      let count = 0;
      for (const pid of g.personIds) {
        if (visited.has(pid)) count++;
        if (count >= 2) { visibleGroupIds.add(g.id); break; }
      }
    }
  }

  // Check if a person is in at least one visible group
  function inVisibleGroup(pid) {
    const gs = personGroups.get(pid);
    if (!gs) return false;
    for (const gid of gs) {
      if (visibleGroupIds.has(gid)) return true;
    }
    return false;
  }

  // Position nodes top-down
  const nodes = [];
  const nodePositions = new Map(); // id → {x, y}

  function positionSubtree(id, cx, y) {
    const allChildren = childrenMap.get(id) || [];
    const hasChildren = allChildren.length > 0;
    const isCollapsed = collapsedIds && collapsedIds.has(id) && hasChildren;
    nodes.push({ person: personMap.get(id), x: cx - CARD_W / 2, y, hasChildren, isCollapsed });
    nodePositions.set(id, { x: cx, y: y + CARD_H / 2 }); // center for edge drawing

    const children = childrenMap.get(id) || [];
    const validChildren = isCollapsed
      ? []
      : focusedId
        ? children.filter(cid => isDescendantOf(cid, focusedId, childrenMap, personMap))
        : children;
    if (validChildren.length === 0) return;

    const childY = y + CARD_H + V_GAP;

    // Staggered two-row brick layout for leaf children
    if (staggeredParents.has(id)) {
      const row1 = validChildren.filter((_, i) => i % 2 === 0); // even indices
      const row2 = validChildren.filter((_, i) => i % 2 === 1); // odd indices
      const pitch = CARD_W + H_GAP;
      const totalW = subtreeWidth.get(id);
      const leftEdge = cx - totalW / 2;
      const childY2 = childY + CARD_H + STAGGER_V_GAP;

      // Row 1: cards at leftEdge, leftEdge+pitch, leftEdge+2*pitch, ...
      for (let i = 0; i < row1.length; i++) {
        const childCx = leftEdge + CARD_W / 2 + i * pitch;
        const gOff = inVisibleGroup(row1[i]) ? GROUP_TITLE_SPACE : 0;
        positionSubtree(row1[i], childCx, childY + gOff);
      }

      // Row 2: offset by half a pitch so cards sit between row 1 cards
      for (let i = 0; i < row2.length; i++) {
        const childCx = leftEdge + pitch / 2 + CARD_W / 2 + i * pitch;
        const gOff = inVisibleGroup(row2[i]) ? GROUP_TITLE_SPACE : 0;
        positionSubtree(row2[i], childCx, childY2 + gOff);
      }
      return;
    }

    // Normal single-row layout — use pre-computed contour offsets
    const offsets = childLayoutOffsets.get(id);
    if (offsets) {
      for (let i = 0; i < validChildren.length; i++) {
        const childCx = cx + offsets[i];
        const gOff = inVisibleGroup(validChildren[i]) ? GROUP_TITLE_SPACE : 0;
        positionSubtree(validChildren[i], childCx, childY + gOff);
      }
    }
  }

  // Position all roots side by side using contour merging
  if (roots.length === 1) {
    positionSubtree(roots[0], 0, 0);
  } else {
    const rootOffsets = [0];
    let mRight = subtreeContour.get(roots[0]).map(e => e.right);
    let mRightBase = subtreeContourBase.get(roots[0]).map(e => e.right);
    for (let i = 1; i < roots.length; i++) {
      const gap = gapBetween(roots[i - 1], roots[i]);
      const shared = shareGroup(roots[i - 1], roots[i]);
      const useRight = shared ? mRightBase : mRight;
      const rc = shared ? subtreeContourBase.get(roots[i]) : subtreeContour.get(roots[i]);
      const sep = contourSeparation(useRight, rc, gap);
      rootOffsets.push(sep);
      mRight = mergeRightContour(mRight, subtreeContour.get(roots[i]), sep);
      mRightBase = mergeRightContour(mRightBase, subtreeContourBase.get(roots[i]), sep);
    }
    const rootCenter = (rootOffsets[0] + rootOffsets[rootOffsets.length - 1]) / 2;
    for (let i = 0; i < roots.length; i++) {
      positionSubtree(roots[i], rootOffsets[i] - rootCenter, 0);
    }
  }

  // Build edges
  const edges = [];
  const positionedIds = new Set(nodes.map(n => n.person.id));

  for (const person of people) {
    if (!positionedIds.has(person.id)) continue;

    // Direct report edge
    if (person.reportsTo && positionedIds.has(person.reportsTo)) {
      edges.push({ from: person.reportsTo, to: person.id, type: 'solid' });
    }

    // Dotted report edge
    if (person.dottedReportsTo && positionedIds.has(person.dottedReportsTo)) {
      edges.push({ from: person.dottedReportsTo, to: person.id, type: 'dashed' });
    }
  }

  // Compute bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + CARD_W);
    maxY = Math.max(maxY, n.y + CARD_H);
  }

  if (nodes.length === 0) {
    minX = minY = maxX = maxY = 0;
  }

  return { nodes, edges, bounds: { minX, minY, maxX, maxY } };
}

/**
 * Generate an elbow connector path between parent and child cards.
 * @param {Object} parentNode - {x, y} of parent card (top-left)
 * @param {Object} childNode - {x, y} of child card (top-left)
 * @returns {string} SVG path d attribute
 */
export function elbowPath(parentNode, childNode) {
  const x1 = parentNode.x + CARD_W / 2;
  const y1 = parentNode.y + CARD_H + 1;
  const x2 = childNode.x + CARD_W / 2;
  const y2 = childNode.y - 1;
  const midY = y1 + V_GAP / 2;

  // Radius for rounded corners at bends
  const r = Math.min(12, Math.abs(x2 - x1) / 2, V_GAP / 4);

  if (x1 === x2) {
    // Straight vertical line, no bends needed
    return `M ${x1} ${y1} L ${x1} ${y2}`;
  }

  const dir = x2 > x1 ? 1 : -1; // horizontal direction

  // Path: down from parent → round bend → horizontal → round bend → down to child
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${midY - r}`,
    `Q ${x1} ${midY} ${x1 + dir * r} ${midY}`,
    `L ${x2 - dir * r} ${midY}`,
    `Q ${x2} ${midY} ${x2} ${midY + r}`,
    `L ${x2} ${y2}`,
  ].join(' ');
}
