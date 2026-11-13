import { clamp } from './scroll-model';
export function valueFrame(progress: number, amounts: number[]) {
  const cursor = clamp(progress / .65) * amounts.length;
  const completed = Math.min(amounts.length, Math.floor(cursor));
  const fraction = cursor - completed;
  const subtotalCents = amounts.slice(0,completed).reduce((sum,value) => sum+value,0) + Math.round((amounts[completed] || 0)*fraction);
  // Reconstroi o roteiro FocoMarketing sem alterar o motor de pin e scroll reverso.
  const buildExit = clamp((progress - .68) / .11);
  const bridge = clamp((progress - .72) / .08) * (1 - clamp((progress - .87) / .07));
  const reveal = clamp((progress - .88) / .12);
  return { cursor, subtotalCents, referenceComplete: progress >= .65, buildExit, bridge, reveal, active: Math.min(amounts.length-1,completed) };
}
