import { useState, useRef, useEffect } from 'react';
import { CARD_W, CARD_H } from '../../utils/orgLayout';

const PAD = 24;
const LABEL_FONT_SIZE = 16;
const LABEL_PAD_Y = 14;
const LABEL_INSET = 14;
// Cards in groups are pushed down by GROUP_TITLE_SPACE (20) in the layout.
// The horizontal connector runs at original minY - 50 (V_GAP/2 + GROUP_TITLE_SPACE).
// Frame top sits 12px below the connector line.
const FRAME_TOP_OFFSET = 38;

function groupBounds(group, nodePositions) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;
  for (const pid of group.personIds) {
    const n = nodePositions.get(pid);
    if (!n) continue;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + CARD_W);
    maxY = Math.max(maxY, n.y + CARD_H);
    count++;
  }
  if (count < 2) return null;
  return {
    x: minX - PAD,
    y: minY - FRAME_TOP_OFFSET,
    w: maxX - minX + PAD * 2,
    h: maxY - minY + FRAME_TOP_OFFSET + PAD,
  };
}

function GroupRect({ group, bounds, onUpdateLabel, onDelete, onGroupClick }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.label);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== group.label) {
      onUpdateLabel(group.id, trimmed);
    } else {
      setDraft(group.label);
    }
  };

  return (
    <g>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.w}
        height={bounds.h}
        rx={8}
        ry={8}
        fill={group.color || '#606080'}
        fillOpacity={0.1}
        stroke={group.color || '#606080'}
        strokeWidth={1.5}
        strokeDasharray="6 4"
        style={{ cursor: 'pointer' }}
        onDoubleClick={(e) => { e.stopPropagation(); onGroupClick(group); }}
      />
      {!editing ? (
        <text
          x={bounds.x + LABEL_INSET}
          y={bounds.y + LABEL_FONT_SIZE + LABEL_INSET - LABEL_FONT_SIZE / 2}
          fill="#808098"
          fontSize={LABEL_FONT_SIZE}
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight="700"
          style={{ cursor: 'pointer' }}
          onDoubleClick={(e) => { e.stopPropagation(); onGroupClick(group); }}
        >
          {group.label}
        </text>
      ) : (
        <foreignObject
          x={bounds.x + LABEL_INSET - 2}
          y={bounds.y + LABEL_INSET - LABEL_FONT_SIZE / 2 - 2}
          width={bounds.w - 8}
          height={LABEL_FONT_SIZE + 8}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setDraft(group.label); setEditing(false); }
            }}
            style={{
              width: '100%',
              background: 'var(--surface-el)',
              color: 'var(--text)',
              border: '1px solid #606080',
              borderRadius: 3,
              fontSize: LABEL_FONT_SIZE,
              fontFamily: 'Inter, system-ui, sans-serif',
              padding: '0 4px',
              outline: 'none',
            }}
          />
        </foreignObject>
      )}
      {/* Delete button — small × near top-right */}
      <g
        onClick={(e) => { e.stopPropagation(); onDelete(group.id); }}
        style={{ cursor: 'pointer' }}
      >
        <circle
          cx={bounds.x + bounds.w - 8}
          cy={bounds.y + LABEL_FONT_SIZE / 2 + 2}
          r={6}
          fill="var(--surface-el)"
          stroke="#606080"
          strokeWidth={0.8}
        />
        <text
          x={bounds.x + bounds.w - 8}
          y={bounds.y + LABEL_FONT_SIZE / 2 + 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#808098"
          fontSize="9"
          fontFamily="Inter, system-ui, sans-serif"
          style={{ pointerEvents: 'none' }}
        >
          ×
        </text>
      </g>
    </g>
  );
}

export function GroupOverlays({ groups, nodePositions, onUpdateLabel, onDelete, onGroupClick }) {
  return groups.map(group => {
    const bounds = groupBounds(group, nodePositions);
    if (!bounds) return null;
    return (
      <GroupRect
        key={group.id}
        group={group}
        bounds={bounds}
        onUpdateLabel={onUpdateLabel}
        onDelete={onDelete}
        onGroupClick={onGroupClick}
      />
    );
  });
}
