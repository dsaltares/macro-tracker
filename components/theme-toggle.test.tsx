import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUi } from '@/test/ui';
import { ThemeToggle } from './theme-toggle.tsx';

describe('ThemeToggle', () => {
  it('marks the theme that was picked as the current one', async () => {
    const { user } = renderUi(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: 'Change theme' }));
    await user.click(screen.getByRole('menuitem', { name: 'Dark' }));
    await user.click(screen.getByRole('button', { name: 'Change theme' }));

    expect(screen.getByRole('menuitem', { name: 'Dark' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(
      screen.getByRole('menuitem', { name: 'System' }),
    ).not.toHaveAttribute('aria-current');
  });
});
