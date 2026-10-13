import { useLocalSearchParams } from 'expo-router';

import type { LifecycleEventId, SubscriptionId } from '@/domain/model';
import { SubscriptionDetailScreen } from '@/features/subscriptions/subscription-detail-screen';

export default function SubscriptionDetailRoute() {
  const { id, lifecycleEventId } = useLocalSearchParams<{ id: string; lifecycleEventId?: string }>();
  return (
    <SubscriptionDetailScreen
      id={id as SubscriptionId}
      highlightedEventId={lifecycleEventId as LifecycleEventId | undefined}
    />
  );
}
