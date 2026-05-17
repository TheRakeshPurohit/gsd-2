import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir, platform } from "node:os";
import { isAllowedBrowsePath, getAdditionalRoots } from "../../../lib/browse-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve the configured dev root from web preferences.
 * Returns the devRoot path if set, otherwise the user's home directory.
 */
function getDevRoot(): string {
  try {
    const prefsPath = join(homedir(), ".gsd", "web-preferences.json");
    if (existsSync(prefsPath)) {
      const prefs = JSON.parse(readFileSync(prefsPath, "utf-8")) as Record<string, unknown>;
      if (typeof prefs.devRoot === "string" && prefs.devRoot) {
        return resolve(prefs.devRoot);
      }
    }
  } catch {
    // Fall through to default
  }
  return homedir();
}

/**
 * GET /api/browse-directories?path=/some/path
 *
 * Returns the directory listing for the given path.
 * Defaults to the configured devRoot (or home directory) if no path is given.
 * Only returns directories (no files) for the folder picker use case.
 *
 * Scope:
 *   - devRoot and its descendants
 *   - the immediate parent of devRoot (one level up for context)
 *   - the user's home directory and its descendants
 *   - platform-specific mount roots (e.g. /Volumes on macOS, /media on Linux,
 *     existing drive letters on Windows)
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const rawPath = url.searchParams.get("path");
    const devRoot = getDevRoot();
    const home = homedir();
    const additionalRoots = getAdditionalRoots(platform(), existsSync);
    const targetPath = rawPath ? resolve(rawPath) : devRoot;

    if (!isAllowedBrowsePath(targetPath, { devRoot, home, additionalRoots })) {
      return Response.json(
        { error: "Path outside allowed scope" },
        { status: 403 },
      );
    }

    if (!existsSync(targetPath)) {
      return Response.json(
        { error: `Path does not exist: ${targetPath}` },
        { status: 404 },
      );
    }

    const stat = statSync(targetPath);
    if (!stat.isDirectory()) {
      return Response.json(
        { error: `Not a directory: ${targetPath}` },
        { status: 400 },
      );
    }

    const parentPath = dirname(targetPath);
    const parentAllowed =
      parentPath !== targetPath &&
      isAllowedBrowsePath(parentPath, { devRoot, home, additionalRoots });

    // Surface mount roots / drive letters as quick-access when browsing $HOME or devRoot.
    const showAdditionalRoots =
      additionalRoots.length > 0 && (targetPath === home || targetPath === devRoot);

    const entries: Array<{ name: string; path: string }> = [];

    try {
      const items = readdirSync(targetPath, { withFileTypes: true });
      for (const item of items) {
        if (!item.isDirectory()) continue;
        if (item.name.startsWith(".")) continue;
        if (item.name === "node_modules") continue;

        entries.push({
          name: item.name,
          path: resolve(targetPath, item.name),
        });
      }

      if (showAdditionalRoots) {
        for (const mp of additionalRoots) {
          const mpName = mp.split(/[/\\]/).filter(Boolean).pop() || mp;
          entries.push({
            name: mpName,
            path: mp,
          });
        }
      }
    } catch {
      // Permission denied or other read error — return empty entries
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({
      current: targetPath,
      parent: parentAllowed ? parentPath : null,
      entries,
    });
  } catch (err) {
    return Response.json(
      { error: `Browse failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
