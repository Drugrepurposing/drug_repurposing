import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from zero up to `target`, so a computed score reads as
 * something the pipeline worked out rather than a static figure.
 *
 * Uses an ease-out curve, and honours prefers-reduced-motion by jumping
 * straight to the final value.
 */
export default function useCountUp(target, { duration = 900, decimals = 1, delay = 0 } = {}) {
  const [value, setValue] = useState(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const finalValue = Number(target) || 0;

    const prefersReducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || duration <= 0) {
      // Scheduled rather than set synchronously, so the effect never triggers
      // a cascading render.
      frameRef.current = window.requestAnimationFrame(() => setValue(finalValue));
      return () => {
        if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      };
    }

    let start = null;
    let timeoutId = 0;

    const step = (timestamp) => {
      if (start === null) start = timestamp;
      const progress = Math.min(1, (timestamp - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(finalValue * eased);
      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(step);
      }
    };

    timeoutId = window.setTimeout(() => {
      frameRef.current = window.requestAnimationFrame(step);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, delay]);

  return value.toFixed(decimals);
}
