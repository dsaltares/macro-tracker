import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export type Account = {
  email: string;
};

export function AccountAvatar({
  account: { email },
  className,
}: {
  account: Account;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-8', className)}>
      <AvatarFallback>{email.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
