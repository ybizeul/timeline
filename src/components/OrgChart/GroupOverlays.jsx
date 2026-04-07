import { useState, useRef, useEffect } from 'react';
import { CARD_W, CARD_H } from '../../utils/orgLayout';

const PAD = 24;
const LABEL_FONT_SIZE = 16;
const LABEL_PAD_Y = 8;
// V_GAP/2 = 30 is where the horizontal connector runs above a child card.
// Start the frame 4px below that line.
const TOP_INSET = 2;

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
  const top = minY - TOP_INSET;
  return {
    x: minX - PAD,
    y: top - LABEL_FONT_SIZE - LABEL_PAD_Y,
    w: maxX - minX + PAD * 2,
    h: maxY - minY + TOP_INSET + PAD + LABEL_FONT_SIZE + LABEL_PAD_Y,
  };
}

function GroupRect({ group, bounds, onUpdateLabel, onDelete }) {
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
        fill="none"
        stroke="#606080"
        strokeWidth={1.5}
        strokeDasharray="6 4"
      />
      {!editing ? (
        <text
          x={bounds.x + 8}
          y={bounds.y + LABEL_FONT_SIZE}
          fill="#808098"
          fontSize={LABEL_FONT_SIZE}
          fontFamily="Inter, system-ui, sans-serif"
          fontWeight="700"
          style={{ cursor: 'pointer' }}
          onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
        >
          {group.label}
        </text>
      ) : (
        <foreignObject
          x={bounds.x + 4}
          y={bounds.y}
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

export function GroupOverlays({ groups, nodePositions, onUpdateLabel, onDelete }) {
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
      />
    );
  });
}
