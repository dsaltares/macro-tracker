import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-semibold text-2xl">Reset your password</h1>
      <ForgotPasswordForm />
    </>
  );
}
