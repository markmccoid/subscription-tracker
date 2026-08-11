import { Image } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import type { CategoryOption } from '@/application/subscription-tracker';
import { useTheme } from '@/hooks/use-theme';

export function CategoriesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [categories, setCategories] = useState<readonly CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError(null);
      void getSubscriptionTracker()
        .then((tracker) => tracker.loadCategories())
        .then((next) => {
          if (active) setCategories(next);
        })
        .catch((caught) => {
          if (active) setError(caught instanceof Error ? caught.message : 'Could not load Categories.');
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
          accessibilityLabel="Add Category"
          icon="plus"
          onPress={() => router.push('/add-category')}
        />
      </Stack.Toolbar>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 16 }}>
        <Text selectable style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
          Categories organize Subscriptions. Names must be unique, ignoring capitalization.
        </Text>

        {loading ? <ActivityIndicator style={{ padding: 36 }} color={theme.accent} /> : null}
        {error ? <Text selectable style={{ color: theme.danger }}>{error}</Text> : null}

        {!loading && !error && categories.length === 0 ? (
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
            <Image source="sf:tag" style={{ width: 34, height: 34 }} tintColor={theme.textSecondary} />
            <Text selectable style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>No Categories</Text>
            <Text selectable style={{ color: theme.textSecondary, textAlign: 'center', lineHeight: 20 }}>
              Add one to organize your Subscriptions, or leave them Uncategorized.
            </Text>
          </View>
        ) : null}

        {categories.length > 0 ? (
          <View
            style={{
              overflow: 'hidden',
              borderRadius: 14,
              borderCurve: 'continuous',
              backgroundColor: theme.backgroundElement,
            }}>
            {categories.map((category, index) => (
              <View key={category.id}>
                {index > 0 ? <View style={{ height: 1, marginLeft: 58, backgroundColor: theme.border }} /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${category.name}, ${usageDescription(category)}`}
                  onPress={() => router.push(`/edit-category/${category.id}`)}
                  style={({ pressed }) => ({
                    minHeight: 64,
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
                      backgroundColor: theme.accent,
                    }}>
                    <Image source="sf:tag.fill" style={{ width: 17, height: 17 }} tintColor={theme.accentForeground} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text selectable numberOfLines={1} style={{ color: theme.text, fontSize: 17, fontWeight: '600' }}>
                      {category.name}
                    </Text>
                    <Text selectable style={{ color: theme.textSecondary, fontSize: 13 }}>
                      {usageDescription(category)}
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

function usageDescription(category: CategoryOption): string {
  return category.subscriptionCount === 1 ? '1 Subscription' : `${category.subscriptionCount} Subscriptions`;
}
