import * as Crypto from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';

import { SQLiteHouseholdRepository } from '@/data/sqlite/sqlite-household-repository';

import { SubscriptionTracker } from './subscription-tracker';

let trackerPromise: Promise<SubscriptionTracker> | null = null;

/** Composition root: native dependencies are selected once, outside screens and domain modules. */
export function getSubscriptionTracker(): Promise<SubscriptionTracker> {
  trackerPromise ??= createTracker();
  return trackerPromise;
}

async function createTracker(): Promise<SubscriptionTracker> {
  const database = await openDatabaseAsync('subscription-tracker.db');
  const tracker = new SubscriptionTracker({
    repository: new SQLiteHouseholdRepository(database),
    createId: Crypto.randomUUID,
    now: () => new Date(),
  });
  await tracker.initialize();
  return tracker;
}
