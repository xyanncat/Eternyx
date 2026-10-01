import { NextResponse } from 'next/server';
import { writeSnapshot, acknowledgeCommands } from '@/lib/store';

export const dynamic = 'force-dynamic';

// The phone pushes here every 60s: Authorization: Bearer <DASHBOARD_INGEST_KEY>.
// Payload: snapshot + acks for executed queue commands.
export async function POST(req) {
  const expected = process.env.DASHBOARD_INGEST_KEY;
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!expected || got !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.bot || !Array.isArray(body.usage)) {
    return NextResponse.json({ ok: false, error: 'bad payload' }, { status: 400 });
  }
  try {
    // First execute the command side-effects (drain executed ids, append results),
    // then store the snapshot itself.
    if (Array.isArray(body.acks) && body.acks.length > 0) {
      await acknowledgeCommands(body.acks);
    }
    await writeSnapshot({ ...body, receivedAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'store unavailable' }, { status: 503 });
  }
}
