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
    // Walk to the nearest existing ancestor. Checking only the immediate parent
    // misses a symlink escape when one or more requested child directories do
    // not exist yet.
    let ancestor = path.dirname(resolved);
    while (isPathInside(base, ancestor)) {
      try {
        const realAncestor = fs.realpathSync(ancestor);
        if (!isPathInside(base, realAncestor)) return null;
        break;
      } catch {
        const parent = path.dirname(ancestor);
        if (parent === ancestor) return null;
        ancestor = parent;
      }
    }
  }

  return resolved;
}
