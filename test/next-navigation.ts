import { vi } from 'vitest';

let params = new URLSearchParams();

let pathname = '/';

export const atPathname = (path: string) => {
  pathname = path;
};

export const atSearchParams = (search: string) => {
  params = new URLSearchParams(search);
};

export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

export const useSearchParams = () => params;

export const usePathname = () => pathname;

export const useRouter = () => router;
