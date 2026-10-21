'use client';

import { IconCopy, IconDots, IconTrash } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DiaryEntry } from '@/lib/db/diary';
import { useTRPC } from '@/lib/trpc/client';

export const deleteFailed = 'The entry could not be deleted. Try again.';

export const copiedEntry = (label: string) =>
  `Copied ${label}: paste it from a meal’s options`;

export const deletedEntry = (label: string) => `Deleted ${label}`;

export function EntryMenu({
  entry,
  onCopy,
}: {
  entry: DiaryEntry;
  onCopy: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const remove = useMutation(
    trpc.diary.remove.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.diary.pathKey(),
        });
        toast.success(deletedEntry(entry.label));
      },
      onError: () => toast.error(deleteFailed),
    }),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="mr-1 size-11 shrink-0 text-muted-foreground"
          />
        }
      >
        <IconDots className="size-5" />
        <span className="sr-only">Options for {entry.label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onClick={() => {
            onCopy();
            toast.success(copiedEntry(entry.label));
          }}
        >
          <IconCopy />
          Copy
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={remove.isPending}
          onClick={() => remove.mutate(entry.id)}
        >
          <IconTrash />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
