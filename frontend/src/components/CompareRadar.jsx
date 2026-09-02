import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus, Maximize } from 'lucide-react';
import { DIMENSIONS } from '../lib/compareDimensions.js';

/**
 * The six scoring dimensions as a radar, one polygon per compound.
 *
 * A NOTE ON WHY THIS IS NOT THE WHOLE PANEL. A radar is good at one thing -
 * showing the overall shape of a profile at a glance, whether a compound is
 * strong across the board or spiky - and bad at the thing a comparison
 * usually needs. Its area grows with the square of the values, so a compound
 * scoring 20% higher looks about 44% larger; and the shape depends entirely on
 * which order the axes are drawn in, so the same six numbers can be made to
 * look balanced or lopsided by reordering them.
 *
 * So this is deliberately the summary and not the evidence. Every number it
 * draws also appears as a bar on a common scale and as a figure in the table
 * below, and nothing here is the only way to read a value. The axis order is
 * fixed in compareDimensions.js so at least the distortion is constant.
 *
 * The fill is kept faint and the outline strong for the same reason: an
 * outline is a shape, a filled area invites you to compare sizes, which is
 * exactly the comparison that would mislead.
 *
 * ZOOM. Where two polygons run close together the difference between them is a
 * few pixels at rest, so the plot can be magnified up to four times and
 * dragged around: wheel over the plot, drag to pan, or the buttons - which
 * exist because a scroll-to-zoom nobody knows about is not a feature. Zoom is
 * presentation only; it changes no value, and the reset returns to a known
 * state rather than to wherever the last drag happened to end.
 */

/**
 * The viewBox is wider than it is tall on purpose. The plot is circular, but
 * the labels for the left and right axes extend sideways, and at a square
 * viewBox they were clipped mid-word - "Gene associatio". The extra width is
 * label margin, not plot.
 */
const WIDTH = 320;
const HEIGHT = 250;
const CENTRE_X = WIDTH / 2;
const CENTRE_Y = 118;
const MAX_RADIUS = 78;
const RINGS = [0.25, 0.5, 0.75, 1];

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.35;

/** Straight up for the first axis, then clockwise. */
function point(index, total, radius) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return [CENTRE_X + Math.cos(angle) * radius, CENTRE_Y + Math.sin(angle) * radius];
}

function ringPath(fraction) {
  return DIMENSIONS
    .map((unused, index) => point(index, DIMENSIONS.length, MAX_RADIUS * fraction).join(','))
    .join(' ');
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

/**
 * Keeps the plot from being dragged off screen: at 1x there is nowhere to go,
 * and at 4x the furthest useful pan is three-quarters of the way to an edge.
 */
function clampPan(pan, zoom) {
  const limitX = ((zoom - 1) * WIDTH) / 2;
  const limitY = ((zoom - 1) * HEIGHT) / 2;
  return { x: clamp(pan.x, -limitX, limitX), y: clamp(pan.y, -limitY, limitY) };
}

export default function CompareRadar({ candidates, colours, maxWidth = 320 }) {
  const svgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  /** Zoom about a fixed point, so what is under the pointer stays under it. */
  const zoomAbout = useCallback((nextZoom, anchor) => {
    setZoom((currentZoom) => {
      const target = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      setPan((currentPan) => {
        if (!anchor) return clampPan(currentPan, target);
        // Solve for the pan that leaves the anchor's world position fixed.
        const worldX = (anchor.x - CENTRE_X - currentPan.x) / currentZoom;
        const worldY = (anchor.y - CENTRE_Y - currentPan.y) / currentZoom;
        return clampPan({
          x: anchor.x - CENTRE_X - target * worldX,
          y: anchor.y - CENTRE_Y - target * worldY,
        }, target);
      });
      return target;
    });
  }, []);

  // Registered by hand rather than through onWheel, because React attaches
  // wheel listeners passively and a passive listener cannot preventDefault -
  // so the modal behind would scroll away while the chart zoomed.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    const onWheel = (event) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const anchor = {
        x: ((event.clientX - rect.left) / rect.width) * WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
      };
      zoomAbout(zoom * (event.deltaY < 0 ? 1.18 : 1 / 1.18), anchor);
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoom, zoomAbout]);

  const onPointerDown = (event) => {
    if (zoom <= MIN_ZOOM) return;
    const rect = svgRef.current.getBoundingClientRect();
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      pan,
      // The plot is drawn in viewBox units but dragged in screen pixels.
      scaleX: WIDTH / rect.width,
      scaleY: HEIGHT / rect.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPan(clampPan({
      x: drag.pan.x + (event.clientX - drag.x) * drag.scaleX,
      y: drag.pan.y + (event.clientY - drag.y) * drag.scaleY,
    }, zoom));
  };

  const endDrag = () => { dragRef.current = null; };

  if (!candidates || candidates.length === 0) return null;

  const summary = candidates
    .map((candidate) => `${candidate.name}: ${DIMENSIONS
      .map((d) => `${d.label} ${d.display(candidate)}`)
      .join(', ')}`)
    .join('. ');

  const zoomed = zoom > MIN_ZOOM + 0.001;
  // Zoom about the plot centre, then pan. Written as three transforms rather
  // than one matrix so the intent stays readable.
  const transform = `translate(${CENTRE_X + pan.x} ${CENTRE_Y + pan.y}) scale(${zoom}) translate(${-CENTRE_X} ${-CENTRE_Y})`;

  return (
    <div className="relative" style={{ maxWidth: `${maxWidth}px`, margin: '0 auto' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        /* Grab/grabbing comes from CSS rather than from reading the drag ref
           during render - a ref read at render time is not a render input and
           would not repaint reliably anyway. */
        className={`w-full block touch-none select-none ${
          zoomed ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        role="img"
        aria-label={`Radar comparison across six scoring dimensions. ${summary}. The same values are listed in the table below.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <g transform={transform}>
          {/* Grid: solid hairlines one shade off the surface, never dashed. */}
          {RINGS.map((fraction) => (
            <polygon
              key={fraction}
              points={ringPath(fraction)}
              fill="none"
              stroke="var(--viz-grid)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {DIMENSIONS.map((dimension, index) => {
            const [x, y] = point(index, DIMENSIONS.length, MAX_RADIUS);
            return (
              <line
                key={dimension.key}
                x1={CENTRE_X}
                y1={CENTRE_Y}
                x2={x}
                y2={y}
                stroke="var(--viz-grid)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Polygons, faint fill and strong outline - see the note above.
              Strokes and vertex rings keep their on-screen width at every zoom
              level, so magnifying reveals the gap between two close outlines
              instead of thickening both until they merge. */}
          {candidates.map((candidate, seriesIndex) => {
            const points = DIMENSIONS
              .map((dimension, index) => point(
                index, DIMENSIONS.length, MAX_RADIUS * dimension.normalised(candidate),
              ).join(','))
              .join(' ');

            return (
              <g key={candidate.id ?? seriesIndex}>
                <polygon
                  points={points}
                  fill={colours[seriesIndex]}
                  fillOpacity="0.12"
                  stroke={colours[seriesIndex]}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {DIMENSIONS.map((dimension, index) => {
                  const [x, y] = point(
                    index, DIMENSIONS.length, MAX_RADIUS * dimension.normalised(candidate),
                  );
                  return (
                    <circle
                      key={dimension.key}
                      cx={x}
                      cy={y}
                      r={3 / zoom}
                      fill={colours[seriesIndex]}
                      /* A ring in the surface colour, so two vertices landing
                         on the same spot stay countable instead of merging. */
                      stroke="var(--color-surface)"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Axis labels, outside the plot. Two lines where the name is long, so
              they never overlap the neighbouring spoke. */}
          {DIMENSIONS.map((dimension, index) => {
            const [x, y] = point(index, DIMENSIONS.length, MAX_RADIUS + 17);
            const words = dimension.label.split(' ');
            const anchor = Math.abs(x - CENTRE_X) < 6 ? 'middle' : (x > CENTRE_X ? 'start' : 'end');
            return (
              <text
                key={dimension.key}
                x={x}
                y={y}
                textAnchor={anchor}
                className="fill-slate-500"
                style={{ fontSize: `${9 / zoom}px` }}
              >
                {words.map((word, line) => (
                  <tspan
                    key={word}
                    x={x}
                    dy={line === 0 ? (words.length > 1 ? -4 / zoom : 3 / zoom) : 10 / zoom}
                  >
                    {word}
                  </tspan>
                ))}
              </text>
            );
          })}
        </g>
      </svg>

      {/* Controls. Buttons as well as the wheel, because a gesture nobody is
          told about may as well not exist - and because a trackpad, a phone
          and a keyboard all need a way in. */}
      <div className="absolute top-0 right-0 flex items-center gap-1">
        <button
          type="button"
          onClick={() => zoomAbout(zoom - ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Zoom out of the radar chart"
          title="Zoom out"
          className="p-1 rounded-md border border-slate-200 bg-surface text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => zoomAbout(zoom + ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Zoom into the radar chart"
          title="Zoom in"
          className="p-1 rounded-md border border-slate-200 bg-surface text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <Plus className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={!zoomed && pan.x === 0 && pan.y === 0}
          aria-label="Reset the radar chart view"
          title="Reset view"
          className="p-1 rounded-md border border-slate-200 bg-surface text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <Maximize className="w-3 h-3" />
        </button>
      </div>

      {zoomed && (
        <span
          className="absolute top-0 left-0 px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-mono text-slate-600 tabular-nums"
          aria-live="polite"
        >
          {zoom.toFixed(1)}×
        </span>
      )}
    </div>
  );
}
