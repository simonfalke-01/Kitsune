import type {
  ChallengeHint,
  HintUnlockReceipt,
  SaveWriteupInput,
  SubmissionReceipt,
  SurveyReceipt,
  Writeup
} from '@/lib/api/client';

export interface ChallengeWorkspaceActions {
  loadHints: (challengeId: string) => Promise<ChallengeHint[]>;
  loadWriteup?: (challengeId: string) => Promise<Writeup | null>;
  saveWriteup?: (challengeId: string, input: SaveWriteupInput) => Promise<Writeup>;
  submitAnswer: (challengeId: string, answer: string) => Promise<SubmissionReceipt>;
  submitSurvey: (challengeId: string, answers: Record<string, number>) => Promise<SurveyReceipt>;
  unlockHint: (challengeId: string, hintId: number) => Promise<HintUnlockReceipt>;
}
