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

export const dataSourcesUrl =
  'https://github.com/dsaltares/macro-tracker/blob/main/docs/DATA-SOURCES.md';

export const sourceCodeUrl = 'https://github.com/dsaltares/macro-tracker';

export type AppTab = {
  href: string;
  label: string;
};

export const appTabs: readonly AppTab[] = [
  { href: routes.diary, label: 'Diary' },
  { href: routes.foods, label: 'Foods' },
  { href: routes.trends, label: 'Trends' },
  { href: routes.settings, label: 'Settings' },
];

export const isActiveTab = (pathname: string, { href }: AppTab) =>
  pathname === href || pathname.startsWith(`${href}/`);

export type SettingsSection = {
  label: string;
  description: string;
  href: string | null;
};

export const settingsSections: readonly SettingsSection[] = [
  {
    label: 'Profile',
    description: 'Sex, date of birth, height and activity',
    href: routes.profile,
  },
  {
    label: 'Goals',
    description: 'Your energy and nutrient targets',
    href: null,
  },
  {
    label: 'Food sources',
    description: 'Which food tables your search includes',
    href: routes.foodSources,
  },
  {
    label: 'API keys',
    description: 'Log food from other apps and scripts',
    href: null,
  },
  {
    label: 'Export',
    description: 'Everything you logged, as CSV and JSON',
    href: null,
  },
  {
    label: 'Account',
    description: 'Your address, and deleting your account',
    href: routes.account,
  },
];
