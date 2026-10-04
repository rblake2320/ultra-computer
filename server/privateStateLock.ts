import Database from "better-sqlite3";
import path from "node:path";

/** Held for the private process lifetime; OS releases it even after SIGKILL. */
export function acquirePrivateStateLock(): (() => void) | null {
  if (process.env.ULTRA_PRIVATE_INSTALL !== "1") return null;
  const filename = path.resolve(process.env.DATABASE_PATH || "data/ultra_computer.db") + ".ownership.db";
  const lock = new Database(filename);
  lock.pragma("busy_timeout = 100");
  try { lock.exec("BEGIN EXCLUSIVE"); }
  catch { lock.close(); throw new Error("Private state is in use by another app or backup operation. Stop that operation before starting."); }
  return () => { lock.exec("ROLLBACK"); lock.close(); };
}
