import { useTheme } from '@/hooks/use-theme';

export function useTabStackOptions() {
  const theme = useTheme();

  return {
    headerTransparent: true,
    headerLargeTitleEnabled: true,
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerBlurEffect: 'none' as const,
    headerBackButtonDisplayMode: 'minimal' as const,
    headerTintColor: theme.accent,
    headerTitleStyle: { color: theme.text },
    headerLargeTitleStyle: { color: theme.text },
    contentStyle: { backgroundColor: theme.background },
  };
}
