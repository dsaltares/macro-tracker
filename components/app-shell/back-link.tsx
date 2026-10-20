import { IconChevronLeft } from '@tabler/icons-react';
import Link from 'next/link';

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="-ml-3 flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
    >
      <IconChevronLeft className="size-5" />
    </Link>
  );
}
