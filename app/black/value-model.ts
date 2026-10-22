import { clamp } from './scroll-model';
export function valueFrame(progress: number, amounts: number[]) {
  const cursor = clamp(progress / .65) * amounts.length;
  const completed = Math.min(amounts.length, Math.floor(cursor));
  const fraction = cursor - completed;
  const subtotalCents = amounts.slice(0,completed).reduce((sum,value) => sum+value,0) + Math.round((amounts[completed] || 0)*fraction);
  return { cursor, subtotalCents, reveal: clamp((progress - .76) / .18), active: Math.min(amounts.length-1,completed) };
}
