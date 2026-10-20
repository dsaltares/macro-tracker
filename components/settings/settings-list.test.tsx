import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsList } from '@/components/settings/settings-list';
import { settingsSections } from '@/lib/navigation';
import { renderUi } from '@/test/ui';

describe('SettingsList', () => {
  it('links to the live sections and marks the rest as coming', () => {
    renderUi(<SettingsList sections={settingsSections} />);

    expect(screen.getByRole('link', { name: /^Profile/ })).toHaveAttribute(
      'href',
      '/settings/profile',
    );
    expect(screen.getByRole('link', { name: /^Food sources/ })).toHaveAttribute(
      'href',
      '/settings/food-sources',
    );
    expect(screen.getByRole('link', { name: /^Account/ })).toHaveAttribute(
      'href',
      '/settings/account',
    );
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.getAllByText('Coming soon')).toHaveLength(3);
    expect(screen.getByText('Goals')).toBeInTheDocument();
  });
});
