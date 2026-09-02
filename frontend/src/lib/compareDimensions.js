/**
 * The six axes a candidate is compared on, and how each becomes a 0-1 number.
 *
 * Kept apart from the components because three of them read it - the radar, the
 * bars and the value table - and the one thing that must never drift between
 * those three is what "GNN affinity" means or how a docking energy becomes a
 * proportion.
 *
 * The order is fixed and deliberate: the four evidence dimensions the ranker
 * scores first, then the two physical ones the docking loop contributes. On a
 * radar the axis order changes the shape of the polygon completely, so it has
 * to be a decision rather than whatever order the object happened to be in.
 */

/**
 * Docking energy is the only dimension that is not already a proportion, and
 * the only one where lower is better. It is mapped against a FIXED window
 * rather than against the best and worst of whatever happens to be selected:
 * a scale that rescales itself to the current selection would make every
 * comparison show one compound at 100% and one at 0%, whatever the real gap.
 *
 * -4 kcal/mol is around the floor of a meaningful pose; -13 is exceptional.
 * Values outside are clamped, and the raw number is always in the table.
 */
const DOCKING_WEAK = -4;
const DOCKING_STRONG = -13;

function clamp01(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function percent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

export const DIMENSIONS = [
  {
    key: 'gnn',
    label: 'GNN affinity',
    detail: 'Graph neural network drug-target interaction score',
    normalised: (c) => clamp01(c.gnn_dti_score),
    display: (c) => percent(c.gnn_dti_score),
  },
  {
    key: 'gene',
    label: 'Gene association',
    detail: 'DisGeNET disease-gene association strength',
    normalised: (c) => clamp01(c.disgenet_gene_score),
    display: (c) => percent(c.disgenet_gene_score),
  },
  {
    key: 'reversal',
    label: 'Expression reversal',
    detail: 'LINCS L1000 signature reversal',
    normalised: (c) => clamp01(c.lincs_reversal_score),
    display: (c) => percent(c.lincs_reversal_score),
  },
  {
    key: 'literature',
    label: 'Literature support',
    detail: 'SciBERT evidence mined from PubMed abstracts',
    normalised: (c) => clamp01(c.nlp_evidence_score),
    display: (c) => percent(c.nlp_evidence_score),
  },
  {
    key: 'docking',
    label: 'Docking strength',
    detail: `AutoDock Vina ΔG, scaled ${DOCKING_WEAK} to ${DOCKING_STRONG} kcal/mol`,
    normalised: (c) => clamp01(
      (c.docking_delta_g - DOCKING_WEAK) / (DOCKING_STRONG - DOCKING_WEAK),
    ),
    // The raw energy, not the scaled proportion. Someone reading the table is
    // entitled to the number the docking actually produced.
    display: (c) => `${c.docking_delta_g} kcal/mol`,
  },
  {
    key: 'safety',
    label: 'Safety',
    detail: 'Likelihood of an acceptable safety profile',
    normalised: (c) => clamp01(c.safety_score),
    display: (c) => percent(c.safety_score),
  },
];

/**
 * Non-scored facts, shown beneath the dimensions in the value table. These are
 * identity rather than magnitude, so they belong in the table and nowhere near
 * the chart.
 */
export const PROPERTIES = [
  { label: 'Target gene', value: (c) => c.target_gene || '—' },
  { label: 'Protein', value: (c) => c.target_protein_name || '—' },
  { label: 'Formula', value: (c) => c.formula || '—' },
  { label: 'Molecular weight', value: (c) => (c.mw ? `${c.mw} g/mol` : '—') },
  { label: 'Estimated Ki', value: (c) => (c.estimated_ki_nm ? `${c.estimated_ki_nm} nM` : '—') },
  { label: 'Overall score', value: (c) => percent(c.overall_score) },
  { label: 'Validation', value: (c) => (c.validation_passed ? 'Passed' : 'Docked, not passed') },
];

/** How many compounds may be compared at once. */
export const MAX_COMPARE = 3;

/**
 * Index of the strongest compound on a dimension, or -1 if they tie.
 *
 * Used to label one bar per row rather than all of them - a number beside
 * every bar is eighteen numbers, which nobody reads, and the table below
 * carries every value anyway.
 */
export function leaderIndex(dimension, candidates) {
  let best = -1;
  let bestValue = -Infinity;
  let tied = false;
  candidates.forEach((candidate, index) => {
    const value = dimension.normalised(candidate);
    if (value > bestValue + 1e-9) {
      bestValue = value;
      best = index;
      tied = false;
    } else if (Math.abs(value - bestValue) <= 1e-9) {
      tied = true;
    }
  });
  return tied ? -1 : best;
}
