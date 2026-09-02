import React, { useEffect, useRef } from 'react';
import { useTheme } from '../context/theme-context.js';

/**
 * Drifting chemistry behind the hero: benzene and fused rings, peptide
 * backbones, and short helices, floating slowly across the top of the page.
 *
 * The shapes are the reason this is here rather than a generic particle field.
 * Every glyph is something the pipeline actually works with — an aromatic ring
 * from a SMILES string, a peptide backbone from a protein target, a nucleic
 * helix from an expression signature — so the motion reads as subject matter
 * rather than as decoration bolted on.
 *
 * Three constraints keep it from being obnoxious, which is the failure mode of
 * every animated background:
 *
 *  1. Low contrast and low count. Eighteen glyphs at roughly a third opacity,
 *     behind a veil; the headline is never competing with it.
 *  2. Slow. Everything drifts at a few pixels a second and rotates a fraction
 *     of a degree per frame. Nothing here should catch the eye mid-sentence.
 *  3. Cheap and polite. One canvas, no library, no assets. It stops painting
 *     when scrolled out of view or when the tab is hidden, and anyone who has
 *     asked for reduced motion gets a single still frame instead.
 *
 * Purely decorative, so the canvas is aria-hidden — a screen reader is told
 * nothing about it, because there is nothing here to know.
 */

const GLYPH_COUNT = 18;

// Colourful but restrained, and drawn from the palette the rest of the
// interface already uses so the page does not suddenly acquire a sixth accent.
const PALETTE = {
  light: ['#6366f1', '#0d9488', '#d97706', '#0284c7', '#7c3aed', '#db2777'],
  dark: ['#a5b4fc', '#5eead4', '#fbbf24', '#7dd3fc', '#c4b5fd', '#f9a8d4'],
};

const BASE_ALPHA = { light: 0.30, dark: 0.34 };

const KINDS = ['benzene', 'fused', 'pentagon', 'peptide', 'helix'];

/** Deterministic pseudo-random, so the layout is identical on every load. */
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function buildGlyphs() {
  const random = makeRandom(20260902);
  return Array.from({ length: GLYPH_COUNT }, (unused, index) => ({
    // Positions are fractions of the canvas, so a resize repositions rather
    // than stranding half the glyphs outside the new bounds.
    fx: random(),
    fy: random(),
    // Pixels per millisecond. At these values a glyph crosses the hero in
    // something like a minute and a half.
    vx: (random() - 0.5) * 0.012,
    vy: (random() - 0.5) * 0.009,
    rotation: random() * Math.PI * 2,
    spin: (random() - 0.5) * 0.00022,
    scale: 0.7 + random() * 0.85,
    kind: KINDS[index % KINDS.length],
    colourIndex: index % PALETTE.light.length,
    // A slow breath in opacity, out of phase between glyphs, so the field
    // never looks like a single object moving in lockstep.
    phase: random() * Math.PI * 2,
  }));
}

function regularRing(context, sides, radius) {
  context.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.stroke();
}

/** The inner strokes that make a hexagon read as an aromatic ring. */
function aromaticMarks(context, radius) {
  context.beginPath();
  for (let i = 0; i < 6; i += 2) {
    const a1 = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2;
    const inner = radius * 0.74;
    context.moveTo(Math.cos(a1) * inner, Math.sin(a1) * inner);
    context.lineTo(Math.cos(a2) * inner, Math.sin(a2) * inner);
  }
  context.stroke();
}

function drawGlyph(context, kind, radius) {
  switch (kind) {
    case 'benzene':
      regularRing(context, 6, radius);
      aromaticMarks(context, radius);
      break;

    case 'pentagon':
      regularRing(context, 5, radius * 0.9);
      break;

    case 'fused': {
      // Two rings sharing an edge — an indole-like scaffold, the shape that
      // turns up in a good share of CNS-active compounds.
      const offset = radius * Math.sqrt(3);
      context.save();
      context.translate(-offset / 2, 0);
      regularRing(context, 6, radius);
      context.restore();
      context.save();
      context.translate(offset / 2, 0);
      regularRing(context, 6, radius);
      aromaticMarks(context, radius);
      context.restore();
      break;
    }

    case 'peptide': {
      // A zig-zag backbone with a residue marker at each alpha carbon.
      const step = radius * 0.62;
      const amplitude = radius * 0.42;
      context.beginPath();
      for (let i = 0; i <= 6; i += 1) {
        const x = (i - 3) * step;
        const y = (i % 2 === 0 ? -1 : 1) * amplitude;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      for (let i = 0; i <= 6; i += 2) {
        const x = (i - 3) * step;
        context.beginPath();
        context.arc(x, -amplitude, radius * 0.13, 0, Math.PI * 2);
        context.stroke();
      }
      break;
    }

    case 'helix': {
      // Two counter-phase strands with base-pair rungs between them.
      const span = radius * 2.1;
      const amplitude = radius * 0.5;
      for (let strand = 0; strand < 2; strand += 1) {
        context.beginPath();
        for (let t = 0; t <= 32; t += 1) {
          const p = t / 32;
          const x = (p - 0.5) * span;
          const y = Math.sin(p * Math.PI * 2.4 + strand * Math.PI) * amplitude;
          if (t === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
      context.beginPath();
      for (let t = 2; t <= 30; t += 4) {
        const p = t / 32;
        const x = (p - 0.5) * span;
        context.moveTo(x, Math.sin(p * Math.PI * 2.4) * amplitude);
        context.lineTo(x, Math.sin(p * Math.PI * 2.4 + Math.PI) * amplitude);
      }
      context.stroke();
      break;
    }

    default:
      break;
  }
}

export default function MolecularAmbience({ className = '' }) {
  const canvasRef = useRef(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const theme = PALETTE[resolvedTheme] ? resolvedTheme : 'light';
    const colours = PALETTE[theme];
    const baseAlpha = BASE_ALPHA[theme];
    const glyphs = buildGlyphs();
    const prefersReducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (elapsed) => {
      if (width === 0 || height === 0) return;
      context.clearRect(0, 0, width, height);
      context.lineCap = 'round';
      context.lineJoin = 'round';

      glyphs.forEach((glyph) => {
        // Wrapped in fractional space, so a glyph leaving the right edge
        // re-enters on the left regardless of the panel's width.
        const fx = (((glyph.fx + (glyph.vx * elapsed) / Math.max(width, 1)) % 1) + 1) % 1;
        const fy = (((glyph.fy + (glyph.vy * elapsed) / Math.max(height, 1)) % 1) + 1) % 1;
        // A margin either side so glyphs drift in from off-screen rather than
        // appearing at the edge.
        const x = -60 + fx * (width + 120);
        const y = -50 + fy * (height + 100);
        const breath = 0.72 + 0.28 * Math.sin(elapsed * 0.00035 + glyph.phase);

        context.save();
        context.translate(x, y);
        context.rotate(glyph.rotation + elapsed * glyph.spin);
        context.globalAlpha = baseAlpha * breath;
        context.strokeStyle = colours[glyph.colourIndex];
        context.lineWidth = 1.4;
        drawGlyph(context, glyph.kind, 21 * glyph.scale);
        context.restore();
      });

      context.globalAlpha = 1;
    };

    resize();

    if (prefersReducedMotion) {
      draw(0);
      const staticResize = () => { resize(); draw(0); };
      window.addEventListener('resize', staticResize);
      return () => window.removeEventListener('resize', staticResize);
    }

    let frame = 0;
    let running = true;
    let visible = true;
    let elapsed = 0;
    let previous = null;

    const loop = (timestamp) => {
      if (previous === null) previous = timestamp;
      // Clamped: a tab restored after ten minutes away would otherwise
      // teleport every glyph across the panel in a single frame.
      elapsed += Math.min(timestamp - previous, 60);
      previous = timestamp;
      draw(elapsed);
      if (running && visible) frame = window.requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      previous = null;
      frame = window.requestAnimationFrame(loop);
    };

    const observer = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible && running) startLoop();
      }, { threshold: 0.01 })
      : null;
    if (observer) observer.observe(canvas);

    const onVisibilityChange = () => {
      running = !document.hidden;
      if (running && visible) startLoop();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('resize', resize);
    startLoop();

    return () => {
      running = false;
      if (frame) window.cancelAnimationFrame(frame);
      if (observer) observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', resize);
    };
  }, [resolvedTheme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="molecular-ambience"
      className={`pointer-events-none absolute inset-0 w-full h-full ${className}`}
    />
  );
}
