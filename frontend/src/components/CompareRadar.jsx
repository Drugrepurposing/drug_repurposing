import React from 'react';
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

export default function CompareRadar({ candidates, colours }) {
  if (!candidates || candidates.length === 0) return null;

  const summary = candidates
    .map((candidate) => `${candidate.name}: ${DIMENSIONS
      .map((d) => `${d.label} ${d.display(candidate)}`)
      .join(', ')}`)
    .join('. ');

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full max-w-[320px] mx-auto block"
      role="img"
      aria-label={`Radar comparison across six scoring dimensions. ${summary}. The same values are listed in the table below.`}
    >
      {/* Grid: solid hairlines one shade off the surface, never dashed. */}
      {RINGS.map((fraction) => (
        <polygon
          key={fraction}
          points={ringPath(fraction)}
          fill="none"
          stroke="var(--viz-grid)"
          strokeWidth="1"
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
          />
        );
      })}

      {/* Polygons, faint fill and strong outline - see the note above. */}
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
                  r="3"
                  fill={colours[seriesIndex]}
                  /* A 2px ring in the surface colour, so two vertices landing
                     on the same spot stay countable instead of merging. */
                  stroke="var(--color-surface)"
                  strokeWidth="2"
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
            style={{ fontSize: '9px' }}
          >
            {words.map((word, line) => (
              <tspan key={word} x={x} dy={line === 0 ? (words.length > 1 ? -4 : 3) : 10}>
                {word}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}
