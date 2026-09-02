import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/theme-context.js';

/**
 * Live 3D visualisation of the heterogeneous biomedical graph that the GNN
 * operates on — the structure described in PROJECT_DOCUMENTATION.md section 1.
 *
 *   centre      the disease node
 *   inner shell protein / gene targets
 *   outer shell candidate drug compounds
 *
 * The component has two modes, and the difference between them is the point of
 * this file. Without a `result` it draws an illustrative graph: even shells,
 * arbitrary nodes, a decoration for the landing page. With a `result` it draws
 * THE SEARCH THAT JUST RAN — one node per returned candidate, clustered around
 * the real target gene the pipeline assigned it, sized by its real overall
 * score, and clickable through to the explainability panel for that compound.
 *
 * That distinction matters when the application is being demonstrated. A
 * decorative graph is a screensaver; a graph whose every node is a row in the
 * results table below it is the pipeline's output in a second form, and hovering
 * a node to see "Donepezil · 93% overall" is a claim the table can be checked
 * against.
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
    label: '#334155',
    labelSoft: '#64748b',
    ring: '#0f172a',
  },
  dark: {
    disease: '#fbbf24',
    target: '#4ade9f',
    drug: '#a5b4fc',
    edge: 'rgba(148, 163, 184, 0.34)',
    pulse: '#c7d2fe',
    label: '#e2e8f0',
    labelSoft: '#94a3b8',
    ring: '#f8fafc',
  },
};

const FOCAL = 430;
const TILT = 0.34;
const ROTATION_SPEED = 0.00022; // radians per millisecond
const PULSE_SPEED = 0.00035;

/** Radii for the result graph. Targets sit inside, their compounds outside. */
const TARGET_RADIUS = 62;
const DRUG_RADIUS = 126;

/** Pointer has to land within this many CSS pixels of a node's edge to select it. */
const HIT_SLOP = 7;

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

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalise(v) {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * Two unit vectors perpendicular to `u` and to each other, so a cluster of
 * compounds can be arranged in a disc facing away from the disease core rather
 * than in a line. The seed is switched near the pole because a cross product
 * with a nearly-parallel vector is numerically useless.
 */
function perpendicularBasis(u) {
  const seed = Math.abs(u.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const p1 = normalise(cross(u, seed));
  return [p1, cross(u, p1)];
}

function clamp01(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/** The generic shells — used before a search has been run. */
function buildIllustrativeGraph() {
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

  edges.forEach((edge, i) => { edge.phase = (i * 0.371) % 1; });

  return { nodes, edges, interactive: false };
}

/**
 * The graph of an actual pipeline run.
 *
 * Everything here is read from the response rather than invented: the centre is
 * the matched disease, each inner node is a distinct `target_gene` the pipeline
 * assigned, and each outer node is one candidate, attached to its own target.
 * Node size and distance from the core both track `overall_score`, so the
 * strongest candidates are visibly the largest and sit nearest the disease —
 * which is the same ordering the results table shows, in a form that can be
 * taken in at a glance.
 */
function buildResultGraph(result) {
  const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
  if (candidates.length === 0) return null;

  const nodes = [{
    x: 0,
    y: 0,
    z: 0,
    size: 11,
    type: 'disease',
    label: result?.disease?.name || 'Indication',
  }];
  const edges = [];

  // Group by the gene the pipeline actually assigned. Map preserves insertion
  // order, so the highest-ranked candidate's target is placed first and the
  // clustering follows the ranking rather than an alphabetical accident.
  const groups = new Map();
  candidates.forEach((candidate) => {
    const gene = candidate.target_gene || 'Unassigned';
    if (!groups.has(gene)) groups.set(gene, []);
    groups.get(gene).push(candidate);
  });

  const genes = [...groups.keys()];

  genes.forEach((gene, geneIndex) => {
    const axis = normalise(fibonacciPoint(geneIndex, Math.max(genes.length, 2), 1));
    const targetIndex = nodes.length;

    nodes.push({
      x: axis.x * TARGET_RADIUS,
      y: axis.y * TARGET_RADIUS,
      z: axis.z * TARGET_RADIUS,
      size: 6.8,
      type: 'target',
      label: gene,
    });
    edges.push({ a: 0, b: targetIndex });

    const members = groups.get(gene);
    const [p1, p2] = perpendicularBasis(axis);
    // One compound sits on the target's own axis; several fan out around it.
    const spread = members.length === 1 ? 0 : 18 + members.length * 4;

    members.forEach((candidate, memberIndex) => {
      const score = clamp01(candidate.overall_score);
      const theta = (memberIndex / members.length) * Math.PI * 2 + geneIndex * 0.7;
      const reach = DRUG_RADIUS - score * 24;
      const offsetX = (p1.x * Math.cos(theta) + p2.x * Math.sin(theta)) * spread;
      const offsetY = (p1.y * Math.cos(theta) + p2.y * Math.sin(theta)) * spread;
      const offsetZ = (p1.z * Math.cos(theta) + p2.z * Math.sin(theta)) * spread;

      nodes.push({
        x: axis.x * reach + offsetX,
        y: axis.y * reach + offsetY,
        z: axis.z * reach + offsetZ,
        size: 3.9 + score * 4.4,
        type: 'drug',
        label: candidate.name,
        candidate,
        score,
        validated: candidate.validation_passed === true,
      });
      edges.push({ a: targetIndex, b: nodes.length - 1 });
    });
  });

  edges.forEach((edge, i) => { edge.phase = (i * 0.371) % 1; });

  return { nodes, edges, interactive: true };
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

export default function MolecularScene3D({
  className = '',
  height = 260,
  result = null,
  onSelectCandidate = null,
}) {
  const canvasRef = useRef(null);
  const { resolvedTheme } = useTheme();

  // Rebuilt only when the result identity changes. The layout is deterministic,
  // so a re-render for an unrelated reason must not shuffle the graph.
  const graph = useMemo(
    () => buildResultGraph(result) || buildIllustrativeGraph(),
    [result],
  );

  // Hover lives in a ref for the render loop (which must not re-subscribe on
  // every pointer move) and in state only for the DOM tooltip.
  const hoverRef = useRef(-1);
  const projectedRef = useRef([]);
  const [hovered, setHovered] = useState(null);

  // The click handler is read through a ref so that passing a new inline
  // function from the parent does not tear down and restart the animation.
  const selectRef = useRef(onSelectCandidate);
  useEffect(() => { selectRef.current = onSelectCandidate; }, [onSelectCandidate]);

  const clearHover = useCallback(() => {
    if (hoverRef.current === -1) return;
    hoverRef.current = -1;
    setHovered(null);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const { nodes, edges, interactive } = graph;
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
      // constrained vertically. The result graph carries labels, so it leaves a
      // little more vertical room than the illustrative one to keep text inside
      // the panel.
      scale = interactive
        ? Math.min(width / 310, cssHeight / 310, 1.5)
        : Math.min(width / 380, cssHeight / 268, 1.35);
    };

    const LABEL_HEIGHT = 12;

    const labelFont = (weight) => `${weight} 10px ui-sans-serif, system-ui, -apple-system, sans-serif`;

    /**
     * Place a label if there is room for it.
     *
     * Canvas has no layout engine, so overlapping text is the default outcome
     * whenever two nodes project near each other — and unreadable stacked
     * labels are worse than one label fewer. Candidates are offered in
     * importance order and each is dropped if its box collides with one already
     * placed, after trying the other side of its node.
     */
    const placeLabel = (placed, text, x, y, radius, alpha, colour, weight, options = {}) => {
      context.font = labelFont(weight);
      const halfWidth = context.measureText(text).width / 2 + 2;
      const positions = [y + radius + 5, y - radius - 5 - LABEL_HEIGHT];
      // The disease sits at the crowded centre of the graph, where the two
      // usual slots are often occupied. It is also the one label the reader
      // most needs, so it is allowed to search further out before giving up,
      // and to overlap as a last resort rather than vanish.
      if (options.persistent) {
        [20, 34, 50].forEach((extra) => {
          positions.push(y + radius + extra, y - radius - extra - LABEL_HEIGHT);
        });
      }

      const draw = (top) => {
        context.globalAlpha = alpha;
        context.fillStyle = colour;
        context.textAlign = 'center';
        context.textBaseline = 'top';
        context.fillText(text, x, top);
      };

      for (const top of positions) {
        const box = {
          x1: x - halfWidth, x2: x + halfWidth, y1: top - 1, y2: top + LABEL_HEIGHT,
        };
        const clash = placed.some((q) => !(
          box.x2 < q.x1 || box.x1 > q.x2 || box.y2 < q.y1 || box.y1 > q.y2
        ));
        if (clash) continue;
        placed.push(box);
        draw(top);
        return true;
      }

      if (options.persistent) {
        draw(positions[0]);
        return true;
      }
      return false;
    };

    const draw = (angle, pulseOffset) => {
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const centreX = width / 2;
      const centreY = cssHeight / 2;

      context.clearRect(0, 0, width, cssHeight);

      const projected = nodes.map((node) => project(node, cosA, sinA, centreX, centreY, scale));
      // Hit testing reads exactly what was painted, so what the pointer selects
      // is always what the eye sees, mid-rotation included.
      projectedRef.current = projected;

      const hoverIndex = hoverRef.current;

      // Edges, faded by depth so the far side of the graph recedes.
      context.lineWidth = 1;
      edges.forEach((edge) => {
        const a = projected[edge.a];
        const b = projected[edge.b];
        const nearness = (a.perspective + b.perspective) / 2;
        const touchesHover = hoverIndex !== -1 && (edge.a === hoverIndex || edge.b === hoverIndex);
        context.globalAlpha = touchesHover
          ? 0.95
          : Math.max(0.06, Math.min(1, (nearness - 0.55) * 2.2)) * (hoverIndex === -1 ? 1 : 0.4);
        context.strokeStyle = touchesHover ? colours.pulse : colours.edge;
        context.lineWidth = touchesHover ? 1.6 : 1;
        context.beginPath();
        context.moveTo(a.sx, a.sy);
        context.lineTo(b.sx, b.sy);
        context.stroke();
      });
      context.lineWidth = 1;

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

      const radii = new Array(nodes.length);

      order.forEach(({ index }) => {
        const node = nodes[index];
        const p = projected[index];
        const isHovered = index === hoverIndex;
        const radius = Math.max(1.2, node.size * p.perspective * scale) * (isHovered ? 1.35 : 1);
        radii[index] = radius;

        context.globalAlpha = isHovered
          ? 1
          : Math.max(0.25, Math.min(1, (p.perspective - 0.5) * 2.2)) * (hoverIndex === -1 ? 1 : 0.45);

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

        // A ring on compounds that cleared closed-loop docking validation. It
        // is a second channel on top of size, not a second colour, because the
        // three node colours already carry the node type and a fourth hue would
        // be one distinction too many to hold in mind.
        if (node.validated && !isHovered) {
          context.globalAlpha *= 0.7;
          context.strokeStyle = colours.ring;
          context.lineWidth = 1;
          context.beginPath();
          context.arc(p.sx, p.sy, radius + 2.4, 0, Math.PI * 2);
          context.stroke();
        }

        if (isHovered) {
          context.strokeStyle = colours.ring;
          context.lineWidth = 1.6;
          context.beginPath();
          context.arc(p.sx, p.sy, radius + 4, 0, Math.PI * 2);
          context.stroke();
        }
      });

      // Labels last, so nothing is painted over them. Only the disease and the
      // target genes are named permanently: labelling twenty compounds at once
      // produces a wall of overlapping text, so those appear on hover.
      //
      // Offered in importance order, because the collision test is greedy and
      // whichever label is placed first wins the space: the hovered node (the
      // one being asked about), then the disease, then targets from nearest to
      // furthest.
      if (interactive) {
        // Seeded with the nodes themselves, so a label never lands on top of a
        // sphere. Text over a node is unreadable and, worse, hides the thing it
        // is naming. A label that cannot find a clear spot is simply dropped —
        // the target list beside the graph names every one of them anyway.
        const placed = nodes.map((unusedNode, index) => {
          const p = projected[index];
          const r = (radii[index] ?? 3) + 1;
          return { x1: p.sx - r, x2: p.sx + r, y1: p.sy - r, y2: p.sy + r };
        });
        const order = [];
        if (hoverIndex !== -1) order.push(hoverIndex);
        if (hoverIndex !== 0) order.push(0);
        nodes.forEach((node, index) => {
          if (node.type === 'target' && index !== hoverIndex) order.push(index);
        });
        order.sort((a, bIndex) => {
          if (a === hoverIndex) return -1;
          if (bIndex === hoverIndex) return 1;
          if (a === 0) return -1;
          if (bIndex === 0) return 1;
          return projected[bIndex].perspective - projected[a].perspective;
        });

        order.forEach((index) => {
          const node = nodes[index];
          const p = projected[index];
          if (p.perspective < 0.78 && index !== hoverIndex) return;
          const alpha = index === hoverIndex
            ? 1
            : Math.max(0, Math.min(1, (p.perspective - 0.78) * 5));
          if (alpha <= 0.02) return;
          placeLabel(
            placed,
            node.label,
            p.sx,
            p.sy,
            radii[index] ?? 4,
            alpha,
            node.type === 'disease' ? colours.label : colours.labelSoft,
            node.type === 'disease' ? '700' : '600',
            { persistent: node.type === 'disease' || index === hoverIndex },
          );
        });
      }

      context.globalAlpha = 1;
      context.textAlign = 'start';
      context.textBaseline = 'alphabetic';
    };

    resize();

    // Pointer interaction only exists on the result graph; the illustrative one
    // has nothing behind its nodes to select.
    let detachPointer = () => {};
    if (interactive) {
      const pick = (event) => {
        const rect = canvas.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const projected = projectedRef.current;
        let best = -1;
        let bestDistance = Infinity;
        projected.forEach((p, index) => {
          const node = nodes[index];
          const radius = Math.max(1.2, node.size * p.perspective * scale);
          const dx = px - p.sx;
          const dy = py - p.sy;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > radius + HIT_SLOP) return;
          // Nearer nodes win ties, so clicking an overlap selects the one on top.
          const weighted = distance - p.perspective * 4;
          if (weighted < bestDistance) {
            bestDistance = weighted;
            best = index;
          }
        });
        return best;
      };

      const onPointerMove = (event) => {
        const index = pick(event);
        if (index === hoverRef.current) return;
        hoverRef.current = index;
        if (index === -1) {
          setHovered(null);
          canvas.style.cursor = 'default';
          return;
        }
        const node = nodes[index];
        const p = projectedRef.current[index];
        canvas.style.cursor = node.candidate ? 'pointer' : 'default';
        setHovered({
          index,
          x: p.sx,
          y: p.sy,
          type: node.type,
          label: node.label,
          score: node.score,
          validated: node.validated,
          selectable: Boolean(node.candidate),
        });
      };

      const onPointerLeave = () => {
        hoverRef.current = -1;
        canvas.style.cursor = 'default';
        setHovered(null);
      };

      const onClick = (event) => {
        const index = pick(event);
        const node = index === -1 ? null : nodes[index];
        if (node?.candidate && selectRef.current) selectRef.current(node.candidate);
      };

      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerleave', onPointerLeave);
      canvas.addEventListener('click', onClick);
      detachPointer = () => {
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('click', onClick);
      };
    }

    if (prefersReducedMotion) {
      // One representative frame, no animation loop. Hover still repaints, so
      // the graph remains inspectable without ever animating.
      const paint = () => draw(0.7, 0.35);
      paint();
      const staticResize = () => { resize(); paint(); };
      window.addEventListener('resize', staticResize);
      let hoverFrame = 0;
      const repaintOnHover = () => {
        window.cancelAnimationFrame(hoverFrame);
        hoverFrame = window.requestAnimationFrame(paint);
      };
      canvas.addEventListener('pointermove', repaintOnHover);
      canvas.addEventListener('pointerleave', repaintOnHover);
      return () => {
        window.removeEventListener('resize', staticResize);
        canvas.removeEventListener('pointermove', repaintOnHover);
        canvas.removeEventListener('pointerleave', repaintOnHover);
        window.cancelAnimationFrame(hoverFrame);
        detachPointer();
      };
    }

    let frame = 0;
    let running = true;
    let visible = true;
    let previous = null;
    // Accumulated rather than derived from a start timestamp, because rotation
    // pauses while a node is hovered — reading the clock would make the graph
    // jump forward the moment the pointer left.
    let angle = 0;
    let pulse = 0;

    const loop = (timestamp) => {
      if (previous === null) previous = timestamp;
      // A tab restored after minutes away reports one enormous delta; clamping
      // keeps that from spinning the graph through several revolutions.
      const delta = Math.min(timestamp - previous, 50);
      previous = timestamp;

      // Holding still while the pointer is on a node is what makes the graph
      // usable: a moving target cannot be clicked.
      if (hoverRef.current === -1) angle += delta * ROTATION_SPEED;
      pulse = (pulse + delta * PULSE_SPEED) % 1;

      draw(angle, pulse);
      if (running && visible) {
        frame = window.requestAnimationFrame(loop);
      }
    };

    const startLoop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      previous = null;
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
      detachPointer();
    };
  }, [resolvedTheme, graph]);

  // Leaving the graph mounted across searches would keep a stale hover box on
  // screen pointing at a compound that is no longer in the result.
  useEffect(() => { clearHover(); }, [graph, clearHover]);

  const interactive = graph.interactive;
  const candidates = interactive
    ? graph.nodes.filter((node) => node.candidate)
    : [];

  return (
    <div
      className={`relative ${className}`}
      role="img"
      aria-label={
        interactive
          ? 'Rotating three-dimensional graph of this search: the disease at the centre, its target genes on the inner shell, and each candidate compound placed beside the target it acts on and sized by its overall score'
          : 'Rotating three-dimensional view of the drug, target and disease graph, with pulses travelling along the edges to represent graph neural network message passing'
      }
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: `${height}px`, display: 'block' }} />

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-slate-200 bg-surface px-2.5 py-1.5 shadow-lg"
          style={{
            left: `${hovered.x}px`,
            // Above the node, so the pointer never covers the label it summoned.
            top: `${Math.max(hovered.y - 58, 4)}px`,
          }}
        >
          <p className="text-[11px] font-semibold text-slate-900 whitespace-nowrap">
            {hovered.label}
          </p>
          <p className="text-[10px] text-slate-500 whitespace-nowrap">
            {hovered.type === 'drug' && typeof hovered.score === 'number'
              ? `${Math.round(hovered.score * 100)}% overall${hovered.validated ? ' · validated' : ''}`
              : hovered.type === 'target' ? 'Protein target' : 'Indication'}
            {hovered.selectable && ' · click to explain'}
          </p>
        </div>
      )}

      {/* The same actions the canvas offers, reachable by keyboard and readable
          by a screen reader. A canvas is a bitmap: without this the compounds
          in the graph would exist for sighted mouse users only. */}
      {interactive && candidates.length > 0 && (
        <ul className="sr-only">
          {candidates.map((node) => (
            <li key={node.candidate.id ?? node.label}>
              <button
                type="button"
                onClick={() => selectRef.current?.(node.candidate)}
              >
                {`${node.label}, targets ${node.candidate.target_gene}, `
                  + `${Math.round(clamp01(node.candidate.overall_score) * 100)} percent overall score. `
                  + 'Open explainability panel.'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
