import { useLocalSearchParams } from 'expo-router';

import { SubscriptionHistoryScreen } from '@/features/history/subscription-history-screen';

export default function HistoryRoute() {
  const { from, to } = useLocalSearchParams<{ from?: string; to?: string }>();
  return <SubscriptionHistoryScreen key={`${from ?? ''}:${to ?? ''}`} customFrom={from} customTo={to} />;
}
