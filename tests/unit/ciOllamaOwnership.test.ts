import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {load} from 'js-yaml';
import {expect,it} from 'vitest';
it('rejects an occupied model port even when another daemon responds as healthy',()=>{
 const workflow=load(fs.readFileSync('.github/workflows/ci.yml','utf8')) as any;
 const startup=workflow.jobs['core-e2e'].steps.find((s:any)=>s.name==='Start Ollama and pull the bounded test model').run;
 // All service/network operations are fixture functions; no host daemon or
 // socket is touched. Execute the actual workflow shell body on both platforms.
 const fixture=`sudo(){ return 0; }
ss(){ echo 'fixture competing listener'; }
ollama(){ echo 'unexpected model process'; return 0; }
curl(){ echo '{"version":"0.32.0","models":[]}'; return 0; }
jq(){ cat >/dev/null; return 0; }
${startup}`;
 const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
 const result=spawnSync(bash,['-c',fixture],{encoding:'utf8',windowsHide:true,timeout:5000});
 expect(result.error).toBeUndefined();
 expect(result.status).toBe(1);
 expect(result.stdout).toContain('Ollama test port is already occupied');
 expect(result.stdout).not.toContain('unexpected model process');
 const retained=workflow.jobs['core-e2e'].steps.find((s:any)=>s.name==='Retain private installation and recovery diagnostics').with.path;
 expect(retained).toContain('test-results/**/error-context.md');
});
