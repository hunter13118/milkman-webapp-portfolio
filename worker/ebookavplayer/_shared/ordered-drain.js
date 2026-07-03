/**
 * Runs `produce(item, index)` for up to `concurrency` items at once, but only
 * invokes `consume(item, result, index)` once every earlier item (by array
 * position) has already been consumed — so downstream logic can rely on
 * strict positional ordering even though production runs concurrently and
 * may finish out of order.
 *
 * `concurrency` bounds items "in flight" (producing, or produced but not yet
 * drained) rather than just active producers, so concurrency=1 reproduces
 * fully lockstep produce→consume→produce→consume behavior (no look-ahead),
 * while concurrency=N gives the consumer an N-item look-ahead buffer.
 *
 * Used by the parallel chapter-extraction path: chapters extract
 * concurrently, but voice assignment / checkpointing / character
 * reconciliation still see them one at a time, in chapter order.
 */
export async function runOrderedDrain(items, { concurrency = 1, produce, consume }) {
  const n = items.length;
  if (n === 0) return;

  const results = new Array(n);
  const resolvers = new Array(n);
  const rejecters = new Array(n);
  const readySignals = items.map((_, i) => {
    const p = new Promise((resolve, reject) => {
      resolvers[i] = resolve;
      rejecters[i] = reject;
    });
    p.catch(() => {}); // avoid unhandled-rejection noise; the drain loop below still observes it
    return p;
  });

  let nextToStart = 0;
  let active = 0;

  function tryStart() {
    while (active < concurrency && nextToStart < n) {
      const idx = nextToStart;
      nextToStart += 1;
      active += 1;
      (async () => {
        try {
          const result = await produce(items[idx], idx);
          results[idx] = result;
          resolvers[idx]();
        } catch (e) {
          rejecters[idx](e);
        }
      })();
    }
  }

  tryStart();

  for (let idx = 0; idx < n; idx++) {
    await readySignals[idx];
    await consume(items[idx], results[idx], idx);
    active -= 1;
    tryStart();
  }
}
