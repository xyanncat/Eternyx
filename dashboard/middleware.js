import { NextResponse } from 'next/server';

export function middleware(req) {
  const accessKey = process.env.DASHBOARD_ACCESS_KEY ?? 'demo';
  if (req.cookies.get('eternyx_auth')?.value === accessKey) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL('/', req.url));
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
