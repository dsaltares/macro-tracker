'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormError } from '@/components/auth/fields';
import {
  UserFoodForm,
  type UserFoodSubmission,
} from '@/components/foods/user-food-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { Food } from '@/lib/db/food-search';
import { routes } from '@/lib/routes';
import { useTRPC } from '@/lib/trpc/client';
import { isConflict } from '@/lib/trpc/failure';

export const foodLoadFailed = 'This food could not be loaded.';

export const notEditable = 'Only your own foods can be edited.';

export const archiveFailed = 'The food could not be archived. Try again.';

function useAfterSave() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.food.pathKey() });
    router.push(routes.foods);
  };
}

export function NewUserFood({ barcode }: { barcode: string }) {
  const trpc = useTRPC();
  const afterSave = useAfterSave();
  const create = useMutation(
    trpc.food.create.mutationOptions({ onSuccess: afterSave }),
  );

  return (
    <UserFoodForm
      barcode={barcode}
      submit="Create food"
      saving={create.isPending || create.isSuccess}
      failed={create.isError && !isConflict(create.error)}
      conflict={create.isError && isConflict(create.error)}
      onSave={(food: UserFoodSubmission) => create.mutate(food)}
    />
  );
}

function ArchiveFood({ food }: { food: Food }) {
  const trpc = useTRPC();
  const afterSave = useAfterSave();
  const [open, setOpen] = useState(false);
  const archive = useMutation(
    trpc.food.archive.mutationOptions({ onSuccess: afterSave }),
  );
  const working = archive.isPending || archive.isSuccess;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 text-destructive"
        onClick={() => setOpen(true)}
      >
        Archive food
      </Button>
      <DialogContent className="text-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Archive {food.name}?</DialogTitle>
          <DialogDescription>
            It leaves your foods, search and barcode lookups. Entries you
            already logged keep it.
          </DialogDescription>
        </DialogHeader>
        {archive.isError ? <FormError>{archiveFailed}</FormError> : null}
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" className="h-11" />}
            disabled={working}
          >
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            className="h-11"
            disabled={working}
            onClick={() => archive.mutate(food.id)}
          >
            {working ? 'Archiving…' : 'Archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditFood({ food }: { food: Food }) {
  const trpc = useTRPC();
  const afterSave = useAfterSave();
  const update = useMutation(
    trpc.food.update.mutationOptions({ onSuccess: afterSave }),
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
