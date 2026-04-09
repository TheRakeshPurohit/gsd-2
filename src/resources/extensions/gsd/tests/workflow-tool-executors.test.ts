import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import {
  openDatabase,
  closeDatabase,
  _getAdapter,
} from "../gsd-db.ts";
import {
  executeSummarySave,
  executeTaskComplete,
  executeMilestoneStatus,
} from "../tools/workflow-tool-executors.ts";

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-workflow-executors-${randomUUID()}`);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* swallow */ }
}

function openTestDb(base: string): void {
  openDatabase(join(base, ".gsd", "gsd.db"));
}

async function inProjectDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();
  try {
    process.chdir(dir);
    return await fn();
  } finally {
    process.chdir(originalCwd);
  }
}

function seedMilestone(milestoneId: string, title: string, status = "active"): void {
  const db = _getAdapter();
  if (!db) throw new Error("DB not open");
  db.prepare(
    "INSERT OR REPLACE INTO milestones (id, title, status, created_at) VALUES (?, ?, ?, ?)",
  ).run(milestoneId, title, status, new Date().toISOString());
}

function seedSlice(milestoneId: string, sliceId: string, status: string): void {
  const db = _getAdapter();
  if (!db) throw new Error("DB not open");
  db.prepare(
    "INSERT OR REPLACE INTO slices (milestone_id, id, title, status, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(milestoneId, sliceId, `Slice ${sliceId}`, status, new Date().toISOString());
}

test("executeSummarySave persists artifact and returns computed path", async () => {
  const base = makeTmpBase();
  try {
    openTestDb(base);
    const result = await inProjectDir(base, () => executeSummarySave({
      milestone_id: "M001",
      slice_id: "S01",
      artifact_type: "SUMMARY",
      content: "# Summary\n\ncontent",
    }, base));

    assert.equal(result.details.operation, "save_summary");
    assert.equal(result.details.path, "milestones/M001/slices/S01/S01-SUMMARY.md");

    const filePath = join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-SUMMARY.md");
    assert.ok(existsSync(filePath), "summary artifact should be written to disk");
    assert.match(readFileSync(filePath, "utf-8"), /# Summary/);
  } finally {
    closeDatabase();
    cleanup(base);
  }
});

test("executeTaskComplete coerces string verificationEvidence entries", async () => {
  const base = makeTmpBase();
  try {
    openTestDb(base);
    const planDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    mkdirSync(planDir, { recursive: true });
    writeFileSync(join(planDir, "S01-PLAN.md"), "# S01\n\n- [ ] **T01: Demo** `est:5m`\n");

    const result = await inProjectDir(base, () => executeTaskComplete({
      milestoneId: "M001",
      sliceId: "S01",
      taskId: "T01",
      oneLiner: "Completed task",
      narrative: "Did the work",
      verification: "npm test",
      verificationEvidence: ["npm test"],
    }, base));

    assert.equal(result.details.operation, "complete_task");
    assert.equal(result.details.taskId, "T01");

    const db = _getAdapter();
    assert.ok(db, "DB should be open");
    const rows = db!.prepare(
      "SELECT command, exit_code, verdict, duration_ms FROM verification_evidence WHERE milestone_id = ? AND slice_id = ? AND task_id = ?",
    ).all("M001", "S01", "T01") as Array<Record<string, unknown>>;

    assert.equal(rows.length, 1, "one coerced verification evidence row should be inserted");
    assert.equal(rows[0]["command"], "npm test");
    assert.equal(rows[0]["exit_code"], -1);
    assert.match(String(rows[0]["verdict"]), /coerced from string/);

    const summaryPath = String(result.details.summaryPath);
    assert.ok(existsSync(summaryPath), "task summary should be written to disk");
  } finally {
    closeDatabase();
    cleanup(base);
  }
});

test("executeMilestoneStatus returns milestone metadata and slice counts", async () => {
  const base = makeTmpBase();
  try {
    openTestDb(base);
    seedMilestone("M001", "Milestone One");
    seedSlice("M001", "S01", "active");
    const db = _getAdapter();
    db!.prepare(
      "INSERT OR REPLACE INTO tasks (milestone_id, slice_id, id, title, status) VALUES (?, ?, ?, ?, ?)",
    ).run("M001", "S01", "T01", "Task T01", "pending");

    const result = await inProjectDir(base, () => executeMilestoneStatus({ milestoneId: "M001" }));
    const parsed = JSON.parse(result.content[0].text);

    assert.equal(parsed.milestoneId, "M001");
    assert.equal(parsed.title, "Milestone One");
    assert.equal(parsed.sliceCount, 1);
    assert.equal(parsed.slices[0].id, "S01");
    assert.equal(parsed.slices[0].taskCounts.pending, 1);
  } finally {
    closeDatabase();
    cleanup(base);
  }
});
