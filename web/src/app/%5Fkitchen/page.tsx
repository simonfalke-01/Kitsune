import type { Metadata } from 'next';

import { KitchenSinkPage } from '@/components/kitchen-sink';

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false
  },
  title: 'Component kitchen'
};

export default function KitchenPage() {
  return <KitchenSinkPage />;
}
