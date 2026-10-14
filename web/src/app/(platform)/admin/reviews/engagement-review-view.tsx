'use client';

import { useState } from 'react';
import type { Key } from 'react-aria-components';

import { ManualReviewPanel } from './manual-review-panel';
import { SurveySummaryPanel } from './survey-summary-panel';
import { WriteupReviewPanel } from './writeup-review-panel';
import { useEvent } from '../../../event-context';
import { useSession } from '../../../session-context';
import { Alert, EmptyState, Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui';

type ReviewWorkspace = 'manual' | 'surveys' | 'writeups';

export function EngagementReviewView() {
  const { challenges, selectedEvent } = useEvent();
  const { can, session } = useSession();
  const [workspace, setWorkspace] = useState<ReviewWorkspace>('writeups');

  if (!can('submission_manage')) {
    return <Alert title="Engagement review is unavailable for this account." tone="danger" />;
  }

  if (!selectedEvent) {
    return (
      <EmptyState description="Choose an event from the navigation." title="No event selected" />
    );
  }

  if (!session?.csrf_token) {
    return <Alert title="The session could not authorize review decisions." tone="danger" />;
  }

  const selectWorkspace = (key: Key) => {
    setWorkspace(String(key) as ReviewWorkspace);
  };

  return (
    <Tabs onSelectionChange={selectWorkspace} selectedKey={workspace}>
      <TabsList aria-label="Engagement review workspace">
        <TabsTab id="writeups">Writeups</TabsTab>
        <TabsTab id="manual">Manual submissions</TabsTab>
        <TabsTab id="surveys">Survey summaries</TabsTab>
      </TabsList>
      <TabsPanel id="writeups">
        {workspace === 'writeups' ? (
          <WriteupReviewPanel
            csrfToken={session.csrf_token}
            eventId={selectedEvent.id}
            key={selectedEvent.id}
          />
        ) : null}
      </TabsPanel>
      <TabsPanel id="manual">
        {workspace === 'manual' ? (
          <ManualReviewPanel
            csrfToken={session.csrf_token}
            eventId={selectedEvent.id}
            key={selectedEvent.id}
          />
        ) : null}
      </TabsPanel>
      <TabsPanel id="surveys">
        {workspace === 'surveys' ? (
          <SurveySummaryPanel
            challenges={challenges}
            eventId={selectedEvent.id}
            key={selectedEvent.id}
          />
        ) : null}
      </TabsPanel>
    </Tabs>
  );
}
