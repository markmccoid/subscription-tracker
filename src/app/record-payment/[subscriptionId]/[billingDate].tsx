import { useLocalSearchParams } from 'expo-router';

import type { SubscriptionId } from '@/domain/model';
import { RecordPaymentScreen } from '@/features/dashboard/record-payment-screen';

export default function RecordPaymentRoute() {
  const { subscriptionId, billingDate } = useLocalSearchParams<{ subscriptionId: string; billingDate: string }>();
  return <RecordPaymentScreen subscriptionId={subscriptionId as SubscriptionId} billingDate={billingDate} />;
}
