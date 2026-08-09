import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { PrototypeSwitcher, type PrototypeVariant } from './prototype-switcher';

// PROTOTYPE — throw away after selecting a Dashboard direction.
// Three Dashboard variants, switchable via ?variant=, on the existing / route.

type Subscription = {
  id: string;
  name: string;
  monogram: string;
  amount: string;
  dueLabel: string;
  relativeLabel: string;
  daysUntil: number;
  color: string;
  category: string;
  note?: string;
};

const subscriptions: Subscription[] = [
  {
    id: 'icloud',
    name: 'iCloud+',
    monogram: 'iC',
    amount: '$2.99',
    dueLabel: 'Aug 9',
    relativeLabel: 'Tomorrow',
    daysUntil: 1,
    color: '#3A8DFF',
    category: 'Utilities',
  },
  {
    id: 'netflix',
    name: 'Netflix',
    monogram: 'N',
    amount: '$24.99',
    dueLabel: 'Aug 12',
    relativeLabel: 'In 4 days',
    daysUntil: 4,
    color: '#E50914',
    category: 'Entertainment',
  },
  {
    id: 'adobe',
    name: 'Adobe Creative Cloud',
    monogram: 'A',
    amount: '$59.99',
    dueLabel: 'Aug 19',
    relativeLabel: 'In 11 days',
    daysUntil: 11,
    color: '#FF3B30',
    category: 'Software',
    note: 'Promo price ends in November',
  },
  {
    id: 'music',
    name: 'Apple Music',
    monogram: '♫',
    amount: '$10.99',
    dueLabel: 'Aug 22',
    relativeLabel: 'Trial converts',
    daysUntil: 14,
    color: '#FA2D55',
    category: 'Entertainment',
    note: 'Free trial · reminder Aug 19',
  },
  {
    id: 'costco',
    name: 'Costco Membership',
    monogram: 'C',
    amount: '$65.00',
    dueLabel: 'Sep 3',
    relativeLabel: 'Yearly',
    daysUntil: 26,
    color: '#1166B1',
    category: 'Other',
  },
];

const accent = '#5D5FEF';
const mint = '#0A9E78';
const amber = '#C96B00';
const urgentRed = '#D43D47';

export function SubscriptionDashboardPrototype() {
  const { variant: rawVariant } = useLocalSearchParams<{ variant?: string }>();
  const variant: PrototypeVariant = rawVariant === 'B' || rawVariant === 'C' ? rawVariant : 'A';
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const maxWidth = Math.min(width, 720);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {variant === 'A' && <VariantA maxWidth={maxWidth} />}
      {variant === 'B' && <VariantB maxWidth={maxWidth} />}
      {variant === 'C' && <VariantC maxWidth={maxWidth} />}
      <PrototypeSwitcher current={variant} />
    </View>
  );
}

function Screen({ children, maxWidth }: { children: React.ReactNode; maxWidth: number }) {
  const theme = useTheme();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        width: '100%',
        maxWidth,
        alignSelf: 'center',
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 150,
        gap: 18,
      }}>
      {children}
    </ScrollView>
  );
}

function VariantA({ maxWidth }: { maxWidth: number }) {
  const theme = useTheme();

  return (
    <Screen maxWidth={maxWidth}>
      <Header eyebrow="SATURDAY, AUGUST 8" title="Upcoming" action="＋" />

      <View
        style={{
          borderRadius: 28,
          borderCurve: 'continuous',
          padding: 22,
          gap: 18,
          backgroundColor: accent,
          boxShadow: '0 12px 30px rgba(93,95,239,0.22)',
        }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
          <Metric light label="MONTHLY COMMITMENT" value="$104.38" />
          <Metric light right label="NEXT 30 DAYS" value="$163.96" />
        </View>
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.24)' }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image source="sf:checkmark.shield.fill" style={{ width: 17, height: 17 }} tintColor="#BDF5DF" />
          <Text selectable style={{ color: '#E8E9FF', fontSize: 13, fontWeight: '600' }}>
            5 next reminders covered
          </Text>
        </View>
      </View>

      <TimelineSection title="NEXT 7 DAYS" count="$27.98" emphasized>
        {subscriptions.slice(0, 2).map((item, index) => (
          <TimelineRow key={item.id} item={item} last={index === 1} />
        ))}
      </TimelineSection>

      <TimelineSection title="NEXT 30 DAYS" count="$135.98">
        {subscriptions.slice(2).map((item, index) => (
          <TimelineRow key={item.id} item={item} last={index === 2} />
        ))}
      </TimelineSection>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: 14,
          borderRadius: 18,
          borderCurve: 'continuous',
          backgroundColor: theme.backgroundElement,
        }}>
        <Image source="sf:lightbulb.fill" style={{ width: 18, height: 18 }} tintColor={amber} />
        <Text selectable style={{ flex: 1, color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
          Adobe increases to $79.99 in November.
        </Text>
        <Text style={{ color: accent, fontSize: 13, fontWeight: '700' }}>Review</Text>
      </View>
    </Screen>
  );
}

function VariantB({ maxWidth }: { maxWidth: number }) {
  const theme = useTheme();
  const appleMusic = subscriptions[3];

  return (
    <Screen maxWidth={maxWidth}>
      <Header eyebrow="HOUSEHOLD SUBSCRIPTIONS" title="Your next decision" action="＋" />

      <View
        style={{
          overflow: 'hidden',
          borderRadius: 32,
          borderCurve: 'continuous',
          backgroundColor: '#17181D',
          boxShadow: '0 14px 32px rgba(0,0,0,0.18)',
        }}>
        <View style={{ padding: 24, gap: 22 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <ServiceMark item={appleMusic} size={58} />
            <Pill label="TRIAL" color="#FF7894" background="rgba(250,45,85,0.18)" />
          </View>
          <View style={{ gap: 7 }}>
            <Text selectable style={{ color: '#FFFFFF', fontSize: 28, lineHeight: 33, fontWeight: '800' }}>
              Keep Apple Music?
            </Text>
            <Text selectable style={{ color: '#B4B6BE', fontSize: 15, lineHeight: 21 }}>
              Your free trial converts in 14 days at $10.99 per month.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ActionButton label="Keep it" filled />
            <ActionButton label="Review details" />
          </View>
          <Text selectable style={{ color: '#777B86', fontSize: 12, fontWeight: '600' }}>
            Reminder scheduled for August 19 at 9:00 AM
          </Text>
        </View>
        <View style={{ height: 5, width: '62%', backgroundColor: '#FA2D55' }} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatTile label="MONTHLY" value="$104" detail="commitment" color={accent} />
        <StatTile label="DUE SOON" value="$164" detail="next 30 days" color={mint} />
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading title="Coming up" trailing="See all" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {subscriptions.slice(0, 3).map((item) => (
            <View
              key={item.id}
              style={{
                flex: 1,
                minWidth: 0,
                padding: 12,
                gap: 10,
                borderRadius: 20,
                borderCurve: 'continuous',
                backgroundColor: theme.backgroundElement,
              }}>
              <ServiceMark item={item} size={34} />
              <View style={{ gap: 2 }}>
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>
                  {item.name}
                </Text>
                <Text selectable style={{ color: theme.textSecondary, fontSize: 11 }}>
                  {item.dueLabel}
                </Text>
              </View>
              <Text selectable style={{ color: theme.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {item.amount}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeading title="Worth a look" trailing="2 signals" />
        <SignalRow
          icon="sf:arrow.up.forward"
          color={amber}
          title="Adobe price increases in November"
          detail="$20 more each month"
        />
        <SignalRow
          icon="sf:checkmark.shield.fill"
          color={mint}
          title="All reminders are covered"
          detail="Last checked just now"
        />
      </View>
    </Screen>
  );
}

function VariantC({ maxWidth }: { maxWidth: number }) {
  const theme = useTheme();

  return (
    <Screen maxWidth={maxWidth}>
      <Header eyebrow="AUGUST 2026" title="Subscription ledger" action="＋" />

      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {[
            ['S', '8', true],
            ['S', '9', false],
            ['M', '10', false],
            ['T', '11', false],
            ['W', '12', false],
            ['T', '13', false],
            ['F', '14', false],
          ].map(([day, date, selected]) => (
            <View key={`${day}${date}`} style={{ alignItems: 'center', gap: 7 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700' }}>{day}</Text>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.text : 'transparent',
                }}>
                <Text
                  selectable
                  style={{
                    color: selected ? theme.background : theme.text,
                    fontSize: 15,
                    fontWeight: selected ? '800' : '600',
                    fontVariant: ['tabular-nums'],
                  }}>
                  {date}
                </Text>
              </View>
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: date === '9' || date === '12' ? accent : 'transparent',
                }}
              />
            </View>
          ))}
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          paddingVertical: 12,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.backgroundElement,
        }}>
        <View style={{ gap: 3 }}>
          <Text selectable style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>
            DUE IN 30 DAYS
          </Text>
          <Text selectable style={{ color: theme.text, fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            $163.96
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text selectable style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>
            MONTHLY
          </Text>
          <Text selectable style={{ color: theme.text, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            $104.38
          </Text>
        </View>
      </View>

      <View style={{ gap: 0 }}>
        <SectionHeading title="Expected charges" trailing="5 items" />
        {subscriptions.map((item) => (
          <LedgerRow key={item.id} item={item} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <CompactStatus icon="sf:bell.badge.fill" label="5 covered" color={mint} />
        <CompactStatus icon="sf:arrow.up.right" label="1 price change" color={amber} />
      </View>
    </Screen>
  );
}

function Header({ eyebrow, title, action }: { eyebrow: string; title: string; action: string }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text selectable style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>
          {eyebrow}
        </Text>
        <Text selectable style={{ color: theme.text, fontSize: 34, lineHeight: 40, fontWeight: '800', fontFamily: Fonts.rounded }}>
          {title}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Add subscription"
        accessibilityRole="button"
        style={({ pressed }) => ({
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? '#4A4CCC' : accent,
        })}>
        <Text style={{ color: '#FFFFFF', fontSize: 27, lineHeight: 30, fontWeight: '400' }}>{action}</Text>
      </Pressable>
    </View>
  );
}

function Metric({ label, value, light, right }: { label: string; value: string; light?: boolean; right?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: right ? 'flex-end' : 'flex-start', gap: 4 }}>
      <Text selectable style={{ color: light ? '#D7D8FF' : '#737680', fontSize: 10, fontWeight: '700', letterSpacing: 0.7 }}>
        {label}
      </Text>
      <Text
        selectable
        style={{ color: light ? '#FFFFFF' : '#111318', fontSize: 25, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

function TimelineSection({
  title,
  count,
  children,
  emphasized = false,
}: {
  title: string;
  count: string;
  children: React.ReactNode;
  emphasized?: boolean;
}) {
  const theme = useTheme();
  const isDark = theme.background === '#000000';

  return (
    <View
      style={{
        gap: 10,
        padding: emphasized ? 12 : 0,
        borderRadius: emphasized ? 26 : 0,
        borderCurve: 'continuous',
        borderWidth: emphasized ? 1 : 0,
        borderColor: emphasized ? (isDark ? '#65441E' : '#F0C27B') : 'transparent',
        backgroundColor: emphasized ? (isDark ? '#261D13' : '#FFF7EA') : 'transparent',
      }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {emphasized && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: amber }} />}
          <Text
            selectable
            style={{
              color: emphasized ? (isDark ? '#FFB95E' : '#9B5100') : theme.textSecondary,
              fontSize: 11,
              fontWeight: '800',
              letterSpacing: 0.8,
            }}>
            {title}
          </Text>
        </View>
        <View
          style={{
            borderRadius: 10,
            paddingHorizontal: emphasized ? 8 : 0,
            paddingVertical: emphasized ? 3 : 0,
            backgroundColor: emphasized ? (isDark ? '#513619' : '#FFE4B7') : 'transparent',
          }}>
          <Text
            selectable
            style={{
              color: emphasized ? (isDark ? '#FFD092' : '#874500') : theme.textSecondary,
              fontSize: 11,
              fontWeight: '700',
              fontVariant: ['tabular-nums'],
            }}>
            {count}
          </Text>
        </View>
      </View>
      <View
        style={{
          borderRadius: 22,
          borderCurve: 'continuous',
          backgroundColor: emphasized ? theme.background : theme.backgroundElement,
          overflow: 'hidden',
          boxShadow: emphasized ? '0 5px 18px rgba(135,69,0,0.10)' : undefined,
        }}>
        {children}
      </View>
    </View>
  );
}

function TimelineRow({ item, last }: { item: Subscription; last: boolean }) {
  const theme = useTheme();
  const isDark = theme.background === '#000000';
  const isUrgent = item.daysUntil < 3;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: isUrgent ? 82 : 72,
        paddingHorizontal: 14,
        backgroundColor: isUrgent ? (isDark ? '#281416' : '#FFF7F7') : 'transparent',
      }}>
      <View
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          width: 44,
          height: isUrgent ? 52 : 44,
          gap: 1,
          borderRadius: isUrgent ? 15 : 0,
          borderCurve: 'continuous',
          backgroundColor: isUrgent ? (isDark ? '#651F27' : '#FFE1E4') : 'transparent',
        }}>
        <Text
          selectable
          style={{
            color: isUrgent ? (isDark ? '#FFBCC2' : '#971F2A') : theme.text,
            fontSize: 17,
            fontWeight: '800',
            fontVariant: ['tabular-nums'],
          }}>
          {item.dueLabel.split(' ')[1]}
        </Text>
        <Text
          style={{
            color: isUrgent ? (isDark ? '#F49AA3' : '#B42C38') : theme.textSecondary,
            fontSize: 10,
            fontWeight: '700',
          }}>
          {item.dueLabel.split(' ')[0].toUpperCase()}
        </Text>
      </View>
      <ServiceMark item={item} size={40} />
      <View
        style={{
          flex: 1,
          minHeight: isUrgent ? 82 : 72,
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: theme.backgroundSelected,
        }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>
            {item.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {isUrgent && <Image source="sf:clock.badge.exclamationmark.fill" style={{ width: 12, height: 12 }} tintColor={urgentRed} />}
            <Text
              numberOfLines={1}
              style={{
                color: isUrgent ? (isDark ? '#FF9EA7' : '#B32632') : item.id === 'music' ? '#D92D52' : theme.textSecondary,
                fontSize: 12,
                fontWeight: isUrgent ? '700' : '400',
              }}>
              {isUrgent ? `Renews ${item.relativeLabel.toLowerCase()}` : item.note ?? item.relativeLabel}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <Text selectable style={{ color: theme.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {item.amount}
          </Text>
          {isUrgent ? (
            <Pressable
              accessibilityLabel={`Review ${item.name}`}
              accessibilityRole="button"
              style={({ pressed }) => ({
                minHeight: 28,
                paddingHorizontal: 11,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? '#AA2C35' : urgentRed,
              })}>
              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>Review</Text>
            </Pressable>
          ) : (
            <Text style={{ color: theme.textSecondary, fontSize: 20, paddingLeft: 7 }}>›</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function ServiceMark({ item, size }: { item: Subscription; size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: item.color,
      }}>
      <Text style={{ color: '#FFFFFF', fontSize: size * 0.36, fontWeight: '800', letterSpacing: -0.5 }}>{item.monogram}</Text>
    </View>
  );
}

function Pill({ label, color, background }: { label: string; color: string; background: string }) {
  return (
    <View style={{ borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: background }}>
      <Text style={{ color, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>{label}</Text>
    </View>
  );
}

function ActionButton({ label, filled }: { label: string; filled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        borderRadius: 15,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: filled ? 0 : 1,
        borderColor: '#3A3D45',
        backgroundColor: filled ? (pressed ? '#4A4CCC' : accent) : pressed ? '#292B31' : '#202126',
      })}>
      <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function StatTile({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        padding: 16,
        gap: 4,
        borderRadius: 22,
        borderCurve: 'continuous',
        backgroundColor: theme.backgroundElement,
        borderTopWidth: 3,
        borderTopColor: color,
      }}>
      <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>{label}</Text>
      <Text selectable style={{ color: theme.text, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{detail}</Text>
    </View>
  );
}

function SectionHeading({ title, trailing }: { title: string; trailing: string }) {
  const theme = useTheme();
  return (
    <View style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text selectable style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>
        {title}
      </Text>
      <Text selectable style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>
        {trailing}
      </Text>
    </View>
  );
}

function SignalRow({ icon, color, title, detail }: { icon: `sf:${string}`; color: string; title: string; detail: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 13,
        borderRadius: 18,
        borderCurve: 'continuous',
        backgroundColor: theme.backgroundElement,
      }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}18` }}>
        <Image source={icon} style={{ width: 17, height: 17 }} tintColor={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text selectable style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>
          {title}
        </Text>
        <Text selectable style={{ color: theme.textSecondary, fontSize: 12 }}>
          {detail}
        </Text>
      </View>
      <Text style={{ color: theme.textSecondary, fontSize: 20 }}>›</Text>
    </View>
  );
}

function LedgerRow({ item }: { item: Subscription }) {
  const theme = useTheme();
  return (
    <View
      style={{
        minHeight: 70,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.backgroundElement,
      }}>
      <View style={{ width: 42, gap: 2 }}>
        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>{item.dueLabel}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{item.relativeLabel}</Text>
      </View>
      <View style={{ width: 4, height: 38, borderRadius: 2, backgroundColor: item.color }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>
          {item.name}
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{item.category}</Text>
      </View>
      <Text selectable style={{ color: theme.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {item.amount}
      </Text>
    </View>
  );
}

function CompactStatus({ icon, label, color }: { icon: `sf:${string}`; label: string; color: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minHeight: 48,
        paddingHorizontal: 13,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 16,
        borderCurve: 'continuous',
        backgroundColor: theme.backgroundElement,
      }}>
      <Image source={icon} style={{ width: 15, height: 15 }} tintColor={color} />
      <Text selectable style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>
        {label}
      </Text>
    </View>
  );
}
