import { NextResponse } from 'next/server';
import { readQueue } from '@/lib/store';

export const dynamic = 'force-dynamic';

// The phone pulls its pending setup-command queue here every 60s:
// Authorization: Bearer <DASHBOARD_INGEST_KEY>.
export async function GET(req) {
  const expected = process.env.DASHBOARD_INGEST_KEY;
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!expected || got !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const commands = await readQueue();
  return NextResponse.json({ ok: true, commands });
}
