import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEmptyProject } from "../shared/editing";
import type { ExportResult, LoadProjectResult, PalmierProject, SaveProjectResult } from "../shared/types";
import { createMediaAsset, exportTimeline, getToolStatus } from "./ffmpeg";
import { readProjectFile, writeProjectFile } from "./projectIo";

const currentDir = dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | undefined;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#101214",
    title: "Palmier JS",
    webPreferences: {
      preload: join(currentDir, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
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

  ipcMain.handle("media:import", async (_event, fps: number) => {
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
      return [];
    }

    return Promise.all(result.filePaths.map((filePath) => createMediaAsset(filePath, fps)));
  });

  ipcMain.handle("project:save", async (_event, project: PalmierProject, projectPath?: string): Promise<SaveProjectResult> => {
    try {
      let targetPath = projectPath;

      if (!targetPath) {
        const result = await dialog.showSaveDialog(mainWindow!, {
          title: "Save Project",
          defaultPath: `${project.name || "Untitled"}.palmier-js.json`,
          filters: [{ name: "Palmier JS Project", extensions: ["palmier-js.json"] }]
        });

        if (result.canceled || !result.filePath) {
          return { ok: false, error: "Save canceled." };
        }

        targetPath = result.filePath;
      }

      await writeProjectFile(targetPath, project);
      return { ok: true, projectPath: targetPath };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Save failed." };
    }
  });

  ipcMain.handle("project:load", async (): Promise<LoadProjectResult> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: "Open Project",
        properties: ["openFile"],
        filters: [{ name: "Palmier JS Project", extensions: ["palmier-js.json", "json"] }]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: "Open canceled." };
      }

      const projectPath = result.filePaths[0];
      const project = await readProjectFile(projectPath);

      return { ok: true, project, projectPath };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Open failed." };
    }
  });

  ipcMain.handle("timeline:export", async (_event, project: PalmierProject): Promise<ExportResult> => {
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

    return exportTimeline(project, result.filePath);
  });

  ipcMain.handle("tools:status", () => getToolStatus());
}
