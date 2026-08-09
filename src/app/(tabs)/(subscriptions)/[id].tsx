import { useLocalSearchParams } from 'expo-router';

import type { SubscriptionId } from '@/domain/model';
import { SubscriptionDetailScreen } from '@/features/subscriptions/subscription-detail-screen';

export default function SubscriptionDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SubscriptionDetailScreen id={id as SubscriptionId} />;
}
