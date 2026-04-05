import {
  DPNSupervisor,
  PriorityMailbox,
} from './dpn-supervisor.js';
import type {
  ChildSpec,
} from './dpn-supervisor.js';
import type {
  ProcessDefinition,
} from '../types/channel.js';

function makeDefinition(id: string): ProcessDefinition {
  return {
    id,
    name: `process-${id}`,
    inputs: [],
    outputs: [],
  };
}

function makeSuccessSpec(id: string, delayMs: number = 10): ChildSpec {
  return {
    definition: makeDefinition(id),
    behavior: async () => {
      await new Promise((r) => setTimeout(r, delayMs));
    },
  };
}

function makeFailSpec(id: string): ChildSpec {
  return {
    definition: makeDefinition(id),
    behavior: async () => {
      throw new Error(`Process ${id} failed`);
    },
  };
}

let failCount = 0;

function makeFailThenSucceedSpec(id: string, failTimes: number): ChildSpec {
  failCount = 0;
  return {
    definition: makeDefinition(id),
    behavior: async () => {
      failCount++;
      if (failCount <= failTimes) {
        throw new Error(`Process ${id} failed (attempt ${failCount})`);
      }
      await new Promise((r) => setTimeout(r, 10));
    },
  };
}

describe('PriorityMailbox', () => {
  let mailbox: PriorityMailbox<string>;

  beforeEach(() => {
    mailbox = new PriorityMailbox();
  });

  it('should start empty', () => {
    expect(mailbox.isEmpty).toBe(true);
    expect(mailbox.size).toBe(0);
    expect(mailbox.dequeue()).toBeUndefined();
  });

  it('should enqueue and dequeue messages', () => {
    mailbox.enqueue({ priority: 'normal', payload: 'hello', timestamp: Date.now() });
    expect(mailbox.size).toBe(1);
    const msg = mailbox.dequeue();
    expect(msg?.payload).toBe('hello');
    expect(mailbox.isEmpty).toBe(true);
  });

  it('should dequeue high priority first', () => {
    mailbox.enqueue({ priority: 'low', payload: 'low-1', timestamp: 1 });
    mailbox.enqueue({ priority: 'normal', payload: 'normal-1', timestamp: 2 });
    mailbox.enqueue({ priority: 'high', payload: 'high-1', timestamp: 3 });
    mailbox.enqueue({ priority: 'normal', payload: 'normal-2', timestamp: 4 });

    expect(mailbox.dequeue()?.payload).toBe('high-1');
    expect(mailbox.dequeue()?.payload).toBe('normal-1');
    expect(mailbox.dequeue()?.payload).toBe('normal-2');
    expect(mailbox.dequeue()?.payload).toBe('low-1');
  });

  it('should preserve FIFO within same priority', () => {
    mailbox.enqueue({ priority: 'high', payload: 'a', timestamp: 1 });
    mailbox.enqueue({ priority: 'high', payload: 'b', timestamp: 2 });
    mailbox.enqueue({ priority: 'high', payload: 'c', timestamp: 3 });

    expect(mailbox.dequeue()?.payload).toBe('a');
    expect(mailbox.dequeue()?.payload).toBe('b');
    expect(mailbox.dequeue()?.payload).toBe('c');
  });

  it('should peek without removing', () => {
    mailbox.enqueue({ priority: 'normal', payload: 'x', timestamp: 1 });
    expect(mailbox.peek()?.payload).toBe('x');
    expect(mailbox.size).toBe(1);
  });

  it('should peek high priority first', () => {
    mailbox.enqueue({ priority: 'low', payload: 'low', timestamp: 1 });
    mailbox.enqueue({ priority: 'high', payload: 'high', timestamp: 2 });
    expect(mailbox.peek()?.payload).toBe('high');
  });
});

describe('DPNSupervisor', () => {
  describe('basic lifecycle', () => {
    it('should start and complete all children', async () => {
      const supervisor = new DPNSupervisor({ restartDelay: 10 });
      supervisor.addChild(makeSuccessSpec('p1'));
      supervisor.addChild(makeSuccessSpec('p2'));

      await supervisor.start();

      expect(supervisor.getChildState('p1')).toBe('completed');
      expect(supervisor.getChildState('p2')).toBe('completed');
      expect(supervisor.isRunning).toBe(false);

      const events = supervisor.getEvents();
      expect(events.some((e) => e.type === 'supervisor-started')).toBe(true);
      expect(events.some((e) => e.type === 'supervisor-stopped')).toBe(true);
      expect(events.filter((e) => e.type === 'child-started')).toHaveLength(2);
      expect(events.filter((e) => e.type === 'child-completed')).toHaveLength(2);
    });

    it('should throw on duplicate child registration', () => {
      const supervisor = new DPNSupervisor();
      supervisor.addChild(makeSuccessSpec('p1'));
      expect(() => supervisor.addChild(makeSuccessSpec('p1'))).toThrow('already registered');
    });

    it('should return child IDs', () => {
      const supervisor = new DPNSupervisor();
      supervisor.addChild(makeSuccessSpec('a'));
      supervisor.addChild(makeSuccessSpec('b'));
      expect(supervisor.getChildIds()).toEqual(['a', 'b']);
    });

    it('should return undefined state for unknown child', () => {
      const supervisor = new DPNSupervisor();
      expect(supervisor.getChildState('nonexistent')).toBeUndefined();
    });
  });

  describe('one-for-one restart', () => {
    it('should restart a failed child', async () => {
      const supervisor = new DPNSupervisor({
        maxRestarts: 3,
        restartDelay: 10,
        strategy: 'one-for-one',
      });

      // Process that fails once then succeeds
      failCount = 0;
      supervisor.addChild(makeFailThenSucceedSpec('p1', 1));

      await supervisor.start();

      expect(supervisor.getRestartCount('p1')).toBe(1);
      const events = supervisor.getEvents();
      expect(events.some((e) => e.type === 'child-restarted' && e.processId === 'p1')).toBe(true);
    });

    it('should stop after max restarts', async () => {
      const supervisor = new DPNSupervisor({
        maxRestarts: 2,
        restartDelay: 10,
        strategy: 'one-for-one',
      });

      supervisor.addChild(makeFailSpec('p1'));

      await supervisor.start();

      const events = supervisor.getEvents();
      expect(events.some((e) => e.type === 'child-max-restarts')).toBe(true);
      expect(supervisor.getRestartCount('p1')).toBe(2);
    });

    it('should not restart other children on single failure', async () => {
      const supervisor = new DPNSupervisor({
        maxRestarts: 2,
        restartDelay: 10,
        strategy: 'one-for-one',
      });

      supervisor.addChild(makeSuccessSpec('p1'));
      supervisor.addChild(makeFailSpec('p2'));

      await supervisor.start();

      expect(supervisor.getChildState('p1')).toBe('completed');
      expect(supervisor.getRestartCount('p1')).toBe(0);
      expect(supervisor.getRestartCount('p2')).toBeGreaterThan(0);
    });
  });

  describe('all-for-one restart', () => {
    it('should restart all children when one fails', async () => {
      const supervisor = new DPNSupervisor({
        maxRestarts: 1,
        restartDelay: 10,
        strategy: 'all-for-one',
      });

      // p1 succeeds, p2 fails once then we hit max restarts
      supervisor.addChild(makeSuccessSpec('p1', 5));
      supervisor.addChild(makeFailSpec('p2'));

      await supervisor.start();

      const events = supervisor.getEvents();
      // Both should have been restarted together
      const restartEvents = events.filter((e) => e.type === 'child-restarted');
      const restartedIds = restartEvents.map((e) => e.processId);
      expect(restartedIds).toContain('p1');
      expect(restartedIds).toContain('p2');
    });
  });

  describe('event log', () => {
    it('should record all lifecycle events', async () => {
      const supervisor = new DPNSupervisor({ restartDelay: 10 });
      supervisor.addChild(makeSuccessSpec('p1'));

      await supervisor.start();

      const events = supervisor.getEvents();
      expect(events.length).toBeGreaterThanOrEqual(4); // started, child-started, child-completed, stopped

      for (const event of events) {
        expect(event.timestamp).toBeTruthy();
        expect(event.processId).toBeTruthy();
        expect(event.type).toBeTruthy();
      }
    });

    it('should return restart count of 0 for unknown child', () => {
      const supervisor = new DPNSupervisor();
      expect(supervisor.getRestartCount('unknown')).toBe(0);
    });
  });
});
