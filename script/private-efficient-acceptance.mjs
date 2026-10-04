import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {data,root,loadConfig} from './private-runtime.mjs';
import {verifyReleasePayload} from './verify-private-release.mjs';
const config=loadConfig(),base=`http://127.0.0.1:${config.httpPort}`;
const receipt={checkedAt:new Date().toISOString(),results:[]};
const record=(name,ok,detail)=>{const r={name,status:ok?'Worked':'Failed',detail};receipt.results.push(r);console.log(JSON.stringify(r));if(!ok)throw new Error(name+' failed');};
async function api(route,body){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(180000)});if(!r.ok)throw new Error(`HTTP ${r.status} ${route}`);return r.json();}
async function message(conv,content,expectedError=false){const prior=(await api(`/api/conversations/${conv.id}/messages`)).length;await api(`/api/conversations/${conv.id}/messages`,{content});for(let i=0;i<480;i++){const c=await api('/api/conversations/'+conv.id);if(c.status==='error'){if(expectedError)return{status:'error',agents:await api(`/api/conversations/${conv.id}/agent-runs`)};throw new Error('Conversation failed: '+conv.title);}const messages=await api(`/api/conversations/${conv.id}/messages`);const answer=messages.slice(prior).find(m=>m.role==='assistant');if(c.status==='idle'&&answer)return{status:'completed',answer,agents:await api(`/api/conversations/${conv.id}/agent-runs`)};await delay(500);}throw new Error('Conversation did not finish');}
try {
 verifyReleasePayload();receipt.sourceCommit=JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json'),'utf8')).sourceCommit;
 const sandbox=await api('/api/sandbox/status');record('installed-openshell',sandbox.engine==='NVIDIA OpenShell'&&sandbox.enabled&&sandbox.dockerAvailable,{engine:sandbox.engine,active:sandbox.enabled&&sandbox.dockerAvailable});
 const models=await api('/api/models'),model=models.find(m=>m.isDefault&&m.connectionStatus==='connected'&&m.provider==='ollama');
 record('local-model-ready',!!model,{modelId:model?.modelId});
 const conv=await api('/api/conversations',{title:'Release verification: efficient dialogue',orchestratorModelId:model.id});
 const arithmetic=await message(conv,'What is 2 + 2? Reply with only the number.');const budget=JSON.parse(arithmetic.answer.metadata).modelBudget;
 record('one-call-arithmetic',/^\s*4[.!]?\s*$/.test(arithmetic.answer.content)&&budget.calls===1,{answer:arithmetic.answer.content,modelBudget:budget});
 await message(conv,'My synthetic verification project is named Atlas. Reply with only OK.');
 const follow=await message(conv,'What is my verification project named? Reply with only the name.');
 record('bounded-follow-up-context',/^\s*Atlas[.!]?\s*$/i.test(follow.answer.content),{answer:follow.answer.content,modelBudget:JSON.parse(follow.answer.metadata).modelBudget});
 record('no-automatic-invented-memory',!(await api('/api/memory')).some(m=>m.sessionId===conv.id),{automaticMemoryEntries:0});
 await message(conv,'Remember that I prefer concise replies for my verification project.');
 record('explicit-verbatim-memory',(await api('/api/memory')).some(m=>m.sessionId===conv.id&&m.content==='I prefer concise replies for my verification project.'),{originalOwnerTextStored:true});
 const languages={python3:"from pathlib import Path; Path('/workspace/artifacts/received.txt').write_text('42'); print(4)",node:"console.log(2+2)",typescript:"const n:number=2+2; console.log(n)",bash:'echo $((2+2))'};
 for(const [language,code] of Object.entries(languages)){
  const r=await api('/api/protocols/code/interpret',{language,code});
  record('openshell-'+language,r.exitCode===0&&r.stdout.trim()==='4',{exitCode:r.exitCode,correctOutput:r.stdout.trim()==='4'});
  if(language==='python3'){const received=r.artifacts.find(p=>path.basename(p)==='received.txt');const resolved=received&&path.resolve(received);const prefix=path.resolve(root,'sandbox')+path.sep;
   record('interpreter-receiving-file',!!resolved&&resolved.startsWith(prefix)&&fs.readFileSync(resolved,'utf8')==='42',{fileReceived:true,content:'42'});
  }
 }
 const deniedWrite=await api('/api/protocols/code/interpret',{language:'bash',code:'echo denied > /etc/ultra-production-test.txt'});
 record('protected-filesystem-denial',deniedWrite.exitCode!==0,{exitCode:deniedWrite.exitCode});
 const deniedNetwork=await api('/api/protocols/code/interpret',{language:'bash',code:'curl --connect-timeout 2 --max-time 3 --fail https://example.com >/dev/null'});
 record('offline-network-denial',deniedNetwork.exitCode!==0,{exitCode:deniedNetwork.exitCode});
 const identity=await api('/api/protocols/code/interpret',{language:'bash',code:'id -u'});record('non-root-workload',identity.exitCode===0&&identity.stdout.trim()==='1000',{uid:identity.stdout.trim()});
 const file='verification-'+randomUUID()+'.txt';const actionConv=await api('/api/conversations',{title:'Release verification: actual tool action',orchestratorModelId:model.id});
 const action=await message(actionConv,`Use the bash tool to run: printf 42 > ${file}. Reply briefly after the tool succeeds.`);
 const calls=action.agents.flatMap(a=>JSON.parse(a.toolCalls||'[]'));
 record('real-agent-file-receipt',calls.some(c=>c.tool==='bash'&&c.result.success)&&fs.readFileSync(path.join(root,'sandbox',file),'utf8')==='42',{successfulBashReceipts:calls.filter(c=>c.tool==='bash'&&c.result.success).length,received:'42',modelBudget:JSON.parse(action.answer.metadata).modelBudget});
 const failedConv=await api('/api/conversations',{title:'Release verification: failed action',orchestratorModelId:model.id});
 const failed=await message(failedConv,'Use the bash tool to run exit 7 once. Report the exit status.',true);
 record('failed-tool-never-reported-complete',failed.status==='error'&&failed.agents.some(a=>JSON.parse(a.toolCalls||'[]').some(c=>c.tool==='bash'&&!c.result.success)),{conversationStatus:failed.status});
} catch(error){receipt.error=String(error.message).replaceAll(config.apiKey,'[redacted]').replaceAll(config.encryptionKey,'[redacted]');console.error(receipt.error);process.exitCode=1;}
finally{receipt.status=receipt.error?'Failed':'Worked';fs.writeFileSync(path.join(data,'private-efficient-receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600});}
