import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const lastUpdated = '20 October 2026';

export const supportEmail = 'saltares.dev@gmail.com';

export const operator = 'Saltares Marquez David Persoana Fizica Autorizata';

export const siteHost = 'macros.saltares.dev';

export function LegalDocument({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
        <p className="max-w-prose text-muted-foreground text-pretty">
          {summary}
        </p>
        <p className="text-muted-foreground text-xs">
          {siteHost} · Last updated {lastUpdated}
        </p>
      </header>
      {children}
    </article>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3">
      <h2 className="font-semibold text-foreground text-lg tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function LegalHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-semibold text-foreground text-sm tracking-tight">
      {children}
    </h3>
  );
}

export function Prose({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex max-w-prose flex-col gap-3 text-muted-foreground text-sm text-pretty',
        '[&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-foreground',
        '[&_strong]:font-semibold [&_strong]:text-foreground',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-foreground [&_code]:text-xs',
        '[&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Callout({ children }: { children: ReactNode }) {
  return (
    <Prose className="rounded-lg border-ring border-l-2 bg-card px-4 py-3 ring-1 ring-foreground/10">
      {children}
    </Prose>
  );
}

export type LegalTableRow = {
  key: string;
  cells: readonly ReactNode[];
};

export function LegalTable({
  columns,
  headings,
  rows,
}: {
  columns: string;
  headings: readonly string[];
  rows: readonly LegalTableRow[];
}) {
  return (
    <div className="max-w-prose text-muted-foreground text-sm">
      <div
        aria-hidden="true"
        className={cn(
          columns,
          'hidden gap-x-4 border-b pb-2 font-medium text-foreground text-xs sm:grid',
        )}
      >
        {headings.map((heading) => (
          <span key={heading}>{heading}</span>
        ))}
      </div>
      <ul className="flex flex-col gap-3 sm:gap-0 sm:divide-y">
        {rows.map(({ key, cells }) => (
          <li
            key={key}
            className="rounded-lg bg-card p-3 ring-1 ring-foreground/10 sm:rounded-none sm:bg-transparent sm:p-0 sm:py-3 sm:ring-0"
          >
            <dl className={cn(columns, 'flex flex-col gap-3 sm:gap-x-4')}>
              {cells.map((cell, position) => (
                <div
                  key={headings[position] ?? String(position)}
                  className="flex flex-col gap-0.5"
                >
                  <dt className="font-medium text-foreground text-xs sm:sr-only">
                    {headings[position]}
                  </dt>
                  <dd className="text-pretty [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-foreground [&_code]:text-xs [&_strong]:font-semibold [&_strong]:text-foreground">
                    {cell}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
