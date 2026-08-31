import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/theme-context.js';

/**
 * Live 3D visualisation of the heterogeneous biomedical graph that the GNN
 * operates on — the structure described in PROJECT_DOCUMENTATION.md section 1.
 *
 *   centre      the disease node
 *   inner shell protein / gene targets
 *   outer shell candidate drug compounds
 *
 * Nodes are placed on concentric spheres using a Fibonacci distribution so the
 * spacing is even rather than clustered at the poles, then rotated and
 * perspective-projected onto a 2D canvas. Travelling dots along each edge
 * represent message passing between neighbouring nodes, which is the actual
 * mechanism the GNN uses to build node embeddings.
 *
 * Deliberately dependency-free: this is plain canvas 2D with the projection
 * maths written out, so it adds nothing to the bundle and cannot break because
 * a CDN is unreachable.
 */

const SHELLS = [
  { count: 1, radius: 0, size: 10.5, type: 'disease' },
  { count: 6, radius: 64, size: 6.4, type: 'target' },
  { count: 18, radius: 120, size: 4.8, type: 'drug' },
];

const PALETTE = {
  light: {
    disease: '#b45309',
    target: '#047857',
    drug: '#4f46e5',
    edge: 'rgba(71, 85, 105, 0.40)',
    pulse: '#6366f1',
  },
  dark: {
    disease: '#fbbf24',
    target: '#4ade9f',
    drug: '#a5b4fc',
    edge: 'rgba(148, 163, 184, 0.34)',
    pulse: '#c7d2fe',
  },
};

const FOCAL = 430;
const TILT = 0.34;
const ROTATION_SPEED = 0.00022; // radians per millisecond
const PULSE_SPEED = 0.00035;

function fibonacciPoint(index, total, radius) {
  const offset = 2 / total;
  const increment = Math.PI * (3 - Math.sqrt(5));
  const y = index * offset - 1 + offset / 2;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = index * increment;
  return {
    x: Math.cos(phi) * ring * radius,
    y: y * radius,
    z: Math.sin(phi) * ring * radius,
  };
}

function buildGraph() {
  const nodes = [];
  const ranges = [];

  SHELLS.forEach((shell) => {
    const from = nodes.length;
    for (let i = 0; i < shell.count; i += 1) {
      const point = shell.radius === 0
        ? { x: 0, y: 0, z: 0 }
        : fibonacciPoint(i, shell.count, shell.radius);
      nodes.push({ ...point, size: shell.size, type: shell.type });
    }
    ranges.push([from, nodes.length]);
  });

  const edges = [];
  const [diseaseIndex] = ranges[0];
  const [targetFrom, targetTo] = ranges[1];
  const [drugFrom, drugTo] = ranges[2];

  // Disease connects to every candidate target.
  for (let t = targetFrom; t < targetTo; t += 1) {
    edges.push({ a: diseaseIndex, b: t });
  }

  // Each drug attaches to its nearest target, so the edges read as structure
  // rather than as an arbitrary pattern.
  for (let d = drugFrom; d < drugTo; d += 1) {
    let best = targetFrom;
    let bestDistance = Infinity;
    for (let t = targetFrom; t < targetTo; t += 1) {
      const dx = nodes[d].x - nodes[t].x;
      const dy = nodes[d].y - nodes[t].y;
      const dz = nodes[d].z - nodes[t].z;
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = t;
      }
    }
    edges.push({ a: best, b: d });
  }

  edges.forEach((edge, i) => {
    edge.phase = (i * 0.371) % 1;
  });

  return { nodes, edges };
}

function project(node, cosA, sinA, centreX, centreY, scale) {
  // Rotate about the vertical axis.
  const rx = node.x * cosA - node.z * sinA;
  const rz = node.x * sinA + node.z * cosA;
  // Fixed tilt about the horizontal axis so the shells read as spheres.
  const ry = node.y * Math.cos(TILT) - rz * Math.sin(TILT);
  const depthZ = node.y * Math.sin(TILT) + rz * Math.cos(TILT);
  const perspective = FOCAL / (FOCAL + depthZ);
  return {
    sx: centreX + rx * perspective * scale,
    sy: centreY + ry * perspective * scale,
    perspective,
    depthZ,
  };
}

export default function MolecularScene3D({ className = '', height = 260 }) {
  const canvasRef = useRef(null);
  const { resolvedTheme } = useTheme();

  // Built once, lazily. The layout is deterministic, so it never needs rebuilding.
  const [graph] = useState(buildGraph);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const { nodes, edges } = graph;
    const colours = PALETTE[resolvedTheme] || PALETTE.light;
    const prefersReducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let cssHeight = 0;
    let scale = 1;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      cssHeight = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(cssHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      // Height-driven: the graph is spherical, so a wide panel is always
      // constrained vertically.
      scale = Math.min(width / 380, cssHeight / 268, 1.35);
    };

    const draw = (angle, pulseOffset) => {
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const centreX = width / 2;
      const centreY = cssHeight / 2;

      context.clearRect(0, 0, width, cssHeight);

      const projected = nodes.map((node) => project(node, cosA, sinA, centreX, centreY, scale));

      // Edges, faded by depth so the far side of the graph recedes.
      context.lineWidth = 1;
      edges.forEach((edge) => {
        const a = projected[edge.a];
        const b = projected[edge.b];
        const nearness = (a.perspective + b.perspective) / 2;
        context.globalAlpha = Math.max(0.06, Math.min(1, (nearness - 0.55) * 2.2));
        context.strokeStyle = colours.edge;
        context.beginPath();
        context.moveTo(a.sx, a.sy);
        context.lineTo(b.sx, b.sy);
        context.stroke();
      });

      // Message-passing pulses travelling along each edge.
      edges.forEach((edge) => {
        const a = projected[edge.a];
        const b = projected[edge.b];
        const t = (pulseOffset + edge.phase) % 1;
        const nearness = a.perspective * (1 - t) + b.perspective * t;
        context.globalAlpha = Math.max(0, Math.min(1, (nearness - 0.6) * 2.4)) * 0.85;
        context.fillStyle = colours.pulse;
        context.beginPath();
        context.arc(
          a.sx + (b.sx - a.sx) * t,
          a.sy + (b.sy - a.sy) * t,
          1.9 * nearness,
          0,
          Math.PI * 2,
        );
        context.fill();
      });

      // Nodes, painted far to near so nearer ones overlap correctly.
      const order = nodes
        .map((node, index) => ({ index, depthZ: projected[index].depthZ }))
        .sort((p, q) => q.depthZ - p.depthZ);

      order.forEach(({ index }) => {
        const node = nodes[index];
        const p = projected[index];
        const radius = Math.max(1.2, node.size * p.perspective * scale);
        context.globalAlpha = Math.max(0.25, Math.min(1, (p.perspective - 0.5) * 2.2));

        const gradient = context.createRadialGradient(
          p.sx - radius * 0.35,
          p.sy - radius * 0.35,
          radius * 0.15,
          p.sx,
          p.sy,
          radius,
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.35, colours[node.type]);
        gradient.addColorStop(1, colours[node.type]);

        context.fillStyle = gradient;
        context.beginPath();
        context.arc(p.sx, p.sy, radius, 0, Math.PI * 2);
        context.fill();
      });

      context.globalAlpha = 1;
    };

    resize();

    if (prefersReducedMotion) {
      // One representative frame, no animation loop.
      draw(0.7, 0.35);
      const staticResize = () => {
        resize();
        draw(0.7, 0.35);
      };
      window.addEventListener('resize', staticResize);
      return () => window.removeEventListener('resize', staticResize);
    }

    let frame = 0;
    let running = true;
    let visible = true;
    let start = null;

    const loop = (timestamp) => {
      if (start === null) start = timestamp;
      const elapsed = timestamp - start;
      draw(elapsed * ROTATION_SPEED, (elapsed * PULSE_SPEED) % 1);
      if (running && visible) {
        frame = window.requestAnimationFrame(loop);
      }
    };

    const startLoop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(loop);
    };

    // Stop painting when the panel is scrolled away or the tab is hidden.
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
  }, [resolvedTheme, graph]);

  return (
    <div
      className={className}
      role="img"
      aria-label="Rotating three-dimensional view of the drug, target and disease graph, with pulses travelling along the edges to represent graph neural network message passing"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: `${height}px`, display: 'block' }} />
    </div>
  );
}
