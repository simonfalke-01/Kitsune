'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow
} from '@/components/ui';
import { api, errorMessage, type ChallengeSummary, type SurveySummary } from '@/lib/api/client';

interface SurveySummaryPanelProps {
  challenges: ChallengeSummary[];
  eventId: string;
}

function formatAverage(value: number | null | undefined): string {
  if (typeof value !== 'number') {
    return 'No responses';
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2
  }).format(value);
}

export function SurveySummaryPanel({ challenges, eventId }: SurveySummaryPanelProps) {
  const surveyChallenges = useMemo(
    () => challenges.filter((challenge) => challenge.survey.length > 0),
    [challenges]
  );
  const [challengeId, setChallengeId] = useState(surveyChallenges[0]?.id ?? '');
  const [summary, setSummary] = useState<SurveySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(surveyChallenges.length > 0);
  const selectedChallenge = surveyChallenges.find((challenge) => challenge.id === challengeId);

  const load = useCallback(async () => {
    if (!challengeId) {
      setSummary(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await api.GET(
        '/api/v1/events/{event_id}/challenges/{challenge_id}/survey-summary',
        {
          params: {
            path: {
              challenge_id: challengeId,
              event_id: eventId
            }
          }
        }
      );

      if (!result.data) {
        setError(errorMessage(result.error, 'The survey summary could not be loaded.'));
        return;
      }

      setSummary(result.data);
    } catch {
      setError('The survey summary could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  }, [challengeId, eventId]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [load]);

  if (surveyChallenges.length === 0) {
    return (
      <EmptyState
        description="Add survey questions to a challenge to collect response summaries."
        title="No challenge surveys"
      />
    );
  }

  return (
    <div aria-busy={isLoading} className="grid gap-6">
      <div className="max-w-prose">
        <Select
          label="Challenge"
          onSelectionChange={(key) => {
            setChallengeId(String(key));
            setSummary(null);
          }}
          options={surveyChallenges.map((challenge) => ({
            id: challenge.id,
            label: challenge.name
          }))}
          selectedKey={challengeId}
        />
      </div>

      {error ? (
        <Alert
          actions={
            <Button
              isLoading={isLoading}
              onPress={() => {
                void load();
              }}
              size="small"
              tone="secondary"
            >
              Retry
            </Button>
          }
          title={error}
          tone="danger"
        />
      ) : null}

      {isLoading ? (
        <div aria-label="Loading survey summary" className="grid gap-3" role="status">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : summary && !error ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="m-0 font-display text-lg font-semibold tracking-tight text-text">
              {selectedChallenge?.name ?? 'Survey summary'}
            </h3>
            <Badge tone="accent">
              {summary.response_count} {summary.response_count === 1 ? 'response' : 'responses'}
            </Badge>
          </div>
          {summary.questions.length === 0 ? (
            <EmptyState
              description="Responses will appear after competitors answer the survey."
              title="No survey responses"
            />
          ) : (
            <Table aria-label={`${selectedChallenge?.name ?? 'Challenge'} survey summary`}>
              <TableHeader>
                <TableColumn isRowHeader>Question</TableColumn>
                <TableColumn>Responses</TableColumn>
                <TableColumn>Average</TableColumn>
                <TableColumn>Range</TableColumn>
              </TableHeader>
              <TableBody emptyState="No survey questions.">
                {summary.questions.map((question) => (
                  <TableRow id={question.key} key={question.key}>
                    <TableCell>{question.prompt}</TableCell>
                    <TableCell>{question.responses}</TableCell>
                    <TableCell>{formatAverage(question.average)}</TableCell>
                    <TableCell>
                      {typeof question.minimum === 'number' && typeof question.maximum === 'number'
                        ? `${question.minimum} to ${question.maximum}`
                        : 'No responses'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ) : null}
    </div>
  );
}
