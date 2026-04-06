/**
 * Phase 7 Comprehensive Evaluation test suite.
 *
 * Sprint 15 — Advisory Panel: All (research synthesis).
 */

import { runPhase7Evaluation } from './phase7-evaluation.js';
import type { Phase7EvaluationReport } from './phase7-evaluation.js';

// ── Tests ────────────────────────────────────────────────────────────

describe('Phase 7 Comprehensive Evaluation', () => {
  let report: Phase7EvaluationReport;

  beforeAll(async () => {
    report = await runPhase7Evaluation();
  });

  describe('milestone demos', () => {
    it('should run all 4 milestone demos', () => {
      expect(report.milestones.length).toBe(4);
      expect(report.milestones.map((m) => m.milestone)).toEqual([
        'M2', 'M3', 'M4', 'integration',
      ]);
    });

    it('M2 demo should succeed: External Task Expression', () => {
      const m2 = report.milestones.find((m) => m.milestone === 'M2')!;

      expect(m2.success).toBe(true);
      expect(m2.metrics.nodeCount).toBe(4);
      expect(m2.metrics.categoryValid).toBe(true);
      expect(m2.durationMs).toBeGreaterThan(0);
    });

    it('M3 demo should succeed: LLM-Native Programming', () => {
      const m3 = report.milestones.find((m) => m.milestone === 'M3')!;

      expect(m3.success).toBe(true);
      expect(m3.metrics.graphValid).toBe(true);
      expect(m3.metrics.categoryValid).toBe(true);
      expect(m3.metrics.autonomousStages).toBe(4);
    });

    it('M4 demo should succeed: Self-Modification', () => {
      const m4 = report.milestones.find((m) => m.milestone === 'M4')!;

      expect(m4.success).toBe(true);
      expect(m4.metrics.applied).toBe(true);
      expect(m4.metrics.confidenceScore).toBeGreaterThan(0);
      expect(m4.metrics.pipelineSizeAfter).toBeGreaterThan(6);
    });

    it('Integration demo should succeed: Pipeline After Modification', () => {
      const integration = report.milestones.find((m) => m.milestone === 'integration')!;

      expect(integration.success).toBe(true);
      expect(integration.metrics.modificationApplied).toBe(true);
      expect(integration.metrics.graphValid).toBe(true);
      expect(integration.metrics.categoryValid).toBe(true);
      expect(integration.metrics.originalStagesPreserved).toBe(true);
      expect(integration.metrics.newStageAdded).toBe(true);
    });

    it('each demo should include timing information', () => {
      for (const milestone of report.milestones) {
        expect(milestone.durationMs).toBeGreaterThan(0);
      }
    });
  });

  describe('advisory panel alignment', () => {
    it('should include all 10 advisors', () => {
      expect(report.advisorAlignments.length).toBe(10);
    });

    it('should show score improvement for key advisors', () => {
      const pearl = report.advisorAlignments.find((a) => a.advisor === 'Pearl')!;
      expect(pearl.scoreAfter).toBeGreaterThan(pearl.scoreBefore);

      const kay = report.advisorAlignments.find((a) => a.advisor === 'Kay')!;
      expect(kay.scoreAfter).toBeGreaterThan(kay.scoreBefore);

      const sutskever = report.advisorAlignments.find((a) => a.advisor === 'Sutskever')!;
      expect(sutskever.scoreAfter).toBeGreaterThan(sutskever.scoreBefore);
    });

    it('should have justifications for all advisors', () => {
      for (const alignment of report.advisorAlignments) {
        expect(alignment.justification.length).toBeGreaterThan(0);
      }
    });

    it('should achieve composite score of 9.0+', () => {
      expect(report.compositeScore).toBeGreaterThanOrEqual(9.0);
    });
  });

  describe('research contributions', () => {
    it('should identify 6 research contributions', () => {
      expect(report.researchContributions.length).toBe(6);
    });

    it('should include at least 2 novel contributions', () => {
      const novel = report.researchContributions.filter((c) => c.novelty === 'novel');
      expect(novel.length).toBeGreaterThanOrEqual(2);
    });

    it('should reference specific sprints', () => {
      for (const contribution of report.researchContributions) {
        expect(contribution.sprint).toMatch(/Sprint \d+/);
      }
    });
  });

  describe('overall assessment', () => {
    it('should produce a positive assessment when all demos pass', () => {
      if (report.milestones.every((m) => m.success)) {
        expect(report.overallAssessment).toContain('Phase 7 complete');
      }
    });

    it('should include composite score in assessment', () => {
      expect(report.overallAssessment).toContain(report.compositeScore.toFixed(2));
    });

    it('should include total evaluation time', () => {
      expect(report.totalTimeMs).toBeGreaterThan(0);
    });
  });
});
