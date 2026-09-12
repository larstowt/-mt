/** Meget lille pub/sub – bruges af SSE-endpointet til at skubbe haendelser ud til browseren. */
const subscribers = new Set();

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function emit(type, payload) {
  const event = { type, payload, ts: Date.now() };
  for (const fn of subscribers) {
    try {
      fn(event);
    } catch (err) {
      console.error('[bus] abonnent fejlede:', err.message);
    }
  }
}

export function subscriberCount() {
  return subscribers.size;
}
