import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export type Account = {
  email: string;
  image?: string | null | undefined;
};

export function AccountAvatar({
  account: { email, image },
  className,
}: {
  account: Account;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-8', className)}>
      {image ? <AvatarImage src={image} alt="" /> : null}
      <AvatarFallback>{email.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
