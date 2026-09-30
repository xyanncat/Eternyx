import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST() {
  const store = await cookies();
  store.delete('eternyx_auth');
  return NextResponse.json({ ok: true });
}
