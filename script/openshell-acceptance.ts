import {OpenShellSandbox} from '../server/openShellSandbox.js';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {SANDBOX_DIR} from '../server/sandboxPaths.js';
const s=new OpenShellSandbox(),folder=path.join(SANDBOX_DIR,'.openshell-verification-'+randomUUID());
fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'input.txt'),'41',{flush:true});
const results:Array<Record<string,unknown>>=[];
const record=(name:string,ok:boolean,detail:unknown)=>{const r={name,status:ok?'Worked':'Failed',detail};results.push(r);console.log(JSON.stringify(r));if(!ok)throw new Error(name+' failed');};
try {
 record('authenticated-gateway',await s.isActive(),{});
 const result=await s.exec('receiving',`python3 -c "from pathlib import Path; n=int(Path('/workspace/input.txt').read_text()); Path('/workspace/output.txt').write_text(str(n+1)); print(n+1)"`,folder);
 record('windows-input-and-receiving-output',result.exitCode===0&&result.stdout.trim()==='42'&&fs.readFileSync(path.join(folder,'output.txt'),'utf8')==='42',result);
 const timeout=await s.exec('timeout','sleep 20',folder,1000);record('timeout-classification',timeout.timedOut&&timeout.exitCode===-1,timeout);
 await s.shutdown();
 const names=results.length;record('no-tracked-sessions',s.getStatus().activeContainers===0,{activeContainers:s.getStatus().activeContainers,checks:names});
}finally{await s.shutdown();}
