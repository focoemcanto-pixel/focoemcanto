export type SceneKind = 'intro' | 'universe' | 'fusion';
export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

// O palco usa a menor viewport estável. O percurso corresponde às transições,
// nunca a um número arbitrário de telas vazias ou ao innerHeight dinâmico.
export function sceneTravel(kind: SceneKind, stageHeight: number, count: number) {
  const h = Math.max(1, stageHeight);
  if (kind === 'intro') return h * 0.55 * 2; // duas transições entre três atos
  if (kind === 'universe') return h * 0.38 * Math.max(1, count - 1);
  return h * 0.65; // uma convergência
}

export function sceneFrame(scrollY: number, start: number, travel: number) {
  const progress = clamp((scrollY - start) / Math.max(1, travel));
  const pin = scrollY < start ? 'before' : scrollY < start + travel ? 'active' : 'after';
  return { progress, pin } as const;
}

export function universeFrame(progress: number, count: number) {
  const cursor = clamp(progress) * Math.max(0, count - 1);
  const active = Math.round(cursor);
  return { cursor, active, textOpacity: 1 - Math.abs(cursor - active) * 0.5 };
}

export function coverFrame(index: number, cursor: number) {
  const distance = index - cursor;
  const depth = Math.min(4, Math.abs(distance));
  return { distance, scale: 1 - depth * 0.075, opacity: Math.max(0.12, 1 - depth * 0.62), tilt: clamp(distance, -2, 2) * -2 };
}

export function introFrame(progress: number) {
  const cursor = clamp(progress) * 2;
  const weights = [0, 1, 2].map(index => Math.max(0, 1 - Math.abs(cursor - index)));
  return { cursor, weights };
}

export function productScrollTarget(start: number, travel: number, index: number, count: number) {
  return start + travel * clamp(index / Math.max(1, count - 1));
}
