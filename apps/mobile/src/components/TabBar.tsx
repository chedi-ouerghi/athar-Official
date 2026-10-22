import type { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps, type ReactElement } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT, TAB_BAR_RAISE, motion, radius, shadows, spacing } from '../theme';
import { AppText } from './AppText';
import { GradientFill } from './GradientFill';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { useReduceMotion } from './use-reduce-motion';
import { useTheme } from './use-theme';

/** What the navigator hands a custom tab bar, taken from the navigator itself. */
export type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Readonly<Record<string, IconName>> = {
  index: 'home',
  scan: 'scan',
  account: 'user',
};

/** The middle tab is the main action of the app, so it is a raised key, not a tab. */
const SCAN_ROUTE = 'scan';
const SCAN_SIZE = 64;

/**
 * The floating tab bar: a rounded bar with the active tab lit by a soft gold
 * pill that springs in, and the scan key standing proud in the middle. It takes
 * no position from the layout direction: the tabs sit in the order the navigator
 * lists them, which the row mirrors by itself in right-to-left languages.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps): ReactElement {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scanRoute = state.routes.find((route) => route.name === SCAN_ROUTE);

  const press = (routeKey: string, routeName: string, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });

    if (!focused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  return (
    <View style={[styles.outer, { bottom: Math.max(insets.bottom, spacing.md) }]}>
      <View
        style={[
          styles.bar,
          shadows.lifted,
          { backgroundColor: theme.tabBar, borderColor: theme.border, shadowColor: theme.shadow },
        ]}
      >
        {state.routes.map((route, index) => {
          if (route.name === SCAN_ROUTE) {
            // The raised key covers this gap.
            return <View key={route.key} style={styles.gap} />;
          }

          const focused = state.index === index;
          const options = descriptors[route.key]?.options;

          return (
            <TabItem
              key={route.key}
              icon={ICONS[route.name] ?? 'home'}
              label={options?.title ?? route.name}
              focused={focused}
              onPress={() => {
                press(route.key, route.name, focused);
              }}
              testID={`tab-${route.name}`}
            />
          );
        })}
      </View>

      {scanRoute !== undefined ? (
        <ScanKey
          label={descriptors[scanRoute.key]?.options.title ?? SCAN_ROUTE}
          focused={state.routes[state.index]?.name === SCAN_ROUTE}
          onPress={() => {
            press(scanRoute.key, scanRoute.name, state.routes[state.index]?.name === SCAN_ROUTE);
          }}
        />
      ) : null}
    </View>
  );
}

interface TabItemProps {
  readonly icon: IconName;
  readonly label: string;
  readonly focused: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}

function TabItem({ icon, label, focused, onPress, testID }: TabItemProps): ReactElement {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [focus] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) {
      focus.setValue(focused ? 1 : 0);
      return;
    }

    Animated.spring(focus, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      ...motion.settleSpring,
    }).start();
  }, [focus, focused, reduceMotion]);

  const color = focused ? theme.accentText : theme.textMuted;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      style={styles.item}
      testID={testID}
    >
      <Animated.View
        style={[
          styles.pill,
          {
            backgroundColor: theme.accentSoft,
            opacity: focus,
            transform: [
              { scale: focus.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={{
          transform: [
            { translateY: focus.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) },
            { scale: focus.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
          ],
        }}
      >
        <Icon name={icon} color={color} size={24} />
      </Animated.View>
      <AppText variant="caption" style={{ color }}>
        {label}
      </AppText>
    </Pressable>
  );
}

interface ScanKeyProps {
  readonly label: string;
  readonly focused: boolean;
  readonly onPress: () => void;
}

function ScanKey({ label, focused, onPress }: ScanKeyProps): ReactElement {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [focus] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) {
      focus.setValue(focused ? 1 : 0);
      return;
    }

    Animated.spring(focus, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      ...motion.settleSpring,
    }).start();
  }, [focus, focused, reduceMotion]);

  return (
    <View style={styles.scanSlot} pointerEvents="box-none">
      {/* A ring that opens around the key while the scanner is the current tab. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.scanRing,
          {
            borderColor: theme.gold,
            opacity: focus,
            transform: [
              { scale: focus.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
            ],
          },
        ]}
      />
      <PressableScale
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        onPress={onPress}
        scaleTo={0.92}
        style={[styles.scanShadow, shadows.glow, { shadowColor: theme.glow }]}
        testID="tab-scan"
      >
        <View style={styles.scanFace}>
          <GradientFill from={theme.gradientStart} via={theme.gradientMid} to={theme.gradientEnd} />
          <Icon name="scan" color={theme.textOnAccent} size={28} strokeWidth={2.1} />
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    start: spacing.md,
    end: spacing.md,
    height: TAB_BAR_HEIGHT + TAB_BAR_RAISE,
  },
  bar: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    height: TAB_BAR_HEIGHT,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  gap: { flex: 1 },
  item: {
    flex: 1,
    height: TAB_BAR_HEIGHT - spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: spacing.sm,
    end: spacing.sm,
    borderRadius: radius.pill,
  },
  scanSlot: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: SCAN_SIZE + 16,
    height: SCAN_SIZE + 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanRing: {
    position: 'absolute',
    width: SCAN_SIZE + 14,
    height: SCAN_SIZE + 14,
    borderRadius: (SCAN_SIZE + 14) / 2,
    borderWidth: 1.5,
  },
  scanShadow: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: SCAN_SIZE / 2,
  },
  scanFace: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: SCAN_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
