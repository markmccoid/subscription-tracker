import { createMMKV } from 'react-native-mmkv';
import { useStore } from 'zustand';
import type { StateStorage } from 'zustand/middleware';

import {
  createNotificationPreferenceStore,
  type NotificationPreferenceState,
} from '@/notifications/notification-preferences';

const mmkv = createMMKV({ id: 'subscription-tracker.preferences' });

const mmkvStorage: StateStorage = {
  getItem: (name) => mmkv.getString(name) ?? null,
  setItem: (name, value) => mmkv.set(name, value),
  removeItem: (name) => mmkv.remove(name),
};

export const notificationPreferenceStore = createNotificationPreferenceStore(mmkvStorage);

export function useNotificationPreferenceStore<T>(
  selector: (state: NotificationPreferenceState) => T,
): T {
  return useStore(notificationPreferenceStore, selector);
}
