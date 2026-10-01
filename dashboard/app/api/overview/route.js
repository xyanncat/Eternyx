import { NextResponse } from 'next/server';
import { readSnapshot, readQueue, readResults } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Cookie-authenticated (middleware matcher) — one call for the client poller.
export async function GET() {
  const [snapshot, queue, results] = await Promise.all([readSnapshot(), readQueue(), readResults()]);
  return NextResponse.json({ ok: true, snapshot, queue, results });
}
