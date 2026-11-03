// Only a successful answer response may create a conversion. Restoration and signup never do.
export const BLACK_PIXEL_ID = '392375800147182';
export const BLACK_CAMPAIGN_KEY = 'black_foco_2026';
type Completion = { ok: boolean; completed?: boolean; entry_id?: string };
type Pixel = (...args: unknown[]) => void;
type Environment = {
  pixel: () => Pixel | undefined;
  storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  later: (fn: () => void, ms: number) => unknown;
};
export function createBlackLeadTracker(env: Environment) {
  const pending = new Set<string>(), sent = new Set<string>();
  return (result: Completion, previouslyCompleted: boolean) => {
    if (!result.ok || !result.completed || previouslyCompleted || !/^[0-9a-f-]{36}$/i.test(result.entry_id || '')) return;
    const eventId = `${BLACK_CAMPAIGN_KEY}:completed:${result.entry_id}`;
    const key = `black26:meta:${eventId}`;
    const alreadySent = () => {
      if (sent.has(eventId)) return true;
      try { return env.storage().getItem(key) === '1'; } catch { return false; }
    };
    if (pending.has(eventId) || alreadySent()) return;
    pending.add(eventId);
    const send = (attempt: number) => {
      if (alreadySent()) { pending.delete(eventId); return; }
      const fbq = env.pixel();
      if (!fbq) {
        if (attempt < 60) env.later(() => send(attempt + 1), 500);
        else pending.delete(eventId);
        return;
      }
      try {
        // Reuse the existing SDK/consent state. Do not initialize another pixel, send form values,
        // or broadcast to other pixels. The stable ID also supports any future server deduplication.
        fbq('trackSingle', BLACK_PIXEL_ID, 'Lead', {
          campaign_key: BLACK_CAMPAIGN_KEY,
          registration_status: 'completed',
          content_name: 'BLACK FOCO 2026 | Lista Prioritaria',
        }, { eventID: eventId });
        sent.add(eventId);
        try { env.storage().setItem(key, '1'); } catch { /* memory still prevents repeats */ }
      } catch { /* Tracking failure must never prevent confirmation or access to the group. */ }
      finally { pending.delete(eventId); }
    };
    send(0);
  };
}
export const trackBlackCompletion = createBlackLeadTracker({
  pixel: () => typeof window === 'undefined' ? undefined : (window as Window & { fbq?: Pixel }).fbq,
  storage: () => window.localStorage,
  later: (fn, ms) => window.setTimeout(fn, ms),
});
