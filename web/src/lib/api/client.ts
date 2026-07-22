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
export type ScoreHistory = components['schemas']['ScoreHistoryResponse'];
export type ScoreHistorySeries = components['schemas']['ScoreHistorySeriesResponse'];
export type ScoreHistoryPoint = components['schemas']['ScoreHistoryPointResponse'];
export type ChallengeHint = components['schemas']['HintResponse'];
export type HintUnlockReceipt = components['schemas']['HintUnlockResponse'];
export type Writeup = components['schemas']['WriteupResponse'];
export type SaveWriteupInput = components['schemas']['SaveWriteupRequest'];
export type ReviewWriteupInput = components['schemas']['ReviewWriteupRequest'];
export type SurveyInput = components['schemas']['SubmitSurveyRequest'];
export type SurveyReceipt = components['schemas']['SurveyResponse'];
export type SurveySummary = components['schemas']['SurveySummaryResponse'];
export type ManualReview = components['schemas']['ManualReviewResponse'];
export type ReviewManualSubmissionInput = components['schemas']['ReviewManualSubmissionRequest'];
export type OidcProvider = components['schemas']['OidcProviderResponse'];
export type PublicOidcProvider = components['schemas']['PublicOidcProviderResponse'];
export type CreateOidcProviderInput = components['schemas']['CreateOidcProviderRequest'];
export type UpdateOidcProviderInput = components['schemas']['UpdateOidcProviderRequest'];
export type SamlProvider = components['schemas']['SamlProviderResponse'];
export type PublicSamlProvider = components['schemas']['PublicSamlProviderResponse'];
export type CreateSamlProviderInput = components['schemas']['CreateSamlProviderRequest'];
export type UpdateSamlProviderInput = components['schemas']['UpdateSamlProviderRequest'];
export type PasskeySummary = components['schemas']['PasskeyResponse'];
export type PasskeyCeremony = components['schemas']['PasskeyCeremonyResponse'];
export type PasskeyBrowserCredential = components['schemas']['PasskeyBrowserCredential'];

export const api = createClient<paths>({
  baseUrl: '',
  credentials: 'include',
  headers: { accept: 'application/json' }
});

export function errorMessage(error: ApiErrorBody | undefined, fallback: string): string {
  return error?.message ?? fallback;
}
