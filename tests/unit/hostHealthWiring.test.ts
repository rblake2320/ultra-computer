import {expect, it} from 'vitest';
import {TOOL_SCHEMAS} from '../../server/tools.js';
import {evaluatePolicy} from '../../server/policyEngine.js';

it('makes read-only host health visible and governed without permitting arbitrary host tools', () => {
  expect(TOOL_SCHEMAS.find(tool => tool.name === 'host_health')).toMatchObject({parameters: {properties: {}, required: []}});
  expect(evaluatePolicy({domain: 'tool', action: 'tool:execute', tool: 'host_health'}).allowed).toBe(true);
  for (const tool of ['host_shell', 'env_list', 'process_kill']) {
    expect(evaluatePolicy({domain: 'tool', action: 'tool:execute', tool}).allowed).toBe(false);
  }
});
