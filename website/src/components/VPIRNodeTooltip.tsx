import React from 'react';

export interface NodeTooltipData {
  id: string;
  type: string;
  label: string;
  classification?: string;
  trustLevel?: number;
  verifiable?: boolean;
}

export interface VPIRNodeTooltipProps {
  node: NodeTooltipData;
  position: { x: number; y: number };
}

const WRAPPER_STYLE: React.CSSProperties = {
  position: 'absolute',
  zIndex: 10,
  pointerEvents: 'none',
  minWidth: 220,
  maxWidth: 320,
  padding: '10px 12px',
  borderRadius: 6,
  background: 'rgba(17, 24, 39, 0.95)',
  color: '#f3f4f6',
  font: '12px/1.4 ui-sans-serif, system-ui, sans-serif',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
};

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  margin: '2px 0',
};

const KEY_STYLE: React.CSSProperties = {
  color: '#9ca3af',
  textTransform: 'uppercase',
  fontSize: 10,
  letterSpacing: 0.4,
};

const BADGE_BASE: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
};

export function VPIRNodeTooltip({ node, position }: VPIRNodeTooltipProps) {
  const verifiableBadge: React.CSSProperties = {
    ...BADGE_BASE,
    background: node.verifiable ? '#065f46' : '#7c2d12',
    color: '#f0fdf4',
  };

  return (
    <div
      data-testid="vpir-tooltip"
      style={{ ...WRAPPER_STYLE, left: position.x + 14, top: position.y + 14 }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{node.label}</div>
      <div style={ROW_STYLE}>
        <span style={KEY_STYLE}>Type</span>
        <span>{node.type}</span>
      </div>
      {node.classification ? (
        <div style={ROW_STYLE}>
          <span style={KEY_STYLE}>Classification</span>
          <span>{node.classification}</span>
        </div>
      ) : null}
      {typeof node.trustLevel === 'number' ? (
        <div style={ROW_STYLE}>
          <span style={KEY_STYLE}>Trust level</span>
          <span>{node.trustLevel}</span>
        </div>
      ) : null}
      {typeof node.verifiable === 'boolean' ? (
        <div style={ROW_STYLE}>
          <span style={KEY_STYLE}>Verifiable</span>
          <span style={verifiableBadge}>{node.verifiable ? 'yes' : 'no'}</span>
        </div>
      ) : null}
      <div style={{ ...ROW_STYLE, opacity: 0.6, marginTop: 4 }}>
        <span style={KEY_STYLE}>id</span>
        <code style={{ fontSize: 10 }}>{node.id}</code>
      </div>
    </div>
  );
}

export default VPIRNodeTooltip;
