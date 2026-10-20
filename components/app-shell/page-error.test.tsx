import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageError } from '@/components/app-shell/page-error';
import { renderUi } from '@/test/ui';

describe('PageError', () => {
  it('says the page failed and retries on request', async () => {
    const retry = vi.fn();
    const { user } = renderUi(<PageError retry={retry} />);

    expect(
      screen.getByRole('heading', { name: 'Something went wrong', level: 1 }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
