import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BottomNav } from '@/components/app-shell/bottom-nav';
import { atPathname } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));

const renderAt = (path: string) => {
  atPathname(path);
  renderUi(<BottomNav />);
  return within(screen.getByRole('navigation', { name: 'Main' }));
};

describe('BottomNav', () => {
  it('links to the diary, foods, trends and settings, in that order', () => {
    const nav = renderAt('/diary');

    expect(
      nav
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Diary', '/diary'],
      ['Foods', '/foods'],
      ['Trends', '/trends'],
      ['Settings', '/settings'],
    ]);
  });

  it.each([
    ['/diary', 'Diary'],
    ['/foods', 'Foods'],
    ['/trends', 'Trends'],
    ['/settings', 'Settings'],
  ])('marks only the tab of %s as the current page', (path, tab) => {
    const nav = renderAt(path);

    expect(nav.getByRole('link', { current: 'page' })).toHaveAccessibleName(
      tab,
    );
  });

  it('keeps Settings current on a settings section', () => {
    const nav = renderAt('/settings/food-sources');

    expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('marks no tab current outside them', () => {
    const nav = renderAt('/diaryish');

    expect(nav.queryByRole('link', { current: 'page' })).toBeNull();
  });
});
