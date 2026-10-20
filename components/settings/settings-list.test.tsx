import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsList } from '@/components/settings/settings-list';
import { settingsSections } from '@/lib/navigation';
import { renderUi } from '@/test/ui';

describe('SettingsList', () => {
  it('links to every section', () => {
    renderUi(<SettingsList sections={settingsSections} />);

    expect(screen.getByRole('link', { name: /^Profile/ })).toHaveAttribute(
      'href',
      '/settings/profile',
    );
    expect(screen.getByRole('link', { name: /^Goals/ })).toHaveAttribute(
      'href',
      '/settings/goals',
    );
    expect(screen.getByRole('link', { name: /^Food sources/ })).toHaveAttribute(
      'href',
      '/settings/food-sources',
    );
    expect(screen.getByRole('link', { name: /^API keys/ })).toHaveAttribute(
      'href',
      '/settings/api-keys',
    );
    expect(screen.getByRole('link', { name: /^Export/ })).toHaveAttribute(
      'href',
      '/settings/export',
    );
    expect(screen.getByRole('link', { name: /^Account/ })).toHaveAttribute(
      'href',
      '/settings/account',
    );
    expect(screen.getAllByRole('link')).toHaveLength(6);
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });
});
