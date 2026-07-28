'use client';

import { Bell, Ellipsis } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  ChallengeWorkspace,
  type ChallengeWorkspaceActions
} from '@/app/(platform)/challenges/challenge-workspace';
import { SessionProvider } from '@/app/session-context';
import {
  Alert,
  AlertDialog,
  AuthoredContent,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  CodeBlock,
  ComboBox,
  CopyButton,
  CopyIconButton,
  Dialog,
  DialogTrigger,
  Disclosure,
  DisclosureGroup,
  DownloadLink,
  EmptyState,
  FileDropZone,
  IconButton,
  KeyboardKey,
  Link,
  Meter,
  Menu,
  MenuTrigger,
  NumberField,
  Pagination,
  Popover,
  PopoverDialog,
  PresenceSummary,
  Progress,
  RadioGroup,
  SearchField,
  Select,
  Sheet,
  SheetTrigger,
  Skeleton,
  StatusIndicator,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  TagGroup,
  TextArea,
  TextField,
  ToastRegion,
  Tooltip,
  TooltipTrigger,
  showToast
} from '@/components/ui';
import type { ChallengeSummary } from '@/lib/api/client';
import { createChallengeExperience } from '@/lib/challenges';

const eventOptions = [
  {
    id: 'foxden',
    label: 'Foxden Invitational',
    description: 'Live Jeopardy event'
  },
  {
    id: 'shrine',
    label: 'Shrine Defense',
    description: 'Attack/Defense rehearsal'
  },
  {
    id: 'workshop',
    label: 'First tails workshop',
    description: 'Guided learning event'
  }
] as const;

const menuOptions = [
  {
    id: 'inspect',
    label: 'Inspect event'
  },
  {
    id: 'settings',
    label: 'Event settings'
  },
  {
    id: 'delete',
    label: 'Delete event',
    isDisabled: true
  }
] as const;

function previewChallenge(
  id: string,
  name: string,
  category: string,
  overrides: Partial<ChallengeSummary> = {}
) {
  return createChallengeExperience(
    {
      category,
      description:
        'Follow the request trail, inspect the response, and submit the flag without losing your place.',
      event_id: 'preview-event',
      id,
      kind: {
        type: 'static_flag'
      },
      max_attempts: 5,
      name,
      position: 0,
      scoring: {
        kind: 'static',
        points: 300
      },
      solved: false,
      state: 'published',
      survey: [],
      tags: ['browser', 'beginner'],
      visibility: {
        division_ids: [],
        prerequisites: [],
        visible_from: null,
        visible_until: null
      },
      writeups_enabled: false,
      ...overrides
    },
    {
      attemptsRemaining: 4,
      solveCount: id === 'survey' ? 41 : 18,
      surveyMode: id === 'survey' ? 'gate' : null,
      surveyRewardFlag: id === 'survey' ? 'kit{survey-complete}' : null
    }
  );
}

const previewChallenges = [
  previewChallenge('survey', 'Welcome survey', 'Welcome', {
    solved: true,
    survey: [
      {
        key: 'experience',
        prompt: 'How familiar are you with CTFs?',
        range: [1, 5],
        required: true
      }
    ]
  }),
  previewChallenge('shrine-gate', 'Shrine gate', 'Web'),
  previewChallenge('cache-route', 'Cache route', 'Web', {
    solved: true
  }),
  previewChallenge('lantern-instance', 'Lantern instance', 'Pwn', {
    kind: {
      template: 'pwn-lantern-v1',
      type: 'dynamic_instance'
    }
  }),
  previewChallenge('after-hours', 'After hours', 'Pwn', {
    solved: true
  }),
  previewChallenge('paper-trail', 'Paper trail', 'Reverse Engineering'),
  previewChallenge('fox-cipher', 'Fox cipher', 'Crypto', {
    scoring: {
      decay: 20,
      initial: 500,
      kind: 'dynamic',
      minimum: 100
    },
    solved: true
  }),
  previewChallenge('cold-storage', 'Cold storage', 'Forensics')
];

const previewChallengeActions: ChallengeWorkspaceActions = {
  loadHints() {
    return Promise.resolve([
      {
        content: null,
        cost: 10,
        id: 1,
        unlocked: false
      }
    ]);
  },
  submitAnswer(challengeId) {
    return Promise.resolve({
      attempts_remaining: 4,
      awarded_points: 300,
      challenge_id: challengeId,
      first_blood: false,
      id: crypto.randomUUID(),
      outcome: 'correct',
      replayed: false,
      submitted_at: new Date().toISOString()
    });
  },
  submitSurvey(challengeId, answers) {
    return Promise.resolve({
      answers,
      challenge_id: challengeId,
      id: crypto.randomUUID(),
      submitted_at: new Date().toISOString()
    });
  },
  unlockHint(_challengeId, hintId) {
    return Promise.resolve({
      charged: 10,
      hint: {
        content: 'The first redirect contains the value you need.',
        cost: 10,
        id: hintId,
        unlocked: true
      },
      replayed: false
    });
  }
};

function ChallengeWorkspacePreview() {
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>('shrine-gate');

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button
          onPress={() => {
            setSelectedChallengeId('survey');
          }}
          size="small"
          tone="secondary"
        >
          Open survey preview
        </Button>
      </div>
      <div className="h-workspace">
        <ChallengeWorkspace
          actions={previewChallengeActions}
          challenges={previewChallenges}
          currentCompetitor={{ id: 'foxden', name: 'Foxden' }}
          eventId="preview-event"
          eventName="Foxden Invitational"
          getChallengeHref={(challengeId) => `#challenge-${challengeId}`}
          onClearSelection={() => {
            setSelectedChallengeId(null);
          }}
          onSelectChallenge={setSelectedChallengeId}
          selectedChallengeId={selectedChallengeId}
        />
      </div>
    </div>
  );
}

interface PreviewSectionProps {
  children: ReactNode;
  id?: string;
  title: string;
}

function PreviewSection({ children, id, title }: PreviewSectionProps) {
  return (
    <section className="grid gap-4 border-t border-border-subtle py-8" id={id}>
      <h3 className="m-0 font-display text-lg font-semibold text-text">{title}</h3>
      {children}
    </section>
  );
}

interface ThemePreviewProps {
  isDark?: boolean;
  title: string;
}

function ThemePreview({ isDark = false, title }: ThemePreviewProps) {
  const [page, setPage] = useState(2);
  const [passphrase, setPassphrase] = useState('short');
  const isPassphraseInvalid = passphrase.length < 12;

  return (
    <section
      className={
        isDark
          ? 'kitsune-theme-scope dark bg-surface text-text'
          : 'kitsune-theme-scope bg-surface text-text'
      }
      data-theme={isDark ? 'dark' : 'light'}
    >
      <div className="mx-auto grid max-w-shell gap-8 px-4 py-12 sm:px-6">
        <h2 className="m-0 font-display text-2xl font-semibold tracking-tight">{title}</h2>

        <PreviewSection title="Buttons and links">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Publish event</Button>
            <Button tone="secondary">Save draft</Button>
            <Button tone="quiet">Preview</Button>
            <Button tone="danger">Delete event</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="small">Small</Button>
            <Button size="medium">Medium</Button>
            <Button size="large">Large</Button>
            <IconButton label="Notification settings" tone="secondary">
              <Bell aria-hidden className="size-4" />
            </IconButton>
            <Button isDisabled>Unavailable</Button>
            <Button isLoading>Publishing event</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <CopyButton
              copiedLabel="Event ID copied"
              label="Copy event ID"
              value="foxden-invitational"
            />
            <CopyIconButton
              copiedLabel="Event link copied"
              label="Copy event link"
              value="https://kitsune.test/events/foxden"
            />
            <span className="flex items-center gap-1">
              <KeyboardKey>J</KeyboardKey>
              <KeyboardKey>K</KeyboardKey>
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href="#forms">Jump to forms</Link>
            <Link href="#tables" tone="muted">
              Inspect tables
            </Link>
            <DownloadLink href="/demo/cache-rules-everything.txt">Download capture</DownloadLink>
            <DownloadLink href="javascript:unsafe">Unavailable download</DownloadLink>
            <Link href="#states" isDisabled>
              Unavailable link
            </Link>
          </div>
        </PreviewSection>

        <PreviewSection title="Forms">
          <div className="grid gap-6 md:grid-cols-2" id="forms">
            <TextField
              description="Shown to competitors before the event begins."
              label="Event name"
              placeholder="Foxden Invitational"
            />
            <TextField
              errorMessage="Use at least 12 characters."
              isInvalid={isPassphraseInvalid}
              label="Operator passphrase"
              onChange={setPassphrase}
              type="password"
              value={passphrase}
            />
            <TextArea
              description="Markdown is supported after saving."
              label="Event description"
              placeholder="Set the scene for competitors."
            />
            <TextField isDisabled label="Canonical event ID" value="evt_foxden" />
            <Select
              description="Controls the active operations context."
              label="Current event"
              options={eventOptions}
              placeholder="Choose an event"
            />
            <ComboBox
              description="Type to narrow the event catalog."
              label="Find an event"
              options={eventOptions}
              placeholder="Search events"
            />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="grid gap-3">
              <Checkbox>Notify captains when this challenge opens</Checkbox>
              <Checkbox isSelected>Publish to the event feed</Checkbox>
              <Checkbox isIndeterminate>Apply to selected divisions</Checkbox>
              <Checkbox isDisabled>Mirror to an unavailable connector</Checkbox>
            </div>
            <div className="grid gap-4">
              <Switch
                description="Competitors can inspect ranks while the event is live."
                label="Public scoreboard"
              />
              <Switch
                description="New score events are withheld until the board is released."
                isSelected
                label="Freeze scoreboard"
              />
              <Switch isDisabled label="External incident relay" />
            </div>
          </div>
          <RadioGroup
            defaultValue="team"
            description="This cannot change after the first accepted solve."
            label="Participation"
            options={[
              {
                value: 'individual',
                label: 'Individuals',
                description: 'Each competitor owns their score.'
              },
              {
                value: 'team',
                label: 'Teams',
                description: 'Members share solves and standing.'
              }
            ]}
          />
        </PreviewSection>

        <PreviewSection title="Overlays and feedback">
          <div className="flex flex-wrap items-center gap-3">
            <DialogTrigger>
              <Button tone="secondary">Open event dialog</Button>
              <Dialog
                actions={
                  <>
                    <Button slot="close" tone="quiet">
                      Keep editing
                    </Button>
                    <Button slot="close">Publish event</Button>
                  </>
                }
                description="Competitors will see the event and every published challenge."
                title="Publish Foxden Invitational?"
              >
                <div className="rounded-md border border-border-subtle bg-surface-sunken p-4">
                  <p className="m-0 text-sm text-text-muted">
                    The event is scheduled for 18:00 UTC. Scoreboard controls remain available
                    during live operations.
                  </p>
                </div>
              </Dialog>
            </DialogTrigger>

            <DialogTrigger>
              <Button tone="danger">Remove team member</Button>
              <AlertDialog
                actions={
                  <>
                    <Button slot="close" tone="quiet">
                      Keep member
                    </Button>
                    <Button slot="close" tone="danger">
                      Remove member
                    </Button>
                  </>
                }
                description="The member loses access to the team roster and team-owned event progress."
                title="Remove this team member?"
              />
            </DialogTrigger>

            <DialogTrigger>
              <Button tone="secondary">Open popover</Button>
              <Popover>
                <PopoverDialog>
                  <div className="grid gap-2">
                    <strong className="font-semibold">Event health is clear</strong>
                    <span className="text-text-muted">
                      API, database, and realtime fanout are ready.
                    </span>
                  </div>
                </PopoverDialog>
              </Popover>
            </DialogTrigger>

            <MenuTrigger>
              <Button aria-label="More event actions" size="icon" tone="secondary">
                <Ellipsis aria-hidden className="size-4" />
              </Button>
              <Menu aria-label="Event actions" options={menuOptions} />
            </MenuTrigger>

            <TooltipTrigger delay={0}>
              <Button tone="quiet">Access policy</Button>
              <Tooltip>RBAC is enforced for this action.</Tooltip>
            </TooltipTrigger>

            <Button
              onPress={() => {
                showToast({
                  title: 'Event published',
                  description: 'Foxden Invitational is now visible to competitors.',
                  tone: 'success'
                });
              }}
            >
              Show success toast
            </Button>
            <Button
              onPress={() => {
                showToast({
                  title: 'Connector unavailable',
                  description: 'Discord is disabled. Enable it in Notifications to retry.',
                  tone: 'danger'
                });
              }}
              tone="secondary"
            >
              Show error toast
            </Button>
          </div>
        </PreviewSection>

        <PreviewSection id="tables" title="Collections">
          <Tabs defaultSelectedKey="ready">
            <TabsList aria-label="Challenge state">
              <TabsTab id="ready">Ready</TabsTab>
              <TabsTab id="loading">Loading</TabsTab>
              <TabsTab id="empty">Empty</TabsTab>
              <TabsTab id="error">Error</TabsTab>
              <TabsTab id="disabled" isDisabled>
                Disabled
              </TabsTab>
            </TabsList>
            <TabsPanel id="ready">
              <ChallengeTable state="ready" />
            </TabsPanel>
            <TabsPanel id="loading">
              <ChallengeTable state="loading" />
            </TabsPanel>
            <TabsPanel id="empty">
              <ChallengeTable state="empty" />
            </TabsPanel>
            <TabsPanel id="error">
              <ChallengeTable state="error" />
            </TabsPanel>
            <TabsPanel id="disabled" />
          </Tabs>
        </PreviewSection>

        <PreviewSection title="Status and feedback">
          <div className="flex flex-wrap gap-2">
            <Badge>Draft</Badge>
            <Badge tone="accent">Live</Badge>
            <Badge tone="success">Healthy</Badge>
            <Badge tone="warning">Degraded</Badge>
            <Badge tone="danger">Failed</Badge>
            <Badge tone="info">Scheduled</Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Alert
              description="All event services are accepting traffic."
              title="Systems operational"
              tone="success"
            />
            <Alert
              description="Two challenge instances are approaching their memory limit."
              title="Capacity needs attention"
              tone="warning"
            />
            <Alert
              description="The Discord connector is disabled until its credentials are replaced."
              title="Connector unavailable"
              tone="danger"
            />
            <Alert
              description="Scoreboard changes become public when the freeze lifts."
              title="Freeze window active"
            />
          </div>
          <div className="flex flex-wrap gap-6">
            <StatusIndicator label="API online" tone="success" />
            <StatusIndicator label="Reaper delayed" tone="warning" />
            <StatusIndicator label="NATS disconnected" tone="danger" />
            <StatusIndicator label="Automation idle" />
          </div>
        </PreviewSection>

        <PreviewSection title="Cards and navigation">
          <Breadcrumbs
            items={[
              { href: '#admin', label: 'Admin' },
              { href: '#events', label: 'Events' },
              { label: 'Foxden Invitational' }
            ]}
          />
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>Foxden Invitational</CardTitle>
                  <Badge tone="accent">Jeopardy</Badge>
                </div>
                <CardDescription>
                  Twelve categories, 48 challenges, and a scheduled freeze window.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  <StatusIndicator label="Live operations healthy" tone="success" />
                  <Progress label="Challenges solved" value={62} />
                </div>
              </CardContent>
              <CardFooter>
                <Button size="small" tone="secondary">
                  Inspect event
                </Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>Shrine Defense</CardTitle>
                  <Badge tone="warning">Attack/Defense</Badge>
                </div>
                <CardDescription>
                  Round checks are healthy; two teams are below their SLA target.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Meter label="Fleet SLA" maxValue={100} minValue={0} tone="warning" value={94} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>First tails</CardTitle>
                  <Badge>Workshop</Badge>
                </div>
                <CardDescription>
                  Guided exercises without scoring for first-time competitors.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TagGroup
                  label="Topics"
                  tags={[
                    { id: 'web', label: 'Web' },
                    { id: 'crypto', label: 'Crypto' },
                    { id: 'forensics', label: 'Forensics' }
                  ]}
                />
              </CardContent>
            </Card>
          </div>
        </PreviewSection>

        <PreviewSection title="Extended controls">
          <div className="grid gap-6 md:grid-cols-2">
            <SearchField
              description="Search names, tags, categories, and authors."
              label="Find a challenge"
              placeholder="Search challenges"
            />
            <NumberField
              defaultValue={4}
              description="The reaper enforces this limit per team."
              label="Concurrent instances"
              maxValue={12}
              minValue={1}
            />
          </div>
          <FileDropZone
            acceptedFileTypes={['.yml', '.yaml']}
            description="Drop a ctfcli challenge.yml file, or choose one from disk."
            label="Import challenge definition"
          />
          <DisclosureGroup>
            <Disclosure
              description="CPU, memory, network, and concurrency ceilings."
              id="quotas"
              title="Instance quotas"
            >
              Quotas protect the shared cluster and can be overridden per division.
            </Disclosure>
            <Disclosure
              description="Expiration, renewal, and idle shutdown rules."
              id="lifecycle"
              title="Lifecycle policy"
            >
              Idle instances are reclaimed after 30 minutes unless a team renews them.
            </Disclosure>
          </DisclosureGroup>
          <div className="flex flex-wrap items-center gap-3">
            <SheetTrigger>
              <Button tone="secondary">Open inspector</Button>
              <Sheet
                description="Review the effective configuration before publishing."
                footer={
                  <>
                    <Button slot="close" tone="quiet">
                      Close
                    </Button>
                    <Button slot="close">Apply changes</Button>
                  </>
                }
                title="Challenge inspector"
              >
                <CodeBlock
                  code={'type: dynamic\ncategory: pwn\nvalue: 500\ninstance:\n  ttl: 30m'}
                  label="challenge.yml"
                  language="yaml"
                />
              </Sheet>
            </SheetTrigger>
            <Pagination currentPage={page} onPageChange={setPage} totalPages={6} />
          </div>
        </PreviewSection>

        <PreviewSection title="Authored content and presence">
          <div className="rounded-md border border-border-subtle bg-surface-sunken p-4">
            <AuthoredContent
              content={`# Objective

Trace the **cache key** and submit the flag from \`/status\`.

- Inspect the response headers
- Follow the signed redirect

| Endpoint | Protocol |
| --- | --- |
| cache.foxden.test | HTTPS |

\`\`\`sh
curl https://cache.foxden.test/status
\`\`\``}
            />
          </div>
          <PresenceSummary
            people={[
              { id: 'mina', name: 'Mina Park' },
              { id: 'theo', name: 'Theo Bell' }
            ]}
          />
        </PreviewSection>

        <PreviewSection title="Challenge workspace">
          <ChallengeWorkspacePreview />
        </PreviewSection>

        <PreviewSection id="states" title="Async states">
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-2/3" />
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </CardContent>
            </Card>
            <EmptyState
              action={<Button size="small">Create challenge</Button>}
              description="Author a challenge here or import a challenge.yml definition."
              title="No challenges yet"
            />
            <Alert
              actions={
                <Button size="small" tone="secondary">
                  Retry
                </Button>
              }
              description="The API did not respond. Check service health and try again."
              title="Challenges could not be loaded"
              tone="danger"
            />
          </div>
        </PreviewSection>
      </div>
    </section>
  );
}

interface ChallengeTableProps {
  state: 'empty' | 'error' | 'loading' | 'ready';
}

function ChallengeTable({ state }: ChallengeTableProps) {
  const hasRows = state === 'ready';

  return (
    <Table aria-label="Challenges">
      <TableHeader>
        <TableColumn isRowHeader>Name</TableColumn>
        <TableColumn>Category</TableColumn>
        <TableColumn>Value</TableColumn>
        <TableColumn>Status</TableColumn>
      </TableHeader>
      <TableBody
        emptyState="No challenges yet. Create the first challenge to start authoring."
        errorState="Could not load challenges. Check the API connection and retry."
        isError={state === 'error'}
        isLoading={state === 'loading'}
        loadingState="Loading challenges"
      >
        {hasRows ? (
          <>
            <TableRow id="shrine-gate">
              <TableCell>Shrine Gate</TableCell>
              <TableCell>Web</TableCell>
              <TableCell>300</TableCell>
              <TableCell>
                <span className="text-success-text">Published</span>
              </TableCell>
            </TableRow>
            <TableRow id="nine-lives">
              <TableCell>Nine Lives</TableCell>
              <TableCell>Reverse engineering</TableCell>
              <TableCell>500</TableCell>
              <TableCell>
                <span className="text-warning-text">Draft</span>
              </TableCell>
            </TableRow>
          </>
        ) : null}
      </TableBody>
    </Table>
  );
}

export function KitchenSinkPage() {
  return (
    <SessionProvider initialSession={null}>
      <>
        <main>
          <div className="border-b border-border-subtle bg-surface-sunken">
            <div className="mx-auto flex max-w-shell items-center px-4 py-4 sm:px-6">
              <h1 className="m-0 font-display text-lg font-semibold tracking-tight">
                Kitsune kitchen
              </h1>
            </div>
          </div>
          <ThemePreview title="Light theme" />
          <ThemePreview isDark title="Dark theme" />
        </main>
        <ToastRegion />
      </>
    </SessionProvider>
  );
}
