import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the person asked the system to reduce motion. Animations check it and
 * show their final state at once, so nothing slides, fades or pulses for someone
 * who has turned that setting on. Assumed off until the system answers.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduce(enabled);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduce;
}
