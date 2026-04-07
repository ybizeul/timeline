import { computeOrgLayout, elbowPath, CARD_W, CARD_H } from './orgLayout';

const PADDING = 40;
const RADIUS = 10;
const PHOTO_SIZE = 40;
const PHOTO_PAD = 10;
const TEXT_X_NO_PHOTO = 14;
const TEXT_PAD_RIGHT = 12;
const CHAR_W_12 = 6.8;
const CHAR_W_10 = 5.8;
const CHAR_W_9 = 5.2;
const FONT_FAMILY = 'Inter, system-ui, -apple-system, sans-serif';

function resolveVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getColors() {
  return {
    bg: resolveVar('--bg'),
    text: resolveVar('--text'),
    textMuted: resolveVar('--text-muted'),
    textDim: resolveVar('--text-dim'),
  };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function renderCardSvg(person, x, y, colors) {
  const hasPhoto = Boolean(person.photo);
  const textStartX = hasPhoto ? PHOTO_PAD + PHOTO_SIZE + 10 : TEXT_X_NO_PHOTO;
  const color = person.color || '#6050e0';
  const textAvailW = CARD_W - textStartX - TEXT_PAD_RIGHT;
  // Use rgba() instead of hex alpha for PowerPoint compatibility
  const bgColor = hexToRgba(color, 0.094);
  const borderColor = hexToRgba(color, 0.333);

  let svg = `<g transform="translate(${x}, ${y})">`;

  // Clip path for accent bar
  svg += `<defs>`;
  svg += `<clipPath id="card-clip-${esc(person.id)}"><rect width="${CARD_W}" height="${CARD_H}" rx="${RADIUS}" ry="${RADIUS}"/></clipPath>`;
  if (hasPhoto) {
    // Use pattern fill for Office compatibility (clip-path on <image> is poorly supported)
    const photoCx = PHOTO_PAD + PHOTO_SIZE / 2;
    const photoCy = CARD_H / 2;
    const photoR = PHOTO_SIZE / 2;
    svg += `<pattern id="photo-pat-${esc(person.id)}" patternUnits="objectBoundingBox" width="1" height="1">`;
    svg += `<image xlink:href="${person.photo}" width="${PHOTO_SIZE}" height="${PHOTO_SIZE}" preserveAspectRatio="xMidYMid meet"/>`;
    svg += `</pattern>`;
  }
  svg += `</defs>`;

  // Card background
  svg += `<rect width="${CARD_W}" height="${CARD_H}" rx="${RADIUS}" ry="${RADIUS}" fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5"/>`;

  // Top accent bar
  svg += `<rect x="0" y="0" width="${CARD_W}" height="3.5" fill="${esc(color)}" clip-path="url(#card-clip-${esc(person.id)})"/>`;

  // Photo — circle filled with pattern for Office compatibility
  if (hasPhoto) {
    const photoCx = PHOTO_PAD + PHOTO_SIZE / 2;
    const photoCy = CARD_H / 2;
    const photoR = PHOTO_SIZE / 2;
    svg += `<circle cx="${photoCx}" cy="${photoCy}" r="${photoR}" fill="url(#photo-pat-${esc(person.id)})"/>`;
    svg += `<circle cx="${photoCx}" cy="${photoCy}" r="${photoR}" fill="none" stroke="${borderColor}" stroke-width="1"/>`;
  }

  // Name
  const nameY = hasPhoto ? 28 : (person.role ? 24 : 34);
  const nameMaxChars = Math.floor(textAvailW / CHAR_W_12);
  svg += `<text x="${textStartX}" y="${nameY}" fill="${esc(colors.text)}" font-size="12" font-weight="600" font-family="${FONT_FAMILY}">${esc(truncate(`${person.firstName} ${person.lastName}`, nameMaxChars))}</text>`;

  // Role — clip to available width for proper ellipsis
  if (person.role) {
    const roleY = hasPhoto ? 44 : 40;
    const roleMaxChars = Math.floor(textAvailW / CHAR_W_10);
    const roleClipId = `role-clip-${esc(person.id)}`;
    svg += `<defs><clipPath id="${roleClipId}"><rect x="${textStartX}" y="${roleY - 11}" width="${textAvailW}" height="14"/></clipPath></defs>`;
    svg += `<text x="${textStartX}" y="${roleY}" fill="${esc(colors.textMuted)}" font-size="10" font-family="${FONT_FAMILY}" clip-path="url(#${roleClipId})">${esc(truncate(person.role, roleMaxChars))}</text>`;
  }

  // Company / Organization
  const orgLine = [person.company, person.organization].filter(Boolean).join(' · ');
  if (orgLine) {
    const orgY = hasPhoto ? 58 : 55;
    const orgMaxChars = Math.floor(textAvailW / CHAR_W_9);
    svg += `<text x="${textStartX}" y="${orgY}" fill="${esc(colors.textDim)}" font-size="9" font-family="${FONT_FAMILY}">${esc(truncate(orgLine, orgMaxChars))}</text>`;
  }

  svg += `</g>`;
  return svg;
}

function renderEdgeSvg(edge, nodePositions, colors) {
  const fromNode = nodePositions.get(edge.from);
  const toNode = nodePositions.get(edge.to);
  if (!fromNode || !toNode) return '';

  const d = elbowPath(fromNode, toNode);
  const isDashed = edge.type === 'dashed';
  const sw = isDashed ? 1.2 : 1.5;
  const dash = isDashed ? ' stroke-dasharray="6 4"' : '';
  const color = isDashed ? '#555570' : '#606080';

  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}"${dash} stroke-linecap="round" stroke-linejoin="round"/>`;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').trim() || 'orgchart';
}

function buildOrgChartSvgString(people, focusedPersonId, collapsedIds, groups) {
  const colors = getColors();
  const layout = computeOrgLayout(people, focusedPersonId, collapsedIds, groups);
  const { nodes, edges, bounds } = layout;

  if (nodes.length === 0) return null;

  const nodePositions = new Map();
  for (const n of nodes) {
    nodePositions.set(n.person.id, n);
  }

  // Expand bounds to include group extents
  let expMinX = bounds.minX, expMinY = bounds.minY, expMaxX = bounds.maxX, expMaxY = bounds.maxY;
  if (groups && groups.length > 0) {
    const GP = 24, GFTO = 38;
    for (const group of groups) {
      let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
      let cnt = 0;
      for (const pid of group.personIds) {
        const n = nodePositions.get(pid);
        if (!n) continue;
        gMinX = Math.min(gMinX, n.x);
        gMinY = Math.min(gMinY, n.y);
        gMaxX = Math.max(gMaxX, n.x + CARD_W);
        gMaxY = Math.max(gMaxY, n.y + CARD_H);
        cnt++;
      }
      if (cnt < 2) continue;
      expMinX = Math.min(expMinX, gMinX - GP);
      expMinY = Math.min(expMinY, gMinY - GFTO);
      expMaxX = Math.max(expMaxX, gMaxX + GP);
      expMaxY = Math.max(expMaxY, gMaxY + GP);
    }
  }

  const svgW = expMaxX - expMinX + PADDING * 2;
  const svgH = expMaxY - expMinY + PADDING * 2;
  const offsetX = -expMinX + PADDING;
  const offsetY = -expMinY + PADDING;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${svgW}pt" height="${svgH}pt" viewBox="0 0 ${svgW} ${svgH}">`;
  svg += `<style>text { font-family: ${FONT_FAMILY}; }</style>`;
  svg += `<rect width="${svgW}" height="${svgH}" fill="${esc(colors.bg)}"/>`;
  svg += `<g transform="translate(${offsetX}, ${offsetY})">`;

  // Group overlays
  if (groups && groups.length > 0) {
    const GP = 24, GFS = 16, GFTO = 38, GLI = 14;
    for (const group of groups) {
      let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
      let cnt = 0;
      for (const pid of group.personIds) {
        const n = nodePositions.get(pid);
        if (!n) continue;
        gMinX = Math.min(gMinX, n.x);
        gMinY = Math.min(gMinY, n.y);
        gMaxX = Math.max(gMaxX, n.x + CARD_W);
        gMaxY = Math.max(gMaxY, n.y + CARD_H);
        cnt++;
      }
      if (cnt < 2) continue;
      const gx = gMinX - GP;
      const gy = gMinY - GFTO;
      const gw = gMaxX - gMinX + GP * 2;
      const gh = gMaxY - gMinY + GFTO + GP;
      svg += `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="8" ry="8" fill="none" stroke="#606080" stroke-width="1.5" stroke-dasharray="6 4"/>`;
      svg += `<text x="${gx + GLI}" y="${gy + GFS + GLI - GFS / 2}" fill="#808098" font-size="${GFS}" font-weight="700" font-family="${FONT_FAMILY}">${esc(group.label)}</text>`;
    }
  }

  for (const edge of edges) {
    svg += renderEdgeSvg(edge, nodePositions, colors);
  }
  for (const n of nodes) {
    svg += renderCardSvg(n.person, n.x, n.y, colors);
    // Collapsed stub: dashed line hint
    if (n.isCollapsed) {
      const cx = n.x + CARD_W / 2;
      const stubY = n.y + CARD_H + 10;
      svg += `<line x1="${cx}" y1="${stubY}" x2="${cx}" y2="${stubY + 16}" stroke="#606080" stroke-width="1.5" stroke-dasharray="4 3" stroke-linecap="round"/>`;
    }
  }

  svg += `</g>`;
  svg += `</svg>`;

  return { svg, svgW, svgH };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportOrgChartSvg({ people, chartName, focusedPersonId, collapsedIds, groups }) {
  if (!people.length) return;

  const result = buildOrgChartSvgString(people, focusedPersonId, collapsedIds, groups);
  if (!result) return;

  const blob = new Blob([result.svg], { type: 'image/svg+xml' });
  downloadBlob(blob, `${sanitizeFilename(chartName)}.svg`);
}

export function exportOrgChartPng({ people, chartName, focusedPersonId, collapsedIds, groups, scale = 2 }) {
  if (!people.length) return;

  const result = buildOrgChartSvgString(people, focusedPersonId, collapsedIds, groups);
  if (!result) return;

  const { svg, svgW, svgH } = result;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(svgW * scale);
  canvas.height = Math.round(svgH * scale);
  const ctx = canvas.getContext('2d');

  const img = new Image();
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  img.onload = () => {
    URL.revokeObjectURL(url);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((pngBlob) => {
      if (pngBlob) {
        downloadBlob(pngBlob, `${sanitizeFilename(chartName)}.png`);
      }
    }, 'image/png');
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
  };

  img.src = url;
}
