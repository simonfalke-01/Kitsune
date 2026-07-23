import type { Metadata } from 'next';

import { ChallengeAdminView } from './challenge-admin-view';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = {
  title: 'Challenge authoring'
};

export default function ChallengeAdminPage() {
  return (
    <div className="grid gap-8">
      <PageHeader title="Challenge authoring" />
      <ChallengeAdminView />
    </div>
  );
}
