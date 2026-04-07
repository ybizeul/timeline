import { CARD_W, CARD_H } from '../../utils/orgLayout';

const PHOTO_SIZE = 40;
const PHOTO_PAD = 10;
const TEXT_X_NO_PHOTO = 14;
const TEXT_PAD_RIGHT = 12;
const RADIUS = 10;

// Approximate average character widths per font size
const CHAR_W_12 = 6.8;  // fontSize 12, weight 600
const CHAR_W_10 = 5.8;  // fontSize 10
const CHAR_W_9  = 5.2;  // fontSize 9

export function PersonCard({ person, x, y, onClick, onDoubleClick, hasChildren, isCollapsed, onToggleCollapse, isFocused, onToggleFocus, showControls, isSelected }) {
  const hasPhoto = Boolean(person.photo);
  const textStartX = hasPhoto ? PHOTO_PAD + PHOTO_SIZE + 10 : TEXT_X_NO_PHOTO;
  const color = person.color || '#6050e0';
  const textAvailW = CARD_W - textStartX - TEXT_PAD_RIGHT;

  // Dimmed background from person color
  const bgColor = color + '18'; // ~10% opacity via hex alpha
  const borderColor = color + '55'; // ~33% opacity

  return (
    <g
      className="orgchart-card"
      transform={`translate(${x}, ${y})`}
      onClick={(e) => { e.stopPropagation(); onClick(person, e); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick && onDoubleClick(person); }}
    >
      {/* Selection highlight */}
      {isSelected && (
        <rect
          x={-3}
          y={-3}
          width={CARD_W + 6}
          height={CARD_H + 6}
          rx={RADIUS + 2}
          ry={RADIUS + 2}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeDasharray="4 3"
        />
      )}
      {/* Clip paths */}
      <defs>
        <clipPath id={`card-clip-${person.id}`}>
          <rect width={CARD_W} height={CARD_H} rx={RADIUS} ry={RADIUS} />
        </clipPath>
        {hasPhoto && (
          <clipPath id={`photo-clip-${person.id}`}>
            <circle
              cx={PHOTO_PAD + PHOTO_SIZE / 2}
              cy={CARD_H / 2}
              r={PHOTO_SIZE / 2}
            />
          </clipPath>
        )}
      </defs>

      {/* Card background */}
      <rect
        className="orgchart-card__bg"
        width={CARD_W}
        height={CARD_H}
        rx={RADIUS}
        ry={RADIUS}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={1.5}
      />

      {/* Color accent bar at top — clipped to card shape */}
      <rect
        x={0}
        y={0}
        width={CARD_W}
        height={3.5}
        fill={color}
        clipPath={`url(#card-clip-${person.id})`}
      />

      {/* Photo (clipped circle) */}
      {hasPhoto && (
        <>
          <image
            href={person.photo}
            x={PHOTO_PAD}
            y={(CARD_H - PHOTO_SIZE) / 2}
            width={PHOTO_SIZE}
            height={PHOTO_SIZE}
            clipPath={`url(#photo-clip-${person.id})`}
            preserveAspectRatio="xMidYMid meet"
          />
          {/* Photo border circle */}
          <circle
            cx={PHOTO_PAD + PHOTO_SIZE / 2}
            cy={CARD_H / 2}
            r={PHOTO_SIZE / 2}
            fill="none"
            stroke={borderColor}
            strokeWidth={1}
          />
        </>
      )}

      {/* Name */}
      <text
        x={textStartX}
        y={hasPhoto ? 28 : (person.role ? 24 : 34)}
        fill="var(--text)"
        fontSize="12"
        fontWeight="600"
        fontFamily="Inter, system-ui, sans-serif"
      >
        {truncate(`${person.firstName} ${person.lastName}`, Math.floor(textAvailW / CHAR_W_12))}
      </text>

      {/* Role */}
      {person.role && (
        <text
          x={textStartX}
          y={hasPhoto ? 44 : 40}
          fill="var(--text-muted)"
          fontSize="10"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {truncate(person.role, Math.floor(textAvailW / CHAR_W_10))}
        </text>
      )}

      {/* Company / Organization */}
      {(person.company || person.organization) && (
        <text
          x={textStartX}
          y={hasPhoto ? 58 : 55}
          fill="var(--text-dim)"
          fontSize="9"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {truncate([person.company, person.organization].filter(Boolean).join(' · '), Math.floor(textAvailW / CHAR_W_9))}
        </text>
      )}

      {/* Focus toggle — top half circle */}
      {showControls && (
      <g
        className="orgchart-card__toggle"
        onClick={(e) => { e.stopPropagation(); onToggleFocus(person.id); }}
        style={{ cursor: 'pointer' }}
      >
        <path
          d={`M ${CARD_W / 2 - 7} 0 A 7 7 0 0 1 ${CARD_W / 2 + 7} 0`}
          fill={isFocused ? '#606080' : 'var(--surface-el)'}
          stroke="#606080"
          strokeWidth={1}
        />
      </g>
      )}

      {/* Collapse toggle — bottom half circle */}
      {showControls && hasChildren && (
        <g
          className="orgchart-card__toggle"
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(person.id); }}
          style={{ cursor: 'pointer' }}
        >
          <path
            d={`M ${CARD_W / 2 - 7} ${CARD_H} A 7 7 0 0 0 ${CARD_W / 2 + 7} ${CARD_H}`}
            fill={isCollapsed ? '#606080' : 'var(--surface-el)'}
            stroke="#606080"
            strokeWidth={1}
          />
        </g>
      )}

      {/* Dashed stub line when collapsed */}
      {isCollapsed && (
        <line
          x1={CARD_W / 2}
          y1={CARD_H + 10}
          x2={CARD_W / 2}
          y2={CARD_H + 26}
          stroke="#606080"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}
