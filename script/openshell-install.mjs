import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root,data,loadConfig} from './private-runtime.mjs';
const VERSION='0.1.2';
const CLI_SHA='7eb6917285331a09e3300266a0558616481a5e9927cae2612ea07c4045b6dd6f';
const GATEWAY='ghcr.io/nvidia/openshell/gateway@sha256:2fe4dad9118e14ab80a8258b545ea6e6cd74c3469e24ad4e6610f964d98913a2';
const dir=path.join(data,'openshell');
const wsl=value=>{const m=/^([A-Za-z]):[\\/](.*)$/.exec(value);if(!m)throw new Error('Absolute Windows path required');return `/mnt/${m[1].toLowerCase()}/${m[2].replaceAll('\\','/')}`;};
function run(file,args,timeout=90000){return execFileSync(file,args,{cwd:root,shell:false,windowsHide:true,timeout,encoding:'utf8',maxBuffer:1024*1024});}
function cli(args){return run('wsl.exe',['-d','Ubuntu-24.04','--exec','env',`XDG_CONFIG_HOME=${wsl(path.join(dir,'config'))}`,`OPENSHELL_LOCAL_TLS_DIR=${wsl(path.join(dir,'tls'))}`,wsl(path.join(dir,'bin','openshell')),...args]);}
try {
 const config=loadConfig();
 if(process.platform!=='win32')throw new Error('This installer supports Windows with WSL Ubuntu-24.04 and Docker Desktop');
 run('wsl.exe',['-d','Ubuntu-24.04','--exec','true']); run('docker',['info','--format','{{.ServerVersion}}']);
 fs.mkdirSync(path.join(dir,'bin'),{recursive:true,mode:0o700});
 const user=run('whoami',[]).trim();run('icacls',[dir,'/inheritance:r','/grant:r',`${user}:(OI)(CI)F`]);
 const archive=path.join(dir,'openshell.tar.gz');
 if(!fs.existsSync(archive)) {
  const url=`https://github.com/NVIDIA/OpenShell/releases/download/v${VERSION}/openshell-x86_64-unknown-linux-musl.tar.gz`;
  const response=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error(`CLI download failed HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==CLI_SHA)throw new Error('OpenShell archive digest mismatch');
  fs.writeFileSync(archive,bytes,{flag:'wx',mode:0o600});
 }
 if(createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==CLI_SHA)throw new Error('OpenShell archive digest mismatch');
 run('tar',['-xzf',archive,'-C',path.join(dir,'bin'),'openshell']);
 run('docker',['pull',GATEWAY]);
 for(const image of ['ghcr.io/nvidia/openshell/sandbox@sha256:bf4797b6c511f2d8ba02955dbba4bf76c1f0dd6d83531420c5408d5f1fb9d72f','ghcr.io/nvidia/openshell/supervisor@sha256:d7b5264bb6bc56f4796e6fa3617b8e4a8d785be0b7293542efd8cc250b0fb67a'])run('docker',['pull',image]);
 run('docker',['build','-f','Dockerfile.sandbox','-t','ultra-computer-sandbox:local','.'],300000);
 run('docker',['build','-f','Dockerfile.openshell','-t','ultra-computer-openshell:local','.']);
 // Generate only when absent; never rotate certificates used by a running gateway.
 if(!fs.existsSync(path.join(dir,'tls','ca.crt')))run('docker',['run','--rm','--user','0','-v','/var/lib/ultra-computer-openshell:/var/lib/ultra-computer-openshell','-e','XDG_CONFIG_HOME=/var/lib/ultra-computer-openshell/config',GATEWAY,'generate-certs','--output-dir','/var/lib/ultra-computer-openshell/tls','--server-san','host.openshell.internal','--server-san','127.0.0.1']);
 run('docker',['compose','-p','ultra-computer-openshell','-f','docker-compose.openshell.yml','up','-d']);
 fs.mkdirSync(path.join(dir,'tls'),{recursive:true,mode:0o700});
 run('docker',['cp','ultra-computer-openshell-gateway-1:/var/lib/ultra-computer-openshell/tls/.',path.join(dir,'tls')]);
 run('icacls',[dir,'/inheritance:r','/grant:r',`${user}:(OI)(CI)F`]);
 cli(['gateway','add','https://127.0.0.1:5671','--local','--name','ultra-computer']);
 // Readiness requires authenticated gRPC, not just an HTTP health page.
 let ready=false;
 for(let i=0;i<10;i++){try{cli(['--gateway','ultra-computer','sandbox','list','-o','json']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 if(!ready)throw new Error('OpenShell authenticated gateway did not become ready');
 config.sandboxEngine='openshell';
 const filename=path.join(data,'private-install.json'), temp=filename+'.'+randomUUID()+'.openshell.tmp';
 fs.writeFileSync(temp,JSON.stringify(config,null,2),{flag:'wx',mode:0o600,flush:true});fs.renameSync(temp,filename);
 run('icacls',[filename,'/inheritance:r','/grant:r',`${user}:F`]);
 fs.writeFileSync(path.join(dir,'installation.json'),JSON.stringify({version:VERSION,cliArchiveSha256:CLI_SHA,gatewayImage:GATEWAY,endpoint:'https://127.0.0.1:5671',authentication:'mTLS',networkPolicy:'deny',landlock:'hard_requirement'},null,2),{mode:0o600});
 console.log('Worked: pinned NVIDIA OpenShell, authenticated local gateway and offline policy. Restart the private service to activate.');
}catch(error){console.error(error.message);process.exitCode=1;}
