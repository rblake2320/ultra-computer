import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {root, data} from './private-runtime.mjs';

// Synthetic, isolated state. The proxy measures actual Ollama calls and usage;
// it never receives the owner's configured model/provider credentials.
fs.mkdirSync(data,{recursive:true});
const state=fs.mkdtempSync(path.join(data,'efficiency-acceptance-'));
const modelId=process.env.E2E_OLLAMA_MODEL || 'gemma4:latest';
const key=randomBytes(32).toString('hex'), container='ultra-efficiency-'+randomBytes(5).toString('hex');
const receipt={startedAt:new Date().toISOString(),modelId,scenario:process.env.ULTRA_EFFICIENCY_LABEL || 'candidate',results:[]};
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const [port,grpc,redis,proxyPort]=await Promise.all([freePort(),freePort(),freePort(),freePort()]);
const base=`http://127.0.0.1:${port}`;
let child, calls=[], proxy;
const record=(name,ok,details)=>{const result={name,status:ok?'Worked':'Failed',details};receipt.results.push(result);console.log(JSON.stringify(result));if(!ok)throw new Error(name+' failed');};
async function api(route,body){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error(`HTTP ${r.status} ${route}`);return r.json();}
try {
 proxy=http.createServer(async(req,res)=>{
  try {
   const chunks=[];for await(const c of req)chunks.push(c);const bytes=Buffer.concat(chunks);
   const body=bytes.length?JSON.parse(bytes.toString('utf8')):{};
   const measure=req.url.includes('chat/completions')?{maxOutput:body.max_tokens,reasoningEffort:body.reasoning_effort||null,tools:body.tools?.length||0,inputBytes:Buffer.byteLength(JSON.stringify(body.messages||[])),started:Date.now()}:null;
   if(measure)calls.push(measure);
   const upstream=await fetch('http://127.0.0.1:11434'+req.url,{method:req.method,headers:{'Content-Type':'application/json'},body:bytes.length?bytes:undefined,signal:AbortSignal.timeout(180000)});
   res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json'});
   let output='';for await(const c of upstream.body){res.write(c);if(output.length<4194304)output+=Buffer.from(c).toString('utf8');}res.end();
   if(measure){measure.durationMs=Date.now()-measure.started;delete measure.started;measure.httpStatus=upstream.status;
    const frames=output.startsWith('data:')?output.split('\n').filter(v=>v.startsWith('data: {')).map(v=>JSON.parse(v.slice(6))):[JSON.parse(output)];
    const usage=frames.map(v=>v.usage).filter(Boolean).at(-1);measure.usage=usage?{inputTokens:usage.prompt_tokens,outputTokens:usage.completion_tokens,totalTokens:usage.total_tokens}:null;
   }
  }catch{res.destroy();}
 });await new Promise(resolve=>proxy.listen(proxyPort,'127.0.0.1',resolve));
 execFileSync('docker',['run','--detach','--name',container,'--publish',`127.0.0.1:${redis}:6379`,'redis:7-alpine@sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99'],{windowsHide:true,stdio:'pipe'});
 const log=fs.openSync(path.join(state,'server.log'),'a',0o600);
 child=spawn(process.execPath,[process.env.ULTRA_EFFICIENCY_BUILD||'dist/index.cjs'],{cwd:root,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),GRPC_PORT:String(grpc),ULTRA_API_KEY:key,ENCRYPTION_KEY:randomBytes(32).toString('hex'),DATABASE_PATH:path.join(state,'app.db'),REDIS_URL:`redis://127.0.0.1:${redis}`,ULTRA_DURABLE_RUN_DIR:path.join(state,'runs'),ULTRA_POLICY_AUDIT_FILE:path.join(state,'policy.jsonl'),ULTRA_SANDBOX_DIR:path.join(state,'sandbox'),ULTRA_LOCAL_EGRESS_ALLOWLIST:'127.0.0.1',ULTRA_ALLOW_INSECURE_HTTP:'true',ULTRA_PRIVATE_INSTALL:'0',ULTRA_SANDBOX_ENGINE:'docker',ULTRA_EXPERIMENTAL:'0',ALLOW_HOST_SHELL:'false'}});fs.closeSync(log);
 let healthy=false;for(let i=0;i<160;i++){if(child.exitCode!==null)throw new Error('Acceptance build exited');try{if((await fetch(base+'/api/health')).ok){healthy=true;break;}}catch{}await delay(250);}if(!healthy)throw new Error('Startup failed');
 const model=await api('/api/models',{name:'Measured local model',provider:'ollama',modelId,authMethod:'none',baseUrl:`http://127.0.0.1:${proxyPort}/v1`,capabilities:['chat','code','tools']});
 const connection=await api(`/api/models/${model.id}/test`,{});record('real-model-connection',connection.ok,{modelId});
 await api('/api/settings',{model_for_workers:model.id,model_for_decomposition:model.id,model_for_synthesis:model.id,max_tool_iterations:'6'});
 for(const [name,prompt,expected] of [['arithmetic','What is 2 + 2? Reply with only the number.',/^\s*4[.!]?\s*$/],['single-instruction','Summarize this in exactly one sentence: Water freezes into ice when it gets cold enough.',/water|ice/i]]){
  calls=[];const conv=await api('/api/conversations',{title:'Efficiency acceptance: '+name,orchestratorModelId:model.id});
  await api(`/api/conversations/${conv.id}/messages`,{content:prompt});let answer,done=false;
  for(let i=0;i<480;i++){const c=await api('/api/conversations/'+conv.id);const messages=await api(`/api/conversations/${conv.id}/messages`);answer=messages.find(m=>m.role==='assistant');if(c.status==='error')throw new Error(name+' conversation failed');if(c.status==='idle'&&answer){done=true;break;}await delay(500);}
  const metadata=JSON.parse(answer?.metadata||'{}');
  record(name,done&&expected.test(answer.content),{answer:answer?.content,actualProviderCalls:calls.length,providerRequests:calls.map(c=>({...c})),modelBudget:metadata.modelBudget||null});
  if(receipt.scenario==='candidate')record(name+'-efficiency',calls.length===1&&calls[0].reasoningEffort==='none'&&(name!=='arithmetic'||calls[0].tools===0),{providerCalls:calls.length,noHiddenMemoryOrPlannerCall:true});
 }
} catch(error){receipt.error=String(error.message).replaceAll(key,'[redacted]');console.error(receipt.error);process.exitCode=1;}
finally {
 if(child?.exitCode===null){child.kill('SIGKILL');await new Promise(r=>child.once('exit',r));}
 proxy?.closeAllConnections();await new Promise(r=>proxy?proxy.close(r):r());
 try{execFileSync('docker',['rm','--force',container],{windowsHide:true,stdio:'pipe'});}catch{receipt.cleanupError='Scoped Redis cleanup failed';process.exitCode=1;}
 receipt.finishedAt=new Date().toISOString();receipt.status=receipt.error||receipt.cleanupError?'Failed':'Worked';
 const output=process.env.ULTRA_EFFICIENCY_RECEIPT||path.join(state,'receipt.json');fs.writeFileSync(output,JSON.stringify(receipt,null,2),{mode:0o600});console.log('Receipt: '+output);
}
