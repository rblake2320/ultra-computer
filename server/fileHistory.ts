/**
 * fileHistory.ts
 *
 * File history and undo/redo snapshot system for Ultra Computer.
 * Inspired by Claude Code's file history tracking, this module maintains
 * before/after snapshots of every file modification made by the agent,
 * enabling instant rollback if an agent makes a mistake.
 *
 * Features:
 *   - Automatic snapshot on every file write/edit
 *   - Per-file version history with configurable depth
 *   - Undo/redo operations per file or per batch
 *   - Diff generation between snapshots
 *   - Batch grouping (all files changed in a single tool call)
 *
 * @module fileHistory
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single snapshot of a file's content. */
export interface FileSnapshot {
  /** Unique snapshot ID. */
  id: string;
  /** Absolute file path. */
  filePath: string;
  /** Content hash (SHA-256) for deduplication. */
  contentHash: string;
  /** File content at the time of snapshot. */
  content: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** When this snapshot was taken. */
  timestamp: string;
  /** Batch ID if part of a multi-file operation. */
  batchId?: string;
  /** Description of the operation that created this snapshot. */
  operation: string;
  /** Whether this is a "before" or "after" snapshot. */
  type: "before" | "after";
}

/** A file change record linking before and after snapshots. */
export interface FileChange {
  /** Unique change ID. */
  id: string;
  /** Absolute file path. */
  filePath: string;
  /** Before snapshot ID (null if file was created). */
  beforeSnapshotId: string | null;
  /** After snapshot ID (null if file was deleted). */
  afterSnapshotId: string | null;
  /** Batch ID for grouping. */
  batchId: string;
  /** Operation description. */
  operation: string;
  /** When this change was recorded. */
  timestamp: string;
  /** Whether this change has been undone. */
  undone: boolean;
}

/** A batch of related file changes. */
export interface ChangeBatch {
  /** Unique batch ID. */
  id: string;
  /** Description of the batch operation. */
  description: string;
  /** File changes in this batch. */
  changes: FileChange[];
  /** When this batch was created. */
  timestamp: string;
  /** Whether this entire batch has been undone. */
  undone: boolean;
}

/** Diff between two versions of a file. */
export interface FileDiff {
  filePath: string;
  beforeHash: string | null;
  afterHash: string | null;
  linesAdded: number;
  linesRemoved: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  startLine: number;
  endLine: number;
  type: "add" | "remove" | "change";
  content: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface FileHistoryConfig {
  /** Maximum snapshots per file. */
  maxSnapshotsPerFile: number;
  /** Maximum total snapshots across all files. */
  maxTotalSnapshots: number;
  /** Maximum file size to snapshot (bytes). */
  maxFileSizeBytes: number;
  /** Directory to store snapshot data (null = in-memory only). */
  snapshotDir: string | null;
  /** File extensions to exclude from snapshots. */
  excludeExtensions: Set<string>;
  /** Directories to exclude from snapshots. */
  excludePaths: Set<string>;
}

const DEFAULT_CONFIG: FileHistoryConfig = {
  maxSnapshotsPerFile: 50,
  maxTotalSnapshots: 2000,
  maxFileSizeBytes: 5 * 1024 * 1024, // 5 MB
  snapshotDir: null,
  excludeExtensions: new Set([".db", ".db-shm", ".db-wal", ".sqlite", ".lock", ".log"]),
  excludePaths: new Set(["node_modules", ".git", "dist", "build", "__pycache__"]),
};

// ---------------------------------------------------------------------------
// FileHistory Engine
// ---------------------------------------------------------------------------

export class FileHistoryEngine {
  private config: FileHistoryConfig;
  private snapshots: Map<string, FileSnapshot> = new Map(); // id -> snapshot
  private fileSnapshots: Map<string, string[]> = new Map(); // filePath -> snapshot IDs (ordered)
  private changes: Map<string, FileChange> = new Map(); // id -> change
  private batches: Map<string, ChangeBatch> = new Map(); // id -> batch
  private undoStack: string[] = []; // batch IDs
  private redoStack: string[] = []; // batch IDs

  constructor(config: Partial<FileHistoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // Snapshot Operations
  // -----------------------------------------------------------------------

  /**
   * Take a snapshot of a file's current content.
   * Returns null if the file should be excluded or is too large.
   */
  async takeSnapshot(
    filePath: string,
    operation: string,
    type: "before" | "after",
    batchId?: string
  ): Promise<FileSnapshot | null> {
    const absPath = path.resolve(filePath);

    // Check exclusions
    if (this.shouldExclude(absPath)) return null;

    let content: string;
    let sizeBytes: number;

    try {
      const stat = await fs.stat(absPath);
      sizeBytes = stat.size;
      if (sizeBytes > this.config.maxFileSizeBytes) return null;
      content = await fs.readFile(absPath, "utf-8");
    } catch {
      // File doesn't exist (e.g., before a create operation)
      content = "";
      sizeBytes = 0;
    }

    const contentHash = crypto.createHash("sha256").update(content).digest("hex");

    // Check if the latest snapshot for this file has the same hash (no change)
    const existingIds = this.fileSnapshots.get(absPath) || [];
    if (existingIds.length > 0) {
      const latest = this.snapshots.get(existingIds[existingIds.length - 1]);
      if (latest && latest.contentHash === contentHash && type === "before") {
        // No change since last snapshot — reuse
        return latest;
      }
    }

    const snapshot: FileSnapshot = {
      id: uuidv4(),
      filePath: absPath,
      contentHash,
      content,
      sizeBytes,
      timestamp: new Date().toISOString(),
      batchId,
      operation,
      type,
    };

    this.snapshots.set(snapshot.id, snapshot);

    // Track per-file
    if (!this.fileSnapshots.has(absPath)) {
      this.fileSnapshots.set(absPath, []);
    }
    this.fileSnapshots.get(absPath)!.push(snapshot.id);

    // Enforce per-file limit
    this.enforcePerFileLimit(absPath);

    // Enforce total limit
    this.enforceTotalLimit();

    return snapshot;
  }

  /**
   * Record a file change with before/after snapshots.
   * This is the primary API for tracking modifications.
   */
  async recordChange(
    filePath: string,
    operation: string,
    batchId?: string
  ): Promise<{ beforeSnapshot: FileSnapshot | null; changeId: string; batchId: string }> {
    const bid = batchId || uuidv4();
    const absPath = path.resolve(filePath);

    // Take "before" snapshot
    const beforeSnapshot = await this.takeSnapshot(absPath, operation, "before", bid);

    const change: FileChange = {
      id: uuidv4(),
      filePath: absPath,
      beforeSnapshotId: beforeSnapshot?.id || null,
      afterSnapshotId: null, // Will be set after the operation completes
      batchId: bid,
      operation,
      timestamp: new Date().toISOString(),
      undone: false,
    };

    this.changes.set(change.id, change);

    // Create or update batch
    if (!this.batches.has(bid)) {
      this.batches.set(bid, {
        id: bid,
        description: operation,
        changes: [],
        timestamp: new Date().toISOString(),
        undone: false,
      });
    }
    this.batches.get(bid)!.changes.push(change);

    return { beforeSnapshot, changeId: change.id, batchId: bid };
  }

  /**
   * Complete a change record by taking the "after" snapshot.
   * Call this after the file modification is done.
   */
  async completeChange(changeId: string): Promise<FileSnapshot | null> {
    const change = this.changes.get(changeId);
    if (!change) return null;

    const afterSnapshot = await this.takeSnapshot(change.filePath, change.operation, "after", change.batchId);
    change.afterSnapshotId = afterSnapshot?.id || null;

    // Push batch to undo stack
    if (!this.undoStack.includes(change.batchId)) {
      this.undoStack.push(change.batchId);
      this.redoStack.length = 0; // Clear redo on new change
    }

    return afterSnapshot;
  }

  // -----------------------------------------------------------------------
  // Undo / Redo
  // -----------------------------------------------------------------------

  /**
   * Undo the most recent batch of changes.
   * Restores all files in the batch to their "before" state.
   */
  async undo(): Promise<{ batchId: string; filesRestored: string[] } | null> {
    if (this.undoStack.length === 0) return null;

    const batchId = this.undoStack.pop()!;
    const batch = this.batches.get(batchId);
    if (!batch) return null;

    const filesRestored: string[] = [];

    for (const change of batch.changes) {
      if (change.beforeSnapshotId) {
        const beforeSnapshot = this.snapshots.get(change.beforeSnapshotId);
        if (beforeSnapshot) {
          try {
            await fs.mkdir(path.dirname(beforeSnapshot.filePath), { recursive: true });
            await fs.writeFile(beforeSnapshot.filePath, beforeSnapshot.content, "utf-8");
            filesRestored.push(beforeSnapshot.filePath);
          } catch {
            // File restore failed — log but continue
          }
        }
      } else {
        // File was created — delete it to undo
        try {
          await fs.unlink(change.filePath);
          filesRestored.push(change.filePath);
        } catch {
          // File already gone
        }
      }
      change.undone = true;
    }

    batch.undone = true;
    this.redoStack.push(batchId);

    return { batchId, filesRestored };
  }

  /**
   * Redo the most recently undone batch.
   * Restores all files to their "after" state.
   */
  async redo(): Promise<{ batchId: string; filesRestored: string[] } | null> {
    if (this.redoStack.length === 0) return null;

    const batchId = this.redoStack.pop()!;
    const batch = this.batches.get(batchId);
    if (!batch) return null;

    const filesRestored: string[] = [];

    for (const change of batch.changes) {
      if (change.afterSnapshotId) {
        const afterSnapshot = this.snapshots.get(change.afterSnapshotId);
        if (afterSnapshot) {
          try {
            await fs.mkdir(path.dirname(afterSnapshot.filePath), { recursive: true });
            await fs.writeFile(afterSnapshot.filePath, afterSnapshot.content, "utf-8");
            filesRestored.push(afterSnapshot.filePath);
          } catch {
            // File restore failed
          }
        }
      }
      change.undone = false;
    }

    batch.undone = false;
    this.undoStack.push(batchId);

    return { batchId, filesRestored };
  }

  /**
   * Undo a specific file to a specific snapshot.
   */
  async restoreToSnapshot(snapshotId: string): Promise<boolean> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) return false;

    try {
      await fs.mkdir(path.dirname(snapshot.filePath), { recursive: true });
      await fs.writeFile(snapshot.filePath, snapshot.content, "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Diff Generation
  // -----------------------------------------------------------------------

  /**
   * Generate a diff between two snapshots.
   */
  diffSnapshots(beforeId: string, afterId: string): FileDiff | null {
    const before = this.snapshots.get(beforeId);
    const after = this.snapshots.get(afterId);
    if (!before && !after) return null;

    const beforeLines = (before?.content || "").split("\n");
    const afterLines = (after?.content || "").split("\n");

    const hunks: DiffHunk[] = [];
    let linesAdded = 0;
    let linesRemoved = 0;

    // Simple line-by-line diff
    const maxLen = Math.max(beforeLines.length, afterLines.length);
    let hunkStart = -1;
    let hunkContent = "";
    let hunkType: "add" | "remove" | "change" = "change";

    for (let i = 0; i < maxLen; i++) {
      const bLine = i < beforeLines.length ? beforeLines[i] : undefined;
      const aLine = i < afterLines.length ? afterLines[i] : undefined;

      if (bLine !== aLine) {
        if (hunkStart === -1) hunkStart = i + 1;

        if (bLine === undefined) {
          hunkContent += `+${aLine}\n`;
          linesAdded++;
          hunkType = "add";
        } else if (aLine === undefined) {
          hunkContent += `-${bLine}\n`;
          linesRemoved++;
          hunkType = "remove";
        } else {
          hunkContent += `-${bLine}\n+${aLine}\n`;
          linesAdded++;
          linesRemoved++;
          hunkType = "change";
        }
      } else if (hunkStart !== -1) {
        hunks.push({ startLine: hunkStart, endLine: i, type: hunkType, content: hunkContent });
        hunkStart = -1;
        hunkContent = "";
      }
    }

    if (hunkStart !== -1) {
      hunks.push({ startLine: hunkStart, endLine: maxLen, type: hunkType, content: hunkContent });
    }

    return {
      filePath: (after || before)!.filePath,
      beforeHash: before?.contentHash || null,
      afterHash: after?.contentHash || null,
      linesAdded,
      linesRemoved,
      hunks,
    };
  }

  // -----------------------------------------------------------------------
  // Query API
  // -----------------------------------------------------------------------

  /** Get the version history for a specific file. */
  getFileHistory(filePath: string): FileSnapshot[] {
    const absPath = path.resolve(filePath);
    const ids = this.fileSnapshots.get(absPath) || [];
    return ids.map((id) => this.snapshots.get(id)!).filter(Boolean);
  }

  /** Get all change batches, newest first. */
  getBatches(limit: number = 20): ChangeBatch[] {
    return Array.from(this.batches.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /** Get undo/redo stack sizes. */
  getStackInfo(): { undoCount: number; redoCount: number } {
    return { undoCount: this.undoStack.length, redoCount: this.redoStack.length };
  }

  /** Get overall statistics. */
  getStats(): {
    totalSnapshots: number;
    totalChanges: number;
    totalBatches: number;
    trackedFiles: number;
    totalSizeBytes: number;
  } {
    let totalSize = 0;
    for (const snapshot of this.snapshots.values()) {
      totalSize += snapshot.sizeBytes;
    }

    return {
      totalSnapshots: this.snapshots.size,
      totalChanges: this.changes.size,
      totalBatches: this.batches.size,
      trackedFiles: this.fileSnapshots.size,
      totalSizeBytes: totalSize,
    };
  }

  // -----------------------------------------------------------------------
  // Internal Helpers
  // -----------------------------------------------------------------------

  private shouldExclude(absPath: string): boolean {
    const ext = path.extname(absPath);
    if (this.config.excludeExtensions.has(ext)) return true;

    for (const excludePath of this.config.excludePaths) {
      if (absPath.includes(`/${excludePath}/`) || absPath.includes(`\\${excludePath}\\`)) {
        return true;
      }
    }

    return false;
  }

  private enforcePerFileLimit(filePath: string): void {
    const ids = this.fileSnapshots.get(filePath);
    if (!ids || ids.length <= this.config.maxSnapshotsPerFile) return;

    while (ids.length > this.config.maxSnapshotsPerFile) {
      const oldId = ids.shift()!;
      this.snapshots.delete(oldId);
    }
  }

  private enforceTotalLimit(): void {
    if (this.snapshots.size <= this.config.maxTotalSnapshots) return;

    // Remove oldest snapshots globally
    const allSnapshots = Array.from(this.snapshots.values())
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const toRemove = allSnapshots.slice(0, this.snapshots.size - this.config.maxTotalSnapshots);
    for (const snap of toRemove) {
      this.snapshots.delete(snap.id);
      const fileIds = this.fileSnapshots.get(snap.filePath);
      if (fileIds) {
        const idx = fileIds.indexOf(snap.id);
        if (idx !== -1) fileIds.splice(idx, 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const fileHistoryEngine = new FileHistoryEngine();
