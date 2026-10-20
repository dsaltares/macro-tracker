'use client';

import { IconBrandGoogle } from '@tabler/icons-react';
import { useState } from 'react';
import { submitButtonClass } from '@/components/auth/auth-form';
import { FormError } from '@/components/auth/fields';
import { Button } from '@/components/ui/button';
import { signIn } from '@/lib/auth/client';
import { termsRequired } from '@/lib/auth/credentials';
import { authErrorMessage } from '@/lib/auth/errors';
import { afterAuthPath, authUrl } from '@/lib/auth/redirect';
import { routes } from '@/lib/routes';

export function GoogleButton({
  next,
  disabled,
  consent,
}: {
  next: string | null;
  disabled: boolean;
  consent?: (() => Promise<boolean>) | undefined;
}) {
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    setFailure(undefined);
    if (consent && !(await consent())) {
      setFailure(termsRequired);
      return;
    }
    setPending(true);
    const { error } = await signIn.social({
      provider: 'google',
      callbackURL: afterAuthPath(next),
      errorCallbackURL: authUrl(routes.signIn, next),
      ...(consent ? { additionalData: { termsAccepted: true } } : {}),
    });
    if (error) {
      setPending(false);
      setFailure(authErrorMessage(error));
    }
  };

  return (
    <>
      {failure ? <FormError>{failure}</FormError> : null}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className={submitButtonClass}
        disabled={disabled || pending}
        onClick={onClick}
      >
        <IconBrandGoogle />
        {pending ? 'Going to Google…' : 'Continue with Google'}
      </Button>
    </>
  );
}
