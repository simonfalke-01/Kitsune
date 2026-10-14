import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { KitchenSinkPage } from '@/components/kitchen-sink';

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false
  },
  title: 'Component kitchen'
};

export default function KitchenPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <KitchenSinkPage />;
}
