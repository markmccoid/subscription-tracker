import { Button, Form, Host, Section, Text, TextField, useNativeState } from '@expo/ui/swift-ui';
import { foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import type { CategoryOption } from '@/application/subscription-tracker';
import type { CategoryId } from '@/domain/model';
import { useTheme } from '@/hooks/use-theme';

type CategoryFormMode = 'add' | 'edit';

export function CategoryFormScreen({ mode }: { readonly mode: CategoryFormMode }) {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const nameState = useNativeState('');
  const [category, setCategory] = useState<CategoryOption | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    let active = true;
    void getSubscriptionTracker()
      .then((tracker) => tracker.loadCategories())
      .then((categories) => {
        const current = categories.find((item) => item.id === id);
        if (!current) throw new Error('Category not found.');
        if (!active) return;
        setCategory(current);
        setName(current.name);
        nameState.set(current.name);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load this Category.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, mode, nameState]);

  const save = async () => {
    if (mode === 'edit' && !id) return;
    setSaving(true);
    setError(null);
    try {
      const tracker = await getSubscriptionTracker();
      if (mode === 'add') await tracker.addCategory({ name });
      else await tracker.updateCategory({ categoryId: id as CategoryId, name });
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not ${mode === 'add' ? 'add' : 'update'} this Category.`);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!id || !category) return;
    const subscriptions = category.subscriptionCount === 1 ? '1 Subscription' : `${category.subscriptionCount} Subscriptions`;
    Alert.alert(
      'Delete Category?',
      `${subscriptions} will be moved to Uncategorized. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void getSubscriptionTracker()
              .then((tracker) => tracker.deleteCategory(id as CategoryId))
              .then(() => router.back())
              .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not delete this Category.'));
          },
        },
      ],
    );
  };

  const unchanged = mode === 'edit' && category ? name.trim() === category.name : false;

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={saving ? 'Saving Category' : 'Save Category'}
          disabled={loading || saving || !name.trim() || unchanged}
          onPress={() => void save()}
          variant="prominent">
          Save
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} seedColor={theme.accent}>
        <Form>
          <Section title="Category" footer={<Text>Names must be unique, ignoring capitalization.</Text>}>
            <TextField text={nameState} placeholder="Name" maxLength={80} onTextChange={setName} />
          </Section>
          {mode === 'edit' && category ? (
            <Section title="Usage" footer={<Text>Renaming updates assigned Subscriptions. Deleting moves them to Uncategorized.</Text>}>
              <Text>{`${category.subscriptionCount} ${category.subscriptionCount === 1 ? 'Subscription' : 'Subscriptions'}`}</Text>
            </Section>
          ) : null}
          {mode === 'edit' && category ? (
            <Section>
              <Button label="Delete Category" role="destructive" onPress={confirmDelete} />
            </Section>
          ) : null}
          {error ? <Section><Text modifiers={[foregroundStyle('red')]}>{error}</Text></Section> : null}
        </Form>
      </Host>
    </>
  );
}
