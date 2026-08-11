import { useLocalSearchParams } from 'expo-router';

import type { SubscriptionId } from '@/domain/model';
import { CancelSubscriptionScreen } from '@/features/subscriptions/subscription-lifecycle-screens';

export default function CancelSubscriptionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CancelSubscriptionScreen id={id as SubscriptionId} />;
}
