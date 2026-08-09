import { useLocalSearchParams } from 'expo-router';

import type { SubscriptionId } from '@/domain/model';
import { BillingOccurrenceScreen } from '@/features/dashboard/billing-occurrence-screen';

export default function BillingOccurrenceRoute() {
  const { subscriptionId, billingDate } = useLocalSearchParams<{
    subscriptionId: string;
    billingDate: string;
  }>();
  return <BillingOccurrenceScreen subscriptionId={subscriptionId as SubscriptionId} billingDate={billingDate} />;
}
