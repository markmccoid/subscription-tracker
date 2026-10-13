import { DatePicker, Form, Host, Section, Text } from '@expo/ui/swift-ui';
import { foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { useTheme } from '@/hooks/use-theme';

export function HistoryRangeScreen({ from, to }: { readonly from?: string; readonly to?: string }) {
  const theme = useTheme();
  const router = useRouter();
  const today = useMemo(() => atNoon(new Date()), []);
  const [start, setStart] = useState(() => parseDate(from) ?? new Date(today.getFullYear(), 0, 1, 12));
  const [end, setEnd] = useState(() => parseDate(to) ?? today);
  const invalid = start > end;
  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          disabled={invalid}
          variant="prominent"
          onPress={() => router.dismissTo({
            pathname: '/(tabs)/(index)/history',
            params: { from: localDate(start), to: localDate(end) },
          })}
        >
          Apply
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} seedColor={theme.accent}>
        <Form>
          <Section title="Inclusive Date Range" footer={<Text>Recorded Spend uses Payment Date.</Text>}>
            <DatePicker
              title="From"
              selection={start}
              displayedComponents={['date']}
              range={{ end }}
              onDateChange={(date) => setStart(atNoon(date))}
            />
            <DatePicker
              title="To"
              selection={end}
              displayedComponents={['date']}
              range={{ start, end: today }}
              onDateChange={(date) => setEnd(atNoon(date))}
            />
          </Section>
          {invalid ? <Section><Text modifiers={[foregroundStyle('red')]}>From must be on or before To.</Text></Section> : null}
        </Form>
      </Host>
    </>
  );
}

function parseDate(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(year, month - 1, day, 12);
  return Number.isNaN(result.valueOf()) ? null : result;
}

function atNoon(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
}

function localDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
