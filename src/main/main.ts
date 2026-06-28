import { access, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { createEmptyProject, defaultExportSettings } from "../shared/editing";
import type {
  ExportProgress,
  ExportResult,
  ExportSettings,
  ImportMediaResult,
  LoadProjectResult,
  MediaAsset,
  RecentProject,
  RelinkMediaResult,
  SaveProjectResult,
  SpikxProject
} from "../shared/types";
import { createMediaAsset, exportTimeline, getToolStatus } from "./ffmpeg";
import { readProjectFile, validateProject, writeProjectFile } from "./projectIo";

const currentDir = dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | undefined;
let activeExportController: AbortController | undefined;
const trustedProjectPaths = new Set<string>();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#101214",
    title: "Spikx JS",
    webPreferences: {
      preload: join(currentDir, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(currentDir, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function registerIpc(): void {
  ipcMain.handle("project:new", () => createEmptyProject());

  ipcMain.handle("media:import", async (_event, fps: number): Promise<ImportMediaResult> => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Import Media",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Media",
          extensions: ["mp4", "mov", "mkv", "webm", "avi", "mp3", "wav", "m4a", "flac", "png", "jpg", "jpeg", "webp"]
        },
        { name: "All Files", extensions: ["*"] }
      ]
    });

    if (result.canceled) {
      return { assets: [], errors: [] };
    }

    return importMediaFiles(result.filePaths, fps);
  });

  ipcMain.handle("media:relink", async (_event, fps: number): Promise<RelinkMediaResult> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: "Relink Media",
        properties: ["openFile"],
        filters: [
          {
            name: "Media",
            extensions: ["mp4", "mov", "mkv", "webm", "avi", "mp3", "wav", "m4a", "flac", "png", "jpg", "jpeg", "webp"]
          },
          { name: "All Files", extensions: ["*"] }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: "Relink canceled." };
      }

      return {
        ok: true,
        asset: await createMediaAsset(result.filePaths[0], fps)
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Relink failed." };
    }
  });

  ipcMain.handle("media:reveal", (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("media:check-files", async (_event, assets: Array<Pick<MediaAsset, "id" | "path">>): Promise<string[]> => {
    const missingAssetIds: string[] = [];

    for (const asset of assets) {
      try {
        await access(asset.path);
      } catch {
        missingAssetIds.push(asset.id);
      }
    }

    return missingAssetIds;
  });

  ipcMain.handle("project:save", async (_event, project: SpikxProject, projectPath?: string): Promise<SaveProjectResult> => (
    saveProject(project, projectPath, false)
  ));

  ipcMain.handle("project:save-as", async (_event, project: SpikxProject): Promise<SaveProjectResult> => (
    saveProject(project, undefined, true)
  ));

  ipcMain.handle("project:load", async (): Promise<LoadProjectResult> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: "Open Project",
        properties: ["openFile"],
        filters: [{ name: "Spikx JS Project", extensions: ["spikx-js.json", "json"] }]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: "Open canceled." };
      }

      return loadProjectFromPath(result.filePaths[0]);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Open failed." };
    }
  });

  ipcMain.handle("project:open-recent", async (_event, projectPath: string): Promise<LoadProjectResult> => {
    try {
      if (!(await isRecentProjectPath(projectPath))) {
        return { ok: false, error: "Recent project is not trusted." };
      }

      return loadProjectFromPath(projectPath);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Open recent failed." };
    }
  });

  ipcMain.handle("project:recent", async () => {
    const recentProjects = await readRecentProjects();

    for (const project of recentProjects) {
      trustProjectPath(project.path);
    }

    return recentProjects;
  });

  ipcMain.handle("timeline:export", async (_event, project: SpikxProject, settings?: ExportSettings): Promise<ExportResult> => {
    if (activeExportController) {
      return {
        ok: false,
        message: "An export is already running."
      };
    }

    const result = await dialog.showSaveDialog(mainWindow!, {
      title: "Export Video",
      defaultPath: `${project.name || "Untitled"}.mp4`,
      filters: [{ name: "MPEG-4 Video", extensions: ["mp4"] }]
    });

    if (result.canceled || !result.filePath) {
      return {
        ok: false,
        message: "Export canceled."
      };
    }

    activeExportController = new AbortController();
    sendExportProgress({
      running: true,
      percent: 0,
      message: "Export starting...",
      outputPath: result.filePath
    });

    try {
      const exportResult = await exportTimeline(validateProject(project), result.filePath, {
        settings: normalizeExportSettings(settings, project.timeline.settings),
        signal: activeExportController.signal,
        onProgress: sendExportProgress
      });

      sendExportProgress({
        running: false,
        percent: exportResult.ok ? 100 : 0,
        message: exportResult.message,
        outputPath: result.filePath
      });

      return exportResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Project is not valid.";

      sendExportProgress({
        running: false,
        percent: 0,
        message,
        outputPath: result.filePath
      });

      return {
        ok: false,
        outputPath: result.filePath,
        message
      };
    } finally {
      activeExportController = undefined;
    }
  });

  ipcMain.handle("timeline:export-cancel", () => {
    activeExportController?.abort();
  });

  ipcMain.handle("tools:status", () => getToolStatus());
}

async function importMediaFiles(filePaths: string[], fps: number): Promise<ImportMediaResult> {
  const assets: MediaAsset[] = [];
  const errors: ImportMediaResult["errors"] = [];

  for (const filePath of filePaths) {
    try {
      assets.push(await createMediaAsset(filePath, fps));
    } catch (error) {
      errors.push({
        path: filePath,
        error: error instanceof Error ? error.message : "Import failed."
      });
    }
  }

  return { assets, errors };
}

async function saveProject(project: SpikxProject, projectPath: string | undefined, saveAs: boolean): Promise<SaveProjectResult> {
  try {
    let targetPath = saveAs ? undefined : projectPath;

    if (targetPath && !isTrustedProjectPath(targetPath)) {
      targetPath = undefined;
    }

    if (!targetPath) {
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: saveAs ? "Save Project As" : "Save Project",
        defaultPath: `${project.name || "Untitled"}.spikx-js.json`,
        filters: [{ name: "Spikx JS Project", extensions: ["spikx-js.json"] }]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, error: "Save canceled." };
      }

      targetPath = result.filePath;
    }

    const trustedPath = trustProjectPath(targetPath);

    await writeProjectFile(trustedPath, project);
    await addRecentProject(trustedPath, project.name);

    return { ok: true, projectPath: trustedPath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Save failed." };
  }
}

async function loadProjectFromPath(projectPath: string): Promise<LoadProjectResult> {
  const trustedPath = trustProjectPath(projectPath);
  const project = await readProjectFile(trustedPath);
  await addRecentProject(trustedPath, project.name);

  return { ok: true, project, projectPath: trustedPath };
}

async function readRecentProjects(): Promise<RecentProject[]> {
  try {
    const raw = await readFile(getRecentProjectsPath(), "utf8");
    const parsed = JSON.parse(raw) as RecentProject[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => (
      typeof item.path === "string" &&
      item.path.trim().length > 0 &&
      typeof item.name === "string" &&
      typeof item.openedAt === "string"
    )).slice(0, 10);
  } catch {
    return [];
  }
}

async function addRecentProject(projectPath: string, projectName: string): Promise<void> {
  const trustedPath = trustProjectPath(projectPath);
  const recentProjects = await readRecentProjects();
  const nextProjects = [
    {
      path: trustedPath,
      name: projectName || basename(trustedPath),
      openedAt: new Date().toISOString()
    },
    ...recentProjects.filter((item) => normalizeProjectPath(item.path) !== trustedPath)
  ].slice(0, 10);

  await writeFile(getRecentProjectsPath(), `${JSON.stringify(nextProjects, null, 2)}\n`, "utf8");
}

function getRecentProjectsPath(): string {
  return join(app.getPath("userData"), "recent-projects.json");
}

async function isRecentProjectPath(projectPath: string): Promise<boolean> {
  const normalizedPath = normalizeProjectPath(projectPath);
  const recentProjects = await readRecentProjects();
  const isRecent = recentProjects.some((project) => normalizeProjectPath(project.path) === normalizedPath);

  if (isRecent) {
    trustedProjectPaths.add(normalizedPath);
  }

  return isRecent;
}

function trustProjectPath(projectPath: string): string {
  const normalizedPath = normalizeProjectPath(projectPath);
  trustedProjectPaths.add(normalizedPath);

  return normalizedPath;
}

function isTrustedProjectPath(projectPath: string): boolean {
  try {
    return trustedProjectPaths.has(normalizeProjectPath(projectPath));
  } catch {
    return false;
  }
}

function normalizeProjectPath(projectPath: string): string {
  if (typeof projectPath !== "string" || projectPath.trim().length === 0) {
    throw new Error("Project path is invalid.");
  }

  return resolve(projectPath);
}

function normalizeExportSettings(settings: ExportSettings | undefined, timelineSettings: SpikxProject["timeline"]["settings"]): ExportSettings {
  return {
    fps: coercePositiveInteger(settings?.fps ?? timelineSettings.fps, defaultExportSettings.fps),
    width: coercePositiveInteger(settings?.width ?? timelineSettings.width, defaultExportSettings.width),
    height: coercePositiveInteger(settings?.height ?? timelineSettings.height, defaultExportSettings.height),
    bitrateKbps: coercePositiveInteger(settings?.bitrateKbps ?? defaultExportSettings.bitrateKbps, defaultExportSettings.bitrateKbps),
    codec: settings?.codec === "libx265" ? "libx265" : "libx264"
  };
}

function coercePositiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function sendExportProgress(progress: ExportProgress): void {
  mainWindow?.webContents.send("timeline:export-progress", progress);
}

function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
