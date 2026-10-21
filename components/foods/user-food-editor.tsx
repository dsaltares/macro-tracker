'use client';

import { IconScan } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormError } from '@/components/auth/fields';
import { ArchiveFoodDialog } from '@/components/foods/archive-food-dialog';
import {
  UserFoodForm,
  type UserFoodSubmission,
} from '@/components/foods/user-food-form';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Food } from '@/lib/db/food-search';
import {
  type LabelFood,
  labelReadingToFood,
} from '@/lib/domain/foods/label-reading';
import { addToDiaryHref, type DiaryMeal, routes } from '@/lib/routes';
import { useTRPC } from '@/lib/trpc/client';
import { isConflict } from '@/lib/trpc/failure';

const LabelCapture = dynamic(
  () =>
    import('@/components/label-scan/label-capture').then(
      ({ LabelCapture }) => LabelCapture,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-36 w-full" />,
  },
);

export const foodLoadFailed = 'This food could not be loaded.';

export const notEditable = 'Only your own foods can be edited.';

function useAfterSave() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  return async (next: string) => {
    await queryClient.invalidateQueries({ queryKey: trpc.food.pathKey() });
    router.push(next);
  };
}

export function NewUserFood({
  barcode,
  diary = null,
  labelScanning = false,
  scanFirst = false,
}: {
  barcode: string;
  diary?: DiaryMeal | null;
  labelScanning?: boolean;
  scanFirst?: boolean;
}) {
  const trpc = useTRPC();
  const afterSave = useAfterSave();
  const create = useMutation(
    trpc.food.create.mutationOptions({
      onSuccess: (foodId) =>
        afterSave(
          diary === null ? routes.foods : addToDiaryHref({ ...diary, foodId }),
        ),
    }),
  );
  const [scanning, setScanning] = useState(labelScanning && scanFirst);
  const [label, setLabel] = useState<LabelFood | null>(null);

  if (scanning) {
    return (
      <div className="flex flex-col gap-3">
        <LabelCapture
          onRead={(reading) => {
            setLabel(labelReadingToFood(reading));
            setScanning(false);
          }}
        />
        <Button
          variant="ghost"
          size="lg"
          className="h-11"
          onClick={() => setScanning(false)}
        >
          Type it in instead
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {labelScanning ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11"
          onClick={() => setScanning(true)}
        >
          <IconScan className="size-5" />
          {label === null ? 'Scan a label instead' : 'Scan the label again'}
        </Button>
      ) : null}
      <UserFoodForm
        key={label === null ? 'typed' : 'scanned'}
        label={label}
        barcode={barcode}
        submit="Create food"
        saving={create.isPending || create.isSuccess}
        failed={create.isError && !isConflict(create.error)}
        conflict={create.isError && isConflict(create.error)}
        onSave={(food: UserFoodSubmission) => create.mutate(food)}
      />
    </div>
  );
}

function ArchiveFood({ food }: { food: Food }) {
  const afterSave = useAfterSave();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 text-destructive"
        onClick={() => setOpen(true)}
      >
        Archive food
      </Button>
      <ArchiveFoodDialog
        food={food}
        open={open}
        onOpenChange={setOpen}
        onArchived={() => afterSave(routes.foods)}
      />
    </>
  );
}

function EditFood({ food }: { food: Food }) {
  const trpc = useTRPC();
  const afterSave = useAfterSave();
  const update = useMutation(
    trpc.food.update.mutationOptions({
      onSuccess: () => afterSave(routes.foods),
    }),
  );

  return (
    <UserFoodForm
      food={food}
      submit="Save food"
      saving={update.isPending || update.isSuccess}
      failed={update.isError && !isConflict(update.error)}
      conflict={update.isError && isConflict(update.error)}
      onSave={(fields) => update.mutate({ id: food.id, ...fields })}
    >
      <ArchiveFood food={food} />
    </UserFoodForm>
  );
}

export function EditUserFood({ foodId }: { foodId: string }) {
  const trpc = useTRPC();
  const food = useQuery(trpc.food.get.queryOptions(foodId, { retry: false }));

  if (food.isPending) {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (food.isError) {
    return <FormError>{foodLoadFailed}</FormError>;
  }
  if (food.data.source !== 'user' || food.data.archived) {
    return <p className="text-muted-foreground text-sm">{notEditable}</p>;
  }
  return <EditFood food={food.data} />;
}
