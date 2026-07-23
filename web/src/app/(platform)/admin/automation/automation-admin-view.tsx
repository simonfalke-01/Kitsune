'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useEvent } from '../../../event-context';
import { useSession } from '../../../session-context';
import {
  Alert,
  Badge,
  Button,
  CodeBlock,
  Dialog,
  DialogTrigger,
  EmptyState,
  Form,
  Select,
  TextField,
  showToast
} from '@/components/ui';
import {
  dryRunAutomation,
  validateAutomationGraph,
  type AutomationNode,
  type AutomationRunStatus,
  type AutomationRunStep
} from '@/lib/automation';

const nodeSchema = z.object({
  kind: z.enum(['trigger', 'condition', 'action']),
  label: z.string().trim().min(1, 'Enter a node label.'),
  value: z.string().trim().min(1, 'Enter a typed value.')
});

type NodeValues = z.infer<typeof nodeSchema>;

const kindOptions = [
  {
    id: 'trigger',
    label: 'Trigger'
  },
  {
    id: 'condition',
    label: 'Condition'
  },
  {
    id: 'action',
    label: 'Action'
  }
] as const;

const statusTone: Record<AutomationRunStatus, 'neutral' | 'success' | 'warning'> = {
  executed: 'success',
  matched: 'success',
  passed: 'success',
  skipped: 'warning'
};

function AddNodeForm({ onAdd }: { onAdd: (node: Omit<AutomationNode, 'id'>) => void }) {
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<NodeValues>({
    defaultValues: {
      kind: 'trigger',
      label: '',
      value: ''
    }
  });

  const submit = handleSubmit((values) => {
    const parsed = nodeSchema.safeParse(values);

    if (!parsed.success) {
      setError('Enter a label and typed value.');
      return;
    }

    setError(null);
    onAdd(parsed.data);
    reset();
  });

  return (
    <Form
      onSubmit={(event) => {
        void submit(event);
      }}
      validationBehavior="aria"
    >
      <Controller
        control={control}
        name="kind"
        render={({ field }) => (
          <Select
            label="Node type"
            onSelectionChange={(key) => {
              field.onChange(String(key));
            }}
            options={kindOptions}
            selectedKey={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="label"
        render={({ field }) => (
          <TextField
            autoFocus
            errorMessage={errors.label?.message}
            isInvalid={Boolean(errors.label)}
            isRequired
            label="Label"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="value"
        render={({ field }) => (
          <TextField
            description="Examples: challenge.solved, challenge, webhook.send"
            errorMessage={errors.value?.message}
            isInvalid={Boolean(errors.value)}
            isRequired
            label="Typed value"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button type="submit">Add node</Button>
    </Form>
  );
}

function statusFor(nodeId: string, trace: AutomationRunStep[]): AutomationRunStatus | null {
  return trace.find((step) => step.nodeId === nodeId)?.status ?? null;
}

export function AutomationAdminView() {
  const { selectedEvent } = useEvent();
  const { can } = useSession();
  const [nodes, setNodes] = useState<AutomationNode[]>([]);
  const [eventKind, setEventKind] = useState('challenge.solved');
  const [errors, setErrors] = useState<string[]>([]);
  const [trace, setTrace] = useState<AutomationRunStep[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const addNode = (node: Omit<AutomationNode, 'id'>) => {
    setNodes((current) => [
      ...current,
      {
        ...node,
        id: `node-${current.length + 1}-${Date.now()}`
      }
    ]);
    setErrors([]);
    setTrace([]);
    setAddOpen(false);
  };

  const moveNode = (index: number, direction: -1 | 1) => {
    const target = index + direction;

    if (target < 0 || target >= nodes.length) {
      return;
    }

    setNodes((current) => {
      const next = [...current];
      const [node] = next.splice(index, 1);

      if (!node) {
        return current;
      }

      next.splice(target, 0, node);
      return next;
    });
    setErrors([]);
    setTrace([]);
  };

  const removeNode = (nodeId: string) => {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setErrors([]);
    setTrace([]);
  };

  const dryRun = () => {
    const validationErrors = validateAutomationGraph(nodes);
    setErrors(validationErrors);

    if (validationErrors.length > 0) {
      setTrace([]);
      return;
    }

    setTrace(dryRunAutomation(nodes, eventKind));
    showToast({
      title: 'Dry run complete',
      tone: 'success'
    });
  };

  if (!can('automation_manage')) {
    return <Alert title="Automation is unavailable for this account." tone="danger" />;
  }

  return (
    <div className="grid gap-8">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-accent-border bg-accent-subtle p-4">
        <div className="grid gap-1">
          <span className="font-display text-lg font-semibold text-text">
            {selectedEvent?.name ?? 'Organization automation'}
          </span>
          <span className="text-sm text-text-muted">
            {nodes.length} nodes, {Math.max(0, nodes.length - 1)} edges
          </span>
        </div>
        <Badge tone={trace.length > 0 ? 'success' : 'neutral'}>
          {trace.length > 0 ? 'Dry run complete' : 'Draft'}
        </Badge>
      </section>

      <Alert
        description="Saving and activation remain unavailable until the automation API is exposed."
        title="This draft stays in the current tab."
        tone="warning"
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <TextField
          description="The trigger compares against this exact event kind."
          label="Dry-run event"
          onChange={setEventKind}
          value={eventKind}
        />
        <div className="flex flex-wrap gap-2">
          <DialogTrigger isOpen={addOpen} onOpenChange={setAddOpen}>
            <Button>Add node</Button>
            <Dialog title="Add automation node">
              <AddNodeForm onAdd={addNode} />
            </Dialog>
          </DialogTrigger>
          <Button isDisabled={nodes.length === 0} onPress={dryRun} tone="secondary">
            Dry run
          </Button>
          <Button
            isDisabled={nodes.length === 0}
            onPress={() => {
              setShowJson((value) => !value);
            }}
            tone="quiet"
          >
            {showJson ? 'Hide JSON' : 'Review JSON'}
          </Button>
        </div>
      </div>

      {errors.length > 0 ? (
        <Alert
          description={
            <ul className="m-0 grid gap-1 pl-4">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          }
          title="The graph is not runnable."
          tone="danger"
        />
      ) : null}

      {nodes.length === 0 ? (
        <EmptyState
          action={
            <Button
              onPress={() => {
                setAddOpen(true);
              }}
              tone="secondary"
            >
              Add trigger
            </Button>
          }
          description="Start with a trigger, add optional conditions, then finish with an action."
          title="No automation nodes"
        />
      ) : (
        <ol className="m-0 grid list-none gap-3 p-0" aria-label="Automation graph">
          {nodes.map((node, index) => {
            const status = statusFor(node.id, trace);

            return (
              <li className="grid gap-3" key={node.id}>
                {index > 0 ? (
                  <div
                    aria-label={`Edge from ${nodes[index - 1]?.label ?? 'previous node'} to ${node.label}`}
                    className="ml-6 h-6 w-px bg-accent-border"
                    role="img"
                  />
                ) : null}
                <article className="grid gap-4 rounded-lg border border-border-subtle bg-surface-raised p-4 shadow-sm sm:flex sm:items-center sm:justify-between">
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{node.kind}</Badge>
                      {status ? <Badge tone={statusTone[status]}>{status}</Badge> : null}
                    </div>
                    <div className="grid gap-1">
                      <h2 className="m-0 text-base font-semibold text-text">{node.label}</h2>
                      <span className="font-mono text-xs text-text-muted">{node.value}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      aria-label={`Move ${node.label} up`}
                      isDisabled={index === 0}
                      onPress={() => {
                        moveNode(index, -1);
                      }}
                      size="small"
                      tone="quiet"
                    >
                      Up
                    </Button>
                    <Button
                      aria-label={`Move ${node.label} down`}
                      isDisabled={index === nodes.length - 1}
                      onPress={() => {
                        moveNode(index, 1);
                      }}
                      size="small"
                      tone="quiet"
                    >
                      Down
                    </Button>
                    <Button
                      aria-label={`Remove ${node.label}`}
                      onPress={() => {
                        removeNode(node.id);
                      }}
                      size="small"
                      tone="danger"
                    >
                      Remove
                    </Button>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}

      {showJson && nodes.length > 0 ? (
        <CodeBlock
          code={JSON.stringify(
            {
              edges: nodes.slice(1).map((node, index) => ({
                from: nodes[index]?.id,
                to: node.id
              })),
              nodes
            },
            null,
            2
          )}
          label="Automation graph"
          language="json"
        />
      ) : null}
    </div>
  );
}
