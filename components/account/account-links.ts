import {
  IconBrandGithub,
  IconCookie,
  IconDatabase,
  IconFileText,
  IconShieldLock,
} from '@tabler/icons-react';
import {
  cookiePolicy,
  dataSourcesUrl,
  privacyPolicy,
  sourceCodeUrl,
  terms,
} from '@/lib/navigation';

export type AccountLink = {
  href: string;
  label: string;
  Icon: typeof IconFileText;
  external: boolean;
};

export const accountLinks: readonly AccountLink[] = [
  { ...privacyPolicy, Icon: IconShieldLock, external: false },
  { ...terms, Icon: IconFileText, external: false },
  { ...cookiePolicy, Icon: IconCookie, external: false },
  {
    href: dataSourcesUrl,
    label: 'Data sources',
    Icon: IconDatabase,
    external: true,
  },
  {
    href: sourceCodeUrl,
    label: 'GitHub',
    Icon: IconBrandGithub,
    external: true,
  },
];
