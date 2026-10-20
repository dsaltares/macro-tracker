import { type NextRequest, NextResponse } from 'next/server';
import { requestPathHeader } from './lib/request-path.ts';

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  const { pathname, search } = request.nextUrl;
  headers.set(requestPathHeader, `${pathname}${search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!api/|_next/|icons/|manifest.webmanifest|favicon.ico).*)'],
};
