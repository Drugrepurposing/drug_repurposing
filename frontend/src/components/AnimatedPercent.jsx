import React from 'react';
import useCountUp from '../hooks/useCountUp.js';

/**
 * A score that counts up to its final value, so the ranking reads as something
 * the pipeline computed rather than a static number on a page.
 */
export default function AnimatedPercent({ value, decimals = 1, delay = 0, suffix = '%' }) {
  const display = useCountUp(Number(value) * 100, { decimals, delay });
  return (
    <>
      {display}
      {suffix}
    </>
  );
}
