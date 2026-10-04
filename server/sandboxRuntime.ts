import {dockerSandbox as docker} from './dockerSandbox.js';
import {OpenShellSandbox} from './openShellSandbox.js';
// An explicitly selected unavailable runtime fails closed; there is no silent downgrade.
export const dockerSandbox = process.env.ULTRA_SANDBOX_ENGINE === 'openshell' ? new OpenShellSandbox() : docker;
