import { vi } from 'vitest';

let params = new URLSearchParams();

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

export const useRouter = () => router;
