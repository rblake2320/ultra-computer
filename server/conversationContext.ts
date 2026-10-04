import type {ChatMessage} from './modelRouter.js';

/** Bounded recent dialogue, scoped by the caller's conversation lookup. */
export function recentConversationContext(history: readonly {role:string;content:string;metadata?:string}[]): ChatMessage[] {
 const prior=history.at(-1)?.role==='user'?history.slice(0,-1):history;
 const result:ChatMessage[]=[];let remaining=8000;
 for(const message of prior.filter(m=>m.role==='user'||m.role==='assistant').slice(-6).reverse()) {
  if(message.metadata && /"errorCode"\s*:/.test(message.metadata))continue;
  if(message.content.length>remaining)break;
  result.unshift({role:message.role as 'user'|'assistant',content:message.content});remaining-=message.content.length;
 }
 return result;
}
