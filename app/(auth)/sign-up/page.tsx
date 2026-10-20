import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { googleConfigured } from '@/lib/auth/google';
import type { SearchParams } from '@/lib/auth/session';
import { onwardIfSignedIn } from '../onward';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await onwardIfSignedIn(searchParams);
  return (
    <>
      <h1 className="font-semibold text-2xl">Create account</h1>
      <Suspense>
        <SignUpForm google={googleConfigured()} />
      </Suspense>
    </>
  );
}
