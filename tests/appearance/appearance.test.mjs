import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accentForeground,
  accentColorOptions,
  createAppearanceStore,
  DEFAULT_ACCENT_COLOR,
} from '../../src/appearance/appearance.ts';

function inMemoryStorage() {
  const values = new Map();
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
    removeItem: (name) => values.delete(name),
  };
}

test('appearance preferences persist through the module interface', () => {
  const storage = inMemoryStorage();
  const first = createAppearanceStore(storage);

  first.getState().setThemeMode('dark');
  first.getState().setAccentColor('#007aff');

  const restored = createAppearanceStore(storage);
  assert.equal(restored.getState().themeMode, 'dark');
  assert.equal(restored.getState().accentColor, '#007AFF');
});

test('appearance preferences reject invalid accents and restore defaults', () => {
  const store = createAppearanceStore(inMemoryStorage());
  assert.throws(() => store.getState().setAccentColor('blue'), /six-digit hex color/);

  store.getState().setThemeMode('light');
  store.getState().setAccentColor('#DC2626');
  store.getState().restoreDefaults();

  assert.equal(store.getState().themeMode, 'system');
  assert.equal(store.getState().accentColor, DEFAULT_ACCENT_COLOR);
  assert.equal(DEFAULT_ACCENT_COLOR, '#DF800F');
  assert.equal(accentColorOptions[3], DEFAULT_ACCENT_COLOR);
});

test('the former default accent migrates to the new default', () => {
  const storage = inMemoryStorage();
  storage.setItem('appearance', JSON.stringify({
    state: { accentColor: '#5D5FEF', themeMode: 'system' },
    version: 1,
  }));

  const store = createAppearanceStore(storage);

  assert.equal(store.getState().accentColor, DEFAULT_ACCENT_COLOR);
});

test('accent foreground remains readable for bright and dark colors', () => {
  assert.equal(accentForeground('#FFFF00'), '#000000');
  assert.equal(accentForeground('#5D5FEF'), '#FFFFFF');
  assert.equal(accentForeground(DEFAULT_ACCENT_COLOR), '#000000');
});
