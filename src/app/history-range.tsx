import { useLocalSearchParams } from 'expo-router';

import { HistoryRangeScreen } from '@/features/history/history-range-screen';

export default function HistoryRangeRoute() {
  const { from, to } = useLocalSearchParams<{ from?: string; to?: string }>();
  return <HistoryRangeScreen from={from} to={to} />;
}
