import type { Metadata } from 'next';

import { ChallengeBoard } from './challenge-board';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = {
  title: 'Challenges'
};

export default function ChallengesPage() {
  return (
    <div className="grid gap-8">
      <PageHeader title="Challenges" />
      <ChallengeBoard />
    </div>
  );
}
