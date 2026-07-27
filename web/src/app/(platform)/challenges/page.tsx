import type { Metadata } from 'next';

import { ChallengeBoard } from './challenge-board';

export const metadata: Metadata = {
  title: 'Challenges'
};

export default function ChallengesPage() {
  return <ChallengeBoard />;
}
