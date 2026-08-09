import { useLocalSearchParams } from 'expo-router';

import type { SubscriptionId } from '@/domain/model';
import { RecordNoChargeScreen } from '@/features/dashboard/record-no-charge-screen';

export default function RecordNoChargeRoute() {
  const { subscriptionId, billingDate } = useLocalSearchParams<{ subscriptionId: string; billingDate: string }>();
  return <RecordNoChargeScreen subscriptionId={subscriptionId as SubscriptionId} billingDate={billingDate} />;
}
