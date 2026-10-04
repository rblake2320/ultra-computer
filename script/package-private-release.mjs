import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { root, data } from "./private-runtime.mjs";

const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const sha256 = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
try {
  const commit = git(["rev-parse", "HEAD"]);
  const changes = git(["diff", "--name-only", "HEAD"]).split("\n").filter(name => name && name !== "reports/sbom.cdx.json");
  if (changes.length) throw new Error("Commit source changes before packaging a private release.");
  if (!fs.existsSync(path.join(root, "dist/index.cjs"))) throw new Error("Run npm run build before packaging.");
  if (!fs.existsSync(path.join(root, "reports/sbom.cdx.json"))) throw new Error("Run npm run sbom before packaging.");
  const directory = path.join(data, "release-build"); fs.mkdirSync(directory, { recursive: true });
  const staging = path.join(directory, randomBytes(8).toString("hex")); fs.mkdirSync(staging);
  const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  function copy(relative) {
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..") || /^(?:data|ipc|sandbox|node_modules|\.git)[/\\]/.test(relative) || (/^\.env(?:\.|$)/.test(path.basename(relative)) && path.basename(relative) !== ".env.example")) throw new Error("Private or invalid source path in release");
    const source = path.join(root, relative);
    if (fs.lstatSync(source).isSymbolicLink()) throw new Error("Linked source files cannot be packaged");
    const destination = path.join(staging, relative); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination);
  }
  for (const file of files) copy(file);
  function walk(directory, prefix = "dist") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("Linked build output cannot be packaged");
      const relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path.join(directory, entry.name), relative);
      else { files.push(relative); copy(relative); }
    }
  }
  walk(path.join(root, "dist"));
  const manifest = { version: 1, sourceCommit: commit, node: process.version,
    files: [...new Set(files)].sort().map(file => ({ path: file.replaceAll("\\", "/"), sha256: sha256(path.join(staging, file)) })) };
  fs.writeFileSync(path.join(staging, "release-manifest.json"), JSON.stringify(manifest, null, 2));
  const archive = path.resolve(process.argv[2] || path.join(directory, `ultra-computer-private-${commit.slice(0, 12)}.tar.gz`));
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  execFileSync("tar", ["-czf", archive, "-C", staging, "."], { cwd: root, windowsHide: true, stdio: "pipe", timeout: 90000 });
  console.log(JSON.stringify({ status: "Worked", sourceCommit: commit, files: manifest.files.length, archive, sha256: sha256(archive), bytes: fs.statSync(archive).size }));
  // Remove only this newly-created staging directory within the checked build root.
  if (path.dirname(fs.realpathSync(staging)) !== fs.realpathSync(directory)) throw new Error("Unexpected staging path; cleanup refused");
  fs.rmSync(staging, { recursive: true });
} catch (error) { console.error(error.message); process.exitCode = 1; }
