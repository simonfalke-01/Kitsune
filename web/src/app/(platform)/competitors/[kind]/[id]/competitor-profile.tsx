import type { ReactNode } from 'react';

import { ProfileAnalytics } from '@/components/charts/profile-analytics';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Link } from '@/components/ui/link';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type { EventSummary, ScoreHistorySeries } from '@/lib/api/client';
import {
  competitorKindLabel,
  competitorMembershipLabel,
  competitorProfileHref,
  formatCompetitorNumber,
  formatCompetitorTimestamp,
  type CompetitorKind,
  type NormalizedCompetitorProfile
} from '@/lib/competitors';

interface CompetitorProfileViewProps {
  event: EventSummary;
  history?: ScoreHistorySeries | null;
  profile: NormalizedCompetitorProfile;
}

interface AssociationRow {
  captain: boolean;
  id: string;
  joinedAt: string;
  kind: CompetitorKind;
  name: string;
}

function SectionHeading({ children, id }: { children: ReactNode; id: string }) {
  return (
    <h2 className="m-0 font-display text-xl font-semibold tracking-tight text-text" id={id}>
      {children}
    </h2>
  );
}

function ProfileStat({
  detail,
  label,
  value
}: {
  detail?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <span className="grid content-start gap-1">
      <span className="text-xs font-semibold tracking-wide text-text-muted">{label}</span>
      <strong className="text-lg font-semibold tabular-nums text-text">{value}</strong>
      {detail ? <span className="text-xs text-text-subtle">{detail}</span> : null}
    </span>
  );
}

function RegistrationDetails({
  eventName,
  profile
}: {
  eventName: string;
  profile: NormalizedCompetitorProfile;
}) {
  const registration = profile.registration;

  return (
    <section aria-labelledby="registration-title" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading id="registration-title">Registration</SectionHeading>
        <Badge tone={registration ? 'success' : 'neutral'}>
          {registration ? 'Registered' : 'Not registered'}
        </Badge>
      </div>
      <Card>
        <CardContent className="pt-6">
          {registration ? (
            <dl className="m-0 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1">
                <dt className="text-xs font-semibold tracking-wide text-text-muted">Registered</dt>
                <dd className="m-0 text-sm text-text">
                  <time dateTime={registration.registered_at}>
                    {formatCompetitorTimestamp(registration.registered_at)}
                  </time>
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-xs font-semibold tracking-wide text-text-muted">
                  Profile created
                </dt>
                <dd className="m-0 text-sm text-text">
                  <time dateTime={profile.created_at}>
                    {formatCompetitorTimestamp(profile.created_at)}
                  </time>
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-xs font-semibold tracking-wide text-text-muted">Division</dt>
                <dd className="m-0 text-sm text-text">
                  {registration.division_name ?? 'Not assigned'}
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-xs font-semibold tracking-wide text-text-muted">Bracket</dt>
                <dd className="m-0 text-sm text-text">
                  {registration.bracket_name ?? 'Not assigned'}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="grid gap-2">
              <p className="m-0 text-sm text-text-muted">
                This competitor has no registration for {eventName}.
              </p>
              <p className="m-0 text-xs text-text-subtle">
                Profile created{' '}
                <time dateTime={profile.created_at}>
                  {formatCompetitorTimestamp(profile.created_at)}
                </time>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function ProfileAssociations({ profile }: { profile: NormalizedCompetitorProfile }) {
  const isTeam = profile.competitor_kind === 'team';
  const rows: AssociationRow[] = isTeam
    ? profile.members.map((member) => ({
        captain: member.captain,
        id: member.user_id,
        joinedAt: member.joined_at,
        kind: 'user',
        name: member.display_name
      }))
    : profile.teams.map((team) => ({
        captain: team.captain,
        id: team.team_id,
        joinedAt: team.joined_at,
        kind: 'team',
        name: team.team_name
      }));
  const heading = isTeam ? 'Roster' : 'Teams';

  return (
    <section aria-labelledby="associations-title" className="grid gap-4">
      <SectionHeading id="associations-title">{heading}</SectionHeading>
      <Table aria-label={`${profile.name} ${heading.toLowerCase()}`}>
        <TableHeader>
          <TableColumn isRowHeader>{isTeam ? 'Competitor' : 'Team'}</TableColumn>
          <TableColumn>Role</TableColumn>
          <TableColumn className="text-right">Joined</TableColumn>
        </TableHeader>
        <TableBody emptyState={isTeam ? 'No public roster members.' : 'No team associations.'}>
          {rows.map((row) => (
            <TableRow id={`${row.kind}-${row.id}`} key={`${row.kind}-${row.id}`}>
              <TableCell>
                <Link href={competitorProfileHref(row.kind, row.id)}>{row.name}</Link>
              </TableCell>
              <TableCell>
                <Badge tone={row.captain ? 'accent' : 'neutral'}>
                  {competitorMembershipLabel(row.captain)}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-text-muted">
                <time dateTime={row.joinedAt}>{formatCompetitorTimestamp(row.joinedAt)}</time>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function RecentSolves({ profile }: { profile: NormalizedCompetitorProfile }) {
  if (profile.scoreboard_hidden) {
    return (
      <section aria-labelledby="recent-solves-title" className="grid gap-4">
        <SectionHeading id="recent-solves-title">Recent solves</SectionHeading>
        <EmptyState
          description="Recent activity is concealed while event standings are hidden."
          title="Solve history unavailable"
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="recent-solves-title" className="grid gap-4">
      <SectionHeading id="recent-solves-title">Recent solves</SectionHeading>
      <Table aria-label={`${profile.name} recent solves`}>
        <TableHeader>
          <TableColumn isRowHeader>Challenge</TableColumn>
          <TableColumn>Category</TableColumn>
          <TableColumn className="text-right">Solved</TableColumn>
          <TableColumn className="text-right">Points</TableColumn>
        </TableHeader>
        <TableBody emptyState="No visible solves for this event.">
          {profile.recent_solves.map((solve) => (
            <TableRow id={solve.challenge_id} key={solve.challenge_id}>
              <TableCell>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{solve.challenge_name}</span>
                  {solve.first_blood ? <Badge tone="accent">First solve</Badge> : null}
                </span>
              </TableCell>
              <TableCell className="text-text-muted">{solve.category}</TableCell>
              <TableCell className="text-right text-text-muted">
                <time dateTime={solve.solved_at}>{formatCompetitorTimestamp(solve.solved_at)}</time>
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCompetitorNumber(solve.awarded_points)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

export function CompetitorProfileView({
  event,
  history = null,
  profile
}: CompetitorProfileViewProps) {
  const standing = profile.standing;
  const kindLabel = competitorKindLabel(profile.competitor_kind);
  const solveTimestamps = profile.recent_solves
    .map((solve) => Date.parse(solve.solved_at))
    .filter(Number.isFinite);
  const eventStart = event.starts_at ? Date.parse(event.starts_at) : Math.min(...solveTimestamps);
  const resolvedStart = Number.isFinite(eventStart) ? eventStart : Date.parse(profile.created_at);
  const eventEnd = event.ends_at ? Date.parse(event.ends_at) : Math.max(...solveTimestamps);
  const resolvedEnd = Number.isFinite(eventEnd)
    ? Math.max(resolvedStart + 1, eventEnd)
    : resolvedStart + 1;

  return (
    <div className="grid gap-8">
      <PageHeader
        actions={<Badge tone="accent">{kindLabel}</Badge>}
        breadcrumbs={[{ href: '/scoreboard', label: 'Scoreboard' }, { label: profile.name }]}
        title={profile.name}
      />

      {profile.scoreboard_hidden ? (
        <Alert
          description="Rank, score, and solve activity remain concealed for this event."
          title="Standings hidden"
          tone="info"
        />
      ) : null}
      {!profile.scoreboard_hidden && profile.scoreboard_frozen ? (
        <Alert
          description="Visible totals and activity follow your scoreboard access."
          title="Standings frozen"
          tone="warning"
        />
      ) : null}

      <section
        aria-label="Event standing"
        className="grid gap-4 border-y border-border-subtle py-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <ProfileStat detail={kindLabel} label="Event" value={event.name} />
        <ProfileStat
          detail={
            standing ? (
              <time dateTime={standing.reached_at}>
                Reached {formatCompetitorTimestamp(standing.reached_at)}
              </time>
            ) : undefined
          }
          label="Rank"
          value={standing ? formatCompetitorNumber(standing.rank) : 'Not ranked'}
        />
        <ProfileStat
          label="Score"
          value={standing ? formatCompetitorNumber(standing.score) : 'Unavailable'}
        />
        <ProfileStat
          label="Solves"
          value={standing ? formatCompetitorNumber(standing.solves) : 'Unavailable'}
        />
      </section>

      <div className="grid items-start gap-8 xl:grid-cols-2">
        <div className="grid gap-8">
          <RegistrationDetails eventName={event.name} profile={profile} />
          <ProfileAssociations profile={profile} />
          <RecentSolves profile={profile} />
        </div>
        {!profile.scoreboard_hidden ? (
          <section aria-labelledby="profile-analytics-title" className="grid gap-6">
            <SectionHeading id="profile-analytics-title">Analytics</SectionHeading>
            <ProfileAnalytics
              competitorId={profile.competitor_id}
              competitorName={profile.name}
              end={resolvedEnd}
              scoreHistory={history}
              solves={profile.recent_solves.map((solve) => ({
                category: solve.category,
                challengeId: solve.challenge_id,
                challengeName: solve.challenge_name,
                points: solve.awarded_points,
                solvedAt: Date.parse(solve.solved_at)
              }))}
              start={resolvedStart}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}
