/**
 * Writes to one key, sent one after another in the order they were made
 * (Phase 170 PR A, Codex on PR #93).
 *
 * The stock stepper sends its taps in batches; on a slow signal several
 * batches can be on their way at once, and an outright write (Out, Set
 * amount) made after them could reach the server first, letting an older
 * increment land on top of it. Queuing every write to an item behind the
 * previous one makes the server see this phone's writes in the order the
 * person made them, however many are in flight, so the last one wins.
 *
 * Each write also gets a sequence number. Its answer says whether it was
 * still the newest write to that key when it came back: an older write's
 * answer must not be shown over a newer one that is still on its way.
 *
 * A failed write doesn't block the ones behind it: each runs once the one
 * before has settled, either way. Different keys never wait for each other.
 */
export interface InOrderResult<T> {
  value: T;
  /** No later write to the same key was made while this one was out. */
  latest: boolean;
}

export interface InOrder {
  /** Runs `send` after every earlier write to `key` has settled; rejects with `send`'s own error. */
  run<T>(key: string, send: () => Promise<T>): Promise<InOrderResult<T>>;
}

export function createInOrder(): InOrder {
  const tails = new Map<string, Promise<unknown>>();
  const newest = new Map<string, number>();
  return {
    async run<T>(key: string, send: () => Promise<T>): Promise<InOrderResult<T>> {
      const seq = (newest.get(key) ?? 0) + 1;
      newest.set(key, seq);
      const before = tails.get(key) ?? Promise.resolve();
      const result = before.then(send);
      const tail = result.then(
        () => undefined,
        () => undefined
      );
      tails.set(key, tail);
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      const value = await result;
      return { value, latest: newest.get(key) === seq };
    },
  };
}
