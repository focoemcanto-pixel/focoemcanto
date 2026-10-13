/**
 * Bounded client polling for /trade (DB incident 2026-10-12): never more than one request of a poller in
 * flight, nothing while the tab is hidden, and exponential backoff (max 30 s) after a failure. Aborting a
 * browser fetch does not cancel the Postgres statement behind it, so overlapping 2 s polls multiplied the
 * load exactly when the database was already slow.
 */
export const MAX_BACKOFF_MS = 30000;

export function backoffMs(failures: number) {
  return failures <= 0 ? 0 : Math.min(MAX_BACKOFF_MS, 1000 * 2 ** failures);
}

export function pageHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

export function createPollGate(
  now: () => number = Date.now,
  hidden: () => boolean = pageHidden,
) {
  let busy = false,
    failures = 0,
    retryAt = 0;
  return {
    /** True when a new request may start now. */
    ready() {
      return !busy && !hidden() && now() >= retryAt;
    },
    /** Runs fn only when ready; skipped ticks resolve to undefined. */
    async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
      if (!this.ready()) return undefined;
      busy = true;
      try {
        const out = await fn();
        failures = 0;
        retryAt = 0;
        return out;
      } catch (e) {
        failures += 1;
        retryAt = now() + backoffMs(failures);
        throw e;
      } finally {
        busy = false;
      }
    },
    begin() {
      busy = true;
    },
    end(ok: boolean) {
      busy = false;
      if (ok) {
        failures = 0;
        retryAt = 0;
      } else {
        failures += 1;
        retryAt = now() + backoffMs(failures);
      }
    },
    get failures() {
      return failures;
    },
  };
}
