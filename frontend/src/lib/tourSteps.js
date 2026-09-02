/**
 * The guided tour, as data.
 *
 * The tour DRIVES the application rather than pointing at a still page. Three
 * of the things worth showing - the live pipeline feed, the discovery graph,
 * the results table - do not exist until a search has run, so at the third
 * step the tour starts one itself and waits for the results to land. Watching
 * the pipeline execute is the demonstration; five tooltips pointing at an
 * empty page would not be.
 *
 * Each step declares what it needs rather than assuming it is there:
 *
 *   target    what to spotlight. Missing and optional -> the step is skipped.
 *   waitFor   how long to wait for that target, in milliseconds. The step that
 *             runs a search allows for a cold backend on the free tier.
 *   before    side effect on entering the step, e.g. running the search.
 *   optional  skip silently if the target never appears, instead of stalling.
 *
 * That structure is what keeps the tour from hanging in front of an audience
 * when the backend is asleep or a panel is missing: the worst case is a
 * shorter tour, never a stuck one.
 */

const DEMO_QUERY = "Alzheimer's Disease";

export const TOUR_STORAGE_KEY = 'drug-repurposing-tour-seen';

export const TOUR_STEPS = [
  {
    id: 'welcome',
    target: null,
    placement: 'center',
    title: 'A one-minute tour',
    body: 'This application screens approved drugs for new uses. I will run a real search and walk you through what comes back. Use the arrow keys, or Escape to leave at any point.',
  },
  {
    id: 'search',
    target: '[data-tour="search"]',
    placement: 'bottom',
    title: 'Start with an indication',
    body: 'Type any disease here, or pick one of the presets below. Signed-in users also get their own recent searches as suggestions.',
  },
  {
    id: 'running',
    target: '[data-tour="summary"]',
    placement: 'bottom',
    // A cold Render instance can take the better part of a minute to wake, and
    // the tour should wait rather than declare the step missing.
    waitFor: 60000,
    before: (context) => {
      if (!context.hasResults) context.runSearch(DEMO_QUERY);
    },
    title: 'The pipeline reports itself',
    body: `Running ${DEMO_QUERY} now. Five agents ran in sequence and each reported as it finished — those were real server-sent events, not an animation. This bar keeps the measured timings; open it to see where the time actually went.`,
  },
  {
    id: 'graph',
    target: '[data-tour="graph"]',
    placement: 'top',
    optional: true,
    title: 'The result as a graph',
    body: 'The disease sits at the centre, its target genes on the inner shell, and every candidate beside the target it acts on. Bigger and closer to the core means a higher score. Hover a node to pause the rotation, click one to see why it was picked.',
  },
  {
    id: 'table',
    target: '[data-tour="table"]',
    placement: 'top',
    optional: true,
    title: 'Every candidate, ranked',
    body: 'The same compounds with their scores: GNN affinity, docking energy, safety, and the overall Pareto rank. Every column sorts, and docking sorts strongest-first even though its numbers are negative.',
  },
  {
    id: 'compare',
    target: '[data-tour="compare"]',
    placement: 'right',
    optional: true,
    title: 'Compare up to three',
    body: 'Tick two or three rows and a comparison opens across all six scoring dimensions — a radar for the shape, bars for the real comparison, and a table of exact values. The charts zoom.',
  },
  {
    id: 'palette',
    target: '[data-tour="palette"]',
    placement: 'bottom',
    optional: true,
    title: 'Ctrl + K from anywhere',
    body: 'The command palette searches indications and jumps between sections without touching the mouse.',
  },
  {
    id: 'account',
    target: '[data-tour="account"]',
    placement: 'bottom',
    optional: true,
    title: 'Your own research record',
    body: 'Sign in and every search is saved to your history, with a dashboard of what you have run and which candidates you marked as supported or rejected.',
  },
  {
    id: 'done',
    target: null,
    placement: 'center',
    title: 'That is the tour',
    body: 'Everything here ran against the live pipeline. You can replay this any time from "Tour" in the header.',
  },
];
