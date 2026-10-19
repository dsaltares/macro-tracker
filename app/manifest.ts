import type { MetadataRoute } from 'next';
import {
  appBackground,
  siteDescription,
  siteName,
  siteShortName,
} from '@/lib/brand';
import { routes } from '@/lib/routes';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: routes.home,
    name: siteName,
    short_name: siteShortName,
    description: siteDescription,
    start_url: routes.home,
    scope: routes.home,
    display: 'standalone',
    orientation: 'portrait',
    background_color: appBackground.dark.hex,
    theme_color: appBackground.dark.hex,
    icons: [
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
