import Link from 'next/link';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

const sections = [
  { href: routes.foods, label: 'Your foods' },
  { href: routes.recipes, label: 'Recipes' },
] as const;

export function FoodsNav({
  current,
}: {
  current: (typeof sections)[number]['href'];
}) {
  return (
    <nav
      aria-label="Foods"
      className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
    >
      {sections.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={href === current ? 'page' : undefined}
          className={cn(
            'flex h-9 items-center justify-center rounded-md font-medium text-muted-foreground text-sm hover:text-foreground',
            href === current && 'bg-background text-foreground shadow-sm',
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
