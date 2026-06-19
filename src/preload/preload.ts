import { contextBridge, ipcRenderer } from "electron";
import type { ExportResult, LoadProjectResult, MediaAsset, PalmierProject, SaveProjectResult, ToolStatus } from "../shared/types";

const api = {
  newProject: (): Promise<PalmierProject> => ipcRenderer.invoke("project:new"),
  importMedia: (fps: number): Promise<MediaAsset[]> => ipcRenderer.invoke("media:import", fps),
  saveProject: (project: PalmierProject, projectPath?: string): Promise<SaveProjectResult> => (
    ipcRenderer.invoke("project:save", project, projectPath)
  ),
  loadProject: (): Promise<LoadProjectResult> => ipcRenderer.invoke("project:load"),
  exportTimeline: (project: PalmierProject): Promise<ExportResult> => ipcRenderer.invoke("timeline:export", project),
  getToolStatus: (): Promise<ToolStatus> => ipcRenderer.invoke("tools:status")
};

contextBridge.exposeInMainWorld("palmier", api);

export type PalmierApi = typeof api;
