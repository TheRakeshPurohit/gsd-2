import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { registerWorkflowTools } from "./workflow-tools.ts";

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-mcp-workflow-${randomUUID()}`);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    // swallow
  }
}

function makeMockServer() {
  const tools: Array<{
    name: string;
    description: string;
    params: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }> = [];
  return {
    tools,
    tool(
      name: string,
      description: string,
      params: Record<string, unknown>,
      handler: (args: Record<string, unknown>) => Promise<unknown>,
    ) {
      tools.push({ name, description, params, handler });
    },
  };
}

describe("workflow MCP tools", () => {
  it("registers the three workflow tools", () => {
    const server = makeMockServer();
    registerWorkflowTools(server as any);

    assert.equal(server.tools.length, 3);
    assert.deepEqual(
      server.tools.map((t) => t.name),
      ["gsd_summary_save", "gsd_task_complete", "gsd_milestone_status"],
    );
  });

  it("gsd_summary_save writes artifact through the shared executor", async () => {
    const base = makeTmpBase();
    try {
      const server = makeMockServer();
      registerWorkflowTools(server as any);
      const tool = server.tools.find((t) => t.name === "gsd_summary_save");
      assert.ok(tool, "summary tool should be registered");

      const result = await tool!.handler({
        projectDir: base,
        milestone_id: "M001",
        slice_id: "S01",
        artifact_type: "SUMMARY",
        content: "# Summary\n\nHello",
      });

      const text = (result as any).content[0].text as string;
      assert.match(text, /Saved SUMMARY artifact/);
      assert.ok(
        existsSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-SUMMARY.md")),
        "summary file should exist on disk",
      );
    } finally {
      cleanup(base);
    }
  });

  it("gsd_task_complete and gsd_milestone_status work end-to-end", async () => {
    const base = makeTmpBase();
    try {
      mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01"), { recursive: true });
      writeFileSync(
        join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md"),
        "# S01\n\n- [ ] **T01: Demo** `est:5m`\n",
      );

      const server = makeMockServer();
      registerWorkflowTools(server as any);
      const taskTool = server.tools.find((t) => t.name === "gsd_task_complete");
      const statusTool = server.tools.find((t) => t.name === "gsd_milestone_status");
      assert.ok(taskTool, "task tool should be registered");
      assert.ok(statusTool, "status tool should be registered");

      const taskResult = await taskTool!.handler({
        projectDir: base,
        taskId: "T01",
        sliceId: "S01",
        milestoneId: "M001",
        oneLiner: "Completed task",
        narrative: "Did the work",
        verification: "npm test",
      });

      assert.match((taskResult as any).content[0].text as string, /Completed task T01/);
      assert.ok(
        existsSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks", "T01-SUMMARY.md")),
        "task summary should be written to disk",
      );

      const statusResult = await statusTool!.handler({
        projectDir: base,
        milestoneId: "M001",
      });
      const parsed = JSON.parse((statusResult as any).content[0].text as string);
      assert.equal(parsed.milestoneId, "M001");
      assert.equal(parsed.sliceCount, 1);
      assert.equal(parsed.slices[0].id, "S01");
    } finally {
      cleanup(base);
    }
  });
});
