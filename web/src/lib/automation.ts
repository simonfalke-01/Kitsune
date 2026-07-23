export type AutomationNodeKind = 'action' | 'condition' | 'trigger';

export interface AutomationNode {
  id: string;
  kind: AutomationNodeKind;
  label: string;
  value: string;
}

export type AutomationRunStatus = 'executed' | 'matched' | 'passed' | 'skipped';

export interface AutomationRunStep {
  nodeId: string;
  status: AutomationRunStatus;
}

export function validateAutomationGraph(nodes: AutomationNode[]): string[] {
  const errors: string[] = [];

  if (nodes.length === 0) {
    return ['Add a trigger and an action.'];
  }

  if (nodes[0]?.kind !== 'trigger') {
    errors.push('The graph must begin with a trigger.');
  }

  if (!nodes.some((node) => node.kind === 'trigger')) {
    errors.push('Add a trigger.');
  }

  if (!nodes.some((node) => node.kind === 'action')) {
    errors.push('Add an action.');
  }

  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) {
    errors.push('Every node must have a unique identifier.');
  }

  return errors;
}

export function dryRunAutomation(nodes: AutomationNode[], eventKind: string): AutomationRunStep[] {
  let active = true;

  return nodes.map((node) => {
    if (!active) {
      return {
        nodeId: node.id,
        status: 'skipped'
      };
    }

    if (node.kind === 'trigger') {
      const matches = node.value.trim() === eventKind.trim();
      active = matches;

      return {
        nodeId: node.id,
        status: matches ? 'matched' : 'skipped'
      };
    }

    if (node.kind === 'condition') {
      const passes = eventKind.includes(node.value.trim());
      active = passes;

      return {
        nodeId: node.id,
        status: passes ? 'passed' : 'skipped'
      };
    }

    return {
      nodeId: node.id,
      status: 'executed'
    };
  });
}
