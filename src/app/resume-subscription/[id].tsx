import { useLocalSearchParams } from 'expo-router';

import type { SubscriptionId } from '@/domain/model';
import { ResumeSubscriptionScreen } from '@/features/subscriptions/subscription-lifecycle-screens';

export default function ResumeSubscriptionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ResumeSubscriptionScreen id={id as SubscriptionId} />;
}
