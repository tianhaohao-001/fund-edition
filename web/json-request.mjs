export class RequestConnectionError extends Error {
  constructor({ timedOut, resultUnknown }) {
    super(timedOut ? 'Request timed out' : 'Connection interrupted');
    this.name = 'RequestConnectionError';
    this.timedOut = timedOut;
    this.resultUnknown = resultUnknown;
  }
}

// End stalled network reads without automatically repeating a state-changing request.
export async function requestJson(url, options = {}, {
  fetchImpl = fetch,
  timeoutMs = url === '/api/action' ? 240_000 : 25_000,
} = {}) {
  const controller = new AbortController();
  const stateChanging = !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase());
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener('abort', forwardAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await fetchImpl(url, { cache: 'no-store', ...options, signal: controller.signal });
    let data;
    try { data = await response.json(); }
    catch (error) {
      if (controller.signal.aborted || error?.name !== 'SyntaxError') throw error;
      data = null;
    }
    if (response.ok && stateChanging && !data) {
      throw new RequestConnectionError({ timedOut: false, resultUnknown: true });
    }
    return { response, data };
  } catch {
    throw new RequestConnectionError({ timedOut, resultUnknown: stateChanging });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', forwardAbort);
  }
}
