import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';

it('actually invokes artifact verification through a Windows junction or POSIX alias', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'ultra-release-alias-'));
  const runtime = path.join(temporary,'runtime');
  const alias = path.join(temporary,'alias');
  fs.mkdirSync(path.join(runtime,'script'),{recursive:true});
  fs.copyFileSync(path.resolve('script/verify-private-release.mjs'),path.join(runtime,'script/verify-private-release.mjs'));
  fs.writeFileSync(path.join(runtime,'script/private-runtime.mjs'),'import {fileURLToPath} from "node:url"; import path from "node:path"; export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");');
  fs.symlinkSync(runtime,alias,process.platform==='win32'?'junction':'dir');
  try {
    // A packaged install with a missing manifest must fail, including via alias.
    const missing=spawnSync(process.execPath,[path.join(alias,'script/verify-private-release.mjs')],{encoding:'utf8',timeout:10000,windowsHide:true});
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('No release manifest');
    fs.writeFileSync(path.join(runtime,'release-manifest.json'),'{}');
    const invalid=spawnSync(process.execPath,[path.join(alias,'script/verify-private-release.mjs')],{encoding:'utf8',timeout:10000,windowsHide:true});
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('Invalid release manifest');
    const source=path.join(runtime,'proof.txt');fs.writeFileSync(source,'original');
    fs.writeFileSync(path.join(runtime,'release-manifest.json'),JSON.stringify({version:1,sourceCommit:'a'.repeat(40),files:[{path:'proof.txt',sha256:createHash('sha256').update('original').digest('hex')}]}));
    const valid=spawnSync(process.execPath,[path.join(alias,'script/verify-private-release.mjs')],{encoding:'utf8',timeout:10000,windowsHide:true});
    expect(valid.status).toBe(0);expect(valid.stdout).toContain('Worked: release source');
    fs.writeFileSync(source,'tampered');
    const tampered=spawnSync(process.execPath,[path.join(alias,'script/verify-private-release.mjs')],{encoding:'utf8',timeout:10000,windowsHide:true});
    expect(tampered.status).toBe(1);expect(tampered.stderr).toContain('Release source integrity failed');
  } finally {
    // Unlink the alias itself; never recursively delete a junction target.
    fs.unlinkSync(alias);
    if(path.dirname(fs.realpathSync(temporary))!==fs.realpathSync(os.tmpdir()))throw new Error('Unexpected temporary root');
    fs.rmSync(temporary,{recursive:true});
  }
});
