import {execFile} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {DockerSandbox, type DockerSandboxConfig} from './dockerSandbox.js';
import {SANDBOX_DIR, resolveSandboxPath} from './sandboxPaths.js';
import {resolveInside} from './pathSafety.js';

function runFile(file: string, args: string[], options: Parameters<typeof execFile>[2]): Promise<{stdout:string;stderr:string}> {
  return new Promise((resolve,reject)=>{
    const child=execFile(file,args,options as any,(error,stdout,stderr)=>{
      if (error) { Object.assign(error,{stdout:String(stdout),stderr:String(stderr)}); reject(error); }
      else resolve({stdout:String(stdout),stderr:String(stderr)});
    });
    child.stdin?.end();
  });
}
const LIMIT = 8 * 1024 * 1024;
// Windows-mounted WSL files report st_blocks=0. The vendor's sparse-tar path
// can then upload nonempty files as zeros. Copy validated data by sequential
// reads to a private native-Linux staging directory before vendor upload.
const STAGE_UPLOAD = `import os,sys,stat,re,shutil
source,stage=sys.argv[1:]
if not re.fullmatch('/tmp/ultra-openshell-[a-f0-9-]{36}',stage): raise RuntimeError('Invalid staging path')
os.mkdir(stage,0o700)
dest=os.path.join(stage,os.path.basename(source)); os.mkdir(dest,0o700)
total=0; count=0
for root,dirs,files in os.walk(source,followlinks=False):
 for name in dirs+files:
  if stat.S_ISLNK(os.lstat(os.path.join(root,name)).st_mode): raise RuntimeError('Links cannot be staged')
 target=os.path.join(dest,os.path.relpath(root,source)); os.makedirs(target,mode=0o700,exist_ok=True)
 for name in files:
  p=os.path.join(root,name)
  if not stat.S_ISREG(os.lstat(p).st_mode): raise RuntimeError('Special files cannot be staged')
  with open(p,'rb') as f: content=f.read(8388609)
  total+=len(content); count+=1
  if total>8388608 or count>256: raise RuntimeError('Staging quota exceeded')
  with open(os.path.join(target,name),'xb') as f: f.write(content); f.flush(); os.fsync(f.fileno())`;
const REMOVE_STAGE = `import os,sys,re,shutil
p=sys.argv[1]
if not re.fullmatch('/tmp/ultra-openshell-[a-f0-9-]{36}',p) or os.path.islink(p): raise RuntimeError('Invalid staging cleanup path')
if os.path.exists(p): shutil.rmtree(p)`;
export function wslPath(value: string): string {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(value);
  if (!match || /[\r\n\0]/.test(value)) throw new Error('OpenShell requires an absolute local Windows path');
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\','/')}`;
}

export function validateTransferFiles(files: unknown): Array<{name: string; data: string}> {
  if (!Array.isArray(files) || files.length > 256) throw new Error('Sandbox transfer exceeds 256 files');
  const names = new Set<string>(); let bytes = 0;
  return files.map(file => {
    if (!file || typeof file.name !== 'string' || typeof file.data !== 'string'
      || !file.name || file.name.length > 1024 || /[\\:\0<>"|?*]/.test(file.name)
      || file.name.startsWith('/') || file.name.split('/').some((v: string)=> !v || /[. ]$/.test(v) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(v))
      || names.has(file.name.toLowerCase()) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data))
      throw new Error('Invalid sandbox transfer path or data');
    names.add(file.name.toLowerCase()); bytes += Buffer.from(file.data,'base64').length;
    if (bytes > LIMIT) throw new Error('Sandbox transfer exceeds 8 MiB');
    for (const name of names) if (name !== file.name.toLowerCase() && (name.startsWith(file.name.toLowerCase()+'/') || file.name.toLowerCase().startsWith(name+'/'))) throw new Error('Conflicting sandbox transfer paths');
    return {name:file.name,data:file.data};
  });
}

// JSON data crosses the trust boundary, never an archive extracted on the host.
const RECEIVE = `import os,json,base64,stat
out=[]; total=0
for root,dirs,files in os.walk('.',followlinks=False):
 for name in dirs+files:
  p=os.path.join(root,name); s=os.lstat(p)
  if stat.S_ISLNK(s.st_mode): raise RuntimeError('Sandbox links cannot be transferred')
 for name in files:
  p=os.path.join(root,name); s=os.lstat(p)
  if not stat.S_ISREG(s.st_mode): raise RuntimeError('Sandbox special files cannot be transferred')
  total+=s.st_size
  if total>8388608 or len(out)>=256: raise RuntimeError('Sandbox transfer quota exceeded')
  with open(p,'rb') as f: data=f.read(8388609)
  out.append({'name':os.path.relpath(p,'.'),'data':base64.b64encode(data).decode()})
print(json.dumps(out))`;

export class OpenShellSandbox extends DockerSandbox {
  private available: boolean | null = null;
  private sessions = new Map<string,{name:string; lastUsed:number}>();
  private serial: Promise<unknown> = Promise.resolve();
  private idleReaper: ReturnType<typeof setInterval>|null=null;
  private readonly owner = createHash('sha256').update(path.resolve(SANDBOX_DIR)).digest('hex').slice(0,16);
  private readonly processId = randomUUID();
  constructor() {
    super({image:'ultra-computer-openshell:local',networkEnabled:false});
    this.startIdleReaper();
  }
  private startIdleReaper() {
    if(this.idleReaper)return;
    this.idleReaper=setInterval(()=>{
      this.serial=this.serial.then(async()=>{
        for (const [id,state] of this.sessions) if (Date.now()-state.lastUsed>this.getConfig().idleTimeoutMs) await this.removeContainer(id);
      }).catch(()=>{ console.warn('[OpenShell] Idle cleanup failed; tracked sandboxes remain available for cleanup.'); });
    },30000);
    this.idleReaper.unref();
  }
  private async cli(args: string[], timeout = 15000, maxBuffer = 1024*1024, workingDir?:string) {
    if (process.platform !== 'win32') throw new Error('This OpenShell bridge requires Windows with WSL Ubuntu-24.04');
    const data = path.resolve(process.env.ULTRA_OPENSHELL_HOME || path.join(process.cwd(),'data','openshell'));
    const cli = process.env.ULTRA_OPENSHELL_CLI || path.join(data,'bin','openshell');
    const policy = path.resolve(process.cwd(),'policies','openshell.yaml');
    if (!fs.existsSync(cli) || !fs.existsSync(policy)) throw new Error('Run npm run setup:openshell first');
    return runFile('wsl.exe',['--distribution','Ubuntu-24.04',...(workingDir?['--cd',workingDir]:[]),'--exec','env',
      `XDG_CONFIG_HOME=${wslPath(path.join(data,'config'))}`,
      `OPENSHELL_LOCAL_TLS_DIR=${wslPath(path.join(data,'tls'))}`,
      wslPath(cli),'--gateway','ultra-computer','--color','never',...args],
      {shell:false,windowsHide:true,timeout,maxBuffer,env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,USERPROFILE:process.env.USERPROFILE}});
  }
  override async isDockerAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try { await this.cli(['sandbox','list','-o','json']); this.available=true; }
    catch { this.available=false; }
    return this.available;
  }
  override resetDetection() { this.available=null; }
  override updateConfig(partial: Partial<DockerSandboxConfig>) {
    if (partial.networkEnabled) throw new Error('OpenShell policy denies network access; update the reviewed policy to change it');
    super.updateConfig(partial.image==='ultra-computer-sandbox:local'?{...partial,image:'ultra-computer-openshell:local'}:partial);
  }
  override getStatus() {
    return {...super.getStatus(),engine:'NVIDIA OpenShell',dockerAvailable:this.available===true,
      activeContainers:this.sessions.size,containers:[...this.sessions.entries()].map(([sessionId,s])=>({
        sessionId,containerId:s.name,status:'ready',age:'',idleSince:`${Math.floor((Date.now()-s.lastUsed)/1000)}s`}))};
  }
  override async exec(sessionId: string, command: string, sandboxDir: string, timeoutMs?: number) {
    this.startIdleReaper();
    const work = async () => {
      const dir = resolveSandboxPath(sandboxDir);
      if (!dir) throw new Error('OpenShell workspace must stay inside the application sandbox');
      fs.mkdirSync(dir,{recursive:true});
      // Validate every outgoing file before OpenShell's upload path reads it.
      let bytes=0, count=0;
      const check = (current: string) => {
        for (const name of fs.readdirSync(current)) {
          const full=path.join(current,name), stat=fs.lstatSync(full);
          if (stat.isSymbolicLink()) throw new Error('Sandbox links cannot be transferred');
          if (stat.isDirectory()) check(full);
          else if (stat.isFile()) { bytes+=stat.size; count++; }
          else throw new Error('Sandbox special files cannot be transferred');
          if (bytes>LIMIT || count>256) throw new Error('Sandbox transfer quota exceeded');
        }
      }; check(dir);
      let state=this.sessions.get(sessionId);
      if (!state) {
        if (this.sessions.size >= this.getConfig().maxContainers) {
          const oldest=[...this.sessions.entries()].sort((a,b)=>a[1].lastUsed-b[1].lastUsed)[0];
          await this.removeContainer(oldest[0]);
        }
        const name=`uc-${createHash('sha256').update(this.owner+this.processId+sessionId).digest('hex').slice(0,16)}`;
        state={name,lastUsed:Date.now()}; this.sessions.set(sessionId,state);
        try { const r=await this.cli(['sandbox','create','--name',name,'--from',this.getConfig().image,
          '--cpu',this.getConfig().cpuLimit,'--memory',this.getConfig().memoryLimit.replace(/([kmgt])(?:i?b)?$/i,(_,unit:string)=>unit.toUpperCase()+'i'),
          '--policy',wslPath(path.resolve(process.cwd(),'policies','openshell.yaml')),
          '--label',`ultra-owner=${this.owner}`,'--label',`ultra-process=${this.processId}`,
          '--detach','--no-auto-providers','--no-tty','--approval-mode','manual','-o','json','--','/bin/sleep','infinity'],90000);
          if (JSON.parse(r.stdout).phase !== 'Ready') throw new Error('OpenShell sandbox did not become ready');
        } catch (error) { await this.removeContainer(sessionId); throw error; }
      }
      state.lastUsed=Date.now();
      const stage=`/tmp/ultra-openshell-${randomUUID()}`;
      const stageCommand=(script:string,args:string[])=>runFile('wsl.exe',['--distribution','Ubuntu-24.04','--exec','python3','-c',script,...args],
        {shell:false,windowsHide:true,timeout:30000,maxBuffer:1024*1024,env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,USERPROFILE:process.env.USERPROFILE}});
      try {
        await stageCommand(STAGE_UPLOAD,[wslPath(dir),stage]);
        await this.cli(['sandbox','upload','--no-git-ignore',state.name,'.','/workspace'],30000,1024*1024,`${stage}/${path.basename(dir)}`);
      } finally { await stageCommand(REMOVE_STAGE,[stage]); }
      const timeout=Math.ceil((timeoutMs || this.getConfig().execTimeoutMs)/1000);
      const prefix=['sandbox','exec','--name',state.name,'--no-tty','--no-login-shell','--workdir','/workspace','--timeout',String(timeout),'--'];
      let stdout='',stderr='',exitCode=0,timedOut=false;
      const encoded=Buffer.from(command,'utf8').toString('base64');
      try { const r=await this.cli([...prefix,'/bin/sh','-c',`echo ${encoded} | base64 -d | /bin/sh`],(timeout+5)*1000); stdout=r.stdout;stderr=r.stderr; }
      catch (error: any) {
        stdout=error.stdout || '';stderr=error.stderr || '';
        timedOut=Boolean(error.killed) || error.code===124 || /timed out|timeout/i.test(stderr);
        exitCode=Number.isInteger(error.code)?error.code:1;
        if (timedOut) { await this.removeContainer(sessionId); return {stdout,stderr,exitCode:-1,timedOut:true}; }
      }
      const received=await this.cli([...prefix,'python3','-c',RECEIVE],30000,LIMIT*2);
      const files=validateTransferFiles(JSON.parse(received.stdout));
      // Validate the entire manifest before writing any file. resolveInside checks existing symlinks.
      const targets=files.map(file=>({file,target:resolveInside(dir,file.name)}));
      if (targets.some(t=>!t.target)) throw new Error('Sandbox transfer escaped the workspace');
      for (const {file,target} of targets) {
        fs.mkdirSync(path.dirname(target!),{recursive:true});
        const safe=resolveInside(dir,file.name);
        if (!safe) throw new Error('Sandbox transfer escaped the workspace');
        const temporary=path.join(path.dirname(safe),`.openshell-${randomUUID()}.tmp`);
        fs.writeFileSync(temporary,Buffer.from(file.data,'base64'),{flag:'wx',mode:0o600,flush:true});
        fs.renameSync(temporary,safe);
      }
      return {stdout,stderr,exitCode,timedOut};
    };
    const result=this.serial.then(work); this.serial=result.catch(()=>{}); return result;
  }
  override async removeContainer(sessionId: string) {
    const state=this.sessions.get(sessionId); if (!state) return;
    await this.deleteSandbox(state.name);
    this.sessions.delete(sessionId);
  }
  private async deleteSandbox(name:string) {
    await this.cli(['sandbox','delete',name],15000);
    const deadline=Date.now()+30000;
    while(Date.now()<deadline) {
      try { await this.cli(['sandbox','get',name,'-o','json']); }
      catch(error:any) { if (/sandbox not found/i.test(error.stderr || '')) return; throw error; }
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    throw new Error('OpenShell deletion remained pending; sandbox cleanup is incomplete');
  }
  override async shutdown() { if(this.idleReaper)clearInterval(this.idleReaper); this.idleReaper=null; await this.serial; await Promise.all([...this.sessions.keys()].map(id=>this.removeContainer(id))); }
  override async recoverPrivateContainers() {
    if (process.env.ULTRA_PRIVATE_INSTALL !== '1' || !await this.isDockerAvailable()) return;
    const {stdout}=await this.cli(['sandbox','list','-o','json']);
    for (const s of JSON.parse(stdout).sandboxes || []) if (s.labels?.['ultra-owner']===this.owner && /^uc-[a-f0-9]{16}$/.test(s.name)) await this.deleteSandbox(s.name);
  }
}
