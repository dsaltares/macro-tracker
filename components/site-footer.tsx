export const dataSourcesUrl =
  'https://github.com/dsaltares/macro-tracker/blob/main/docs/DATA-SOURCES.md';

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-md px-4 pb-6 text-muted-foreground text-xs">
      <a
        href={dataSourcesUrl}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-4"
      >
        Data sources
      </a>
    </footer>
  );
}
