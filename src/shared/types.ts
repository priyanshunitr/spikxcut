export type MediaType = "video" | "audio" | "image";

export type TrackType = "video" | "audio";

export type ClipId = string;
export type TrackId = string;
export type MediaAssetId = string;

export interface TimelineSettings {
  fps: number;
  width: number;
  height: number;
}

export interface MediaAsset {
  id: MediaAssetId;
  name: string;
  path: string;
  previewUrl?: string;
  type: MediaType;
  durationSeconds?: number;
  durationFrames?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  importedAt: string;
}

export interface Clip {
  id: ClipId;
  assetId: MediaAssetId;
  trackId: TrackId;
  name: string;
  type: MediaType;
  startFrame: number;
  durationFrames: number;
  trimStartFrame: number;
  opacity: number;
  volume: number;
  muted: boolean;
}

export interface Track {
  id: TrackId;
  name: string;
  type: TrackType;
  clips: Clip[];
  locked: boolean;
  muted: boolean;
}

export interface Timeline {
  settings: TimelineSettings;
  tracks: Track[];
}

export interface SpikxProject {
  app: "spikx-js";
  version: 1;
  name: string;
  createdAt: string;
  updatedAt: string;
  mediaAssets: MediaAsset[];
  timeline: Timeline;
}

export interface EditorSelection {
  assetId?: MediaAssetId;
  clipId?: ClipId;
  trackId?: TrackId;
}

export interface EditorState {
  project: SpikxProject;
  projectPath?: string;
  selection: EditorSelection;
  playheadFrame: number;
  status: string;
}

export interface SaveProjectResult {
  ok: boolean;
  projectPath?: string;
  error?: string;
}

export interface LoadProjectResult {
  ok: boolean;
  project?: SpikxProject;
  projectPath?: string;
  error?: string;
}

export interface ExportResult {
  ok: boolean;
  outputPath?: string;
  message: string;
}

export interface ToolStatus {
  ffmpeg: boolean;
  ffprobe: boolean;
}
