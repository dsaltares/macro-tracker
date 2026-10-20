'use client';

import { IconArrowLeft } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { FormError } from '@/components/auth/fields';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Food } from '@/lib/db/food-search';
import { type DiaryMeal, newFoodHref } from '@/lib/routes';
import { useTRPC } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

export const lookupFailed = 'The barcode could not be looked up. Try again.';

export const notFound = (code: string) => `No food has the barcode ${code}.`;

const BarcodeScanner = dynamic(
  () =>
    import('@/components/scanner/barcode-scanner').then(
      ({ BarcodeScanner }) => BarcodeScanner,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="aspect-[3/4] w-full rounded-lg" />,
  },
);

function NotFound({
  code,
  diary,
  onSearchByName,
  onScanAgain,
}: {
  code: string;
  diary: DiaryMeal;
  onSearchByName: () => void;
  onScanAgain: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="py-2 text-center">{notFound(code)}</p>
      <Button size="lg" className="h-11" onClick={onSearchByName}>
        Search by name
      </Button>
      <Link
        href={newFoodHref({ barcode: code, diary })}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'lg' }),
          'h-11',
        )}
      >
        Create food
      </Link>
      <Link
        href={newFoodHref({ barcode: code, scanLabel: true, diary })}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'lg' }),
          'h-11',
        )}
      >
        Scan the label
      </Link>
      <Button variant="ghost" size="lg" className="h-11" onClick={onScanAgain}>
        Scan again
      </Button>
    </div>
  );
}

export function ScanStep({
  diary,
  onBack,
  onFound,
}: {
  diary: DiaryMeal;
  onBack: () => void;
  onFound: (food: Food) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [scans, setScans] = useState(0);
  const lookup = useMutation({
    mutationFn: (code: string) =>
      queryClient.fetchQuery(trpc.food.byBarcode.queryOptions(code)),
    onSuccess: (food) => {
      if (food !== null) {
        onFound(food);
      }
    },
    onError: () => setScans((count) => count + 1),
  });
  const missed =
    lookup.isSuccess && lookup.data === null ? lookup.variables : null;
  const scanAgain = () => {
    lookup.reset();
    setScans((count) => count + 1);
  };

  return (
    <section
      aria-label="Scan a barcode"
      className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <Button
        variant="ghost"
        className="-ml-2 h-11 self-start"
        onClick={onBack}
      >
        <IconArrowLeft className="size-5" />
        Back to search
      </Button>
      {missed === null ? (
        <>
          {lookup.isError ? <FormError>{lookupFailed}</FormError> : null}
          <BarcodeScanner
            key={scans}
            onDetected={(code) => {
              if (lookup.isIdle || lookup.isError) {
                lookup.mutate(code);
              }
            }}
          />
          {lookup.isPending ? (
            <p role="status" className="text-center text-sm">
              Looking up {lookup.variables}…
            </p>
          ) : null}
        </>
      ) : (
        <NotFound
          code={missed}
          diary={diary}
          onSearchByName={onBack}
          onScanAgain={scanAgain}
        />
      )}
    </section>
  );
}
