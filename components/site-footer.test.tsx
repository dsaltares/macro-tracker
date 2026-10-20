import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dataSourcesUrl } from '@/lib/navigation';
import { renderUi } from '@/test/ui';
import { SiteFooter } from './site-footer.tsx';

describe('SiteFooter', () => {
  it('links to the privacy policy, the terms and the cookie policy', () => {
    renderUi(<SiteFooter />);

    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer).getByRole('link', { name: 'Privacy policy' }),
    ).toHaveAttribute('href', '/privacy');
    expect(
      within(footer).getByRole('link', { name: 'Terms and conditions' }),
    ).toHaveAttribute('href', '/terms');
    expect(
      within(footer).getByRole('link', { name: 'Cookie policy' }),
    ).toHaveAttribute('href', '/cookies');
  });

  it('links to the attribution of every data source', () => {
    renderUi(<SiteFooter />);

    expect(screen.getByRole('link', { name: 'Data sources' })).toHaveAttribute(
      'href',
      dataSourcesUrl,
    );
  });
});
