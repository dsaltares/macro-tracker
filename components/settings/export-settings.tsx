'use client';

import { IconDownload } from '@tabler/icons-react';
import { useState } from 'react';
import { TextField } from '@/components/auth/fields';
import { Button, buttonVariants } from '@/components/ui/button';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

export const rangeEndsBeforeItStarts = 'Choose a date on or after the start.';

const downloadClass = 'h-11 justify-start gap-2 text-sm';

function Download({ href, label }: { href: string | null; label: string }) {
  if (href === null) {
    return (
      <Button variant="outline" size="lg" className={downloadClass} disabled>
        <IconDownload />
        {label}
      </Button>
    );
  }
  return (
    <a
      href={href}
      download
      className={cn(
        buttonVariants({ variant: 'outline', size: 'lg' }),
        downloadClass,
      )}
    >
      <IconDownload />
      {label}
    </a>
  );
}

const withRange = (path: string, from: string, to: string) => {
  const query = new URLSearchParams(
    Object.entries({ from, to }).filter(([, date]) => date !== ''),
  ).toString();
  return query === '' ? path : `${path}?${query}`;
};

export function ExportSettings() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const invalid = from !== '' && to !== '' && to < from;
  const ranged = (path: string) => (invalid ? null : withRange(path, from, to));

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="export-range" className="flex flex-col gap-4">
        <h2 id="export-range" className="font-semibold text-lg">
          Diary and weights
        </h2>
        <p className="text-muted-foreground text-sm">
          A spreadsheet of your diary, one row per entry with every nutrient,
          and one of your weights. Leave a date empty to start at your first
          entry or end at your last.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="From"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
          />
          <TextField
            label="To"
            type="date"
            value={to}
            min={from || undefined}
            error={invalid ? rangeEndsBeforeItStarts : undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Download href={ranged(routes.exportDiary)} label="Diary (CSV)" />
          <Download href={ranged(routes.exportWeights)} label="Weights (CSV)" />
        </div>
      </section>
      <section aria-labelledby="export-all" className="flex flex-col gap-4">
        <h2 id="export-all" className="font-semibold text-lg">
          Everything
        </h2>
        <p className="text-muted-foreground text-sm">
          Your profile, goals, own foods, whole diary and weights in one JSON
          file.
        </p>
        <Download href={routes.exportAll} label="Everything (JSON)" />
      </section>
    </div>
  );
}
