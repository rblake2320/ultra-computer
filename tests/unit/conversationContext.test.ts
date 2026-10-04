import {expect,it} from 'vitest';
import {recentConversationContext} from '../../server/conversationContext.js';
it('keeps recent dialogue without duplicating the current request or injecting failed diagnostics',()=>{
 expect(recentConversationContext([{role:'user',content:'My project is named Atlas.'},{role:'assistant',content:'Noted.'},{role:'assistant',content:'failure',metadata:'{"errorCode":"failed"}'},{role:'user',content:'What is it named?'}])).toEqual([{role:'user',content:'My project is named Atlas.'},{role:'assistant',content:'Noted.'}]);
});
it('caps history at six messages and eight thousand characters',()=>{
 expect(recentConversationContext(Array.from({length:20},(_,i)=>({role:'assistant',content:String(i)})))).toHaveLength(6);
 expect(recentConversationContext([{role:'assistant',content:'x'.repeat(8001)},{role:'assistant',content:'latest'}])).toEqual([{role:'assistant',content:'latest'}]);
});
