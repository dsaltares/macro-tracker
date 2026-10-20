import { siteName } from '../../brand.ts';
import { type ActionEmailCopy, actionEmail } from './action-email.tsx';

export const resetPasswordCopy: ActionEmailCopy = {
  subject: `Reset your ${siteName} password`,
  preview: 'Choose a new password. The link expires in an hour.',
  heading: 'Reset your password',
  body: `Someone asked to reset the password on your ${siteName} account. Choose a new one here.`,
  button: 'Choose a new password',
  footer:
    'The link expires in an hour and works once. If you did not ask for it, ignore this email — your password stays as it is.',
};

export const resetPasswordEmail = ({ to, url }: { to: string; url: string }) =>
  actionEmail({ to, url, copy: resetPasswordCopy });
