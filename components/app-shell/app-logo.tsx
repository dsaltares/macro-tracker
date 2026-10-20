import Image from 'next/image';
import { cn } from '@/lib/utils';

export function AppLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/icon.svg"
      alt=""
      width={32}
      height={32}
      unoptimized
      className={cn('size-8 shrink-0 rounded-lg', className)}
    />
  );
}
