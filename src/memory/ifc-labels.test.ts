import { InMemoryMemoryService } from './memory-service.js';
import type { MemoryEntry } from '../types/memory.js';
import type { SecurityLabel } from '../types/ifc.js';
import { canFlowTo, joinLabels, createLabel } from '../types/ifc.js';

function makeEntry(label?: SecurityLabel): MemoryEntry {
  return {
    type: 'semantic',
    content: 'test content about TypeScript',
    metadata: {
      source: 'test',
      confidence: 0.9,
      topics: ['test'],
      entities: [],
      timestamp: new Date().toISOString(),
      label,
    },
  };
}

describe('IFC Label Lattice', () => {
  describe('canFlowTo', () => {
    it('should allow flow from low to high trust', () => {
      const low = createLabel('agent-a', 1, 'public');
      const high = createLabel('agent-b', 3, 'confidential');
      expect(canFlowTo(low, high)).toBe(true);
    });

    it('should deny flow from high to low trust', () => {
      const high = createLabel('agent-a', 3, 'confidential');
      const low = createLabel('agent-b', 1, 'public');
      expect(canFlowTo(high, low)).toBe(false);
    });

    it('should allow flow at same level', () => {
      const a = createLabel('agent-a', 2, 'internal');
      const b = createLabel('agent-b', 2, 'internal');
      expect(canFlowTo(a, b)).toBe(true);
    });

    it('should deny when trust matches but classification is higher', () => {
      const a = createLabel('agent-a', 2, 'confidential');
      const b = createLabel('agent-b', 2, 'public');
      expect(canFlowTo(a, b)).toBe(false);
    });

    it('should allow when trust is higher but classification matches', () => {
      const a = createLabel('agent-a', 1, 'internal');
      const b = createLabel('agent-b', 3, 'internal');
      expect(canFlowTo(a, b)).toBe(true);
    });
  });

  describe('joinLabels', () => {
    it('should compute the least upper bound', () => {
      const a = createLabel('agent-a', 1, 'public');
      const b = createLabel('agent-b', 3, 'confidential');
      const joined = joinLabels(a, b);

      expect(joined.trustLevel).toBe(3);
      expect(joined.classification).toBe('confidential');
    });

    it('should return same level for identical labels', () => {
      const a = createLabel('agent-a', 2, 'internal');
      const b = createLabel('agent-b', 2, 'internal');
      const joined = joinLabels(a, b);

      expect(joined.trustLevel).toBe(2);
      expect(joined.classification).toBe('internal');
    });
  });

  // Sprint 17 / M6 — provenance-join rule for human-in-the-loop responses.
  describe('HITL provenance join', () => {
    it('trust-4-launders-trust-0 is rejected when flowing into a low-trust sink', () => {
      // Sprint 17 responseLabel = joinLabels(humanLabel@4, inputJoin)
      const humanLabel = createLabel('operator', 4, 'internal');
      const inputJoin = createLabel('agent-a', 0, 'public');
      const responseLabel = joinLabels(humanLabel, inputJoin);

      // The human attestation does not erase the trust ceiling: the
      // responseLabel carries the human trust level, so a downstream
      // trust-0 sink cannot consume it (high-to-low flow is blocked).
      const lowSink = createLabel('public-log', 0, 'public');
      expect(canFlowTo(responseLabel, lowSink)).toBe(false);
    });

    it('preserves classification ceiling through the join', () => {
      const humanLabel = createLabel('operator', 4, 'internal');
      const confidentialInput = createLabel('agent-a', 2, 'confidential');

      const responseLabel = joinLabels(humanLabel, confidentialInput);
      expect(responseLabel.classification).toBe('confidential');
      expect(responseLabel.trustLevel).toBe(4);
    });
  });
});

describe('MemoryService IFC Enforcement', () => {
  let service: InMemoryMemoryService;

  beforeEach(() => {
    service = new InMemoryMemoryService();
  });

  it('should return all results when no requester label is specified', async () => {
    const highLabel = createLabel('admin', 4, 'restricted');
    const lowLabel = createLabel('observer', 0, 'public');

    await service.store(makeEntry(highLabel));
    await service.store(makeEntry(lowLabel));

    const results = await service.query({ text: 'test' });
    expect(results.length).toBe(2);
  });

  it('should filter out high-trust data from low-trust requester', async () => {
    const highLabel = createLabel('admin', 4, 'restricted');
    const lowLabel = createLabel('observer', 0, 'public');

    await service.store(makeEntry(highLabel));
    await service.store(makeEntry(lowLabel));

    const requesterLabel = createLabel('requester', 1, 'public');
    const results = await service.query({ text: 'test', requesterLabel });

    // Only the low-trust entry should be returned
    expect(results.length).toBe(1);
    expect(results[0].entry.metadata.label?.trustLevel).toBe(0);
  });

  it('should return all results when requester has sufficient trust', async () => {
    const midLabel = createLabel('agent-a', 2, 'internal');
    const lowLabel = createLabel('agent-b', 1, 'public');

    await service.store(makeEntry(midLabel));
    await service.store(makeEntry(lowLabel));

    const requesterLabel = createLabel('requester', 3, 'confidential');
    const results = await service.query({ text: 'test', requesterLabel });

    expect(results.length).toBe(2);
  });

  it('should skip IFC check when entry has no label', async () => {
    await service.store(makeEntry()); // no label

    const requesterLabel = createLabel('requester', 0, 'public');
    const results = await service.query({ text: 'test', requesterLabel });

    // Entry without label should pass through (no restriction)
    expect(results.length).toBe(1);
  });

  it('should prevent confused deputy attack via shared memory', async () => {
    // Scenario: Agent with trust 1 stores data. Agent with trust 4 stores
    // sensitive data. A trust-1 agent should NOT be able to read the trust-4 data.
    const lowTrust = createLabel('untrusted-agent', 1, 'internal');
    const highTrust = createLabel('trusted-agent', 4, 'restricted');

    await service.store({
      type: 'semantic',
      content: 'public info about project',
      metadata: {
        source: 'untrusted-agent',
        confidence: 0.5,
        topics: ['project'],
        entities: [],
        timestamp: new Date().toISOString(),
        label: lowTrust,
      },
    });

    await service.store({
      type: 'semantic',
      content: 'secret credentials for project',
      metadata: {
        source: 'trusted-agent',
        confidence: 1.0,
        topics: ['project'],
        entities: [],
        timestamp: new Date().toISOString(),
        label: highTrust,
      },
    });

    // The untrusted agent queries for "project" — should only get public info
    const results = await service.query({
      text: 'project',
      requesterLabel: createLabel('untrusted-agent', 1, 'internal'),
    });

    expect(results.length).toBe(1);
    expect(results[0].entry.content).toBe('public info about project');
  });
});
