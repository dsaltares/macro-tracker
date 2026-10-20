import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { ThemeColor } from '@/components/theme-color';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import {
  appBackground,
  siteDescription,
  siteName,
  siteShortName,
} from '@/lib/brand';
import { startupImages } from '@/lib/splash';
import { TRPCReactProvider } from '@/lib/trpc/client';
import '@/app/globals.css';

const sans = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-sans',
});

export const metadata: Metadata = {
  title: {
    default: siteName,
    template: `%s · ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  appleWebApp: {
    capable: true,
    title: siteShortName,
    statusBarStyle: 'black-translucent',
    startupImage: startupImages,
  },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: appBackground.light.hex },
    { media: '(prefers-color-scheme: dark)', color: appBackground.dark.hex },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <body className="min-h-dvh font-sans antialiased">
        <TRPCReactProvider>
          <NuqsAdapter>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <ThemeColor />
              {children}
              <Toaster />
            </ThemeProvider>
          </NuqsAdapter>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
