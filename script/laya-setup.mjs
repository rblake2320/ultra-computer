import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const venv = path.join(root, "data/laya-venv");
const python = path.join(venv, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const env = { ...process.env, USE_TF: "0", HF_HOME: path.join(root, "data/laya-cache"), PYTHONNOUSERSITE: "1" };
function run(executable, args) { execFileSync(executable, args, { cwd: root, env, stdio: "inherit", windowsHide: true }); }
try {
  if (process.argv[2] === "setup") {
    run(process.env.ULTRA_PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-m", "venv", venv]);
    run(python, ["-m", "pip", "install", "torch==2.7.1", "--index-url", "https://download.pytorch.org/whl/cpu"]);
    run(python, ["-m", "pip", "install", "laya==0.3.20", "transformers==5.18.0", "huggingface-hub==1.33.0", "numpy==2.5.3"]);
    run(python, ["-m", "pip", "check"]);
  }
  if (!fs.existsSync(python)) throw new Error("Laya is optional and not installed. Run npm run setup:laya (Python 3.12 recommended).");
  run(python, ["script/laya-diagnostics.py", ...process.argv.slice(3)]);
} catch (error) { console.error(error.message); process.exitCode = 1; }
