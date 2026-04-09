import { ensureDbOpen } from "../bootstrap/dynamic-tools.js";
import { shouldBlockContextArtifactSave } from "../bootstrap/write-gate.js";
import {
  getMilestone,
  getSliceStatusSummary,
  getSliceTaskCounts,
  _getAdapter,
} from "../gsd-db.js";
import { saveArtifactToDb } from "../db-writer.js";
import { handleCompleteTask } from "./complete-task.js";
import { logError, logWarning } from "../workflow-logger.js";

export const SUPPORTED_SUMMARY_ARTIFACT_TYPES = ["SUMMARY", "RESEARCH", "CONTEXT", "ASSESSMENT", "CONTEXT-DRAFT"] as const;

export function isSupportedSummaryArtifactType(
  artifactType: string,
): artifactType is (typeof SUPPORTED_SUMMARY_ARTIFACT_TYPES)[number] {
  return (SUPPORTED_SUMMARY_ARTIFACT_TYPES as readonly string[]).includes(artifactType);
}

export interface ToolExecutionResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

export interface SummarySaveParams {
  milestone_id: string;
  slice_id?: string;
  task_id?: string;
  artifact_type: string;
  content: string;
}

export async function executeSummarySave(
  params: SummarySaveParams,
  basePath: string = process.cwd(),
): Promise<ToolExecutionResult> {
  const dbAvailable = await ensureDbOpen();
  if (!dbAvailable) {
    return {
      content: [{ type: "text", text: "Error: GSD database is not available. Cannot save artifact." }],
      details: { operation: "save_summary", error: "db_unavailable" },
    };
  }
  if (!isSupportedSummaryArtifactType(params.artifact_type)) {
    return {
      content: [{ type: "text", text: `Error: Invalid artifact_type "${params.artifact_type}". Must be one of: ${SUPPORTED_SUMMARY_ARTIFACT_TYPES.join(", ")}` }],
      details: { operation: "save_summary", error: "invalid_artifact_type" },
    };
  }
  const contextGuard = shouldBlockContextArtifactSave(
    params.artifact_type,
    params.milestone_id ?? null,
    params.slice_id ?? null,
  );
  if (contextGuard.block) {
    return {
      content: [{ type: "text", text: `Error saving artifact: ${contextGuard.reason ?? "context write blocked"}` }],
      details: { operation: "save_summary", error: "context_write_blocked" },
    };
  }
  try {
    let relativePath: string;
    if (params.task_id && params.slice_id) {
      relativePath = `milestones/${params.milestone_id}/slices/${params.slice_id}/tasks/${params.task_id}-${params.artifact_type}.md`;
    } else if (params.slice_id) {
      relativePath = `milestones/${params.milestone_id}/slices/${params.slice_id}/${params.slice_id}-${params.artifact_type}.md`;
    } else {
      relativePath = `milestones/${params.milestone_id}/${params.milestone_id}-${params.artifact_type}.md`;
    }

    await saveArtifactToDb(
      {
        path: relativePath,
        artifact_type: params.artifact_type,
        content: params.content,
        milestone_id: params.milestone_id,
        slice_id: params.slice_id,
        task_id: params.task_id,
      },
      basePath,
    );
    return {
      content: [{ type: "text", text: `Saved ${params.artifact_type} artifact to ${relativePath}` }],
      details: { operation: "save_summary", path: relativePath, artifact_type: params.artifact_type },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError("tool", `gsd_summary_save tool failed: ${msg}`, { tool: "gsd_summary_save", error: String(err) });
    return {
      content: [{ type: "text", text: `Error saving artifact: ${msg}` }],
      details: { operation: "save_summary", error: msg },
    };
  }
}

type VerificationEvidenceInput =
  | {
      command: string;
      exitCode: number;
      verdict: string;
      durationMs: number;
    }
  | string;

export interface TaskCompleteParams {
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
  verificationEvidence?: VerificationEvidenceInput[];
}

export async function executeTaskComplete(
  params: TaskCompleteParams,
  basePath: string = process.cwd(),
): Promise<ToolExecutionResult> {
  const dbAvailable = await ensureDbOpen();
  if (!dbAvailable) {
    return {
      content: [{ type: "text", text: "Error: GSD database is not available. Cannot complete task." }],
      details: { operation: "complete_task", error: "db_unavailable" },
    };
  }
  try {
    const coerced = { ...params };
    coerced.verificationEvidence = (params.verificationEvidence ?? []).map((v) =>
      typeof v === "string" ? { command: v, exitCode: -1, verdict: "unknown (coerced from string)", durationMs: 0 } : v,
    );

    const result = await handleCompleteTask(coerced as any, basePath);
    if ("error" in result) {
      return {
        content: [{ type: "text", text: `Error completing task: ${result.error}` }],
        details: { operation: "complete_task", error: result.error },
      };
    }
    return {
      content: [{ type: "text", text: `Completed task ${result.taskId} (${result.sliceId}/${result.milestoneId})` }],
      details: {
        operation: "complete_task",
        taskId: result.taskId,
        sliceId: result.sliceId,
        milestoneId: result.milestoneId,
        summaryPath: result.summaryPath,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError("tool", `complete_task tool failed: ${msg}`, { tool: "gsd_task_complete", error: String(err) });
    return {
      content: [{ type: "text", text: `Error completing task: ${msg}` }],
      details: { operation: "complete_task", error: msg },
    };
  }
}

export interface MilestoneStatusParams {
  milestoneId: string;
}

export async function executeMilestoneStatus(
  params: MilestoneStatusParams,
): Promise<ToolExecutionResult> {
  try {
    const dbAvailable = await ensureDbOpen();
    if (!dbAvailable) {
      return {
        content: [{ type: "text", text: "Error: GSD database is not available." }],
        details: { operation: "milestone_status", error: "db_unavailable" },
      };
    }

    const adapter = _getAdapter()!;
    adapter.exec("BEGIN");
    try {
      const milestone = getMilestone(params.milestoneId);
      if (!milestone) {
        adapter.exec("COMMIT");
        return {
          content: [{ type: "text", text: `Milestone ${params.milestoneId} not found in database.` }],
          details: { operation: "milestone_status", milestoneId: params.milestoneId, found: false },
        };
      }

      const sliceStatuses = getSliceStatusSummary(params.milestoneId);
      const slices = sliceStatuses.map((s) => ({
        id: s.id,
        status: s.status,
        taskCounts: getSliceTaskCounts(params.milestoneId, s.id),
      }));

      adapter.exec("COMMIT");

      const result = {
        milestoneId: milestone.id,
        title: milestone.title,
        status: milestone.status,
        createdAt: milestone.created_at,
        completedAt: milestone.completed_at,
        sliceCount: slices.length,
        slices,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: { operation: "milestone_status", milestoneId: milestone.id, sliceCount: slices.length },
      };
    } catch (txErr) {
      try { adapter.exec("ROLLBACK"); } catch { /* swallow */ }
      throw txErr;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logWarning("tool", `gsd_milestone_status tool failed: ${msg}`);
    return {
      content: [{ type: "text", text: `Error querying milestone status: ${msg}` }],
      details: { operation: "milestone_status", error: msg },
    };
  }
}
