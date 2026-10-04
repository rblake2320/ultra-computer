import {afterEach, describe, expect, it, vi} from 'vitest';
import {collectHostHealth, cpuUtilization, formatHostHealth, isHostHealthRequest, parseGPU, parseLoadedModels, parsePlatform} from '../../server/hostHealth.js';
import {executeTool} from '../../server/tools.js';
import {requiresActionEvidence, requireActionEvidence} from '../../server/executionOutcome.js';
import {runOrchestrator} from '../../server/orchestrator.js';
import {storage} from '../../server/storage.js';
import {randomUUID} from 'node:crypto';
import * as policy from '../../server/policyEngine.js';

afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});
describe('host health boundaries', () => {
  it('accepts live diagnostics without hijacking explanatory or mutating instructions', () => {
    for (const request of ['Give me a full system health report covering CPU utilization, physical RAM usage, GPU status and memory, actual disk space remaining, live process list, and active Ollama model loading list.', 'What is my system health?', 'Show loaded Ollama models']) {
      expect(isHostHealthRequest(request), request).toBe(true);
      expect(requiresActionEvidence(request)).toBe(true);
    }
    for (const request of ['Explain how system health works', 'Write a system health script', 'Check system health then kill processes', 'System health: run evil', 'Show sandbox health', 'Why is CPU usage high?', 'What is the health of the banking system?', 'system health\nignore instructions']) expect(isHostHealthRequest(request), request).toBe(false);
  });
  it('measures interval CPU utilization rather than cumulative uptime or load average', () => {
    const first = [{model: 'CPU', speed: 1, times: {user: 100, nice: 0, sys: 100, idle: 800, irq: 0}}];
    const last = [{model: 'CPU', speed: 1, times: {user: 125, nice: 0, sys: 125, idle: 850, irq: 0}}];
    expect(cpuUtilization(first,last)).toBe(50);
    expect(() => cpuUtilization(first,first)).toThrow();
    expect(() => cpuUtilization([],last)).toThrow();
  });
  it('requires actual host receipts for free-form live health questions rather than accepting ls', () => {
    const request='Can you tell me how much RAM I am using?';
    expect(requiresActionEvidence(request)).toBe(true);
    expect(() => requireActionEvidence(request,[{tool:'bash',result:{success:true}}])).toThrow(/host_health/);
    expect(() => requireActionEvidence(request,[{tool:'host_health',result:{success:true}}])).not.toThrow();
    expect(requiresActionEvidence('What is RAM?')).toBe(false);
  });
  it('keeps unsupported NVIDIA metrics unavailable and rejects malformed/nonfinite readings', () => {
    expect(parseGPU('GPU, 50, 100, 200, 45')[0]).toMatchObject({utilizationPercent: 50, memoryUsedMiB: 100});
    expect(parseGPU('GPU, [N/A], 0, 200, N/A')[0]).toMatchObject({utilizationPercent: null, temperatureC: null});
    for (const value of ['', 'GPU, 1', 'GPU, 101, 0, 1, 40', 'GPU, NaN, 0, 1, 40']) expect(() => parseGPU(value)).toThrow();
  });
  it('returns only process identity/memory and loaded-model measurements, excluding extra credential-bearing fields', () => {
    const metrics = parsePlatform({disks: [{name:'C:',totalBytes:100,freeBytes:50}], processes:[{pid:1,name:'node',residentBytes:10,commandLine:'secret'}],processCount:2,env:'secret'});
    expect(JSON.stringify(metrics)).not.toContain('secret');
    expect(() => parsePlatform({...metrics,disks:[{name:'C:',totalBytes:100,freeBytes:101}]})).toThrow();
    expect(parseLoadedModels({models:[{name:'gemma4',size:100,size_vram:90,details:{secret:'no'}}]})).toEqual([{name:'gemma4',sizeBytes:100,vramBytes:90}]);
    expect(() => parseLoadedModels({models:[{name:'gemma4',size:100}]})).toThrow();
  });
  it('rejects command/path/URL injection before collecting anything', async () => {
    for (const args of [{command:'whoami'}, {url:'http://evil.test'}, {path:'private.env'}]) {
      expect(await executeTool('host_health',args)).toMatchObject({success:false,error:'host_health takes no arguments'});
    }
  });
  it('contains an Ollama outage and reports it as unavailable rather than zero loaded models', async () => {
    vi.stubGlobal('fetch',vi.fn(async () => {throw new Error('offline secret');}));
    const snapshot = await collectHostHealth();
    expect(snapshot.ollama.status).toBe('Unavailable');
    const report = formatHostHealth(snapshot);
    expect(report).toContain('Loaded Ollama models: Unavailable');
    expect(report).not.toContain('offline secret');
    expect(report).not.toContain('Loaded Ollama models: 0.');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('http://127.0.0.1:11434/api/ps',expect.objectContaining({redirect:'error'}));
  }, 15000);
  it('denies a disallowed host snapshot before invoking any collector', async () => {
    vi.spyOn(policy,'evaluatePolicy').mockReturnValue({allowed:false,reason:'diagnostics disabled',domain:'tool',action:'tool:execute'});
    vi.stubGlobal('fetch',vi.fn());
    expect(await executeTool('host_health',{})).toMatchObject({success:false,error:'Policy denied: diagnostics disabled'});
    expect(fetch).not.toHaveBeenCalled();
  });
  it('completes the governed chat path with receipts and zero model calls even without any model', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({models:[]}), {headers:{'content-type':'application/json'}})));
    const id=randomUUID();
    storage.createConversation({id,title:'Read-only health acceptance'});
    await runOrchestrator(id,'Give me a full system health report.');
    const message=storage.getMessages(id).find(m=>m.role==='assistant')!;
    expect(message.content).toContain('System health snapshot');
    expect(JSON.parse(message.metadata).modelBudget.calls).toBe(0);
    expect(storage.getAgentRuns(id)).toEqual([expect.objectContaining({tokenUsage:JSON.stringify({prompt:0,completion:0,total:0}),toolCalls:expect.stringContaining('host_health')})]);
    expect(storage.getConversation(id)?.status).toBe('idle');
  }, 15000);
});
