'use client';

import type { ClosetSession } from './supabase';
import type { SavedLook } from './savedLooks';

export type StylistMemory = {
  occasionLikes: Record<string, Record<string, number>>;
  pairLikes: Record<string, number>;
  itemLikes: Record<string, number>;
  signals?: Record<string, number>;
  updatedAt: string;
};

const key = (uid: string) => `closet.stylistMemory.v1.${uid}`;

const empty = (): StylistMemory => ({
  occasionLikes: {},
  pairLikes: {},
  itemLikes: {},
  signals: {},
  updatedAt: new Date().toISOString(),
});

function pairKey(a: string, b: string) {
  return [a, b].sort().join('|');
}

export function loadStylistMemory(session: ClosetSession): StylistMemory {
  try {
    return JSON.parse(localStorage.getItem(key(session.user.id)) || 'null') || empty();
  } catch {
    return empty();
  }
}

export function learnFromSavedLooks(session: ClosetSession, looks: SavedLook[]) {
  const previous = loadStylistMemory(session);
  const m = empty();

  // Commerce signals are durable. Rebuilding feedback memory must not erase
  // purchases, and purchase-derived item affinity is reconstructed once here
  // instead of being cumulatively added on every saved-look refresh.
  m.signals = { ...(previous.signals || {}) };
  for (const [signal, value] of Object.entries(m.signals)) {
    if (!signal.startsWith('purchase:item:')) continue;
    const itemId = signal.slice('purchase:item:'.length);
    if (itemId) m.itemLikes[itemId] = (m.itemLikes[itemId] || 0) + Number(value || 0) * 2;
  }

  for (const look of looks) {
    const ids = (look.item_ids || []).map(String);
    const rating = String(look.rating || '');
    let delta = rating === 'love' ? 5 : rating === 'wear' ? 3 : rating === 'not_me' ? -7 : look.favorite ? 1 : 0;
    delta += Math.min(3, Number(look.worn_count || 0)) * 0.7;
    if (!delta) continue;

    const occasion = look.occasion || 'Geral';
    m.occasionLikes[occasion] ||= {};

    for (const id of ids) {
      m.itemLikes[id] = (m.itemLikes[id] || 0) + delta;
      m.occasionLikes[occasion][id] = (m.occasionLikes[occasion][id] || 0) + delta;
    }

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pair = pairKey(ids[i], ids[j]);
        m.pairLikes[pair] = (m.pairLikes[pair] || 0) + delta;
      }
    }
  }

  m.updatedAt = new Date().toISOString();
  localStorage.setItem(key(session.user.id), JSON.stringify(m));
  return m;
}

export function learnFromMarketplacePurchase(session: ClosetSession, itemId: string, category: string) {
  const m = loadStylistMemory(session);
  m.signals ||= {};

  const itemSignal = `purchase:item:${itemId}`;
  m.signals[itemSignal] = (m.signals[itemSignal] || 0) + 1;
  m.itemLikes[itemId] = (m.itemLikes[itemId] || 0) + 2;

  const categorySignal = `purchase:${category.toLowerCase()}`;
  m.signals[categorySignal] = (m.signals[categorySignal] || 0) + 1;
  m.updatedAt = new Date().toISOString();

  localStorage.setItem(key(session.user.id), JSON.stringify(m));
  return m;
}

export function memoryScore(
  m: StylistMemory | undefined,
  itemId: string,
  occasion: string,
  withIds: string[] = [],
) {
  if (!m) return 0;
  let score = (m.itemLikes[itemId] || 0) * 0.35 + (m.occasionLikes[occasion]?.[itemId] || 0) * 0.8;
  for (const id of withIds) score += (m.pairLikes[pairKey(itemId, id)] || 0) * 0.55;
  return Math.max(-25, Math.min(25, score));
}
