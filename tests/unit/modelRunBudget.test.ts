import {expect, it} from 'vitest';
import {admitModelAttempt, currentModelRunBudget, withModelRunBudget} from '../../server/modelRunBudget.js';
import type {ModelRequest} from '../../server/models/types.js';
const request: ModelRequest = {model:'local',messages:[{role:'user',content:'hello'}],maxOutputTokens:512};
const usage = {inputTokens:5,outputTokens:7,totalTokens:12};

it('shares the call limit across parallel workers and admits no seventeenth attempt', async()=>{
 await withModelRunBudget(async()=>{
  const results = await Promise.allSettled(Array.from({length:17},async()=>{const settle=admitModelAttempt(request);await Promise.resolve();settle(usage);}));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(16);
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect(currentModelRunBudget()).toMatchObject({calls:16,outputTokens:112,reservedOutputTokens:0});
 });
 expect(currentModelRunBudget()).toBeUndefined();
});
it('reserves outputs before concurrent calls and settles each attempt only once',async()=>{
 await withModelRunBudget(async()=>{
  const settle=admitModelAttempt({...request,maxOutputTokens:32768});
  expect(()=>admitModelAttempt(request)).toThrow('budget');
  settle(usage);settle();
  expect(currentModelRunBudget()).toMatchObject({calls:1,outputTokens:7,reservedOutputTokens:0});
  admitModelAttempt(request)();
  expect(currentModelRunBudget()?.outputTokens).toBe(519);
 });
});
it('rejects excessive input before provider admission and isolates separate turns',async()=>{
 await withModelRunBudget(async()=>{
  expect(()=>admitModelAttempt({...request,messages:[{role:'user',content:'x'.repeat(256001)}]})).toThrow('budget');
  expect(currentModelRunBudget()?.calls).toBe(0);
 });
 await withModelRunBudget(async()=>{expect(currentModelRunBudget()?.calls).toBe(0);});
});
