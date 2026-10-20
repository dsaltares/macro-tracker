import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignInForm } from '@/components/auth/sign-in-form';
import { googleConfigured } from '@/lib/auth/google';
import type { SearchParams } from '@/lib/auth/session';
import { onwardIfSignedIn } from '../onward';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await onwardIfSignedIn(searchParams);
  return (
    <>
      <h1 className="font-semibold text-2xl">Sign in</h1>
      <Suspense>
        <SignInForm google={googleConfigured()} />
      </Suspense>
    </>
  );
}
