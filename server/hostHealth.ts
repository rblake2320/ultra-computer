import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';

const runFile = promisify(execFile);
const finite = z.number().finite().nonnegative();
const label = z.string().min(1).max(160);
const diskSchema = z.object({name: label, totalBytes: finite, freeBytes: finite});
const processSchema = z.object({pid: finite.int(), name: label, residentBytes: finite});
const platformSchema = z.object({disks: z.array(diskSchema).max(64), processes: z.array(processSchema).max(12), processCount: finite.int()});
type PlatformMetrics = z.infer<typeof platformSchema>;
type Probe<T> = {status: 'Worked'; data: T} | {status: 'Unavailable'; reason: string};
type GPU = {name: string; utilizationPercent: number | null; memoryUsedMiB: number | null; memoryTotalMiB: number | null; temperatureC: number | null};
type LoadedModel = {name: string; sizeBytes: number; vramBytes: number};
export interface HostHealthSnapshot {
  version: 1;
  capturedAt: string;
  scope: string;
  cpu: Probe<{model: string; logicalCpus: number; utilizationPercent: number; sampleMs: number}>;
  ram: Probe<{totalBytes: number; usedBytes: number; freeBytes: number}>;
  gpu: Probe<GPU[]>;
  platform: Probe<PlatformMetrics>;
  ollama: Probe<LoadedModel[]>;
}

// No commands, paths, URLs, process filters, or environment names come from agents.
async function fixedCommand(file: string, args: string[]): Promise<string> {
  const result = await runFile(file, args, {shell: false, windowsHide: true, timeout: 5000, maxBuffer: 256 * 1024, encoding: 'utf8'});
  return result.stdout;
}
async function probe<T>(operation: () => Promise<T>, reason: string): Promise<Probe<T>> {
  try { return {status: 'Worked', data: await operation()}; }
  catch { return {status: 'Unavailable', reason}; }
}
function safeLabel(value: string): string {
  return value.replace(/[\x00-\x1f\x7f`|<>]/g, '').trim().slice(0, 160) || 'unknown';
}
export function cpuUtilization(before: os.CpuInfo[], after: os.CpuInfo[]): number {
  if (!before.length || before.length !== after.length) throw new Error('CPU sample unavailable');
  let idle = 0, total = 0;
  for (let i = 0; i < before.length; i++) {
    idle += after[i].times.idle - before[i].times.idle;
    total += Object.values(after[i].times).reduce((sum, value) => sum + value, 0) - Object.values(before[i].times).reduce((sum, value) => sum + value, 0);
  }
  if (total <= 0 || idle < 0 || idle > total) throw new Error('Invalid CPU sample');
  return Math.round((1 - idle / total) * 1000) / 10;
}
export function parseGPU(stdout: string): GPU[] {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length || lines.length > 32) throw new Error('Missing or excessive GPU records');
  return lines.map(line => {
    const fields = line.split(',').map(field => field.trim());
    if (fields.length !== 5) throw new Error('Malformed GPU record');
    const number = (text: string, max = Number.MAX_SAFE_INTEGER) => {
      if (text === 'N/A' || text === '[N/A]' || text === '[Not Supported]') return null;
      const parsed = Number(text);
      if (!text || !Number.isFinite(parsed) || parsed < 0 || parsed > max) throw new Error('Invalid GPU metric');
      return parsed;
    };
    return {name: safeLabel(fields[0]), utilizationPercent: number(fields[1], 100), memoryUsedMiB: number(fields[2]), memoryTotalMiB: number(fields[3]), temperatureC: number(fields[4], 150)};
  });
}
export function parsePlatform(value: unknown): PlatformMetrics {
  const parsed = platformSchema.parse(value);
  if (parsed.disks.some(disk => disk.freeBytes > disk.totalBytes)) throw new Error('Invalid free disk space');
  return {...parsed, disks: parsed.disks.map(disk => ({...disk, name: safeLabel(disk.name)})), processes: parsed.processes.map(item => ({...item, name: safeLabel(item.name)}))};
}
async function platformMetrics(): Promise<PlatformMetrics> {
  if (process.platform === 'win32') {
    const script = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $d=@(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType = 3' | ForEach-Object { @{name=$_.DeviceID;totalBytes=[double]$_.Size;freeBytes=[double]$_.FreeSpace} }); $p=@(Get-Process); $top=@($p | Sort-Object WorkingSet64 -Descending | Select-Object -First 12 | ForEach-Object { @{pid=$_.Id;name=$_.ProcessName;residentBytes=[double]$_.WorkingSet64} }); @{disks=$d;processes=$top;processCount=$p.Count} | ConvertTo-Json -Depth 4 -Compress";
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    return parsePlatform(JSON.parse(await fixedCommand(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script])));
  }
  const disks = await Promise.all([...new Set(['/', process.cwd()])].map(async name => {
    const stat = await fs.statfs(name);
    return {name, totalBytes: stat.blocks * stat.bsize, freeBytes: stat.bavail * stat.bsize};
  }));
  // comm exposes process names only: never command lines, env, credentials or owners.
  const stdout = await fixedCommand('/bin/ps', ['-A', '-o', 'pid=,rss=,comm=']);
  const processes = stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    if (!match) throw new Error('Malformed process metrics');
    return {pid: Number(match[1]), residentBytes: Number(match[2]) * 1024, name: safeLabel(path.basename(match[3]))};
  });
  return parsePlatform({disks, processCount: processes.length, processes: processes.sort((a,b) => b.residentBytes-a.residentBytes).slice(0,12)});
}
export function parseLoadedModels(value: unknown): LoadedModel[] {
  const record = z.object({models: z.array(z.object({name: label, size: finite, size_vram: finite})).max(64)}).parse(value);
  return record.models.map(model => ({name: safeLabel(model.name), sizeBytes: model.size, vramBytes: model.size_vram}));
}
async function loadedModels(): Promise<LoadedModel[]> {
  const response = await fetch('http://127.0.0.1:11434/api/ps', {redirect: 'error', signal: AbortSignal.timeout(3000)});
  if (!response.ok || !response.body) throw new Error('Ollama unavailable');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 64 * 1024) throw new Error('Ollama response exceeds limit');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel(); }
  return parseLoadedModels(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}
export async function collectHostHealth(): Promise<HostHealthSnapshot> {
  const before = os.cpus(), started = Date.now();
  const [cpu, gpu, platform, ollama] = await Promise.all([
    probe(async () => {await delay(300); return {model: safeLabel(before[0]?.model || 'unknown'), logicalCpus: before.length, utilizationPercent: cpuUtilization(before, os.cpus()), sampleMs: Date.now()-started};}, 'CPU utilization sample unavailable.'),
    probe(async () => parseGPU(await fixedCommand('nvidia-smi', ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits'])), 'NVIDIA metrics unavailable: driver/tool absent, unsupported or timed out.'),
    probe(platformMetrics, 'Disk/process metrics unavailable: access denied, unsupported response or timed out.'),
    probe(loadedModels, 'Local Ollama /api/ps unavailable, invalid or timed out. No loaded-model claim is made.'),
  ]);
  const total = os.totalmem(), free = os.freemem();
  const ram: HostHealthSnapshot['ram'] = total > 0 && free >= 0 && free <= total ? {status: 'Worked', data: {totalBytes: total, usedBytes: total-free, freeBytes: free}} : {status: 'Unavailable', reason: 'Physical memory readings unavailable.'};
  const inContainer = await fs.access('/.dockerenv').then(() => true, () => false);
  return {version: 1, capturedAt: new Date().toISOString(), scope: inContainer ? 'Application container/runtime; these readings are not a physical-host report.' : 'Machine running Ultra Computer (outside the command sandbox)', cpu, ram, gpu, platform, ollama};
}
let pending: Promise<HostHealthSnapshot> | undefined;
let cached: HostHealthSnapshot | undefined;
let expires = 0;
export async function getHostHealth(): Promise<HostHealthSnapshot> {
  if (cached && Date.now() < expires) return cached;
  if (!pending) pending = collectHostHealth().then(snapshot => {cached = snapshot; expires = Date.now()+2000; return snapshot;}).finally(() => {pending = undefined;});
  return pending;
}

// Only standalone diagnostic requests use the zero-model path. Instructions to
// explain, code, mutate, or do a second action stay in the normal agent workflow.
export function isHostHealthRequest(input: string): boolean {
  if (input.length > 700 || /[\n`]|\b(?:explain|how|why|write|create|install|delete|kill|restart|stop|unload|then|after|script|sandbox)\b|https?:/i.test(input)) return false;
  const words = input.toLowerCase().replace(/[.,!?;:()/-]/g, ' ').split(/\s+/).filter(Boolean);
  const allowed = new Set('please can could would what is are you i my me give show get run check report full complete current live real actual host machine system computer ultra health status diagnostics diagnostic snapshot metrics cpu utilization usage physical ram memory gpu vram disk space free remaining process processes list active running loaded loading ollama model models and the a an of for on including covering with'.split(' '));
  return words.length > 1 && words.every(word => allowed.has(word)) && (/\b(?:host|system|machine|computer)\b/i.test(input) && /\b(?:health|metrics|diagnostics|status)\b/i.test(input) || /\b(?:cpu|ram|gpu|disk)\b/i.test(input) && /\b(?:report|metrics|health|status|usage|utilization)\b/i.test(input) || /\b(?:loaded|loading|active|running)\b/i.test(input) && /\bollama\b/i.test(input));
}
export function needsHostHealthEvidence(input: string): boolean {
  if (isHostHealthRequest(input) || /\bhost_health\b/i.test(input)) return true;
  const normalized = input.slice(0,16000).trim().toLowerCase().split(/\s+/).join(' ');
  if (/^(?:explain|define)\b|^what (?:is|are) (?:(?:a|an|the) )?(?:cpu|ram|gpu)\??$/.test(normalized)) return false;
  const subject = /\b(?:cpu|ram|gpu|vram|disk\s+space|system\s+health|host\s+health|loaded\s+(?:ollama\s+)?models|ollama\s+models)\b/i.test(input);
  return subject && /\b(?:my|this|current|live|actual|available|remaining|using|usage|utilization|loaded|running|check|report)\b/i.test(input);
}
export function formatHostHealth(snapshot: HostHealthSnapshot): string {
  const gib = (bytes: number) => (bytes / 1024 ** 3).toFixed(2)+' GiB';
  const metric = (value: number | null, unit: string) => value === null ? 'Unavailable' : value+unit;
  const lines = [`System health snapshot — ${snapshot.capturedAt}`, snapshot.scope+'.'];
  lines.push(snapshot.cpu.status === 'Worked' ? `CPU: ${snapshot.cpu.data.utilizationPercent}% utilization (${snapshot.cpu.data.sampleMs} ms sample), ${snapshot.cpu.data.logicalCpus} logical CPUs; ${snapshot.cpu.data.model}.` : `CPU: Unavailable — ${snapshot.cpu.reason}`);
  lines.push(snapshot.ram.status === 'Worked' ? `RAM: ${gib(snapshot.ram.data.usedBytes)} used / ${gib(snapshot.ram.data.totalBytes)} total; ${gib(snapshot.ram.data.freeBytes)} free.` : `RAM: Unavailable — ${snapshot.ram.reason}`);
  if (snapshot.gpu.status === 'Worked') for (const gpu of snapshot.gpu.data) lines.push(`GPU: ${gpu.name}; utilization ${metric(gpu.utilizationPercent,'%')}; VRAM ${metric(gpu.memoryUsedMiB,' MiB')} used / ${metric(gpu.memoryTotalMiB,' MiB')} total; temperature ${metric(gpu.temperatureC,' °C')}.`);
  else lines.push(`GPU: Unavailable — ${snapshot.gpu.reason}`);
  if (snapshot.platform.status === 'Worked') {
    for (const disk of snapshot.platform.data.disks) lines.push(`Disk ${disk.name} — ${gib(disk.freeBytes)} free / ${gib(disk.totalBytes)} total.`);
    lines.push(`Processes: ${snapshot.platform.data.processCount} observed; top ${snapshot.platform.data.processes.length} by resident RAM (names/PIDs only):`);
    for (const item of snapshot.platform.data.processes) lines.push(`- ${item.name} (PID ${item.pid}): ${gib(item.residentBytes)}`);
  } else lines.push(`Disk/processes: Unavailable — ${snapshot.platform.reason}`);
  if (snapshot.ollama.status === 'Worked') {
    lines.push(`Loaded Ollama models: ${snapshot.ollama.data.length}.`);
    for (const model of snapshot.ollama.data) lines.push(`- ${model.name}: ${gib(model.sizeBytes)} model memory; ${gib(model.vramBytes)} VRAM.`);
  } else lines.push(`Loaded Ollama models: Unavailable — ${snapshot.ollama.reason}`);
  return lines.join('\n\n');
}
