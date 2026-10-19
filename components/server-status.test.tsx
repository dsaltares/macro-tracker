import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { serveApi } from '@/test/api';
import { ServerStatus } from './server-status';

const api = serveApi();

describe('ServerStatus', () => {
  it('says the server is connected once health answers', async () => {
    render(api.wrap(<ServerStatus />));

    expect(screen.getByRole('status')).toHaveTextContent('Connecting…');
    expect(await screen.findByText('Server connected')).toBeInTheDocument();
  });

  it('says the server is unreachable when health fails', async () => {
    api.fails('health.check');

    render(api.wrap(<ServerStatus />));

    expect(await screen.findByText('Server unreachable')).toBeInTheDocument();
  });
});
