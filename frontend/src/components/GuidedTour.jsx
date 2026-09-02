import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ArrowLeft, ArrowRight, Compass } from 'lucide-react';
import { TOUR_STEPS } from '../lib/tourSteps.js';

/**
 * The guided tour: a spotlight, a card, and a script that drives the app.
 *
 * The overlay captures clicks. That is deliberate rather than lazy - a tour
 * that leaves the page live invites someone to click a control mid-step and
 * arrive somewhere the next step does not describe. Everything the reader
 * needs is on the card: back, next, skip, and the keyboard.
 *
 * WAITING IS THE HARD PART. Half these targets do not exist when the tour
 * starts; they appear once a search has run, and on a sleeping free-tier
 * backend that can take most of a minute. So each step polls for its target up
 * to its own deadline, scrolls it into view, and measures it. A step whose
 * target never arrives is skipped if it said it was optional, so a missing
 * panel shortens the tour instead of stalling it in front of an audience.
 *
 * The spotlight is an SVG mask rather than four positioned divs: one rounded
 * rectangle punched out of a dimmed sheet, which stays exact at any corner
 * radius and needs no arithmetic to keep four edges aligned.
 */

/** How often to look for a step's target while waiting for it. */
const POLL_MS = 120;
/** Default deadline for a target that should already be on the page. */
const DEFAULT_WAIT_MS = 2500;
/** Breathing room between the spotlight and the element it frames. */
const PADDING = 6;
const CARD_WIDTH = 340;
const CARD_GAP = 14;

function measure(element) {
  const box = element.getBoundingClientRect();
  return {
    top: box.top - PADDING,
    left: box.left - PADDING,
    width: box.width + PADDING * 2,
    height: box.height + PADDING * 2,
  };
}

/**
 * Where the card goes. The requested side is honoured when it fits, and
 * otherwise flipped - a card that hangs off the bottom of the window is worse
 * than one on the wrong side of its target.
 */
function placeCard(rect, placement, viewport) {
  if (!rect || placement === 'center') {
    return {
      top: Math.max(viewport.height / 2 - 120, 16),
      left: Math.max(viewport.width / 2 - CARD_WIDTH / 2, 16),
    };
  }

  const below = rect.top + rect.height + CARD_GAP;
  const above = rect.top - CARD_GAP;
  const wantsVertical = placement === 'bottom' || placement === 'top';

  if (wantsVertical) {
    const fitsBelow = below + 190 < viewport.height;
    const top = (placement === 'bottom' && fitsBelow) || above < 190
      ? below
      : Math.max(above - 190, 16);
    return {
      top: Math.min(Math.max(top, 16), viewport.height - 200),
      left: Math.min(
        Math.max(rect.left + rect.width / 2 - CARD_WIDTH / 2, 16),
        viewport.width - CARD_WIDTH - 16,
      ),
    };
  }

  const rightEdge = rect.left + rect.width + CARD_GAP;
  const fitsRight = rightEdge + CARD_WIDTH < viewport.width;
  return {
    top: Math.min(Math.max(rect.top, 16), viewport.height - 210),
    left: fitsRight
      ? rightEdge
      : Math.max(rect.left - CARD_GAP - CARD_WIDTH, 16),
  };
}

export default function GuidedTour({ open, onClose, onRunSearch, hasResults }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const cardRef = useRef(null);
  const nextRef = useRef(null);
  // What a step's `before` hook receives. Held in a ref so that a parent
  // re-render does not restart the step's waiting loop, and named to match
  // the step definitions - passing `onRunSearch` here while the steps called
  // `runSearch` meant the tour walked to the results step and waited for a
  // search it had never started.
  const contextRef = useRef({ runSearch: onRunSearch, hasResults });
  // Declared before the step effect below, so it is already current by the
  // time a step's `before` hook reads it.
  useEffect(() => {
    contextRef.current = { runSearch: onRunSearch, hasResults };
  }, [onRunSearch, hasResults]);

  const step = TOUR_STEPS[index];
  const isLast = index === TOUR_STEPS.length - 1;

  const finish = useCallback(() => {
    setIndex(0);
    setRect(null);
    onClose();
  }, [onClose]);

  const goNext = useCallback(() => {
    if (isLast) finish();
    else setIndex((current) => Math.min(current + 1, TOUR_STEPS.length - 1));
  }, [isLast, finish]);

  const goBack = useCallback(() => setIndex((current) => Math.max(current - 1, 0)), []);

  // Find, scroll to, and measure the current step's target.
  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    let timer = 0;
    const deadline = Date.now() + (step.waitFor ?? DEFAULT_WAIT_MS);

    if (step.before) {
      // A throwing hook must not take the tour down with it - the worst case
      // should be a step that says its piece without having set anything up.
      try {
        step.before(contextRef.current);
      } catch (error) {
        console.warn('Tour step setup failed:', step.id, error);
      }
    }

    if (!step.target) {
      // Synchronising with the DOM is what an effect is for; there is no
      // render-time way to know whether an element that appears after a
      // network round trip is on the page yet.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWaiting(false);
      return undefined;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWaiting(true);

    const look = () => {
      if (cancelled) return;
      const element = document.querySelector(step.target);
      if (element) {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        // One frame after the scroll, so the measurement is of where the
        // element ended up rather than where it started.
        window.setTimeout(() => {
          if (cancelled) return;
          setRect(measure(element));
          setWaiting(false);
        }, 320);
        return;
      }
      if (Date.now() > deadline) {
        setWaiting(false);
        // A step that said it was optional gets out of the way; one that did
        // not is shown centred, so the tour still says its piece.
        if (step.optional) setIndex((current) => Math.min(current + 1, TOUR_STEPS.length - 1));
        else setRect(null);
        return;
      }
      timer = window.setTimeout(look, POLL_MS);
    };

    look();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, index, step]);

  // Keep the spotlight on the target if the page moves underneath it.
  useEffect(() => {
    if (!open || !step.target) return undefined;
    const remeasure = () => {
      const element = document.querySelector(step.target);
      setRect(element ? measure(element) : null);
    };
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, { passive: true });
    return () => {
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure);
    };
  }, [open, step]);

  // Keyboard, and focus kept inside the card.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(); }
      else if (event.key === 'ArrowRight' || event.key === 'Enter') { event.preventDefault(); goNext(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); goBack(); }
      else if (event.key === 'Tab') {
        const focusables = cardRef.current?.querySelectorAll('button');
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, finish, goNext, goBack]);

  useEffect(() => { if (open) nextRef.current?.focus(); }, [open, index]);

  if (!open) return null;

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const card = placeCard(rect, step.placement, viewport);

  return (
    <div className="fixed inset-0 z-[60]" data-testid="guided-tour">
      {/* The dim sheet with the target punched out of it. Clicks land here and
          go no further, which is what keeps the app on the step being read. */}
      <svg
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
        onClick={(event) => event.stopPropagation()}
      >
        <defs>
          <mask id="tour-spotlight">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left}
                y={rect.top}
                width={rect.width}
                height={rect.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgb(15 23 42 / 0.62)"
          mask="url(#tour-spotlight)"
        />
        {rect && (
          <rect
            x={rect.left}
            y={rect.top}
            width={rect.width}
            height={rect.height}
            rx="12"
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="2"
          />
        )}
      </svg>

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Tour step ${index + 1} of ${TOUR_STEPS.length}: ${step.title}`}
        className="absolute clean-card bg-surface rounded-xl shadow-xl p-4 anim-rise"
        style={{ top: `${card.top}px`, left: `${card.left}px`, width: `${CARD_WIDTH}px` }}
      >
        <div className="flex items-start gap-2.5 mb-2">
          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Step {index + 1} of {TOUR_STEPS.length}
            </p>
            <h3 className="text-sm font-bold text-slate-900 leading-snug">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={finish}
            aria-label="Leave the tour"
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">{step.body}</p>

        {waiting && (
          <p className="mt-2 text-[11px] text-slate-500 flex items-center gap-1.5" aria-live="polite">
            <span className="w-3 h-3 border-2 border-slate-300 border-t-brand rounded-full animate-spin" />
            Waiting for the pipeline…
          </p>
        )}

        {/* Progress as dots rather than a bar: nine steps is countable, and a
            bar at 11% reads as "barely started" when it is one click in. */}
        <div className="flex items-center gap-1 mt-3.5 mb-3" aria-hidden="true">
          {TOUR_STEPS.map((entry, position) => (
            <span
              key={entry.id}
              className={`h-1 rounded-full transition-all ${
                position === index ? 'w-4 bg-brand' : 'w-1.5 bg-slate-200'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={finish}
            className="text-[11px] text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            Skip tour
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={goBack}
              disabled={index === 0}
              aria-label="Previous step"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              ref={nextRef}
              type="button"
              onClick={goNext}
              className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-semibold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isLast ? 'Done' : 'Next'}
              {!isLast && <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
