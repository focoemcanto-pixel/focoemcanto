import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlackLeadTracker, BLACK_PIXEL_ID } from '../../app/black/lead-tracking';
const id = '00000000-0000-4000-8000-000000000001';
function fixture(blockedStorage = false) {
  const calls: unknown[][] = [], stored = new Map<string, string>();
  const delayed: (() => void)[] = [];
  let available = true;
  const env = {
    pixel: () => available ? (...args: unknown[]) => { calls.push(args); } : undefined,
    storage: () => { if (blockedStorage) throw new Error('private mode'); return {
      getItem: (k: string) => stored.get(k) || null,
      setItem: (k: string, v: string) => { stored.set(k, v); },
    }; },
    later: (fn: () => void) => delayed.push(fn),
  };
  return { calls, env, delayed, pixel: (v: boolean) => { available = v; } };
}
test('visit, invalid/incomplete responses and restored completion never convert', () => {
  const f = fixture(), track = createBlackLeadTracker(f.env);
  for (const r of [{ok:false,completed:true,entry_id:id},{ok:true,completed:false,entry_id:id},{ok:true,completed:true},{ok:true,completed:true,entry_id:'invalid'}]) track(r,false);
  track({ok:true,completed:true,entry_id:id},true);
  assert.equal(f.calls.length,0);
});
test('confirmed completion sends one Lead to the existing pixel with a stable ID and no PII', () => {
  const f=fixture(), track=createBlackLeadTracker(f.env), r={ok:true,completed:true,entry_id:id};
  track(r,false); track(r,false); createBlackLeadTracker(f.env)(r,false);
  assert.deepEqual(f.calls,[['trackSingle',BLACK_PIXEL_ID,'Lead',{
    campaign_key:'black_foco_2026',registration_status:'completed',content_name:'BLACK FOCO 2026 | Lista Prioritaria',
  },{eventID:`black_foco_2026:completed:${id}`}]]);
});
test('delayed SDK is retried without duplicate submissions; blocked storage is supported', () => {
  const f=fixture(true),track=createBlackLeadTracker(f.env),r={ok:true,completed:true,entry_id:id};
  f.pixel(false); track(r,false);track(r,false);assert.equal(f.delayed.length,1);
  f.pixel(true);f.delayed.shift()!();track(r,false);assert.equal(f.calls.length,1);
});
test('pixel failures do not break registration confirmation', () => {
  const f=fixture();
  const track=createBlackLeadTracker({...f.env,pixel:()=>()=>{throw new Error('blocked');}});
  assert.doesNotThrow(()=>track({ok:true,completed:true,entry_id:id},false));
});
