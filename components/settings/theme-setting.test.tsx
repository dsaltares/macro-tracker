import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeSetting } from '@/components/settings/theme-setting';
import { renderUi } from '@/test/ui';

describe('ThemeSetting', () => {
  it('follows the device until a theme is picked, then keeps that one', async () => {
    const { user } = renderUi(<ThemeSetting />);

    expect(await screen.findByRole('radio', { name: /^System/ })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(document.documentElement).toHaveClass('dark');
  });
});
