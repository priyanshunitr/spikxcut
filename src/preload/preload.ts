import { contextBridge, ipcRenderer } from "electron";
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
  SpikxProject,
  ToolStatus
} from "../shared/types";

const api = {
  newProject: (): Promise<SpikxProject> => ipcRenderer.invoke("project:new"),
  importMedia: (fps: number): Promise<ImportMediaResult> => ipcRenderer.invoke("media:import", fps),
  relinkMedia: (fps: number): Promise<RelinkMediaResult> => ipcRenderer.invoke("media:relink", fps),
  revealMedia: (filePath: string): Promise<void> => ipcRenderer.invoke("media:reveal", filePath),
  checkMediaFiles: (assets: Array<Pick<MediaAsset, "id" | "path">>): Promise<string[]> => (
    ipcRenderer.invoke("media:check-files", assets)
  ),
  saveProject: (project: SpikxProject, projectPath?: string): Promise<SaveProjectResult> => (
    ipcRenderer.invoke("project:save", project, projectPath)
  ),
  saveProjectAs: (project: SpikxProject): Promise<SaveProjectResult> => ipcRenderer.invoke("project:save-as", project),
  loadProject: (): Promise<LoadProjectResult> => ipcRenderer.invoke("project:load"),
  openRecentProject: (projectPath: string): Promise<LoadProjectResult> => ipcRenderer.invoke("project:open-recent", projectPath),
  getRecentProjects: (): Promise<RecentProject[]> => ipcRenderer.invoke("project:recent"),
  exportTimeline: (project: SpikxProject, settings: ExportSettings): Promise<ExportResult> => (
    ipcRenderer.invoke("timeline:export", project, settings)
  ),
  cancelExport: (): Promise<void> => ipcRenderer.invoke("timeline:export-cancel"),
  onExportProgress: (callback: (progress: ExportProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ExportProgress): void => callback(progress);
    ipcRenderer.on("timeline:export-progress", listener);

    return () => ipcRenderer.removeListener("timeline:export-progress", listener);
  },
  getToolStatus: (): Promise<ToolStatus> => ipcRenderer.invoke("tools:status")
};

contextBridge.exposeInMainWorld("spikx", api);

export type SpikxApi = typeof api;
