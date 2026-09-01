import React, { useEffect, useRef, useState } from 'react';

/**
 * Full-screen photographic or video background for the whole application.
 *
 * Sources are configured with environment variables rather than hardcoded, so
 * the asset can be swapped without touching code:
 *
 *   VITE_BACKDROP_IMAGE   defaults to /backdrop.jpg
 *   VITE_BACKDROP_VIDEO   empty by default; set it to /backdrop.mp4 to switch
 *                         the still image for a looping video
 *
 * Three things make the difference between this looking professional and
 * looking like a template:
 *
 *  1. A scrim. Body text over a photograph is unreadable without one. The
 *     scrim is the page background colour at an adjustable opacity, so it
 *     works in both themes; tune --backdrop-veil in index.css.
 *  2. Parallax. The layer drifts more slowly than the page, which reads as
 *     depth rather than as a sticker behind the content.
 *  3. Restraint on cost. The video is muted, looping, preloads only metadata,
 *     is never played when the tab is hidden, and is skipped entirely for
 *     anyone who has asked for reduced motion.
 */

const IMAGE_SRC = import.meta.env.VITE_BACKDROP_IMAGE || '/backdrop.jpg';
const VIDEO_SRC = import.meta.env.VITE_BACKDROP_VIDEO || '';
const PARALLAX = 0.16;

export default function MediaBackdrop() {
  const layerRef = useRef(null);
  const videoRef = useRef(null);

  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [imageOk, setImageOk] = useState(Boolean(IMAGE_SRC));
  const [videoOk, setVideoOk] = useState(Boolean(VIDEO_SRC) && !prefersReducedMotion);

  // Parallax drift, throttled to one paint per frame.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || prefersReducedMotion) return undefined;

    let frame = 0;
    const apply = () => {
      frame = 0;
      layer.style.transform = `translate3d(0, ${window.scrollY * PARALLAX}px, 0)`;
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [prefersReducedMotion]);

  // Never decode video frames for a tab nobody is looking at.
  useEffect(() => {
    if (!videoOk) return undefined;
    const onVisibilityChange = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) video.pause();
      else video.play().catch(() => { /* autoplay can be refused; the poster stands in */ });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [videoOk]);

  return (
    <div className="media-backdrop" aria-hidden="true">
      <div className="media-backdrop__parallax" ref={layerRef}>
        {imageOk && (
          <img
            className="media-backdrop__layer"
            src={IMAGE_SRC}
            alt=""
            decoding="async"
            onError={() => setImageOk(false)}
          />
        )}
        {videoOk && (
          <video
            ref={videoRef}
            className="media-backdrop__layer"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={IMAGE_SRC}
            onError={() => setVideoOk(false)}
          >
            <source src={VIDEO_SRC} type="video/mp4" />
          </video>
        )}
      </div>
      <div className="media-backdrop__scrim" />
    </div>
  );
}
