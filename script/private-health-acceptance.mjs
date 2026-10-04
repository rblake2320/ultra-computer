import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {data,root,loadConfig} from './private-runtime.mjs';
import {verifyReleasePayload} from './verify-private-release.mjs';
const config=loadConfig(), base=`http://127.0.0.1:${config.httpPort}`;
const receipt={checkedAt:new Date().toISOString(),results:[]};
const record=(name,ok,detail)=>{receipt.results.push({name,status:ok?'Worked':'Failed',detail});console.log(JSON.stringify(receipt.results.at(-1)));if(!ok)throw new Error(name+' failed');};
async function api(route,body){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`HTTP ${r.status} ${route}`);return r.json();}
try {
  verifyReleasePayload();
  const manifest=path.join(root,'release-manifest.json');
  if(fs.existsSync(manifest))receipt.sourceCommit=JSON.parse(fs.readFileSync(manifest,'utf8')).sourceCommit;
  const models=await api('/api/models');
  const model=models.find(m=>m.isDefault&&m.connectionStatus==='connected');
  const conv=await api('/api/conversations',{title:'Verification: real host health',orchestratorModelId:model?.id});
  receipt.conversationId=conv.id;
  const prompt='Give me a full system health report covering CPU utilization, physical RAM usage, GPU status and memory, actual disk space remaining, live process list, and active Ollama model loading list.';
  await api(`/api/conversations/${conv.id}/messages`,{content:prompt});
  let answer;
  for(let i=0;i<60;i++){
    const current=await api('/api/conversations/'+conv.id);
    if(current.status==='error')throw new Error('Health conversation failed');
    answer=(await api(`/api/conversations/${conv.id}/messages`)).find(m=>m.role==='assistant');
    if(current.status==='idle'&&answer)break;
    await delay(300);
  }
  record('chat-completed',!!answer,{conversationId:conv.id});
  const runs=await api(`/api/conversations/${conv.id}/agent-runs`),calls=runs.flatMap(run=>JSON.parse(run.toolCalls));
  const call=calls.find(c=>c.tool==='host_health'&&c.result.success);
  record('governed-host-receipt',!!call&&calls.length===1,{tool:calls[0]?.tool,toolCalls:calls.length});
  const snapshot=JSON.parse(call.result.output);receipt.snapshot=snapshot;receipt.answer=answer.content;
  record('zero-model-calls',JSON.parse(answer.metadata).modelBudget.calls===0,{modelBudget:JSON.parse(answer.metadata).modelBudget});
  record('native-host-scope',snapshot.scope.includes('outside the command sandbox')&&Math.abs(Date.now()-Date.parse(snapshot.capturedAt))<15000,{scope:snapshot.scope,capturedAt:snapshot.capturedAt});
  record('cpu',snapshot.cpu.status==='Worked'&&snapshot.cpu.data.utilizationPercent>=0&&snapshot.cpu.data.utilizationPercent<=100&&snapshot.cpu.data.logicalCpus===os.cpus().length,{...snapshot.cpu});
  record('physical-ram',snapshot.ram.status==='Worked'&&snapshot.ram.data.totalBytes===os.totalmem()&&Math.abs(snapshot.ram.data.freeBytes-os.freemem())<os.totalmem()*0.1,{...snapshot.ram});
  record('disks-processes',snapshot.platform.status==='Worked'&&snapshot.platform.data.disks.length>0&&snapshot.platform.data.disks.every(d=>d.freeBytes>=0&&d.freeBytes<=d.totalBytes)&&snapshot.platform.data.processes.length>0&&snapshot.platform.data.processCount>=snapshot.platform.data.processes.length,{...snapshot.platform});
  // Missing NVIDIA hardware/driver is a legitimate explicitly labelled result.
  record('gpu-truthful-result',snapshot.gpu.status==='Worked'?snapshot.gpu.data.length>0:answer.content.includes('GPU: Unavailable'),snapshot.gpu);
  const response=await fetch('http://127.0.0.1:11434/api/ps',{signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw new Error('Independent Ollama observation unavailable');
  const loaded=(await response.json()).models;
  record('actual-loaded-models',snapshot.ollama.status==='Worked'&&snapshot.ollama.data.every(m=>loaded.some(actual=>actual.name===m.name&&actual.size===m.sizeBytes&&actual.size_vram===m.vramBytes))&&snapshot.ollama.data.length===loaded.length,{...snapshot.ollama});
  const unauth=await fetch(base+`/api/conversations/${conv.id}/agent-runs`);
  record('owner-auth-required',unauth.status===401,{unauthenticatedHTTP:unauth.status});
}catch(error){receipt.error=String(error.message).replaceAll(config.apiKey,'[redacted]').replaceAll(config.encryptionKey,'[redacted]');console.error(receipt.error);process.exitCode=1;}
finally{receipt.status=receipt.error?'Failed':'Worked';fs.writeFileSync(path.join(data,'private-health-receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600});}
