import React, { useEffect, useRef, useState } from 'react';

import { VPIRNodeTooltip, type NodeTooltipData } from './VPIRNodeTooltip';

// ── VPIR JSON shape (mirrors src/types/visualization.ts) ──────────────

export interface GraphPosition {
  layer: number;
  index: number;
}

export interface GraphSecurityLabel {
  owner?: string;
  trustLevel?: number;
  classification?: string;
  createdAt?: string;
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  position: GraphPosition;
  securityLabel?: GraphSecurityLabel;
  verifiable?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  dataType: string;
}

export interface GraphMetadata {
  id: string;
  name: string;
  nodeCount: number;
  edgeCount: number;
  roots: string[];
  terminals: string[];
}

export interface VPIRGraphJSON {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: GraphMetadata;
}

// ── Visual encoding constants ────────────────────────────────────────

const NODE_TYPE_FILL: Record<string, string> = {
  observation: '#3b82f6',
  inference: '#f59e0b',
  action: '#ef4444',
  assertion: '#10b981',
  composition: '#8b5cf6',
  human: '#ec4899',
};

const CLASSIFICATION_BORDER: Record<string, string> = {
  public: '#9ca3af',
  internal: '#eab308',
  confidential: '#f97316',
  restricted: '#dc2626',
  external: '#7c3aed',
};

const TRUST_LEVEL_BORDER_WIDTH: Record<number, number> = {
  0: 1,
  1: 2,
  2: 2.5,
  3: 3,
  4: 4,
};

const LAYER_SPACING = 120;
const INDEX_SPACING = 180;

const FALLBACK_FILL = '#6b7280';
const FALLBACK_BORDER = '#4b5563';

// ── Component ────────────────────────────────────────────────────────

export interface VPIRGraphViewerProps {
  graph: VPIRGraphJSON;
  height?: number;
}

interface TooltipState {
  node: NodeTooltipData;
  position: { x: number; y: number };
}

export function VPIRGraphViewer({ graph, height = 560 }: VPIRGraphViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cy: unknown = null;

    async function init() {
      if (!containerRef.current) return;

      try {
        const cytoscapeModule = await import('cytoscape');
        const cytoscape = cytoscapeModule.default ?? cytoscapeModule;

        try {
          const dagreModule = await import('cytoscape-dagre');
          const dagre = dagreModule.default ?? dagreModule;
          (cytoscape as unknown as { use: (ext: unknown) => void }).use(dagre);
        } catch {
          // dagre is a progressive enhancement — pre-computed layers
          // already place every node; fall back silently.
        }

        if (cancelled || !containerRef.current) return;

        const elements = buildElements(graph);

        cy = (cytoscape as unknown as (config: unknown) => unknown)({
          container: containerRef.current,
          elements,
          style: buildStyle(),
          layout: { name: 'preset' },
          wheelSensitivity: 0.2,
        });

        const cyHandle = cy as {
          on: (event: string, selector: string, handler: (e: unknown) => void) => void;
          fit: () => void;
        };

        cyHandle.on('mouseover', 'node', (event: unknown) => {
          const evt = event as {
            target: { data: () => GraphNode; renderedPosition: () => { x: number; y: number } };
          };
          const data = evt.target.data();
          const pos = evt.target.renderedPosition();
          setTooltip({
            node: {
              id: data.id,
              type: data.type,
              label: data.label,
              classification: data.securityLabel?.classification,
              trustLevel: data.securityLabel?.trustLevel,
              verifiable: data.verifiable,
            },
            position: pos,
          });
        });

        cyHandle.on('mouseout', 'node', () => {
          setTooltip(null);
        });

        cyHandle.fit();
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (cy && typeof (cy as { destroy?: () => void }).destroy === 'function') {
        (cy as { destroy: () => void }).destroy();
      }
    };
  }, [graph]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        ref={containerRef}
        data-testid="vpir-graph-canvas"
        style={{
          width: '100%',
          height,
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          background: '#0b1220',
        }}
      />
      {tooltip ? <VPIRNodeTooltip node={tooltip.node} position={tooltip.position} /> : null}
      {loadError ? (
        <div
          role="alert"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f87171',
            background: 'rgba(17,24,39,0.8)',
            borderRadius: 8,
          }}
        >
          Failed to load graph viewer: {loadError}
        </div>
      ) : null}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

function buildElements(graph: VPIRGraphJSON): Array<Record<string, unknown>> {
  const nodes = graph.nodes.map((node) => ({
    group: 'nodes',
    data: node,
    position: {
      x: node.position.index * INDEX_SPACING,
      y: node.position.layer * LAYER_SPACING,
    },
  }));

  const edges = graph.edges.map((edge) => ({
    group: 'edges',
    data: edge,
  }));

  return [...nodes, ...edges];
}

function buildStyle(): Array<Record<string, unknown>> {
  return [
    {
      selector: 'node',
      style: {
        'background-color': nodeFill,
        'border-color': nodeBorder,
        'border-width': nodeBorderWidth,
        'shape': nodeShape,
        'label': 'data(label)',
        'color': '#f9fafb',
        'font-size': 11,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-outline-color': '#0b1220',
        'text-outline-width': 2,
        'width': 140,
        'height': 48,
        'opacity': nodeOpacity,
      },
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': '#6b7280',
        'target-arrow-color': '#6b7280',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(dataType)',
        'color': '#cbd5f5',
        'font-size': 9,
        'text-background-color': '#0b1220',
        'text-background-opacity': 0.85,
        'text-background-padding': 2,
        'text-rotation': 'autorotate',
      },
    },
  ];
}

function nodeFill(ele: { data: (key: string) => unknown }): string {
  const type = ele.data('type');
  if (typeof type === 'string' && type in NODE_TYPE_FILL) {
    return NODE_TYPE_FILL[type];
  }
  return FALLBACK_FILL;
}

function nodeBorder(ele: { data: (key: string) => unknown }): string {
  const label = ele.data('securityLabel') as GraphSecurityLabel | undefined;
  const classification = label?.classification;
  if (classification && classification in CLASSIFICATION_BORDER) {
    return CLASSIFICATION_BORDER[classification];
  }
  return FALLBACK_BORDER;
}

function nodeBorderWidth(ele: { data: (key: string) => unknown }): number {
  const label = ele.data('securityLabel') as GraphSecurityLabel | undefined;
  const level = label?.trustLevel;
  if (typeof level === 'number' && level in TRUST_LEVEL_BORDER_WIDTH) {
    return TRUST_LEVEL_BORDER_WIDTH[level];
  }
  return 1;
}

function nodeShape(ele: { data: (key: string) => unknown }): string {
  const verifiable = ele.data('verifiable');
  return verifiable === false ? 'diamond' : 'round-rectangle';
}

function nodeOpacity(ele: { data: (key: string) => unknown }): number {
  return ele.data('verifiable') === false ? 0.6 : 1;
}

export default VPIRGraphViewer;
