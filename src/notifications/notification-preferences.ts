import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

export interface NotificationPreferenceState {
  readonly enabled: boolean | null;
  readonly setEnabled: (enabled: boolean) => void;
}

export function createNotificationPreferenceStore(storage: StateStorage) {
  return createStore<NotificationPreferenceState>()(
    persist(
      (set) => ({
        enabled: null,
        setEnabled: (enabled) => set({ enabled }),
      }),
      {
        name: 'notifications',
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: ({ enabled }) => ({ enabled }),
      },
    ),
  );
}
