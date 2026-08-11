import { useLocalSearchParams } from 'expo-router';

import type { SubscriptionId } from '@/domain/model';
import { EditCancellationDetailsScreen } from '@/features/subscriptions/subscription-lifecycle-screens';

export default function EditCancellationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditCancellationDetailsScreen id={id as SubscriptionId} />;
}
