import type { Metadata } from 'next';
import { VerifyAddress } from '@/components/auth/verify-address';
import { verificationErrorMessage } from '@/lib/auth/errors';
import { emailParam, errorParam, nextParam } from '@/lib/auth/redirect';
import { onlyParam, type SearchParams } from '@/lib/auth/session';
import { onwardIfSignedIn } from '../onward';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Confirm your address' };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const parameters = await onwardIfSignedIn(searchParams);
  const error = onlyParam(parameters[errorParam]);
  return (
    <>
      <h1 className="font-semibold text-2xl">Confirm your address</h1>
      <VerifyAddress
        email={onlyParam(parameters[emailParam])}
        error={error ? verificationErrorMessage(error) : undefined}
        next={onlyParam(parameters[nextParam]) ?? null}
      />
    </>
  );
}
