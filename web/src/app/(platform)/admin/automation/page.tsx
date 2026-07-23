import type { Metadata } from 'next';

import { AutomationAdminView } from './automation-admin-view';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = {
  title: 'Automation'
};

export default function AutomationAdminPage() {
  return (
    <div className="grid gap-8">
      <PageHeader title="Automation" />
      <AutomationAdminView />
    </div>
  );
}
