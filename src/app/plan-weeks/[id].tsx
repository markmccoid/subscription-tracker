import { useLocalSearchParams } from 'expo-router';

import type { SubscriptionId } from '@/domain/model';
import { WeekPlannerScreen } from '@/features/subscriptions/week-planner-screen';

export default function PlanWeeksRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WeekPlannerScreen id={id as SubscriptionId} />;
}
