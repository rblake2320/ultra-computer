import {expect,it} from 'vitest';
import {requireActionEvidence,isTextOnlyRequest} from '../../server/executionOutcome.js';
import {useDirectTask} from '../../server/taskPlan.js';
import {OpenShellSandbox,validateTransferFiles,wslPath} from '../../server/openShellSandbox.js';
it('uses one worker for one instruction while retaining explicit sequential planning',()=>{
 expect(useDirectTask('Summarize this paragraph in one sentence.')).toBe(true);
 expect(useDirectTask('Create a file named result.txt containing 4.')).toBe(true);
 expect(useDirectTask('Research the latest models, then create a report.')).toBe(false);
});
it('rejects invented execution and failed or unrelated explicit tool receipts',()=>{
 expect(()=>requireActionEvidence('Create a file named result.txt',[])).toThrow('receipt');
 expect(()=>requireActionEvidence('Use the bash tool to run python',[{tool:'bash',result:{success:false}}])).toThrow('receipt');
 expect(()=>requireActionEvidence('Use the bash tool to run python',[{tool:'calculator',result:{success:true}}])).toThrow('receipt');
 expect(()=>requireActionEvidence('Use the bash tool to run python',[{tool:'bash',result:{success:true}}])).not.toThrow();
 expect(()=>requireActionEvidence('What is 2+2?',[])).not.toThrow();
 expect(()=>requireActionEvidence('How do I install a model?',[])).not.toThrow();
 expect(()=>requireActionEvidence('What are the latest installed models?',[])).toThrow('receipt');
 expect(isTextOnlyRequest('Summarize this paragraph: Water is wet.')).toBe(true);
 expect(isTextOnlyRequest('Summarize https://example.com')).toBe(false);
 expect(isTextOnlyRequest('Write a file named output.txt')).toBe(false);
});
it('rejects traversal, absolute paths, duplicate aliases, malformed data and excessive transfers',()=>{
 for(const name of ['../escape','/root','a/../../b','a\\b','C:bad','a//b','NUL','a./b','a /b','CON.txt','bad?name']) expect(()=>validateTransferFiles([{name,data:'NA=='}])).toThrow();
 expect(()=>validateTransferFiles([{name:'a',data:''},{name:'a/b',data:''}])).toThrow();
 expect(()=>validateTransferFiles([{name:'x',data:'NA=='},{name:'X',data:'NA=='}])).toThrow();
 expect(()=>validateTransferFiles([{name:'x',data:'invalid'}])).toThrow();
 expect(()=>validateTransferFiles(Array.from({length:257},(_,i)=>({name:String(i),data:''})))).toThrow();
 expect(validateTransferFiles([{name:'output/result.txt',data:'NA=='}])).toHaveLength(1);
 expect(wslPath('D:\\ultra-computer\\sandbox')).toBe('/mnt/d/ultra-computer/sandbox');
 expect(()=>wslPath('relative')).toThrow();
});
it('migrates the legacy default image and keeps OpenShell network policy closed',async()=>{
 const engine=new OpenShellSandbox();
 try {
  engine.updateConfig({image:'ultra-computer-sandbox:local'});
  expect(engine.getConfig().image).toBe('ultra-computer-openshell:local');
  expect(()=>engine.updateConfig({networkEnabled:true})).toThrow('policy denies');
 }finally{await engine.shutdown();}
});
