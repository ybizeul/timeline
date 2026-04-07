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
  const subtreeWidth = new Map();
  const visited = new Set();
  const staggeredParents = new Set(); // parents whose leaf children use two-row layout

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
      return CARD_W;
    }

    // Compute all children widths first
    for (const cid of validChildren) {
      computeWidth(cid);
    }

    // Check for staggered layout: 4+ children, all are leaves (subtreeWidth === CARD_W)
    if (validChildren.length >= 4 && validChildren.every(cid => subtreeWidth.get(cid) === CARD_W)) {
      staggeredParents.add(id);
      const pitch = CARD_W + H_GAP;
      const r1 = Math.ceil(validChildren.length / 2);
      const r2 = Math.floor(validChildren.length / 2);
      const row1Right = (r1 - 1) * pitch + CARD_W;
      const row2Right = pitch / 2 + (r2 - 1) * pitch + CARD_W;
      const w = Math.max(CARD_W, Math.max(row1Right, row2Right));
      subtreeWidth.set(id, w);
      return w;
    }

    let totalW = 0;
    for (let i = 0; i < validChildren.length; i++) {
      if (i > 0) totalW += gapBetween(validChildren[i - 1], validChildren[i]);
      totalW += subtreeWidth.get(validChildren[i]);
    }
    const w = Math.max(CARD_W, totalW);
    subtreeWidth.set(id, w);
    return w;
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
  let totalRootsWidth = 0;
  for (let i = 0; i < roots.length; i++) {
    if (i > 0) totalRootsWidth += gapBetween(roots[i - 1], roots[i]);
    totalRootsWidth += computeWidth(roots[i]);
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
        const gOff = personGroups.has(row1[i]) ? GROUP_TITLE_SPACE : 0;
        positionSubtree(row1[i], childCx, childY + gOff);
      }

      // Row 2: offset by half a pitch so cards sit between row 1 cards
      for (let i = 0; i < row2.length; i++) {
        const childCx = leftEdge + pitch / 2 + CARD_W / 2 + i * pitch;
        const gOff = personGroups.has(row2[i]) ? GROUP_TITLE_SPACE : 0;
        positionSubtree(row2[i], childCx, childY2 + gOff);
      }
      return;
    }

    // Normal single-row layout
    // Compute total children width
    let totalChildW = 0;
    for (let i = 0; i < validChildren.length; i++) {
      if (i > 0) totalChildW += gapBetween(validChildren[i - 1], validChildren[i]);
      totalChildW += subtreeWidth.get(validChildren[i]);
    }

    let startX = cx - totalChildW / 2;

    for (let i = 0; i < validChildren.length; i++) {
      const childId = validChildren[i];
      const childW = subtreeWidth.get(childId);
      const childCx = startX + childW / 2;
      const gOff = personGroups.has(childId) ? GROUP_TITLE_SPACE : 0;
      positionSubtree(childId, childCx, childY + gOff);
      startX += childW;
      if (i < validChildren.length - 1) {
        startX += gapBetween(childId, validChildren[i + 1]);
      }
    }
  }

  // Position all roots side by side
  let startX = -totalRootsWidth / 2;
  for (let i = 0; i < roots.length; i++) {
    const rootId = roots[i];
    const rootW = subtreeWidth.get(rootId);
    const cx = startX + rootW / 2;
    positionSubtree(rootId, cx, 0);
    startX += rootW;
    if (i < roots.length - 1) {
      startX += gapBetween(rootId, roots[i + 1]);
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
