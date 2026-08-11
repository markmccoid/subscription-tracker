import { useLocalSearchParams } from 'expo-router';

import type { SubscriptionId } from '@/domain/model';
import { ReactivateSubscriptionScreen } from '@/features/subscriptions/subscription-lifecycle-screens';

export default function ReactivateSubscriptionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReactivateSubscriptionScreen id={id as SubscriptionId} />;
}
