import { describe, expect, it } from 'vitest';
import { dryRunAutomation, validateAutomationGraph, type AutomationNode } from './automation';

const graph: AutomationNode[] = [
  {
    id: 'trigger',
    kind: 'trigger',
    label: 'Challenge solved',
    value: 'challenge.solved'
  },
  {
    id: 'condition',
    kind: 'condition',
    label: 'Challenge event',
    value: 'challenge'
  },
  {
    id: 'action',
    kind: 'action',
    label: 'Send webhook',
    value: 'webhook.send'
  }
];

describe('automation graph', () => {
  it('requires a trigger-first graph with an action', () => {
    expect(validateAutomationGraph([])).toEqual(['Add a trigger and an action.']);
    expect(validateAutomationGraph(graph)).toEqual([]);
  });

  it('produces a deterministic dry-run trace', () => {
    expect(dryRunAutomation(graph, 'challenge.solved').map((step) => step.status)).toEqual([
      'matched',
      'passed',
      'executed'
    ]);
    expect(dryRunAutomation(graph, 'team.created').map((step) => step.status)).toEqual([
      'skipped',
      'skipped',
      'skipped'
    ]);
  });
});
