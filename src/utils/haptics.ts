/**
 * Haptic feedback helper for mobile and tablet touch devices
 */
export type HapticType = 'tap' | 'light' | 'medium' | 'selection' | 'success' | 'error';

export const triggerHaptic = (type: HapticType = 'tap') => {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;

  try {
    switch (type) {
      case 'tap':
      case 'light':
      case 'selection':
        navigator.vibrate(20);
        break;
      case 'medium':
        navigator.vibrate(45);
        break;
      case 'success':
        navigator.vibrate([35, 45, 55]);
        break;
      case 'error':
        navigator.vibrate([80, 50, 80]);
        break;
    }
  } catch {
    // Ignore unsupported browser security contexts
  }
};
