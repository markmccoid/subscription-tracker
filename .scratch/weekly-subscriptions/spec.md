# Weekly Subscriptions (Meal Kits) — Implementation Spec

Status: confirmed — ready for implementation
Mockups: `.scratch/weekly-subscriptions/mockups.html` (published: https://claude.ai/code/artifact/8896229f-6b1e-4571-80bd-b32712bc0daa)

Read `CONTEXT.md`, `docs/adr/0003-cancellation-resolves-unbilled-history.md`, and `docs/adr/0004-retain-subscription-lifecycle-events.md` before starting. Use the glossary's canonical terms in code, tests, and commit messages. Keep route files thin (`AGENTS.md`): routes in `src/app`, screens in `src/features`.

---

## 1. Goal

Support meal-kit style commitments (HelloFresh, etc.) that bill **once a week** and are routinely skipped week to week. Requirements:

1. A third Billing Cycle, **Weekly**, selectable at creation.
2. At creation, the user can pre-set the first few weeks as delivering or skipped.
3. After creation, the user can flip any upcoming week between **Deliver** and **Skip** in one or two taps (this is the core of the feature — optimize for speed of access).
4. Upcoming visually distinguishes weekly charges from monthly/yearly ones.
5. Skipped weeks can optionally appear in Upcoming as dimmed "ghost" rows with a one-tap Resume — controlled by a per-subscription setting chosen at creation and editable later.

## 2. Design decisions (resolved — do not re-litigate)

| # | Decision | Resolution |
|---|----------|------------|
| D1 | Is a skipped week a pause? | **No.** Pause is a Subscription-level lifecycle state with Lifecycle Events. A skip is a per-occurrence plan stored as a new **Skipped Week** entity. Lifecycle machinery is untouched. |
| D2 | Monthly Commitment for weekly | Weekly amount contributes `round(amount × 52 / 12)` regardless of skips. It stays a stable ceiling; skips are reflected in "Due in the Next 30 Days" instead. |
| D3 | "Show skipped weeks in Upcoming" default | **On** for weekly Subscriptions; the flag is stored per subscription and meaningless (false) for monthly/yearly. |
| D4 | What happens when a skipped date passes | The Billing Occurrence materializes and is resolved by a **Generated Charge Exception** with reason "Skipped week", linked to the Skipped Week record (same pattern as ADR-0003/0004 cancellation resolution). Skipped weeks never appear in Action Needed. |
| D5 | Undoing a past skip | The Week Planner only toggles **future** weeks. But the Billing Occurrence detail for a skip-generated Charge Exception offers an explicit **Remove Skip** action that deletes the Skipped Week (FK cascade removes the Generated Charge Exception), returning the occurrence to unresolved so a Payment can be recorded — for the "they charged me anyway" case. Mirrors the `deleteLifecycleEvent` reconciliation pattern. |
| D6 | Ghost rows outside the 30-day window | Skipped ghost rows render only inside the rolling 30-day window groups (Next 7 Days / Later This Month), never in Later. |
| D7 | Pause/cancel still apply to weekly | Yes, unchanged. A long vacation is a Pause. The Week Planner is unavailable while paused, canceled, or archived. |
| D8 | Pricing arrangements | Weekly works with the existing `AddStandardSubscriptionCommand` (standard pricing). No new pricing work; trial/promotion interaction with weekly is out of scope. |

## 3. Glossary additions — `CONTEXT.md`

Add these entries (match existing formatting exactly):

**Weekly Billing Cycle**:
A Billing Cycle producing one Billing Occurrence every seven days on the weekday of the Billing Schedule Start Date. Billing Anchor Day does not apply to Weekly schedules.
_Avoid_: Delivery schedule, meal plan

**Skipped Week**:
A user-planned suppression of one projected weekly Billing Occurrence. A future Skipped Week may be freely created or removed; once its Billing Date passes it is retained and resolved by a Generated Charge Exception.
_Avoid_: Paused Subscription, Charge Exception, canceled week

**Week Planner**:
The surface listing a weekly Subscription's upcoming Billing Occurrences where each week is toggled between delivering and skipped. Changes apply immediately without a separate save step.
_Avoid_: Calendar, pause screen

Amend existing entries:
- **Billing Cycle**: "Version one supports Monthly and Yearly cycles only" → "Supports Monthly, Yearly, and Weekly cycles."
- **Minimum Subscription**: cycle list gains Weekly.
- **Monthly Commitment**: add "A weekly amount contributes 52/12 of its value; planned Skipped Weeks do not reduce it."
- **Due in the Next 30 Days**: add "Skipped Weeks are excluded."

## 4. New ADR

Write `docs/adr/0006-skipped-weeks-are-occurrence-plans.md`: skipped weeks are occurrence-level plans, not Lifecycle Events; past skips resolve via Generated Charge Exceptions; rationale = avoids flooding Subscription Activity with pause/resume noise and keeps projection pure. Follow the format of ADR-0004.

## 5. Domain layer

### 5.1 `src/domain/model.ts`

```ts
export type BillingCycle = 'monthly' | 'yearly' | 'weekly';

export type SkippedWeekId = EntityId<'SkippedWeek'>;

export interface SkippedWeek {
  readonly id: SkippedWeekId;
  readonly subscriptionId: SubscriptionId;
  readonly billingDate: CalendarDate;   // the projected weekly Billing Date being skipped
  readonly createdAt: UtcTimestamp;
}
```

- `Subscription` gains `readonly showSkippedWeeks: boolean;`
- `ChargeException` gains `readonly generatedBySkippedWeekId: SkippedWeekId | null;` (parallel to `generatedByLifecycleEventId`; at most one of the two is non-null)
- `HouseholdSnapshot` gains `readonly skippedWeeks: readonly SkippedWeek[];`

### 5.2 `src/domain/recurrence.ts`

- `validateSchedule`: for `cycle === 'weekly'`, keep the 1–31 `anchorDay` bounds check but **skip** the "start date day must match anchor day" check. Convention: weekly schedules store `anchorDay = calendarParts(startDate).day` (callers set this); it is otherwise ignored. The weekday derives from `startDate`.
- `occurrenceAt`: add a weekly arm before the monthly/yearly logic — occurrence `i` is `startDate + 7 × i` days. Use the existing calendar-date helpers in `primitives.ts` (there is an `addCalendarDays`-style helper used by the application layer; reuse or add one in primitives — do not hand-roll Date math with timezones; dates are timezone-independent calendar dates).
- `occurrencesInRange`: hard limit for weekly = `10440` (~200 years, consistent with monthly 2400 / yearly 400).
- `amountForOccurrence`, `validatePricing`: no changes needed (date-based logic already works for weekly).

### 5.3 New `src/domain/week-skips.ts`

Pure functions + invariants (follow the style of `subscription-lifecycle.ts`: take the entity + input, throw `DomainValidationError`, return new values):

```ts
export function createSkippedWeek(input: {
  id: SkippedWeekId; subscription: Subscription; billingDate: string;
  existingSkips: readonly SkippedWeek[]; now: string;
}): SkippedWeek;

export function assertSkipRemovable(skip: SkippedWeek, asOf: CalendarDate): void;

export function isDateSkipped(
  skips: readonly SkippedWeek[], subscriptionId: SubscriptionId, date: CalendarDate,
): boolean;

/** Skips whose billingDate is >= asOf but no longer falls on a projected
 *  occurrence of the given schedule (schedule was edited/resumed/reactivated). */
export function staleFutureSkips(
  skips: readonly SkippedWeek[], subscription: Subscription, asOf: CalendarDate,
): readonly SkippedWeek[];
```

Invariants enforced by `createSkippedWeek`:
- Subscription's cycle is `weekly`; not archived; lifecycle status is `active`.
- `billingDate` is a projected occurrence of the current schedule (`nextOccurrenceOnOrAfter(schedule, billingDate) === billingDate`).
- `billingDate` is not already skipped (unique per subscription+date).
- `billingDate` is in the future relative to a passed-in `asOf` date (today may not be skipped once it has arrived; the planner offers weeks strictly after `asOf`… **exception**: allow skipping `billingDate === asOf` only if no Billing Occurrence row exists for it yet — simplest rule: allow `billingDate >= asOf` when the occurrence is unmaterialized and unresolved).

`assertSkipRemovable`: throws when the skip has a materialized Billing Occurrence resolved by a Charge Exception **not** generated by this skip, or resolved by a Payment (defensive; normally its own generated exception cascades on delete — see D5).

## 6. Persistence

### 6.1 `src/data/sqlite/schema.ts` — schema v7

Bump `schemaVersion` to 7. Inside the existing migration transaction pattern (`if (currentVersion < 7)`):

```sql
CREATE TABLE skipped_weeks (
  id TEXT PRIMARY KEY NOT NULL,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  billing_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (subscription_id, billing_date)
);

ALTER TABLE charge_exceptions
ADD COLUMN generated_by_skipped_week_id TEXT
REFERENCES skipped_weeks(id) ON DELETE CASCADE;

ALTER TABLE subscriptions ADD COLUMN
show_skipped_weeks INTEGER NOT NULL DEFAULT 0 CHECK (show_skipped_weeks IN (0,1));
```

**The `billing_cycle` CHECK must gain `'weekly'`.** SQLite cannot alter a CHECK constraint, so v7 must rebuild the `subscriptions` table: `CREATE TABLE subscriptions_new (...)` with the full current column set (including `category_id` added in v4 and the new `show_skipped_weeks`), copy rows, drop old, rename, recreate `subscriptions_household_idx`. Do this **before** adding the FK from `skipped_weeks`. Keep `PRAGMA foreign_keys` behavior in mind — the migration already runs inside `withExclusiveTransactionAsync`; use `PRAGMA legacy_alter_table`/`foreign_keys=OFF` semantics only if the existing pattern requires it, and verify FK integrity after the rebuild (`PRAGMA foreign_key_check`).

### 6.2 Repositories

Extend `HouseholdRepository` (`src/data/household-repository.ts`) following its existing mutation style, and implement in **both** `sqlite-household-repository.ts` and `in-memory-household-repository.ts`:

- `loadSnapshot()` includes `skippedWeeks`.
- Insert / delete a `SkippedWeek`.
- Whatever transactional helper the tracker needs to atomically (a) insert a Billing Occurrence, (b) insert its Generated Charge Exception with `generated_by_skipped_week_id`, when materializing past skips — reuse the existing pattern used by cancellation's generated exceptions.
- Subscription persistence maps `show_skipped_weeks`.

### 6.3 Backup / restore

The Backup format serializes the Household List. Wherever the backup/restore code enumerates tables/collections (see the Settings → Data feature), include `skipped_weeks` and the new columns. A backup from schema ≤ 6 must restore cleanly (missing collection → empty, missing flag → default).

## 7. Application layer — `src/application/subscription-tracker.ts`

### 7.1 Commands & queries

```ts
// AddStandardSubscriptionCommand: cycle now accepts 'weekly'; add:
readonly initialSkippedDates?: readonly string[]; // weekly only; validated as projected dates
readonly showSkippedWeeks?: boolean;              // weekly only; defaults true for weekly

// EditStandardSubscriptionCommand inherits both.

async skipWeek(cmd: { subscriptionId: SubscriptionId; billingDate: string }): Promise<void>;
async unskipWeek(cmd: { subscriptionId: SubscriptionId; billingDate: string }): Promise<void>;
async removeMaterializedSkip(cmd: { skippedWeekId: SkippedWeekId }): Promise<void>; // D5

export interface WeekPlannerWeek {
  readonly billingDate: CalendarDate;
  readonly amountCents: number;      // via amountForOccurrence
  readonly skipped: boolean;
  readonly togglable: boolean;       // false once materialized/resolved
}
export interface WeekPlannerProjection {
  readonly subscriptionId: SubscriptionId;
  readonly name: string;
  readonly weekday: string;                 // e.g. "Friday", derived from schedule.startDate
  readonly perWeekAmountCents: number;
  readonly weeks: readonly WeekPlannerWeek[];        // next 8 projected weeks from asOf
  readonly next30DaysDeliveries: number;
  readonly next30DaysCents: number;                  // excludes skipped
}
async loadWeekPlanner(subscriptionId: SubscriptionId): Promise<WeekPlannerProjection>;
```

`skipWeek`/`unskipWeek` persist immediately and set the `reminderReconciliationNeeded` device-state flag (same mechanism the lifecycle commands use).

### 7.2 `initialize()`

Where initialize currently materializes/reconciles (auto-resume of dated pauses, etc.), add: for every Skipped Week with `billingDate < today` that has no Billing Occurrence yet — create the Billing Occurrence (expected amount from `amountForOccurrence`) plus a Charge Exception with `reason: 'Skipped week'` and `generatedBySkippedWeekId` set, atomically. Then flag reminder reconciliation.

### 7.3 `loadDashboard()`

Current behavior (lines ~1025–1107) projects `chargesInWindow` from `occurrencesInRange` per active subscription. Changes:

- Extend `UpcomingCharge` with `readonly cycle: BillingCycle;` and `readonly skipped: boolean;` (existing rows: `skipped: false`).
- Projected weekly dates that are skipped are **excluded** from `chargesInWindow` (and therefore from group totals and `dueNext30DaysCents`).
- When `subscription.showSkippedWeeks` is true, emit skipped in-window dates as ghost charges (`skipped: true`) placed into the same date-based groups (Next 7 Days / Later This Month only — D6). Ghost charges do **not** count toward group header sums or `dueNext30DaysCents`.
- The `later` group's `nextUnresolvedBillingDate` must also skip over skipped dates (the "next" charge for a weekly sub is the next *unskipped* occurrence).
- `monthlyCommitmentCents`: weekly arm contributes `Math.round(amount * 52 / 12)` (D2).

### 7.4 Other touchpoints

- `loadSubscriptions()`: `nextBillingDate` for an active weekly sub = next **unskipped** occurrence. Cycle label data already flows through (`cycle` field).
- `loadSubscriptionDetail()`: include `showSkippedWeeks` and cycle so the detail screen can show the Plan Weeks action.
- `loadBillingOccurrenceDetail()`: resolution for a skip-generated Charge Exception must identify it (e.g. resolution kind carries `generatedBySkippedWeekId`) so the occurrence screen can offer **Remove Skip** (D5) instead of the normal exception editing.
- Possible Duplicate detection: no logic change — it compares name/amount/cycle/next-date; weekly cycles now simply participate.
- Lifecycle interactions:
  - `editStandardSubscription` (schedule/cycle change), `resumeSubscription`, `reactivateSubscription`: after computing the new schedule, delete `staleFutureSkips` (future skips no longer on projected dates). Materialized skips are never deleted by this.
  - Changing cycle **away from** weekly deletes all future Skipped Weeks; history (materialized ones) remains.
  - `pauseSubscription`/`cancelSubscription`: leave Skipped Week rows in place. Paused/canceled subs project no occurrences, so future skips are inert; cancellation's existing unbilled-history resolution (ADR-0003) must not double-resolve dates that already have skip-generated exceptions (the existing "at most one resolution per occurrence" triggers enforce this — make cancellation's generated-exception pass skip dates that are already skipped).
- Notifications (`src/notifications/billing-notifications.ts`): Reminder Coverage targets each subscription's next Billing Occurrence — for weekly subs that is the next **unskipped** occurrence. The reconciliation flag from 7.1 drives re-planning; verify the planner uses the same "next occurrence" helper as 7.4's `loadSubscriptions`.

## 8. Interface

Follow existing component conventions (the form uses `@expo/ui` SwiftUI-style `Picker`/`DatePicker`/`Text` with `tag` modifiers; dashboard uses plain RN components + `useTheme()`).

### 8.1 Upcoming — `src/features/dashboard/subscription-dashboard-screen.tsx`

- **Weekly rows** (`charge.cycle === 'weekly' && !charge.skipped`): 3px leading edge stripe + monogram tint + small "WEEKLY" chip beside the name, all in a green reserved for this feature (add `weekly`/`weeklySoft` tokens to the theme, both schemes; green is not currently used as an accent). Subtitle: "{date} · Delivery week". Row remains tappable to the Billing Occurrence route as today.
- **Ghost rows** (`charge.skipped`): dimmed monogram/name, struck-through amount in secondary color, subtitle "{date} · Skipped week", no chevron, hatched or subtly tinted background. Trailing "RESUME" pill (green outline). Tapping the pill calls `unskipWeek` and reloads; tapping elsewhere on the row does nothing.
- **Long-press** on any non-skipped weekly row opens a context menu: "Skip this week" (calls `skipWeek` for that date) and "Plan weeks…" (routes to the Week Planner). Use the platform context-menu affordance consistent with the rest of the app; if none exists yet, a simple action sheet is fine.
- Group header sums and the metric card already derive from the projection — no extra UI math (7.3 handles exclusion).

### 8.2 Week Planner — new route + screen

- Route: `src/app/plan-weeks/[id].tsx` — thin, presented as a form sheet like the pause/resume routes (`src/app/pause-subscription/[id].tsx` is the pattern). Register in `src/app/_layout.tsx` alongside them.
- Screen: `src/features/subscriptions/week-planner-screen.tsx`.
- Content per mockup:
  - Header: subscription name (back), title "Week Planner", subtitle "Delivers {weekday}s · {amount} per week".
  - Next 8 projected weeks from `loadWeekPlanner`, grouped by month, each row: date, contextual hint ("In 3 days", "Skipped · no charge"), and a Deliver/Skip segmented toggle.
  - Toggling calls `skipWeek`/`unskipWeek` immediately (optimistic update, reload on error). No save button.
  - Footer card: "Next 30 days — {n} deliveries · {total}", live-updating.
- Entry points: Upcoming long-press (8.1); Subscription detail (8.3); creation form note (8.4).

### 8.3 Subscription detail — `src/features/subscriptions/subscription-detail-screen.tsx`

- For an active weekly sub, add a "Plan Weeks" action button (routes to `/plan-weeks/[id]`) in the actions row next to Pause Sub / Cancel Sub.
- Schedule card shows "Weekly · every {weekday}" and next delivery date.

### 8.4 Add/Edit form — `src/features/subscriptions/subscription-form-screen.tsx`

- Billing Cycle `Picker` gains a `weekly` tag ("Weekly").
- When weekly: the date row label reads "First Billing Date"; hint text "Bills every {weekday}, projected from the first date." The anchor-day row (monthly-only today) stays hidden for weekly. On save, set `anchorDay` to the start date's day-of-month (5.2 convention).
- New weekly-only group "PLAN THE FIRST WEEKS": chips for the first 4 projected weeks (date + Deliver/Skip), all defaulting to Deliver; tap toggles. Saved as `initialSkippedDates`. In **edit** mode this group is replaced by a "Plan Weeks" link to the planner (single source of truth after creation).
- New weekly-only toggle row: "Show skipped weeks in Upcoming", default on (D3). Maps to `showSkippedWeeks`; editable in edit mode.
- Cycle-change guard: the form already warns when changing cycle in edit mode; extend the warning when leaving weekly: "Future skipped weeks will be removed."

### 8.5 Billing Occurrence detail — `src/features/dashboard/billing-occurrence-screen.tsx`

- When the occurrence is resolved by a skip-generated Charge Exception: show "Not charged · Skipped week" and a **Remove Skip** action (destructive-adjacent, confirm dialog: "This week will return to Action Needed so you can record what actually happened."). Calls `removeMaterializedSkip`.

### 8.6 History — `src/features/history/subscription-history-screen.tsx`

- Skip-generated Charge Exceptions already flow into Subscription Activity as exceptions; ensure the row subtitle shows "Skipped week" (the reason) and they count in the existing no-charge counts. No new activity type.

## 9. Tests

Extend the existing suites (`tests/application/subscription-tracker.test.mjs`, `tests/data/sqlite-household-repository.test.mjs`) plus domain tests alongside whatever pattern exists for `recurrence`. Minimum cases:

Domain
- Weekly `occurrenceAt`/`occurrencesInRange`: 7-day stepping, month/year boundaries, range hard limit.
- `validateSchedule` accepts weekly start dates on any day; anchor mismatch check bypassed only for weekly.
- `createSkippedWeek` invariants: non-weekly rejected, paused/canceled/archived rejected, non-projected date rejected, duplicate rejected, past date rejected.
- `staleFutureSkips` after a schedule change that shifts the weekday.

Application
- Add weekly sub with `initialSkippedDates`; dashboard excludes skipped from totals and window; ghost rows appear when `showSkippedWeeks` and carry `skipped: true`; ghost rows absent when flag off; Later group uses next unskipped date.
- Monthly Commitment: weekly = round(52/12 × amount); unaffected by skips.
- `skipWeek`/`unskipWeek` round-trip; reminder flag set.
- `initialize()` materializes past skip → occurrence + generated exception, linked; not in Action Needed; idempotent on second run.
- `removeMaterializedSkip` cascades the exception; occurrence becomes Action Needed; payment then recordable.
- Resume/reactivate/edit prunes stale future skips; leaving weekly cycle deletes future skips only.
- Cancellation of a weekly sub with past unresolved + skipped dates: no double resolution.

Data
- v6 → v7 migration on a populated database: subscriptions table rebuild preserves all rows/columns, FK check clean, `show_skipped_weeks` defaulted, weekly value accepted, skipped_weeks CRUD + UNIQUE constraint + cascades (subscription delete removes skips; skip delete removes its generated exception).
- Snapshot round-trips `skippedWeeks` and `generatedBySkippedWeekId`.

Run whatever test script `package.json` defines (existing `.mjs` suites run under Node's test runner) plus the TypeScript check before finishing.

## 10. Implementation order

1. **Domain**: model types, recurrence weekly arm, `week-skips.ts`, domain tests.
2. **Persistence**: schema v7 (incl. subscriptions rebuild), both repositories, migration tests, backup/restore.
3. **Application**: commands/queries, initialize materialization, dashboard/list/detail/occurrence projections, lifecycle pruning, notification targeting, application tests.
4. **UI — Upcoming**: theme tokens, weekly row treatment, ghost rows + Resume, long-press menu.
5. **UI — Planner & form**: `/plan-weeks/[id]` route + screen, detail-screen action, form weekly variant.
6. **Docs**: CONTEXT.md glossary edits, ADR-0006, NAVIGATION-DESIGN.md addendum (Upcoming weekly treatment + Week Planner as child route).

Each step should leave the app building and tests green. Publish implementation issues to `.scratch/weekly-subscriptions/issues/<NN>-<slug>.md` (one per step above) if working incrementally.

## 11. Out of scope

- Bi-weekly / every-N-weeks cycles (design leaves room: weekly projection is `startDate + 7i`; an interval multiplier would be a follow-up).
- Trial/promotion pricing combined with weekly (D8).
- Push/notification copy changes beyond retargeting the next unskipped occurrence.
- Any change to pause/resume/cancel/reactivate semantics (D7).
