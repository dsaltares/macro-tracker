import {
  IconChartLine,
  IconNotebook,
  IconSettings,
  IconToolsKitchen2,
} from '@tabler/icons-react';
import { routes } from '@/lib/routes';

export type TabIcon = typeof IconNotebook;

const tabIcons: Record<string, TabIcon> = {
  [routes.diary]: IconNotebook,
  [routes.foods]: IconToolsKitchen2,
  [routes.trends]: IconChartLine,
  [routes.settings]: IconSettings,
};

export const tabIcon = (href: string) => tabIcons[href] ?? IconNotebook;
