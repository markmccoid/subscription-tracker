import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import type { PaymentMethodOption } from '@/application/subscription-tracker';
import { useTheme } from '@/hooks/use-theme';

export function PaymentMethodsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [paymentMethods, setPaymentMethods] = useState<readonly PaymentMethodOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError(null);
      void getSubscriptionTracker()
        .then((tracker) => tracker.loadPaymentMethods())
        .then((next) => {
          if (active) setPaymentMethods(next);
        })
        .catch((caught) => {
          if (active) setError(caught instanceof Error ? caught.message : 'Could not load Payment Methods.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="Add Payment Method"
          icon="plus"
          onPress={() => router.push('/add-payment-method')}
        />
      </Stack.Toolbar>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 16 }}>
        <Text selectable style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
          Payment Methods are names and notes only. The app never stores card numbers or bank credentials.
        </Text>

        {loading ? <ActivityIndicator style={{ padding: 36 }} color={theme.accent} /> : null}
        {error ? <Text selectable style={{ color: theme.danger }}>{error}</Text> : null}

        {!loading && !error && paymentMethods.length === 0 ? (
          <View
            style={{
              alignItems: 'center',
              paddingHorizontal: 28,
              paddingVertical: 44,
              gap: 12,
              borderRadius: 20,
              borderCurve: 'continuous',
              backgroundColor: theme.backgroundElement,
            }}>
            <Image source="sf:creditcard" style={{ width: 36, height: 30 }} tintColor={theme.textSecondary} />
            <Text selectable style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>No Payment Methods</Text>
            <Text selectable style={{ color: theme.textSecondary, textAlign: 'center', lineHeight: 20 }}>
              Add one to reuse it on Subscriptions and recorded Payments.
            </Text>
          </View>
        ) : null}

        {paymentMethods.length > 0 ? (
          <View
            style={{
              overflow: 'hidden',
              borderRadius: 14,
              borderCurve: 'continuous',
              backgroundColor: theme.backgroundElement,
            }}>
            {paymentMethods.map((paymentMethod, index) => (
              <View key={paymentMethod.id}>
                {index > 0 ? <View style={{ height: 1, marginLeft: 58, backgroundColor: theme.border }} /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${paymentMethod.name}${paymentMethod.retired ? ', retired' : ''}`}
                  onPress={() => router.push(`/edit-payment-method/${paymentMethod.id}`)}
                  style={({ pressed }) => ({
                    minHeight: 68,
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                  })}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      borderCurve: 'continuous',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: paymentMethod.retired ? theme.backgroundSelected : theme.accent,
                    }}>
                    <Image
                      source="sf:creditcard.fill"
                      style={{ width: 18, height: 15 }}
                      tintColor={paymentMethod.retired ? theme.textSecondary : theme.accentForeground}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text selectable numberOfLines={1} style={{ flexShrink: 1, color: theme.text, fontSize: 17, fontWeight: '600' }}>
                        {paymentMethod.name}
                      </Text>
                      {paymentMethod.retired ? (
                        <Text selectable style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700' }}>RETIRED</Text>
                      ) : null}
                    </View>
                    <Text selectable numberOfLines={1} style={{ color: theme.textSecondary, fontSize: 13 }}>
                      {usageDescription(paymentMethod)}
                    </Text>
                  </View>
                  <Image source="sf:chevron.right" style={{ width: 7, height: 12 }} tintColor={theme.textSecondary} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

function usageDescription(paymentMethod: PaymentMethodOption): string {
  const uses = [
    paymentMethod.subscriptionCount > 0
      ? `${paymentMethod.subscriptionCount} ${paymentMethod.subscriptionCount === 1 ? 'Subscription' : 'Subscriptions'}`
      : null,
    paymentMethod.paymentCount > 0
      ? `${paymentMethod.paymentCount} past ${paymentMethod.paymentCount === 1 ? 'Payment' : 'Payments'}`
      : null,
  ].filter(Boolean);
  return uses.join(' · ') || paymentMethod.note || 'Not currently used';
}
