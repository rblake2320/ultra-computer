import {AsyncLocalStorage} from 'node:async_hooks';
import {ExecutionFailure} from './executionOutcome.js';
import type {ModelRequest,ModelUsage} from './models/types.js';
export interface RunBudget {calls:number;estimatedInputTokens:number;outputTokens:number;reservedOutputTokens:number;}
const budgets=new AsyncLocalStorage<RunBudget>();
export function withModelRunBudget<T>(work:()=>Promise<T>):Promise<T> {return budgets.run({calls:0,estimatedInputTokens:0,outputTokens:0,reservedOutputTokens:0},work);}
export function currentModelRunBudget():RunBudget|undefined {const b=budgets.getStore();return b?{...b}:undefined;}
export function admitModelAttempt(request:ModelRequest):((usage?:ModelUsage)=>void) {
 const b=budgets.getStore();if(!b)return()=>{};
 const input=Math.ceil(Buffer.byteLength(JSON.stringify(request.messages)+JSON.stringify(request.tools||[]))/4);
 const output=request.maxOutputTokens??4096;
 if (!Number.isSafeInteger(output) || output<1) throw new ExecutionFailure('model_run_budget','Output token allowance must be a positive integer.');
 if(b.calls>=16 || b.estimatedInputTokens+input>64000 || b.outputTokens+b.reservedOutputTokens+output>32768)
   throw new ExecutionFailure('model_run_budget','This request reached its model-call or token budget. Recorded work is retained; narrow the request before retrying.');
 b.calls++;b.estimatedInputTokens+=input;b.reservedOutputTokens+=output;
 let settled=false;return usage=>{if(settled)return;settled=true;b.reservedOutputTokens-=output;b.outputTokens+=usage?.outputTokens??output;};
}
