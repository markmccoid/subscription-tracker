import type { Category } from './model';
import { nonBlank, utcTimestamp } from './primitives';

export function createCategory(input: {
  readonly id: Category['id'];
  readonly householdListId: Category['householdListId'];
  readonly name: string;
  readonly now: string;
}): Category {
  const timestamp = utcTimestamp(input.now);
  return {
    id: input.id,
    householdListId: input.householdListId,
    name: nonBlank(input.name, 'Category name', 80),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateCategory(category: Category, name: string, now: string): Category {
  return {
    ...category,
    name: nonBlank(name, 'Category name', 80),
    updatedAt: utcTimestamp(now),
  };
}
