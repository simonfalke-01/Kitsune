import { redirect } from 'next/navigation';

import { getServerSession } from '@/lib/api/server';

export default async function HomePage() {
  let session: Awaited<ReturnType<typeof getServerSession>> = null;

  try {
    session = await getServerSession();
  } catch {
    redirect('/login');
  }

  redirect(session ? '/challenges' : '/login');
}
