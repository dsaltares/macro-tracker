'use client';

import { useMutation } from '@tanstack/react-query';
import { FormError } from '@/components/auth/fields';
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
import { useTRPC } from '@/lib/trpc/client';

export const archiveFailed = 'The food could not be archived. Try again.';

export function ArchiveFoodDialog({
  food,
  open,
  onOpenChange,
  onArchived,
}: {
  food: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived: () => Promise<unknown> | undefined;
}) {
  const trpc = useTRPC();
  const archive = useMutation(
    trpc.food.archive.mutationOptions({ onSuccess: onArchived }),
  );
  const working = archive.isPending || archive.isSuccess;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
