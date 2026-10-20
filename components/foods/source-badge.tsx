import { Badge } from '@/components/ui/badge';
import type { Source } from '@/lib/domain/foods/sources';

export const sourceBadges: Record<Source, string> = {
  off: 'Open Food Facts',
  ciqual: 'CIQUAL',
  cofid: 'CoFID',
  usda: 'USDA',
  user: 'My food',
};

export function SourceBadge({ source }: { source: Source }) {
  return <Badge variant="outline">{sourceBadges[source]}</Badge>;
}
