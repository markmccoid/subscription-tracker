import { useLocalSearchParams } from 'expo-router';

import type { SubscriptionId } from '@/domain/model';
import { PauseSubscriptionScreen } from '@/features/subscriptions/subscription-lifecycle-screens';

export default function PauseSubscriptionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PauseSubscriptionScreen id={id as SubscriptionId} />;
}
