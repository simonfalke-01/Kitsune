'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';

import { useEvent } from '../../../event-context';
import { useSession } from '../../../session-context';
import {
  Alert,
  Button,
  Checkbox,
  CodeBlock,
  FileDropZone,
  Form,
  NumberField,
  RadioGroup,
  Select,
  Switch,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  TextArea,
  TextField,
  showToast
} from '@/components/ui';
import {
  challengeEditorSchema,
  defaultChallengeEditorValues,
  toCreateChallengeInput,
  validateChallengeEditor,
  type ChallengeEditorIssue,
  type ChallengeEditorSection,
  type ChallengeEditorValues
} from '@/lib/admin-challenges';
import { api, errorMessage, type ChallengeSummary, type DivisionSummary } from '@/lib/api/client';

const sectionLabels: Record<ChallengeEditorSection, string> = {
  basics: 'Basics',
  behavior: 'Behavior and answers',
  scoring: 'Scoring',
  extras: 'Hints and survey',
  visibility: 'Visibility',
  review: 'Review'
};

const stateOptions = [
  { id: 'draft', label: 'Draft' },
  { id: 'testing', label: 'Testing' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
  { id: 'hidden', label: 'Hidden' },
  { id: 'archived', label: 'Archived' }
] as const;

const kindOptions = [
  {
    description: 'Text or regular-expression answers.',
    label: 'Static flag',
    value: 'static_flag'
  },
  {
    description: 'Declared choices with one or more accepted selections.',
    label: 'Multiple choice',
    value: 'multiple_choice'
  },
  {
    description: 'Identity-specific service issued from a template.',
    label: 'Dynamic instance',
    value: 'dynamic_instance'
  },
  {
    description: 'A downloadable artifact with text or regular-expression answers.',
    label: 'File backed',
    value: 'file_backed'
  },
  {
    description: 'An organizer-managed TCP or HTTP service.',
    label: 'Remote service',
    value: 'remote_service'
  },
  {
    description: 'Evidence enters the organizer review queue.',
    label: 'Manual verification',
    value: 'manual_verification'
  },
  {
    description: 'Behavior and verification supplied by a registered plugin.',
    label: 'Plugin',
    value: 'plugin'
  }
] as const;

const answerOptions = [
  {
    description: 'Match a single submitted value.',
    label: 'Exact answer',
    value: 'exact'
  },
  {
    description: 'Match a bounded regular expression.',
    label: 'Regular expression',
    value: 'regex'
  }
] as const;

const scoringOptions = [
  {
    description: 'Every solve receives the same value.',
    label: 'Static',
    value: 'static'
  },
  {
    description: 'Value falls toward a floor as solves accumulate.',
    label: 'Dynamic',
    value: 'dynamic'
  },
  {
    description: 'A registered plugin calculates solve value.',
    label: 'Plugin',
    value: 'plugin'
  }
] as const;

let editorKeySequence = 0;

function nextEditorKey(prefix: string): string {
  editorKeySequence += 1;
  return `${prefix}-${editorKeySequence}`;
}

function issueMessage(
  issues: ChallengeEditorIssue[],
  path: string,
  showValidation: boolean
): string | undefined {
  if (!showValidation) {
    return undefined;
  }

  return issues.find((issue) => issue.path === path)?.message;
}

function SectionHeading({
  description,
  id,
  title
}: {
  description?: string;
  id?: string;
  title: string;
}) {
  return (
    <div className="grid gap-1">
      <h3 className="m-0 font-display text-lg font-semibold text-text" id={id}>
        {title}
      </h3>
      {description ? <p className="m-0 text-sm text-text-muted">{description}</p> : null}
    </div>
  );
}

function EmptyCollection({ children }: { children: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-4 text-sm text-text-muted">
      {children}
    </div>
  );
}

interface ChallengeFileDraft {
  id: string;
  name: string;
  size: number;
}

function fileSizeLabel(size: number): string {
  if (size < 1_024) {
    return `${size} B`;
  }

  if (size < 1_048_576) {
    return `${Math.ceil(size / 1_024)} KB`;
  }

  return `${(size / 1_048_576).toFixed(1)} MB`;
}

interface ChallengeEditorProps {
  challenges: ChallengeSummary[];
  discardRequested: boolean;
  nextPosition: number;
  onDiscard: () => void;
  onDone: () => void;
  onKeepEditing: () => void;
  onRequestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
}

export function ChallengeEditor({
  challenges,
  discardRequested,
  nextPosition,
  onDiscard,
  onDone,
  onKeepEditing,
  onRequestClose,
  onDirtyChange
}: ChallengeEditorProps) {
  const { refreshChallenges, selectedEvent } = useEvent();
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSection, setSelectedSection] = useState<ChallengeEditorSection>('basics');
  const [showValidation, setShowValidation] = useState(false);
  const [divisions, setDivisions] = useState<DivisionSummary[]>([]);
  const [divisionError, setDivisionError] = useState<string | null>(null);
  const [isLoadingDivisions, setIsLoadingDivisions] = useState(true);
  const [draftFiles, setDraftFiles] = useState<ChallengeFileDraft[]>([]);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty }
  } = useForm<ChallengeEditorValues>({
    defaultValues: defaultChallengeEditorValues(nextPosition)
  });
  const values = useWatch({ control });
  const editorValues = values as ChallengeEditorValues;
  const issues = useMemo(() => validateChallengeEditor(editorValues), [editorValues]);
  const visibleIssues = showValidation ? issues : [];
  const preview = useMemo(() => {
    if (issues.length > 0) {
      return null;
    }

    return JSON.stringify(toCreateChallengeInput(editorValues), null, 2);
  }, [editorValues, issues]);
  const answerArrays = useFieldArray({
    control,
    keyName: 'fieldKey',
    name: 'answers'
  });
  const choiceArrays = useFieldArray({
    control,
    keyName: 'fieldKey',
    name: 'choices'
  });
  const hintArrays = useFieldArray({
    control,
    keyName: 'fieldKey',
    name: 'hints'
  });
  const surveyArrays = useFieldArray({
    control,
    keyName: 'fieldKey',
    name: 'survey'
  });

  useEffect(() => {
    onDirtyChange(isDirty || draftFiles.length > 0);
  }, [draftFiles.length, isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty && draftFiles.length === 0) {
      return;
    }

    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener('beforeunload', protectDraft);
    return () => {
      window.removeEventListener('beforeunload', protectDraft);
    };
  }, [draftFiles.length, isDirty]);

  const requestDivisions = useCallback(async () => {
    if (!selectedEvent) {
      return {
        data: [] as DivisionSummary[],
        error: undefined
      };
    }

    return api.GET('/api/v1/events/{event_id}/divisions', {
      params: {
        path: {
          event_id: selectedEvent.id
        }
      }
    });
  }, [selectedEvent]);

  const retryDivisions = async () => {
    setIsLoadingDivisions(true);
    setDivisionError(null);

    try {
      const result = await requestDivisions();
      setDivisions(result.data ?? []);
      setDivisionError(
        result.data ? null : errorMessage(result.error, 'Divisions could not be loaded.')
      );
    } catch {
      setDivisions([]);
      setDivisionError('Divisions could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoadingDivisions(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    void requestDivisions()
      .then((result) => {
        if (!isActive) {
          return;
        }

        setDivisions(result.data ?? []);
        setDivisionError(
          result.data ? null : errorMessage(result.error, 'Divisions could not be loaded.')
        );
      })
      .catch(() => {
        if (isActive) {
          setDivisions([]);
          setDivisionError('Divisions could not be loaded. Check your connection and retry.');
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingDivisions(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [requestDivisions]);

  const goToFirstIssue = () => {
    setShowValidation(true);
    setSelectedSection(issues[0]?.section ?? 'review');
  };

  const submit = handleSubmit(async (submittedValues) => {
    setShowValidation(true);
    setError(null);
    const parsed = challengeEditorSchema.safeParse(submittedValues);

    if (!parsed.success) {
      const firstIssue = validateChallengeEditor(submittedValues)[0];
      setSelectedSection(firstIssue?.section ?? 'review');
      return;
    }

    if (!selectedEvent) {
      setError('Choose an event before creating a challenge.');
      return;
    }

    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await api.POST('/api/v1/events/{event_id}/challenges', {
        body: toCreateChallengeInput(parsed.data),
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            event_id: selectedEvent.id
          }
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The challenge could not be created.'));
        return;
      }

      if (draftFiles.length > 0) {
        window.localStorage.setItem(
          `kitsune.challenge-files.${result.data.id}`,
          JSON.stringify(draftFiles)
        );
      }

      await refreshChallenges();
      reset(defaultChallengeEditorValues(parsed.data.position + 1));
      setDraftFiles([]);
      onDone();
      showToast({
        description:
          draftFiles.length > 0
            ? 'File metadata was saved as a browser draft for the upload API phase.'
            : undefined,
        title: 'Challenge created',
        tone: 'success'
      });
    } catch {
      setError('The challenge could not be created. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
    }
  });

  const textError = (path: string) => issueMessage(visibleIssues, path, showValidation);

  return (
    <Form
      onSubmit={(event) => {
        void submit(event);
      }}
      validationBehavior="aria"
    >
      {discardRequested ? (
        <Alert
          actions={
            <div className="flex flex-wrap gap-2">
              <Button onPress={onKeepEditing} size="small" tone="quiet" type="button">
                Keep editing
              </Button>
              <Button onPress={onDiscard} size="small" tone="danger" type="button">
                Discard draft
              </Button>
            </div>
          }
          description="Unsaved challenge fields will be lost."
          title="Discard this draft?"
          tone="warning"
        />
      ) : null}

      <Tabs
        onSelectionChange={(key) => {
          setSelectedSection(String(key) as ChallengeEditorSection);
        }}
        selectedKey={selectedSection}
      >
        <TabsList aria-label="Challenge editor sections">
          {(Object.keys(sectionLabels) as ChallengeEditorSection[]).map((section) => (
            <TabsTab id={section} key={section}>
              {sectionLabels[section]}
            </TabsTab>
          ))}
        </TabsList>

        <TabsPanel id="basics">
          <div className="grid gap-6">
            <SectionHeading
              description="Identity, board placement, lifecycle and player submission limits."
              title="Basics"
            />
            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <TextField
                  autoFocus
                  errorMessage={textError('name')}
                  isInvalid={Boolean(textError('name'))}
                  label="Challenge name"
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  value={field.value}
                />
              )}
            />
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <TextField
                  errorMessage={textError('category')}
                  isInvalid={Boolean(textError('category'))}
                  label="Category"
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  value={field.value}
                />
              )}
            />
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <TextArea
                  description="Markdown supported."
                  errorMessage={textError('description')}
                  isInvalid={Boolean(textError('description'))}
                  label="Description"
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  rows={8}
                  value={field.value}
                />
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="position"
                render={({ field }) => (
                  <NumberField
                    errorMessage={textError('position')}
                    isInvalid={Boolean(textError('position'))}
                    label="Position"
                    maxValue={100000}
                    minValue={0}
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    value={field.value}
                  />
                )}
              />
              <Controller
                control={control}
                name="max_attempts"
                render={({ field }) => (
                  <NumberField
                    description="Zero allows unlimited failed attempts."
                    errorMessage={textError('max_attempts')}
                    isInvalid={Boolean(textError('max_attempts'))}
                    label="Attempt limit"
                    maxValue={2147483647}
                    minValue={0}
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    value={field.value}
                  />
                )}
              />
            </div>
            <Controller
              control={control}
              name="state"
              render={({ field }) => (
                <Select
                  label="Initial state"
                  onSelectionChange={(key) => {
                    field.onChange(String(key));
                  }}
                  options={stateOptions}
                  selectedKey={field.value}
                />
              )}
            />
            <Controller
              control={control}
              name="tags"
              render={({ field }) => (
                <TextField
                  description="Separate tags with commas. Duplicate tags are removed."
                  errorMessage={textError('tags')}
                  isInvalid={Boolean(textError('tags'))}
                  label="Tags"
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  value={field.value}
                />
              )}
            />
            <Controller
              control={control}
              name="writeups_enabled"
              render={({ field }) => (
                <Switch
                  description="Allow competitors to submit a writeup after solving."
                  isSelected={field.value}
                  label="Writeups"
                  onChange={field.onChange}
                />
              )}
            />
          </div>
        </TabsPanel>

        <TabsPanel id="behavior">
          <div className="grid gap-6">
            <SectionHeading
              description="Challenge delivery and the verifier contract used for submissions."
              title="Behavior and answers"
            />
            <Controller
              control={control}
              name="kind"
              render={({ field }) => (
                <RadioGroup
                  label="Challenge kind"
                  onChange={field.onChange}
                  options={kindOptions}
                  value={field.value}
                />
              )}
            />

            {editorValues.kind === 'dynamic_instance' ? (
              <>
                <Controller
                  control={control}
                  name="dynamic_template"
                  render={({ field }) => (
                    <TextField
                      errorMessage={textError('dynamic_template')}
                      isInvalid={Boolean(textError('dynamic_template'))}
                      label="Instance template"
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      value={field.value}
                    />
                  )}
                />
                <Alert
                  description="The create request uses the required dynamic verifier."
                  title="Answer verification follows the instance"
                  tone="info"
                />
              </>
            ) : null}

            {editorValues.kind === 'remote_service' ? (
              <Controller
                control={control}
                name="remote_connection"
                render={({ field }) => (
                  <TextField
                    description="Host, URL or connection instructions shown to competitors."
                    errorMessage={textError('remote_connection')}
                    isInvalid={Boolean(textError('remote_connection'))}
                    label="Connection"
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    value={field.value}
                  />
                )}
              />
            ) : null}

            {editorValues.kind === 'file_backed' ? (
              <section aria-labelledby="challenge-files-title" className="grid gap-4">
                <SectionHeading id="challenge-files-title" title="Challenge files" />
                <FileDropZone
                  allowsMultiple
                  description="Select every artifact competitors should receive."
                  label="Add challenge files"
                  onSelect={(files) => {
                    setDraftFiles((current) => [
                      ...current,
                      ...Array.from(files ?? []).map((file) => ({
                        id: crypto.randomUUID(),
                        name: file.name,
                        size: file.size
                      }))
                    ]);
                  }}
                />
                {draftFiles.length > 0 ? (
                  <ul className="m-0 grid list-none gap-2 p-0">
                    {draftFiles.map((file) => (
                      <li
                        className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border-subtle bg-surface-raised px-3 py-2"
                        key={file.id}
                      >
                        <span className="grid gap-1">
                          <span className="text-sm font-medium text-text">{file.name}</span>
                          <span className="text-xs text-text-muted">
                            {fileSizeLabel(file.size)}
                          </span>
                        </span>
                        <Button
                          aria-label={`Remove ${file.name}`}
                          onPress={() => {
                            setDraftFiles((current) =>
                              current.filter((entry) => entry.id !== file.id)
                            );
                          }}
                          size="small"
                          tone="quiet"
                          type="button"
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Alert
                  description="Selected file metadata is retained with the frontend draft after challenge creation."
                  title="Upload API pending"
                  tone="info"
                />
              </section>
            ) : null}

            {editorValues.kind === 'plugin' ? (
              <div className="grid gap-4">
                <Controller
                  control={control}
                  name="plugin_name"
                  render={({ field }) => (
                    <TextField
                      errorMessage={textError('plugin_name')}
                      isInvalid={Boolean(textError('plugin_name'))}
                      label="Plugin key"
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      value={field.value}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="plugin_kind"
                  render={({ field }) => (
                    <TextField
                      errorMessage={textError('plugin_kind')}
                      isInvalid={Boolean(textError('plugin_kind'))}
                      label="Plugin challenge kind"
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      value={field.value}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="plugin_config"
                  render={({ field }) => (
                    <TextArea
                      description="JSON passed to the registered plugin."
                      errorMessage={textError('plugin_config')}
                      isInvalid={Boolean(textError('plugin_config'))}
                      label="Plugin configuration"
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      rows={8}
                      value={field.value}
                    />
                  )}
                />
                <Alert
                  description="The create request uses the plugin verifier required by this kind."
                  title="Answer verification follows the plugin"
                  tone="info"
                />
              </div>
            ) : null}

            {editorValues.kind === 'manual_verification' ? (
              <Alert
                description="Every submission enters the organizer review queue."
                title="Manual verifier enabled"
                tone="info"
              />
            ) : null}

            {editorValues.kind === 'multiple_choice' ? (
              <section aria-labelledby="choices-title" className="grid gap-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="grid gap-1">
                    <h4 className="m-0 text-base font-semibold text-text" id="choices-title">
                      Choices
                    </h4>
                    <p className="m-0 text-sm text-text-muted">
                      Mark every accepted choice as correct.
                    </p>
                  </div>
                  <Button
                    onPress={() => {
                      choiceArrays.append({
                        editor_key: nextEditorKey('choice'),
                        is_correct: false,
                        value: ''
                      });
                    }}
                    size="small"
                    tone="secondary"
                    type="button"
                  >
                    Add choice
                  </Button>
                </div>
                {textError('choices') ? <Alert title={textError('choices')} tone="danger" /> : null}
                {choiceArrays.fields.length === 0 ? (
                  <EmptyCollection>Add at least two choices.</EmptyCollection>
                ) : (
                  <div className="grid gap-4">
                    {choiceArrays.fields.map((choice, index) => (
                      <div
                        className="grid gap-4 rounded-lg border border-border-subtle bg-surface-raised p-4"
                        key={choice.fieldKey}
                      >
                        <Controller
                          control={control}
                          name={`choices.${index}.value`}
                          render={({ field }) => (
                            <TextField
                              errorMessage={textError(`choices.${index}.value`)}
                              isInvalid={Boolean(textError(`choices.${index}.value`))}
                              label={`Choice ${index + 1}`}
                              name={field.name}
                              onBlur={field.onBlur}
                              onChange={field.onChange}
                              value={field.value}
                            />
                          )}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <Controller
                            control={control}
                            name={`choices.${index}.is_correct`}
                            render={({ field }) => (
                              <Checkbox isSelected={field.value} onChange={field.onChange}>
                                Accepted answer
                              </Checkbox>
                            )}
                          />
                          <Button
                            aria-label={`Remove choice ${index + 1}`}
                            onPress={() => {
                              choiceArrays.remove(index);
                            }}
                            size="small"
                            tone="quiet"
                            type="button"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {editorValues.kind === 'static_flag' ||
            editorValues.kind === 'file_backed' ||
            editorValues.kind === 'remote_service' ? (
              <section aria-labelledby="answers-title" className="grid gap-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="grid gap-1">
                    <h4 className="m-0 text-base font-semibold text-text" id="answers-title">
                      Answer rules
                    </h4>
                    <p className="m-0 text-sm text-text-muted">
                      Exact values are digested by the server before storage.
                    </p>
                  </div>
                  <Button
                    onPress={() => {
                      answerArrays.append({
                        case_insensitive: false,
                        editor_key: nextEditorKey('answer'),
                        kind: 'exact',
                        value: ''
                      });
                    }}
                    size="small"
                    tone="secondary"
                    type="button"
                  >
                    Add answer rule
                  </Button>
                </div>
                {textError('answers') ? <Alert title={textError('answers')} tone="danger" /> : null}
                {answerArrays.fields.length === 0 ? (
                  <EmptyCollection>Add at least one answer rule.</EmptyCollection>
                ) : (
                  <div className="grid gap-4">
                    {answerArrays.fields.map((answer, index) => (
                      <div
                        className="grid gap-4 rounded-lg border border-border-subtle bg-surface-raised p-4"
                        key={answer.fieldKey}
                      >
                        <Controller
                          control={control}
                          name={`answers.${index}.kind`}
                          render={({ field }) => (
                            <RadioGroup
                              label={`Answer rule ${index + 1}`}
                              onChange={field.onChange}
                              options={answerOptions}
                              value={field.value}
                            />
                          )}
                        />
                        <Controller
                          control={control}
                          name={`answers.${index}.value`}
                          render={({ field }) => (
                            <TextField
                              errorMessage={textError(`answers.${index}.value`)}
                              isInvalid={Boolean(textError(`answers.${index}.value`))}
                              label={
                                editorValues.answers[index]?.kind === 'regex'
                                  ? 'Regular expression'
                                  : 'Accepted answer'
                              }
                              name={field.name}
                              onBlur={field.onBlur}
                              onChange={field.onChange}
                              value={field.value}
                            />
                          )}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <Controller
                            control={control}
                            name={`answers.${index}.case_insensitive`}
                            render={({ field }) => (
                              <Checkbox isSelected={field.value} onChange={field.onChange}>
                                Case insensitive
                              </Checkbox>
                            )}
                          />
                          <Button
                            aria-label={`Remove answer rule ${index + 1}`}
                            onPress={() => {
                              answerArrays.remove(index);
                            }}
                            size="small"
                            tone="quiet"
                            type="button"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </TabsPanel>

        <TabsPanel id="scoring">
          <div className="grid gap-6">
            <SectionHeading
              description="Choose a built-in solve value or a registered scoring strategy."
              title="Scoring"
            />
            <Controller
              control={control}
              name="scoring_kind"
              render={({ field }) => (
                <RadioGroup
                  label="Scoring policy"
                  onChange={field.onChange}
                  options={scoringOptions}
                  value={field.value}
                />
              )}
            />
            {editorValues.scoring_kind === 'static' ? (
              <Controller
                control={control}
                name="scoring_points"
                render={({ field }) => (
                  <NumberField
                    errorMessage={textError('scoring_points')}
                    isInvalid={Boolean(textError('scoring_points'))}
                    label="Points"
                    maxValue={1000000000}
                    minValue={0}
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    value={field.value}
                  />
                )}
              />
            ) : null}
            {editorValues.scoring_kind === 'dynamic' ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Controller
                  control={control}
                  name="scoring_initial"
                  render={({ field }) => (
                    <NumberField
                      errorMessage={textError('scoring_initial')}
                      isInvalid={Boolean(textError('scoring_initial'))}
                      label="Initial points"
                      maxValue={1000000000}
                      minValue={0}
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      value={field.value}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="scoring_minimum"
                  render={({ field }) => (
                    <NumberField
                      errorMessage={textError('scoring_minimum')}
                      isInvalid={Boolean(textError('scoring_minimum'))}
                      label="Minimum points"
                      maxValue={1000000000}
                      minValue={0}
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      value={field.value}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="scoring_decay"
                  render={({ field }) => (
                    <NumberField
                      description="Solve count where the floor is reached."
                      errorMessage={textError('scoring_decay')}
                      isInvalid={Boolean(textError('scoring_decay'))}
                      label="Decay solves"
                      maxValue={1000000000}
                      minValue={1}
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      value={field.value}
                    />
                  )}
                />
              </div>
            ) : null}
            {editorValues.scoring_kind === 'plugin' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="scoring_plugin"
                  render={({ field }) => (
                    <TextField
                      errorMessage={textError('scoring_plugin')}
                      isInvalid={Boolean(textError('scoring_plugin'))}
                      label="Scoring plugin key"
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      value={field.value}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="scoring_strategy"
                  render={({ field }) => (
                    <TextField
                      errorMessage={textError('scoring_strategy')}
                      isInvalid={Boolean(textError('scoring_strategy'))}
                      label="Strategy key"
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      value={field.value}
                    />
                  )}
                />
              </div>
            ) : null}
          </div>
        </TabsPanel>

        <TabsPanel id="extras">
          <div className="grid gap-8">
            <section aria-labelledby="hints-title" className="grid gap-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <SectionHeading
                  description="Markdown guidance competitors can unlock for a score cost."
                  id="hints-title"
                  title="Hints"
                />
                <Button
                  onPress={() => {
                    const nextHintId =
                      editorValues.hints.reduce((maximum, hint) => Math.max(maximum, hint.id), 0) +
                      1;
                    hintArrays.append({
                      content: '',
                      cost: 0,
                      editor_key: nextEditorKey('hint'),
                      id: nextHintId
                    });
                  }}
                  size="small"
                  tone="secondary"
                  type="button"
                >
                  Add hint
                </Button>
              </div>
              {textError('hints') ? <Alert title={textError('hints')} tone="danger" /> : null}
              {hintArrays.fields.length === 0 ? (
                <EmptyCollection>No hints configured.</EmptyCollection>
              ) : (
                <div className="grid gap-4">
                  {hintArrays.fields.map((hint, index) => (
                    <div
                      className="grid gap-4 rounded-lg border border-border-subtle bg-surface-raised p-4"
                      key={hint.fieldKey}
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Controller
                          control={control}
                          name={`hints.${index}.id`}
                          render={({ field }) => (
                            <NumberField
                              errorMessage={textError(`hints.${index}.id`)}
                              isInvalid={Boolean(textError(`hints.${index}.id`))}
                              label={`Hint ${index + 1} ID`}
                              maxValue={1000000000}
                              minValue={1}
                              name={field.name}
                              onBlur={field.onBlur}
                              onChange={field.onChange}
                              value={field.value}
                            />
                          )}
                        />
                        <Controller
                          control={control}
                          name={`hints.${index}.cost`}
                          render={({ field }) => (
                            <NumberField
                              errorMessage={textError(`hints.${index}.cost`)}
                              isInvalid={Boolean(textError(`hints.${index}.cost`))}
                              label="Point cost"
                              maxValue={1000000000}
                              minValue={0}
                              name={field.name}
                              onBlur={field.onBlur}
                              onChange={field.onChange}
                              value={field.value}
                            />
                          )}
                        />
                      </div>
                      <Controller
                        control={control}
                        name={`hints.${index}.content`}
                        render={({ field }) => (
                          <TextArea
                            description="Markdown supported."
                            errorMessage={textError(`hints.${index}.content`)}
                            isInvalid={Boolean(textError(`hints.${index}.content`))}
                            label="Hint content"
                            name={field.name}
                            onBlur={field.onBlur}
                            onChange={field.onChange}
                            value={field.value}
                          />
                        )}
                      />
                      <div className="flex justify-end">
                        <Button
                          aria-label={`Remove hint ${index + 1}`}
                          onPress={() => {
                            hintArrays.remove(index);
                          }}
                          size="small"
                          tone="quiet"
                          type="button"
                        >
                          Remove hint
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="survey-title" className="grid gap-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <SectionHeading
                  description="Integer questions offered after a solve or writeup."
                  id="survey-title"
                  title="Post-solve survey"
                />
                <Button
                  onPress={() => {
                    surveyArrays.append({
                      editor_key: nextEditorKey('survey'),
                      key: '',
                      maximum: 5,
                      minimum: 1,
                      prompt: '',
                      required: false,
                      use_range: true
                    });
                  }}
                  size="small"
                  tone="secondary"
                  type="button"
                >
                  Add question
                </Button>
              </div>
              {textError('survey') ? <Alert title={textError('survey')} tone="danger" /> : null}
              {surveyArrays.fields.length === 0 ? (
                <EmptyCollection>No survey questions configured.</EmptyCollection>
              ) : (
                <div className="grid gap-4">
                  {surveyArrays.fields.map((question, index) => (
                    <div
                      className="grid gap-4 rounded-lg border border-border-subtle bg-surface-raised p-4"
                      key={question.fieldKey}
                    >
                      <Controller
                        control={control}
                        name={`survey.${index}.key`}
                        render={({ field }) => (
                          <TextField
                            description="Stable API key for collected answers."
                            errorMessage={textError(`survey.${index}.key`)}
                            isInvalid={Boolean(textError(`survey.${index}.key`))}
                            label={`Question ${index + 1} key`}
                            name={field.name}
                            onBlur={field.onBlur}
                            onChange={field.onChange}
                            value={field.value}
                          />
                        )}
                      />
                      <Controller
                        control={control}
                        name={`survey.${index}.prompt`}
                        render={({ field }) => (
                          <TextArea
                            errorMessage={textError(`survey.${index}.prompt`)}
                            isInvalid={Boolean(textError(`survey.${index}.prompt`))}
                            label="Prompt"
                            name={field.name}
                            onBlur={field.onBlur}
                            onChange={field.onChange}
                            value={field.value}
                          />
                        )}
                      />
                      <div className="flex flex-wrap gap-6">
                        <Controller
                          control={control}
                          name={`survey.${index}.required`}
                          render={({ field }) => (
                            <Checkbox isSelected={field.value} onChange={field.onChange}>
                              Required answer
                            </Checkbox>
                          )}
                        />
                        <Controller
                          control={control}
                          name={`survey.${index}.use_range`}
                          render={({ field }) => (
                            <Checkbox isSelected={field.value} onChange={field.onChange}>
                              Limit integer range
                            </Checkbox>
                          )}
                        />
                      </div>
                      {editorValues.survey[index]?.use_range ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Controller
                            control={control}
                            name={`survey.${index}.minimum`}
                            render={({ field }) => (
                              <NumberField
                                errorMessage={textError(`survey.${index}.minimum`)}
                                isInvalid={Boolean(textError(`survey.${index}.minimum`))}
                                label="Minimum"
                                maxValue={1000000000}
                                minValue={-1000000000}
                                name={field.name}
                                onBlur={field.onBlur}
                                onChange={field.onChange}
                                value={field.value}
                              />
                            )}
                          />
                          <Controller
                            control={control}
                            name={`survey.${index}.maximum`}
                            render={({ field }) => (
                              <NumberField
                                errorMessage={textError(`survey.${index}.maximum`)}
                                isInvalid={Boolean(textError(`survey.${index}.maximum`))}
                                label="Maximum"
                                maxValue={1000000000}
                                minValue={-1000000000}
                                name={field.name}
                                onBlur={field.onBlur}
                                onChange={field.onChange}
                                value={field.value}
                              />
                            )}
                          />
                        </div>
                      ) : null}
                      <div className="flex justify-end">
                        <Button
                          aria-label={`Remove survey question ${index + 1}`}
                          onPress={() => {
                            surveyArrays.remove(index);
                          }}
                          size="small"
                          tone="quiet"
                          type="button"
                        >
                          Remove question
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </TabsPanel>

        <TabsPanel id="visibility">
          <div className="grid gap-8">
            <section aria-labelledby="release-window-title" className="grid gap-4">
              <SectionHeading
                description="Optional release and exclusive hide instants."
                id="release-window-title"
                title="Release window"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="visible_from"
                  render={({ field }) => (
                    <TextField
                      errorMessage={textError('visible_from')}
                      inputClassName="tabular-nums"
                      isInvalid={Boolean(textError('visible_from'))}
                      label="Visible from"
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      type="datetime-local"
                      value={field.value}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="visible_until"
                  render={({ field }) => (
                    <TextField
                      errorMessage={textError('visible_until')}
                      inputClassName="tabular-nums"
                      isInvalid={Boolean(textError('visible_until'))}
                      label="Visible until"
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                      type="datetime-local"
                      value={field.value}
                    />
                  )}
                />
              </div>
            </section>

            <section aria-labelledby="divisions-title" className="grid gap-4">
              <SectionHeading
                description="No selection makes the challenge visible to every division."
                id="divisions-title"
                title="Divisions"
              />
              {isLoadingDivisions ? (
                <Alert title="Loading divisions." tone="info" />
              ) : divisionError ? (
                <Alert
                  actions={
                    <Button
                      onPress={() => {
                        void retryDivisions();
                      }}
                      size="small"
                      tone="secondary"
                      type="button"
                    >
                      Retry
                    </Button>
                  }
                  title={divisionError}
                  tone="danger"
                />
              ) : divisions.length === 0 ? (
                <EmptyCollection>No divisions configured for this event.</EmptyCollection>
              ) : (
                <Controller
                  control={control}
                  name="division_ids"
                  render={({ field }) => (
                    <div className="grid gap-3">
                      {divisions.map((division) => (
                        <Checkbox
                          isSelected={field.value.includes(division.id)}
                          key={division.id}
                          onChange={(isSelected) => {
                            field.onChange(
                              isSelected
                                ? [...field.value, division.id]
                                : field.value.filter((id) => id !== division.id)
                            );
                          }}
                        >
                          {division.name}
                        </Checkbox>
                      ))}
                    </div>
                  )}
                />
              )}
            </section>

            <section aria-labelledby="prerequisites-title" className="grid gap-4">
              <SectionHeading
                description="Every selected challenge must be solved before this one is visible."
                id="prerequisites-title"
                title="Prerequisites"
              />
              {challenges.length === 0 ? (
                <EmptyCollection>No existing challenges can be selected.</EmptyCollection>
              ) : (
                <Controller
                  control={control}
                  name="prerequisites"
                  render={({ field }) => (
                    <div className="grid gap-3">
                      {challenges.map((challenge) => (
                        <Checkbox
                          isSelected={field.value.includes(challenge.id)}
                          key={challenge.id}
                          onChange={(isSelected) => {
                            field.onChange(
                              isSelected
                                ? [...field.value, challenge.id]
                                : field.value.filter((id) => id !== challenge.id)
                            );
                          }}
                        >
                          {challenge.name}
                        </Checkbox>
                      ))}
                    </div>
                  )}
                />
              )}
            </section>
          </div>
        </TabsPanel>

        <TabsPanel id="review">
          <div className="grid gap-6">
            <SectionHeading
              description="Resolve validation findings, then inspect the exact create request."
              title="Review"
            />
            {issues.length === 0 ? (
              <Alert
                description="The create request is ready to submit."
                title="Validation passed"
                tone="success"
              />
            ) : (
              <Alert
                actions={
                  <Button onPress={goToFirstIssue} size="small" tone="secondary" type="button">
                    Go to first issue
                  </Button>
                }
                description={
                  <ul className="m-0 grid gap-1 pl-4">
                    {issues.map((issue, index) => (
                      <li key={`${issue.path}-${index}`}>
                        {sectionLabels[issue.section]}: {issue.message}
                      </li>
                    ))}
                  </ul>
                }
                title={`${issues.length} validation ${issues.length === 1 ? 'issue' : 'issues'}`}
                tone="danger"
              />
            )}
            {preview ? (
              <CodeBlock code={preview} label="Create request JSON" language="json" />
            ) : (
              <EmptyCollection>The JSON preview appears after validation passes.</EmptyCollection>
            )}
          </div>
        </TabsPanel>
      </Tabs>

      {error ? <Alert title={error} tone="danger" /> : null}
      {showValidation && issues.length > 0 && selectedSection !== 'review' ? (
        <Alert
          actions={
            <Button
              onPress={() => {
                setSelectedSection('review');
              }}
              size="small"
              tone="secondary"
              type="button"
            >
              Review issues
            </Button>
          }
          title={`${issues.length} validation ${issues.length === 1 ? 'issue' : 'issues'}`}
          tone="danger"
        />
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
        <Button onPress={onRequestClose} tone="quiet" type="button">
          Cancel
        </Button>
        <Button isLoading={isSubmitting} type="submit">
          Create challenge
        </Button>
      </div>
    </Form>
  );
}
