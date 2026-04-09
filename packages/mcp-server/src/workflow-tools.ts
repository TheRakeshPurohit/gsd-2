/**
 * Workflow MCP tools — exposes the core GSD mutation/read handlers over MCP.
 */

import { z } from "zod";

const SUMMARY_ARTIFACT_TYPES = ["SUMMARY", "RESEARCH", "CONTEXT", "ASSESSMENT", "CONTEXT-DRAFT"] as const;

type WorkflowToolExecutors = {
  SUPPORTED_SUMMARY_ARTIFACT_TYPES: readonly string[];
  executeMilestoneStatus: (params: { milestoneId: string }) => Promise<unknown>;
  executeSummarySave: (
    params: {
      milestone_id: string;
      slice_id?: string;
      task_id?: string;
      artifact_type: string;
      content: string;
    },
    basePath?: string,
  ) => Promise<unknown>;
  executeTaskComplete: (
    params: {
      taskId: string;
      sliceId: string;
      milestoneId: string;
      oneLiner: string;
      narrative: string;
      verification: string;
      deviations?: string;
      knownIssues?: string;
      keyFiles?: string[];
      keyDecisions?: string[];
      blockerDiscovered?: boolean;
      verificationEvidence?: Array<
        { command: string; exitCode: number; verdict: string; durationMs: number } | string
      >;
    },
    basePath?: string,
  ) => Promise<unknown>;
};

let workflowToolExecutorsPromise: Promise<WorkflowToolExecutors> | null = null;

async function getWorkflowToolExecutors(): Promise<WorkflowToolExecutors> {
  if (!workflowToolExecutorsPromise) {
    const jsUrl = new URL("../../../src/resources/extensions/gsd/tools/workflow-tool-executors.js", import.meta.url).href;
    const tsUrl = new URL("../../../src/resources/extensions/gsd/tools/workflow-tool-executors.ts", import.meta.url).href;
    workflowToolExecutorsPromise = import(jsUrl)
      .catch(() => import(tsUrl)) as Promise<WorkflowToolExecutors>;
  }
  return workflowToolExecutorsPromise;
}

interface McpToolServer {
  tool(
    name: string,
    description: string,
    params: Record<string, unknown>,
    handler: (args: Record<string, unknown>) => Promise<unknown>,
  ): unknown;
}

async function withProjectDir<T>(projectDir: string, fn: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();
  try {
    process.chdir(projectDir);
    return await fn();
  } finally {
    process.chdir(originalCwd);
  }
}

export function registerWorkflowTools(server: McpToolServer): void {
  server.tool(
    "gsd_summary_save",
    "Save a GSD summary/research/context/assessment artifact to the database and disk.",
    {
      projectDir: z.string().describe("Absolute path to the project directory"),
      milestone_id: z.string().describe("Milestone ID (e.g. M001)"),
      slice_id: z.string().optional().describe("Slice ID (e.g. S01)"),
      task_id: z.string().optional().describe("Task ID (e.g. T01)"),
      artifact_type: z.enum(SUMMARY_ARTIFACT_TYPES).describe("Artifact type to save"),
      content: z.string().describe("The full markdown content of the artifact"),
    },
    async (args: Record<string, unknown>) => {
      const { projectDir, milestone_id, slice_id, task_id, artifact_type, content } = args as {
        projectDir: string;
        milestone_id: string;
        slice_id?: string;
        task_id?: string;
        artifact_type: string;
        content: string;
      };
      const { executeSummarySave } = await getWorkflowToolExecutors();
      return withProjectDir(projectDir, () =>
        executeSummarySave({ milestone_id, slice_id, task_id, artifact_type, content }, projectDir),
      );
    },
  );

  server.tool(
    "gsd_task_complete",
    "Record a completed task to the GSD database and render its SUMMARY.md.",
    {
      projectDir: z.string().describe("Absolute path to the project directory"),
      taskId: z.string().describe("Task ID (e.g. T01)"),
      sliceId: z.string().describe("Slice ID (e.g. S01)"),
      milestoneId: z.string().describe("Milestone ID (e.g. M001)"),
      oneLiner: z.string().describe("One-line summary of what was accomplished"),
      narrative: z.string().describe("Detailed narrative of what happened during the task"),
      verification: z.string().describe("What was verified and how"),
      deviations: z.string().optional().describe("Deviations from the task plan"),
      knownIssues: z.string().optional().describe("Known issues discovered but not fixed"),
      keyFiles: z.array(z.string()).optional().describe("List of key files created or modified"),
      keyDecisions: z.array(z.string()).optional().describe("List of key decisions made during this task"),
      blockerDiscovered: z.boolean().optional().describe("Whether a plan-invalidating blocker was discovered"),
      verificationEvidence: z.array(z.union([
        z.object({
          command: z.string(),
          exitCode: z.number(),
          verdict: z.string(),
          durationMs: z.number(),
        }),
        z.string(),
      ])).optional().describe("Verification evidence entries"),
    },
    async (args: Record<string, unknown>) => {
      const {
        projectDir,
        taskId,
        sliceId,
        milestoneId,
        oneLiner,
        narrative,
        verification,
        deviations,
        knownIssues,
        keyFiles,
        keyDecisions,
        blockerDiscovered,
        verificationEvidence,
      } = args as {
        projectDir: string;
        taskId: string;
        sliceId: string;
        milestoneId: string;
        oneLiner: string;
        narrative: string;
        verification: string;
        deviations?: string;
        knownIssues?: string;
        keyFiles?: string[];
        keyDecisions?: string[];
        blockerDiscovered?: boolean;
        verificationEvidence?: Array<
          { command: string; exitCode: number; verdict: string; durationMs: number } | string
        >;
      };
      const { executeTaskComplete } = await getWorkflowToolExecutors();
      return withProjectDir(projectDir, () =>
        executeTaskComplete(
          {
            taskId,
            sliceId,
            milestoneId,
            oneLiner,
            narrative,
            verification,
            deviations,
            knownIssues,
            keyFiles,
            keyDecisions,
            blockerDiscovered,
            verificationEvidence,
          },
          projectDir,
        ),
      );
    },
  );

  server.tool(
    "gsd_milestone_status",
    "Read the current status of a milestone and all its slices from the GSD database.",
    {
      projectDir: z.string().describe("Absolute path to the project directory"),
      milestoneId: z.string().describe("Milestone ID to query (e.g. M001)"),
    },
    async (args: Record<string, unknown>) => {
      const { projectDir, milestoneId } = args as { projectDir: string; milestoneId: string };
      const { executeMilestoneStatus } = await getWorkflowToolExecutors();
      return withProjectDir(projectDir, () => executeMilestoneStatus({ milestoneId }));
    },
  );
}
