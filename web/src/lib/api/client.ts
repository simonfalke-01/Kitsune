import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

export type Session = components['schemas']['SessionResponse'];
export type LoginInput = components['schemas']['LoginRequest'];
export type RegisterInput = components['schemas']['RegisterRequest'];
export type SetupInput = components['schemas']['SetupRequest'];
export type ApiErrorBody = components['schemas']['ErrorBody'];
export type EventSummary = components['schemas']['EventResponse'];
export type CreateEventInput = components['schemas']['CreateEventRequest'];
export type UpdateEventStateInput = components['schemas']['UpdateEventStateRequest'];
export type UpdateScoreboardControlsInput =
  components['schemas']['UpdateScoreboardControlsRequest'];
export type ChallengeSummary = components['schemas']['ChallengeResponse'];
export type CreateChallengeInput = components['schemas']['CreateChallengeRequest'];
export type TeamSummary = components['schemas']['TeamResponse'];
export type CreateTeamInput = components['schemas']['CreateTeamRequest'];
export type JoinTeamInput = components['schemas']['JoinTeamRequest'];
export type SubmitAnswerInput = components['schemas']['SubmitAnswerRequest'];
export type SubmissionReceipt = components['schemas']['SubmissionResponse'];
export type Scoreboard = components['schemas']['ScoreboardResponse'];
export type ScoreboardRow = components['schemas']['ScoreboardRowResponse'];
export type ChallengeHint = components['schemas']['HintResponse'];
export type HintUnlockReceipt = components['schemas']['HintUnlockResponse'];
export type Writeup = components['schemas']['WriteupResponse'];
export type SaveWriteupInput = components['schemas']['SaveWriteupRequest'];
export type ReviewWriteupInput = components['schemas']['ReviewWriteupRequest'];
export type SurveyInput = components['schemas']['SubmitSurveyRequest'];
export type SurveyReceipt = components['schemas']['SurveyResponse'];
export type SurveySummary = components['schemas']['SurveySummaryResponse'];

export const api = createClient<paths>({
  baseUrl: '',
  credentials: 'include',
  headers: { accept: 'application/json' }
});

export function errorMessage(error: ApiErrorBody | undefined, fallback: string): string {
  return error?.message ?? fallback;
}
