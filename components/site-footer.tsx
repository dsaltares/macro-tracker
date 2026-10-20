import Link from 'next/link';
import { legalDocuments } from '@/lib/navigation';

export const dataSourcesUrl =
  'https://github.com/dsaltares/macro-tracker/blob/main/docs/DATA-SOURCES.md';

const linkClass = 'underline underline-offset-4 hover:text-foreground';

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-md px-4 pb-6 text-muted-foreground text-xs">
      <nav aria-label="Legal and attribution">
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {legalDocuments.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} className={linkClass}>
                {label}
              </Link>
            </li>
          ))}
          <li>
            <a
              href={dataSourcesUrl}
              target="_blank"
              rel="noreferrer"
              className={linkClass}
            >
              Data sources
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
