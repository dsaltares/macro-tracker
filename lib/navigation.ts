import { routes } from './routes.ts';

export type LegalDocument = {
  href: string;
  label: string;
};

export const privacyPolicy: LegalDocument = {
  href: routes.privacy,
  label: 'Privacy policy',
};

export const terms: LegalDocument = {
  href: routes.terms,
  label: 'Terms and conditions',
};

export const cookiePolicy: LegalDocument = {
  href: routes.cookies,
  label: 'Cookie policy',
};

export const legalDocuments: readonly LegalDocument[] = [
  privacyPolicy,
  terms,
  cookiePolicy,
];
