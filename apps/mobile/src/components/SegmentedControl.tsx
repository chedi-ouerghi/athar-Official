import { useEffect, useState, type ReactElement } from 'react';
import { Animated, I18nManager, Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH_TARGET, motion, radius, shadows } from '../theme';
import { AppText } from './AppText';
import { useTheme } from './use-theme';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly testID?: string;
}

export interface SegmentedControlProps<T extends string> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly testID?: string;
}

const PADDING = 4;

/**
 * Two to four mutually exclusive choices, with a thumb that slides to the chosen
 * one. The thumb's travel is mirrored in right-to-left layouts.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testID,
}: SegmentedControlProps<T>): ReactElement {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [position] = useState(() => new Animated.Value(index));

  useEffect(() => {
    Animated.spring(position, {
      toValue: index,
      useNativeDriver: true,
      ...motion.settleSpring,
    }).start();
  }, [index, position]);

  const segment = width > 0 ? (width - PADDING * 2) / options.length : 0;
  const direction = I18nManager.isRTL ? -1 : 1;

  return (
    <View
      accessibilityRole="radiogroup"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
      style={[styles.track, { backgroundColor: theme.surfaceMuted }]}
      testID={testID}
    >
      {segment > 0 ? (
        <Animated.View
          style={[
            styles.thumb,
            shadows.soft,
            {
              width: segment,
              backgroundColor: theme.surfaceElevated,
              borderColor: theme.gold,
              shadowColor: theme.shadow,
              transform: [
                {
                  translateX: position.interpolate({
                    inputRange: [0, Math.max(1, options.length - 1)],
                    outputRange: [0, segment * Math.max(1, options.length - 1) * direction],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}

      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) {
                onChange(option.value);
              }
            }}
            style={styles.option}
            testID={option.testID}
          >
            <AppText variant="bodyStrong" tone={selected ? 'text' : 'textMuted'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: PADDING,
  },
  thumb: {
    position: 'absolute',
    top: PADDING,
    bottom: PADDING,
    start: PADDING,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  option: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET - 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
});
