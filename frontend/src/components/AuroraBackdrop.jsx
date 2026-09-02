import React, { useEffect, useRef } from 'react';
import { useTheme } from '../context/theme-context.js';

/**
 * The page's background: an aurora of coloured light, slowly waving.
 *
 * Two layers. A pale wash the whole page sits on, set in CSS so the window is
 * never flat white; and above it a single canvas holding the aurora itself —
 * soft pools of colour with curtains of light waving through them. No strokes
 * anywhere: nothing in this file draws a line.
 *
 * HOW IT IS DRAWN, WHICH IS THE WHOLE TRICK. Everything is painted into a
 * 256x160 offscreen buffer and then blitted up to the full window in one call.
 * Bilinear upscaling of a smooth gradient IS a blur, and a good one: a shape
 * one pixel across in the buffer arrives on screen eight pixels wide with a
 * soft edge. So a curtain can be drawn as an ordinary filled path and still
 * land as diffuse light with nothing hard-edged anywhere.
 *
 * That approach was arrived at by measurement, not taste. The colour pools
 * were originally CSS elements with filter: blur(90px), which ran at 6 frames
 * per second against a 59fps ceiling — five very large blurred layers have to
 * be re-rasterised and re-composited on every frame that anything else on the
 * page moves. Dropping the filter recovered 48fps, and moving the whole
 * backdrop into one small buffer put it back at the ceiling. A fifth of a
 * megapixel of fills plus one stretched draw costs almost nothing.
 *
 * WHAT MAKES IT WAVE. Each curtain's upper boundary is the sum of three sine
 * terms whose wavelengths and speeds do not divide into each other, two of
 * them travelling against the third, so no crest repeats across the width and
 * the shape never returns to one it has held before. The fill below that
 * boundary starts at nothing, swells, and fades out — so the boundary itself
 * is invisible, and what the eye follows is a band of light bending rather
 * than an edge moving.
 *
 * The canvas is pointer-transparent and behind the page's own stacking
 * context, so it can never intercept a click. Under prefers-reduced-motion it
 * paints one still frame, caught mid-wave.
 */

const PALETTE = {
  light: {
    // Pools of colour: broad, soft, barely moving.
    orbs: ['#7dd3fc', '#a5b4fc', '#99f6e4', '#c4b5fd'],
    orbAlpha: 0.50,
    // Curtains: the part that waves.
    curtains: ['#38bdf8', '#818cf8', '#5eead4', '#93c5fd', '#c7d2fe'],
    curtainAlpha: 0.26,
  },
  dark: {
    orbs: ['#0ea5e9', '#4f46e5', '#0d9488', '#6d28d9'],
    orbAlpha: 0.38,
    curtains: ['#0ea5e9', '#6366f1', '#14b8a6', '#2563eb', '#7c3aed'],
    curtainAlpha: 0.26,
  },
};

const TAU = Math.PI * 2;

/**
 * The buffer everything is drawn into before being stretched over the window.
 * Small on purpose: the upscale is what does the blurring, and a larger buffer
 * would only make the result sharper and slower.
 */
const BUFFER_WIDTH = 256;
const BUFFER_HEIGHT = 160;

/** Horizontal sampling step inside the buffer, in buffer pixels. */
const STEP = 4;

/**
 * The colour pools. Fractions of the buffer throughout, so the composition is
 * identical on a phone and on a widescreen monitor.
 *
 *   x, y    resting centre
 *   r       radius, as a fraction of buffer width
 *   ax, ay  how far it wanders from that centre
 *   sx, sy  radians per millisecond on each axis; unequal, so no pool ever
 *           retraces its own path
 */
const ORBS = [
  { x: 0.06, y: 0.10, r: 0.52, colour: 0, ax: 0.10, ay: 0.09, sx: 0.000048, sy: 0.000031, phase: 0.0 },
  { x: 0.94, y: 0.18, r: 0.56, colour: 1, ax: 0.09, ay: 0.11, sx: 0.000033, sy: 0.000052, phase: 1.9 },
  { x: 0.24, y: 0.95, r: 0.48, colour: 2, ax: 0.12, ay: 0.08, sx: 0.000041, sy: 0.000027, phase: 3.4 },
  { x: 0.84, y: 0.86, r: 0.46, colour: 3, ax: 0.11, ay: 0.10, sx: 0.000029, sy: 0.000045, phase: 5.9 },
];

/**
 * The waving curtains, back to front.
 *
 *   base    resting height, as a fraction of buffer height
 *   depth   how far the light reaches below that line before it fades out
 *   terms   amplitude (fraction of buffer height), wavelength (fraction of
 *           buffer width) and speed (radians per millisecond, negative to
 *           travel the other way) for each of the three travelling terms
 */
const CURTAINS = [
  {
    base: 0.18, depth: 0.62, colour: 0, alpha: 1.0,
    terms: [
      { amp: 0.085, len: 1.15, spd: 0.000141 },
      { amp: 0.042, len: 0.47, spd: -0.000097 },
      { amp: 0.018, len: 0.23, spd: 0.000203 },
    ],
  },
  {
    base: 0.36, depth: 0.55, colour: 1, alpha: 0.92,
    terms: [
      { amp: 0.078, len: 0.88, spd: -0.000113 },
      { amp: 0.046, len: 0.39, spd: 0.000162 },
      { amp: 0.020, len: 0.19, spd: -0.000178 },
    ],
  },
  {
    base: 0.54, depth: 0.50, colour: 2, alpha: 0.85,
    terms: [
      { amp: 0.092, len: 1.32, spd: 0.000089 },
      { amp: 0.038, len: 0.53, spd: -0.000149 },
      { amp: 0.016, len: 0.26, spd: 0.000221 },
    ],
  },
  {
    base: 0.72, depth: 0.44, colour: 3, alpha: 0.90,
    terms: [
      { amp: 0.081, len: 0.96, spd: -0.000127 },
      { amp: 0.044, len: 0.43, spd: 0.000108 },
      { amp: 0.019, len: 0.21, spd: -0.000191 },
    ],
  },
  {
    base: 0.90, depth: 0.34, colour: 4, alpha: 0.78,
    terms: [
      { amp: 0.070, len: 1.08, spd: 0.000101 },
      { amp: 0.040, len: 0.36, spd: -0.000133 },
      { amp: 0.017, len: 0.17, spd: 0.000167 },
    ],
  },
];

/** The slow breath that swells and settles the whole aurora. */
const SWELL_SPEED = 0.000047;
const SWELL_DEPTH = 0.30;

/** How far the aurora lags the page as it scrolls. Depth, not motion. */
const PARALLAX = 0.05;

/** #rrggbb plus an alpha, as a canvas-ready colour. */
function withAlpha(hex, alpha) {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

export default function AuroraBackdrop() {
  const canvasRef = useRef(null);
  const scrollRef = useRef(0);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const theme = PALETTE[resolvedTheme] || PALETTE.light;
    const prefersReducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const buffer = document.createElement('canvas');
    buffer.width = BUFFER_WIDTH;
    buffer.height = BUFFER_HEIGHT;
    const bufferContext = buffer.getContext('2d');
    if (!bufferContext) return undefined;

    let width = 0;
    let height = 0;

    const resize = () => {
      // The window is painted from the buffer, so the backing store never
      // needs to be larger than the window - and at one device pixel per CSS
      // pixel the upscale is softer, which is the effect wanted anyway.
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
    };

    const drawOrbs = (elapsed, shift) => {
      ORBS.forEach((orb) => {
        const cx = (orb.x + orb.ax * Math.sin(elapsed * orb.sx + orb.phase)) * BUFFER_WIDTH;
        const cy = (orb.y + orb.ay * Math.sin(elapsed * orb.sy + orb.phase * 1.7) + shift)
          * BUFFER_HEIGHT;
        const radius = orb.r * BUFFER_WIDTH
          * (1 + 0.10 * Math.sin(elapsed * orb.sx * 1.4 + orb.phase));
        const colour = theme.orbs[orb.colour];

        const gradient = bufferContext.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, withAlpha(colour, theme.orbAlpha));
        gradient.addColorStop(0.55, withAlpha(colour, theme.orbAlpha * 0.42));
        gradient.addColorStop(1, withAlpha(colour, 0));
        bufferContext.fillStyle = gradient;
        bufferContext.fillRect(0, 0, BUFFER_WIDTH, BUFFER_HEIGHT);
      });
    };

    const drawCurtains = (elapsed, shift, swell) => {
      CURTAINS.forEach((curtain) => {
        const colour = theme.curtains[curtain.colour];
        const base = (curtain.base + shift) * BUFFER_HEIGHT;
        const depth = curtain.depth * BUFFER_HEIGHT;

        bufferContext.beginPath();
        bufferContext.moveTo(-STEP, BUFFER_HEIGHT + STEP);
        for (let x = -STEP; x <= BUFFER_WIDTH + STEP; x += STEP) {
          let y = base;
          for (let t = 0; t < curtain.terms.length; t += 1) {
            const term = curtain.terms[t];
            y += Math.sin((TAU * x) / (term.len * BUFFER_WIDTH) + elapsed * term.spd)
              * term.amp * BUFFER_HEIGHT * swell;
          }
          bufferContext.lineTo(x, y);
        }
        bufferContext.lineTo(BUFFER_WIDTH + STEP, BUFFER_HEIGHT + STEP);
        bufferContext.closePath();

        // Nothing at the boundary, swelling just below it, gone by the bottom.
        // Starting at zero is what keeps the wave's edge from reading as a
        // line: the shape is visible, its outline is not.
        const gradient = bufferContext.createLinearGradient(
          0, base - curtain.terms[0].amp * BUFFER_HEIGHT, 0, base + depth,
        );
        const peak = theme.curtainAlpha * curtain.alpha;
        gradient.addColorStop(0, withAlpha(colour, 0));
        gradient.addColorStop(0.30, withAlpha(colour, peak));
        gradient.addColorStop(0.62, withAlpha(colour, peak * 0.45));
        gradient.addColorStop(1, withAlpha(colour, 0));
        bufferContext.fillStyle = gradient;
        bufferContext.fill();
      });
    };

    const draw = (elapsed) => {
      if (width === 0 || height === 0) return;

      const swell = 1 - SWELL_DEPTH + SWELL_DEPTH * Math.sin(elapsed * SWELL_SPEED);
      // Scroll moves the aurora a little less than the page, which reads as
      // depth. Expressed as a fraction of the buffer so it survives the blit.
      const shift = (-scrollRef.current * PARALLAX) / Math.max(height, 1);

      bufferContext.clearRect(0, 0, BUFFER_WIDTH, BUFFER_HEIGHT);
      drawOrbs(elapsed, shift);
      drawCurtains(elapsed, shift, swell);

      context.clearRect(0, 0, width, height);
      context.drawImage(buffer, 0, 0, width, height);
    };

    resize();

    if (prefersReducedMotion) {
      // A frame from part-way through the cycle, so the aurora is caught
      // mid-wave rather than flat.
      draw(11000);
      const staticResize = () => { resize(); draw(11000); };
      window.addEventListener('resize', staticResize);
      return () => window.removeEventListener('resize', staticResize);
    }

    let frame = 0;
    let running = true;
    let previous = null;
    let elapsed = 0;

    const loop = (timestamp) => {
      if (previous === null) previous = timestamp;
      // Clamped, so a tab restored after several minutes away resumes rather
      // than jumping the whole composition forward in a single frame.
      elapsed += Math.min(timestamp - previous, 50);
      previous = timestamp;
      draw(elapsed);
      if (running) frame = window.requestAnimationFrame(loop);
    };

    const onVisibilityChange = () => {
      running = !document.hidden;
      if (running) {
        previous = null;
        frame = window.requestAnimationFrame(loop);
      } else if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };

    const onScroll = () => { scrollRef.current = window.scrollY; };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', onScroll, { passive: true });
    frame = window.requestAnimationFrame(loop);

    return () => {
      running = false;
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [resolvedTheme]);

  return (
    <div className="aurora" aria-hidden="true" data-testid="aurora-backdrop">
      <canvas className="aurora__net" ref={canvasRef} data-testid="aurora-waves" />
      <div className="aurora__scrim" />
    </div>
  );
}
