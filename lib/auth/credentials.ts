import { z } from 'zod';

export const minPasswordLength = 12;
export const maxPasswordLength = 128;

export const passwordHint = `At least ${minPasswordLength} characters. Three unrelated words work well.`;

export const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .pipe(z.email('That does not look like an email address.'))
  .transform((value) => value.toLowerCase());

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
});

const chosenPassword = {
  password: z
    .string()
    .min(minPasswordLength, `Use at least ${minPasswordLength} characters.`)
    .max(maxPasswordLength, `Keep it under ${maxPasswordLength} characters.`),
  confirmPassword: z.string().min(1, 'Repeat your password.'),
};

const bothTheSame = ({
  password,
  confirmPassword,
}: {
  password: string;
  confirmPassword: string;
}) => password === confirmPassword;

const mismatch = {
  message: 'Those two passwords do not match.',
  path: ['confirmPassword'],
};

export const signUpSchema = z
  .object({ email, ...chosenPassword })
  .refine(bothTheSame, mismatch);

export const addressSchema = z.object({ email });

export const newPasswordSchema = z
  .object(chosenPassword)
  .refine(bothTheSame, mismatch);

export type SignInCredentials = z.infer<typeof signInSchema>;
export type SignUpCredentials = z.infer<typeof signUpSchema>;
export type Address = z.infer<typeof addressSchema>;
export type NewPassword = z.infer<typeof newPasswordSchema>;

export const displayNameFor = (address: string) =>
  address.slice(0, address.indexOf('@'));
