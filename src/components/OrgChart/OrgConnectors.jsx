import { elbowPath } from '../../utils/orgLayout';

export function OrgConnectors({ edges, nodePositions }) {
  return (
    <g className="orgchart-connectors">
      {edges.map((edge, i) => {
        const fromNode = nodePositions.get(edge.from);
        const toNode = nodePositions.get(edge.to);
        if (!fromNode || !toNode) return null;

        return (
          <path
            key={`${edge.from}-${edge.to}-${edge.type}-${i}`}
            d={elbowPath(fromNode, toNode)}
            fill="none"
            stroke={edge.type === 'dashed' ? '#555570' : '#606080'}
            strokeWidth={edge.type === 'dashed' ? 1.2 : 1.5}
            strokeDasharray={edge.type === 'dashed' ? '6 4' : 'none'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
}
