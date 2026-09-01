import React, { useEffect, useRef, useState } from 'react';

/**
 * Reveals its children once they scroll into view, so the page unfolds as you
 * move down it rather than arriving all at once.
 *
 * Fires only the first time — content that has been seen stays visible, which
 * avoids the distracting re-animation you get when scrolling back up.
 */
export default function ScrollReveal({
  children,
  className = '',
  delay = 0,
  as: Tag = 'div',
}) {
  const ref = useRef(null);
  // Browsers without IntersectionObserver simply start visible, which also
  // keeps the initial state out of the effect.
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    if (typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -60px 0px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal${shown ? ' reveal-in' : ''}${className ? ` ${className}` : ''}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
