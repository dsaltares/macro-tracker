import {
  IconChevronRight,
  IconDatabase,
  IconDownload,
  IconKey,
  IconTarget,
  IconUser,
  IconUserCircle,
} from '@tabler/icons-react';
import Link from 'next/link';
import type { SettingsSection } from '@/lib/navigation';

const sectionIcons: Record<string, typeof IconUser> = {
  Profile: IconUser,
  Goals: IconTarget,
  'Food sources': IconDatabase,
  'API keys': IconKey,
  Export: IconDownload,
  Account: IconUserCircle,
};

function SectionText({ label, description }: SettingsSection) {
  const Icon = sectionIcons[label] ?? IconUser;
  return (
    <span className="flex items-center gap-4">
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground text-sm">{description}</span>
      </span>
    </span>
  );
}

export function SettingsList({
  sections,
}: {
  sections: readonly SettingsSection[];
}) {
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {sections.map((section) => (
        <li key={section.label}>
          {section.href === null ? (
            <div
              aria-disabled="true"
              className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 opacity-60"
            >
              <SectionText {...section} />
              <span className="shrink-0 text-muted-foreground text-xs">
                Coming soon
              </span>
            </div>
          ) : (
            <Link
              href={section.href}
              className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 hover:bg-muted"
            >
              <SectionText {...section} />
              <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
