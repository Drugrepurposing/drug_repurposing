import React, { useEffect, useRef } from 'react';
import { useTheme } from '../context/theme-context.js';

/**
 * Full-viewport ambient background: a deep field of molecular nodes and bonds
 * that the page appears to travel through as you scroll.
 *
 * Scrolling advances a virtual camera along the z axis, so new structures rise
 * out of the depth and pass by — the page is one continuous scene rather than a
 * static image behind the content. The field wraps, so it never runs out. The
 * pointer applies a small parallax tilt, which is what makes it feel reactive
 * rather than merely animated.
 *
 * Chosen over a stock video deliberately: no multi-megabyte asset, no licensing
 * question, no decode cost on a slow connection, and it inherits the theme.
 */

const NODE_COUNT = 110;
const FIELD_WIDTH = 1500;
const FIELD_HEIGHT = 1100;
const FIELD_DEPTH = 2200;
const BOND_DISTANCE = 240;
const MAX_BONDS = 260;
const FOCAL = 620;
const SCROLL_FACTOR = 0.55;
const DRIFT_SPEED = 0.012; // z units per millisecond

const PALETTE = {
  light: { node: '#4f46e5', accent: '#0f766e', bond: '#475569', alpha: 0.46 },
  dark: { node: '#a5b4fc', accent: '#5eead4', bond: '#94a3b8', alpha: 0.62 },
};

/** Deterministic pseudo-random, so the field looks identical on every load. */
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function buildField() {
  const random = makeRandom(20260831);
  const nodes = [];
  for (let i = 0; i < NODE_COUNT; i += 1) {
    nodes.push({
      x: (random() - 0.5) * FIELD_WIDTH,
      y: (random() - 0.5) * FIELD_HEIGHT,
      z: random() * FIELD_DEPTH,
      size: 1.9 + random() * 3.2,
      accent: random() < 0.22,
    });
  }

  // Bonds are fixed in model space, so they are computed once rather than
  // every frame.
  const bonds = [];
  for (let i = 0; i < nodes.length && bonds.length < MAX_BONDS; i += 1) {
    for (let j = i + 1; j < nodes.length && bonds.length < MAX_BONDS; j += 1) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dz = nodes[i].z - nodes[j].z;
      if (dx * dx + dy * dy + dz * dz < BOND_DISTANCE * BOND_DISTANCE) {
        bonds.push([i, j]);
      }
    }
  }
  return { nodes, bonds };
}

export default function AmbientBackdrop() {
  const canvasRef = useRef(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const { nodes, bonds } = buildField();
    const colours = PALETTE[resolvedTheme] || PALETTE.light;
    const prefersReducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let pointerX = 0;
    let pointerY = 0;
    let targetPointerX = 0;
    let targetPointerY = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const projected = new Array(nodes.length);

    const draw = (cameraZ, angle) => {
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const centreX = width / 2 + pointerX * 26;
      const centreY = height / 2 + pointerY * 18;

      context.clearRect(0, 0, width, height);
      context.globalAlpha = 1;

      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        // Wrap the field so scrolling never reaches the end of it.
        const z = (((node.z - cameraZ) % FIELD_DEPTH) + FIELD_DEPTH) % FIELD_DEPTH;
        const rx = node.x * cosA - (z - FIELD_DEPTH / 2) * sinA * 0.12;
        const depth = FOCAL / (FOCAL + z * 0.55);
        projected[i] = {
          sx: centreX + rx * depth,
          sy: centreY + (node.y + pointerY * 40) * depth,
          depth,
          z,
          fade: Math.max(0, Math.min(1, (1 - z / FIELD_DEPTH) * 1.6)),
        };
      }

      // Bonds first, so nodes sit on top of them.
      context.strokeStyle = colours.bond;
      context.lineWidth = 1;
      for (let b = 0; b < bonds.length; b += 1) {
        const a = projected[bonds[b][0]];
        const c = projected[bonds[b][1]];
        // A bond whose ends wrapped at different moments would stretch right
        // across the screen; skip those.
        if (Math.abs(a.z - c.z) > BOND_DISTANCE * 1.5) continue;
        context.globalAlpha = Math.min(a.fade, c.fade) * colours.alpha * 0.5;
        if (context.globalAlpha < 0.012) continue;
        context.beginPath();
        context.moveTo(a.sx, a.sy);
        context.lineTo(c.sx, c.sy);
        context.stroke();
      }

      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        const p = projected[i];
        context.globalAlpha = p.fade * colours.alpha;
        if (context.globalAlpha < 0.012) continue;
        context.fillStyle = node.accent ? colours.accent : colours.node;
        context.beginPath();
        context.arc(p.sx, p.sy, Math.max(0.5, node.size * p.depth), 0, Math.PI * 2);
        context.fill();
      }

      context.globalAlpha = 1;
    };

    resize();

    if (prefersReducedMotion) {
      draw(0, 0);
      const staticResize = () => { resize(); draw(0, 0); };
      window.addEventListener('resize', staticResize);
      return () => window.removeEventListener('resize', staticResize);
    }

    let frame = 0;
    let running = true;
    let start = null;

    const loop = (timestamp) => {
      if (start === null) start = timestamp;
      const elapsed = timestamp - start;

      // Ease the pointer so the parallax glides instead of snapping.
      pointerX += (targetPointerX - pointerX) * 0.05;
      pointerY += (targetPointerY - pointerY) * 0.05;

      const cameraZ = window.scrollY * SCROLL_FACTOR + elapsed * DRIFT_SPEED;
      draw(cameraZ, elapsed * 0.00004 + pointerX * 0.12);

      if (running) frame = window.requestAnimationFrame(loop);
    };

    const onPointerMove = (event) => {
      targetPointerX = (event.clientX / window.innerWidth) * 2 - 1;
      targetPointerY = (event.clientY / window.innerHeight) * 2 - 1;
    };

    const onVisibilityChange = () => {
      running = !document.hidden;
      if (running) {
        if (frame) window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(loop);
      }
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    frame = window.requestAnimationFrame(loop);

    return () => {
      running = false;
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [resolvedTheme]);

  return <canvas ref={canvasRef} className="ambient-backdrop" aria-hidden="true" />;
}
