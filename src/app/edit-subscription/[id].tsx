import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import type { SubscriptionDetail } from '@/application/subscription-tracker';
import type { SubscriptionId } from '@/domain/model';
import { EditSubscriptionScreen } from '@/features/subscriptions/subscription-form-screen';
import { useTheme } from '@/hooks/use-theme';

export default function EditSubscriptionRoute() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getSubscriptionTracker()
      .then((tracker) => tracker.loadSubscriptionDetail(id as SubscriptionId))
      .then(setDetail)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load this Subscription.'));
  }, [id]);

  if (error) return <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.background }}><Text style={{ color: theme.danger, textAlign: 'center' }}>{error}</Text></View>;
  if (!detail) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}><ActivityIndicator color={theme.accent} /></View>;
  return <EditSubscriptionScreen detail={detail} />;
}
