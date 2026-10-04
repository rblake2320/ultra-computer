import { execFileSync } from "node:child_process";
// npm ls otherwise resolves optional metadata over the network on some npm 11
// releases. The lockfile is the complete source for this reproducible SBOM.
execFileSync(process.execPath, ["node_modules/@cyclonedx/cyclonedx-npm/bin/cyclonedx-npm-cli.js",
  "--package-lock-only", "--output-reproducible", "--output-file", "reports/sbom.cdx.json"], {
  env: { ...process.env, npm_config_offline: "true" }, stdio: "inherit", windowsHide: true, timeout: 60000,
});
