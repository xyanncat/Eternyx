import { NextResponse } from 'next/server';
import { enqueueCommand, readQueue, readResults } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Cookie-authenticated by middleware (matcher includes /api/setup).
// Body: { action, params } — enqueued for the phone; results appear after
// the bot's next sync cycle (~60s).
const KNOWN_ACTIONS = new Set([
  'set-log-channel',
  'set-mod-role',
  'add-mod-role',
  'set-raid-threshold',
  'set-nuke-auto-action',
  'set-control-channel',
  'post-panel',
  'lockdown-on',
  'lockdown-off',
  'announce',
  'set-slowmode',
  'lock-channel',
  'unlock-channel',
  'automod-keyword',
  'automod-invite',
  'automod-preset',
  'automod-mention-spam',
  'automod-remove',
]);

export async function GET() {
  const [queue, results] = await Promise.all([readQueue(), readResults()]);
  return NextResponse.json({ ok: true, queue, results });
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (typeof action !== 'string' || !KNOWN_ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
  }
  try {
    const command = await enqueueCommand({
      action,
      params: body.params ?? {},
      createdBy: 'dashboard',
    });
    return NextResponse.json({ ok: true, id: command.id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'queue unavailable' }, { status: 503 });
  }
}
