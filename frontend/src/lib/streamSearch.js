import api, { readStoredToken, REQUEST_TIMEOUT_MS } from '../api.js';

/**
 * Run a search over the streaming endpoint, reporting each stage as it happens.
 *
 * Why fetch rather than EventSource: EventSource is the obvious API for
 * server-sent events and cannot be used here, because it only issues GET
 * requests and cannot carry an Authorization header. Without that header the
 * run would be recorded as anonymous, so a signed-in user's own search would
 * never appear in their history. Reading the body stream from fetch keeps the
 * POST, the header, and the SSE framing.
 *
 * FALLBACK IS THE POINT. Streaming is an enhancement: proxies buffer, corporate
 * networks interfere, and older browsers lack ReadableStream on responses. Any
 * of that causes a single retry against the ordinary endpoint, so the worst
 * outcome is the behaviour that existed before this file. A feature that can
 * break the core flow when the network misbehaves is not worth having.
 */

/** Milliseconds to wait for the FIRST event before giving up and falling back. */
const FIRST_EVENT_TIMEOUT_MS = 12000;

function streamingSupported() {
  return typeof window !== 'undefined'
    && typeof window.fetch === 'function'
    && typeof window.ReadableStream === 'function'
    && typeof TextDecoder === 'function';
}

/**
 * @param {string} diseaseQuery
 * @param {(stage: object) => void} onStage  called for every stage event
 * @param {{ signal?: AbortSignal }} options
 * @returns {Promise<{ result: object, streamed: boolean }>}
 */
export async function runSearchStreaming(diseaseQuery, onStage, options = {}) {
  if (streamingSupported()) {
    try {
      const result = await readStream(diseaseQuery, onStage, options.signal);
      if (result) return { result, streamed: true };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // Anything else: fall through to the ordinary request.
      console.warn('Streaming search unavailable, falling back:', error?.message);
    }
  }

  const response = await api.post('/api/search', { disease_query: diseaseQuery });
  return { result: response.data, streamed: false };
}

async function readStream(diseaseQuery, onStage, externalSignal) {
  const controller = new AbortController();
  const abortFromOutside = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromOutside);

  // Two separate deadlines. The first is short and guards the case that
  // actually happens - a proxy buffering the response, where nothing arrives
  // at all - so the fallback runs quickly rather than after the full timeout.
  let firstEventSeen = false;
  const firstEventTimer = window.setTimeout(() => {
    if (!firstEventSeen) controller.abort();
  }, FIRST_EVENT_TIMEOUT_MS);
  const overallTimer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const base = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const token = readStoredToken();

    const response = await fetch(`${base}/api/search/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ disease_query: diseaseQuery }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Streaming endpoint returned ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;

    // Frames are separated by a blank line, and a frame can be split across
    // any number of network chunks - so the buffer is drained by delimiter
    // rather than assuming one chunk is one message.
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');

        // Comment frames are the server's keep-alive; they carry no data.
        if (!frame.startsWith('data:')) continue;

        firstEventSeen = true;
        let payload;
        try {
          payload = JSON.parse(frame.slice(frame.indexOf(':') + 1).trim());
        } catch {
          continue; // a malformed frame must not kill a working stream
        }

        if (payload.type === 'stage') onStage(payload);
        else if (payload.type === 'result') finalResult = payload.result;
        else if (payload.type === 'error') throw new Error(payload.message);
      }
    }

    return finalResult;
  } finally {
    window.clearTimeout(firstEventTimer);
    window.clearTimeout(overallTimer);
    externalSignal?.removeEventListener('abort', abortFromOutside);
  }
}
