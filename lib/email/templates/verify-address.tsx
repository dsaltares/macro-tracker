import { siteName } from '../../brand.ts';
import { type ActionEmailCopy, actionEmail } from './action-email.tsx';

export const verifyAddressCopy: ActionEmailCopy = {
  subject: `Confirm your ${siteName} email`,
  preview: 'Confirm your address. The link expires in an hour.',
  heading: 'Confirm your email address',
  body: `Someone used this address to create a ${siteName} account. Confirm it here and you are in.`,
  button: 'Confirm my address',
  footer:
    'The link expires in an hour and works once. If you did not ask for it, ignore this email — nobody can use the account until the address is confirmed.',
};

export const verifyAddressEmail = ({ to, url }: { to: string; url: string }) =>
  actionEmail({ to, url, copy: verifyAddressCopy });
