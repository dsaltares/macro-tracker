import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUi } from '@/test/ui';
import { dataSourcesUrl, SiteFooter } from './site-footer.tsx';

describe('SiteFooter', () => {
  it('links to the attribution of every data source', () => {
    renderUi(<SiteFooter />);

    expect(screen.getByRole('link', { name: 'Data sources' })).toHaveAttribute(
      'href',
      dataSourcesUrl,
    );
  });
});
