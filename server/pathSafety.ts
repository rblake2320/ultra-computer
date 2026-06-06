import fs from "fs";
import path from "path";

function withTrailingSeparator(dir: string): string {
  return dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`;
}

export function isPathInside(baseDir: string, targetPath: string): boolean {
  const base = path.resolve(baseDir);
  const target = path.resolve(targetPath);
  return target === base || target.startsWith(withTrailingSeparator(base));
}

export function resolveInside(baseDir: string, relativePath: string): string | null {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, relativePath);
  if (!isPathInside(base, resolved)) return null;

  try {
    const real = fs.realpathSync(resolved);
    if (!isPathInside(base, real)) return null;
  } catch {
    const parent = path.dirname(resolved);
    try {
      const realParent = fs.realpathSync(parent);
      if (!isPathInside(base, realParent)) return null;
    } catch {
      // Missing parent directories are created later under the resolved sandbox path.
    }
  }

  return resolved;
}
