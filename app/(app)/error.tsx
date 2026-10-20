'use client';

import { PageError } from '@/components/app-shell/page-error';

export default function AppError({ reset }: { reset: () => void }) {
  return <PageError retry={reset} />;
}
