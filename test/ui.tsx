import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';

export type UiOptions = {
  wrap?: (children: ReactNode) => ReactNode;
};

export const renderUi = (ui: ReactElement, { wrap }: UiOptions = {}) => ({
  user: userEvent.setup(),
  ...render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {wrap ? wrap(children) : children}
      </ThemeProvider>
    ),
  }),
});
