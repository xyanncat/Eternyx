import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { key } = await req.json().catch(() => ({ key: null }));
  const accessKey = process.env.DASHBOARD_ACCESS_KEY ?? 'demo';
  const demoMode = !process.env.DASHBOARD_ACCESS_KEY;

  if (key !== accessKey) {
    return NextResponse.json({ ok: false, demoMode }, { status: 401 });
  }
  const store = await cookies();
  store.set('eternyx_auth', accessKey, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return NextResponse.json({ ok: true, demoMode });
}
