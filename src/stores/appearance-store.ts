import { createMMKV } from 'react-native-mmkv';
import { useStore } from 'zustand';
import type { StateStorage } from 'zustand/middleware';

import { createAppearanceStore, type AppearanceState } from '@/appearance/appearance';

const mmkv = createMMKV({ id: 'subscription-tracker.preferences' });

const mmkvStorage: StateStorage = {
  getItem: (name) => mmkv.getString(name) ?? null,
  setItem: (name, value) => mmkv.set(name, value),
  removeItem: (name) => mmkv.remove(name),
};

export const appearanceStore = createAppearanceStore(mmkvStorage);

export function useAppearanceStore<T>(selector: (state: AppearanceState) => T): T {
  return useStore(appearanceStore, selector);
}
