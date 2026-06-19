import { contextBridge, ipcRenderer } from "electron";
import type { ExportResult, LoadProjectResult, MediaAsset, SpikxProject, SaveProjectResult, ToolStatus } from "../shared/types";

const api = {
  newProject: (): Promise<SpikxProject> => ipcRenderer.invoke("project:new"),
  importMedia: (fps: number): Promise<MediaAsset[]> => ipcRenderer.invoke("media:import", fps),
  saveProject: (project: SpikxProject, projectPath?: string): Promise<SaveProjectResult> => (
    ipcRenderer.invoke("project:save", project, projectPath)
  ),
  loadProject: (): Promise<LoadProjectResult> => ipcRenderer.invoke("project:load"),
  exportTimeline: (project: SpikxProject): Promise<ExportResult> => ipcRenderer.invoke("timeline:export", project),
  getToolStatus: (): Promise<ToolStatus> => ipcRenderer.invoke("tools:status")
};

contextBridge.exposeInMainWorld("spikx", api);

export type SpikxApi = typeof api;
