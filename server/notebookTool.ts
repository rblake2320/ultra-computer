/**
 * notebookTool.ts
 *
 * Jupyter Notebook editing tool for Ultra Computer.
 * Inspired by Claude Code's NotebookEditTool, this module provides
 * cell-level editing operations for .ipynb files without requiring
 * a running Jupyter kernel.
 *
 * Features:
 *   - Read/write individual cells by index
 *   - Insert, delete, move, and replace cells
 *   - Cell type conversion (code ↔ markdown ↔ raw)
 *   - Output clearing and metadata management
 *   - Notebook validation and repair
 *
 * @module notebookTool
 */

import * as fs from "fs/promises";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Jupyter notebook cell types. */
export type CellType = "code" | "markdown" | "raw";

/** A single notebook cell. */
export interface NotebookCell {
  cell_type: CellType;
  source: string[];
  metadata: Record<string, unknown>;
  outputs?: NotebookOutput[];
  execution_count?: number | null;
}

/** Notebook output (simplified). */
export interface NotebookOutput {
  output_type: string;
  text?: string[];
  data?: Record<string, unknown>;
  name?: string;
  ename?: string;
  evalue?: string;
  traceback?: string[];
}

/** Full notebook structure. */
export interface Notebook {
  nbformat: number;
  nbformat_minor: number;
  metadata: {
    kernelspec?: {
      display_name: string;
      language: string;
      name: string;
    };
    language_info?: {
      name: string;
      version?: string;
    };
    [key: string]: unknown;
  };
  cells: NotebookCell[];
}

/** Result of a notebook operation. */
export interface NotebookOpResult {
  success: boolean;
  message: string;
  cellIndex?: number;
  cellCount?: number;
  notebook?: Notebook;
}

// ---------------------------------------------------------------------------
// Notebook Parser
// ---------------------------------------------------------------------------

/**
 * Read and parse a Jupyter notebook file.
 */
export async function readNotebook(filePath: string): Promise<Notebook> {
  const absPath = path.resolve(filePath);
  const content = await fs.readFile(absPath, "utf-8");
  const notebook = JSON.parse(content) as Notebook;

  // Validate basic structure
  if (!notebook.nbformat || !Array.isArray(notebook.cells)) {
    throw new Error(`Invalid notebook format: ${filePath}`);
  }

  return notebook;
}

/**
 * Write a notebook back to disk.
 */
export async function writeNotebook(filePath: string, notebook: Notebook): Promise<void> {
  const absPath = path.resolve(filePath);
  const content = JSON.stringify(notebook, null, 1) + "\n";
  await fs.writeFile(absPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Cell Operations
// ---------------------------------------------------------------------------

/**
 * Get a specific cell by index.
 */
export function getCell(notebook: Notebook, index: number): NotebookCell | null {
  if (index < 0 || index >= notebook.cells.length) return null;
  return notebook.cells[index];
}

/**
 * Get the source content of a cell as a single string.
 */
export function getCellSource(cell: NotebookCell): string {
  return cell.source.join("");
}

/**
 * Replace the source content of a cell.
 */
export function setCellSource(notebook: Notebook, index: number, source: string): NotebookOpResult {
  if (index < 0 || index >= notebook.cells.length) {
    return { success: false, message: `Cell index ${index} out of range (0-${notebook.cells.length - 1})` };
  }

  // Split source into lines, preserving newlines
  notebook.cells[index].source = source.split(/(?<=\n)/);
  if (notebook.cells[index].source.length === 0) {
    notebook.cells[index].source = [""];
  }

  return {
    success: true,
    message: `Cell ${index} source updated`,
    cellIndex: index,
    cellCount: notebook.cells.length,
  };
}

/**
 * Insert a new cell at the specified index.
 */
export function insertCell(
  notebook: Notebook,
  index: number,
  cellType: CellType,
  source: string = ""
): NotebookOpResult {
  const clampedIndex = Math.max(0, Math.min(index, notebook.cells.length));

  const newCell: NotebookCell = {
    cell_type: cellType,
    source: source ? source.split(/(?<=\n)/) : [""],
    metadata: {},
  };

  if (cellType === "code") {
    newCell.outputs = [];
    newCell.execution_count = null;
  }

  notebook.cells.splice(clampedIndex, 0, newCell);

  return {
    success: true,
    message: `Inserted ${cellType} cell at index ${clampedIndex}`,
    cellIndex: clampedIndex,
    cellCount: notebook.cells.length,
  };
}

/**
 * Delete a cell at the specified index.
 */
export function deleteCell(notebook: Notebook, index: number): NotebookOpResult {
  if (index < 0 || index >= notebook.cells.length) {
    return { success: false, message: `Cell index ${index} out of range` };
  }

  if (notebook.cells.length <= 1) {
    return { success: false, message: "Cannot delete the last remaining cell" };
  }

  notebook.cells.splice(index, 1);

  return {
    success: true,
    message: `Deleted cell at index ${index}`,
    cellIndex: index,
    cellCount: notebook.cells.length,
  };
}

/**
 * Move a cell from one index to another.
 */
export function moveCell(notebook: Notebook, fromIndex: number, toIndex: number): NotebookOpResult {
  if (fromIndex < 0 || fromIndex >= notebook.cells.length) {
    return { success: false, message: `Source index ${fromIndex} out of range` };
  }
  if (toIndex < 0 || toIndex >= notebook.cells.length) {
    return { success: false, message: `Target index ${toIndex} out of range` };
  }
  if (fromIndex === toIndex) {
    return { success: true, message: "Cell already at target position", cellIndex: toIndex, cellCount: notebook.cells.length };
  }

  const [cell] = notebook.cells.splice(fromIndex, 1);
  notebook.cells.splice(toIndex, 0, cell);

  return {
    success: true,
    message: `Moved cell from index ${fromIndex} to ${toIndex}`,
    cellIndex: toIndex,
    cellCount: notebook.cells.length,
  };
}

/**
 * Change the type of a cell (code ↔ markdown ↔ raw).
 */
export function changeCellType(notebook: Notebook, index: number, newType: CellType): NotebookOpResult {
  if (index < 0 || index >= notebook.cells.length) {
    return { success: false, message: `Cell index ${index} out of range` };
  }

  const cell = notebook.cells[index];
  const oldType = cell.cell_type;
  cell.cell_type = newType;

  // Add/remove code-specific fields
  if (newType === "code") {
    if (!cell.outputs) cell.outputs = [];
    if (cell.execution_count === undefined) cell.execution_count = null;
  } else {
    delete cell.outputs;
    delete cell.execution_count;
  }

  return {
    success: true,
    message: `Changed cell ${index} from ${oldType} to ${newType}`,
    cellIndex: index,
    cellCount: notebook.cells.length,
  };
}

/**
 * Clear outputs from a specific cell or all cells.
 */
export function clearOutputs(notebook: Notebook, index?: number): NotebookOpResult {
  if (index !== undefined) {
    if (index < 0 || index >= notebook.cells.length) {
      return { success: false, message: `Cell index ${index} out of range` };
    }
    const cell = notebook.cells[index];
    if (cell.cell_type === "code") {
      cell.outputs = [];
      cell.execution_count = null;
    }
    return { success: true, message: `Cleared outputs for cell ${index}`, cellIndex: index, cellCount: notebook.cells.length };
  }

  // Clear all
  let cleared = 0;
  for (const cell of notebook.cells) {
    if (cell.cell_type === "code") {
      cell.outputs = [];
      cell.execution_count = null;
      cleared++;
    }
  }

  return { success: true, message: `Cleared outputs for ${cleared} code cells`, cellCount: notebook.cells.length };
}

// ---------------------------------------------------------------------------
// Notebook Validation & Repair
// ---------------------------------------------------------------------------

/**
 * Validate a notebook structure and optionally repair issues.
 */
export function validateNotebook(notebook: Notebook, repair: boolean = false): {
  valid: boolean;
  issues: string[];
  repaired: string[];
} {
  const issues: string[] = [];
  const repaired: string[] = [];

  // Check nbformat
  if (notebook.nbformat < 4) {
    issues.push(`Outdated nbformat: ${notebook.nbformat} (expected 4+)`);
    if (repair) {
      notebook.nbformat = 4;
      notebook.nbformat_minor = 5;
      repaired.push("Updated nbformat to 4.5");
    }
  }

  // Check metadata
  if (!notebook.metadata) {
    issues.push("Missing notebook metadata");
    if (repair) {
      notebook.metadata = {};
      repaired.push("Added empty metadata");
    }
  }

  // Check cells
  if (!Array.isArray(notebook.cells)) {
    issues.push("cells is not an array");
    if (repair) {
      notebook.cells = [];
      repaired.push("Initialized empty cells array");
    }
  }

  for (let i = 0; i < notebook.cells.length; i++) {
    const cell = notebook.cells[i];

    // Check cell_type
    if (!["code", "markdown", "raw"].includes(cell.cell_type)) {
      issues.push(`Cell ${i}: invalid cell_type '${cell.cell_type}'`);
      if (repair) {
        cell.cell_type = "code";
        repaired.push(`Cell ${i}: set cell_type to 'code'`);
      }
    }

    // Check source
    if (!Array.isArray(cell.source)) {
      issues.push(`Cell ${i}: source is not an array`);
      if (repair) {
        cell.source = typeof cell.source === "string" ? (cell.source as string).split(/(?<=\n)/) : [""];
        repaired.push(`Cell ${i}: converted source to array`);
      }
    }

    // Check metadata
    if (!cell.metadata || typeof cell.metadata !== "object") {
      issues.push(`Cell ${i}: missing or invalid metadata`);
      if (repair) {
        cell.metadata = {};
        repaired.push(`Cell ${i}: added empty metadata`);
      }
    }

    // Code cells should have outputs array
    if (cell.cell_type === "code" && !Array.isArray(cell.outputs)) {
      issues.push(`Cell ${i}: code cell missing outputs array`);
      if (repair) {
        cell.outputs = [];
        repaired.push(`Cell ${i}: added empty outputs array`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    repaired,
  };
}

// ---------------------------------------------------------------------------
// Notebook Summary
// ---------------------------------------------------------------------------

/**
 * Generate a summary of a notebook's structure and content.
 */
export function summarizeNotebook(notebook: Notebook): {
  totalCells: number;
  codeCells: number;
  markdownCells: number;
  rawCells: number;
  totalLines: number;
  hasOutputs: boolean;
  kernelName: string;
  language: string;
  cellSummaries: Array<{ index: number; type: CellType; lines: number; preview: string }>;
} {
  let codeCells = 0;
  let markdownCells = 0;
  let rawCells = 0;
  let totalLines = 0;
  let hasOutputs = false;

  const cellSummaries = notebook.cells.map((cell, index) => {
    const source = getCellSource(cell);
    const lines = source.split("\n").length;
    totalLines += lines;

    switch (cell.cell_type) {
      case "code": codeCells++; break;
      case "markdown": markdownCells++; break;
      case "raw": rawCells++; break;
    }

    if (cell.outputs && cell.outputs.length > 0) hasOutputs = true;

    return {
      index,
      type: cell.cell_type,
      lines,
      preview: source.slice(0, 100).replace(/\n/g, " "),
    };
  });

  return {
    totalCells: notebook.cells.length,
    codeCells,
    markdownCells,
    rawCells,
    totalLines,
    hasOutputs,
    kernelName: notebook.metadata?.kernelspec?.name || "unknown",
    language: notebook.metadata?.language_info?.name || "unknown",
    cellSummaries,
  };
}
