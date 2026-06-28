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

export type ExportCodec = "libx264" | "libx265";
export type ClipFit = "contain" | "cover";
export type TransitionKind = "none" | "fade" | "dissolve" | "slide" | "wipe" | "zoom" | "blur" | "glitch";
export type KeyframeProperty = "x" | "y" | "scale" | "rotation" | "opacity" | "volume";

export interface ExportPreset {
  id: string;
  name: string;
  settings: ExportSettings;
}

export interface ExportSettings {
  fps: number;
  width: number;
  height: number;
  bitrateKbps: number;
  codec: ExportCodec;
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
  bin?: string;
}

export interface ClipTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  fit: ClipFit;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  cropLeft: number;
}

export interface ClipTransitions {
  kind: TransitionKind;
  inFrames: number;
  outFrames: number;
}

export interface ClipEffects {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  sharpen: number;
  vignette: number;
}

export interface ClipSpeed {
  rate: number;
  reverse: boolean;
  freezeFrame: boolean;
}

export interface ClipKeyframe {
  id: string;
  frame: number;
  property: KeyframeProperty;
  value: number;
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
  transform: ClipTransform;
  transitions: ClipTransitions;
  effects: ClipEffects;
  speed: ClipSpeed;
  keyframes: ClipKeyframe[];
}

export interface Track {
  id: TrackId;
  name: string;
  type: TrackType;
  clips: Clip[];
  locked: boolean;
  muted: boolean;
}

export interface TimelineMarker {
  id: string;
  frame: number;
  label: string;
  color: string;
}

export interface TextOverlay {
  id: string;
  text: string;
  startFrame: number;
  durationFrames: number;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  backgroundColor: string;
  opacity: number;
  align: "left" | "center" | "right";
  role: "title" | "caption";
}

export interface Timeline {
  settings: TimelineSettings;
  tracks: Track[];
  markers: TimelineMarker[];
  textOverlays: TextOverlay[];
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
  clipIds?: ClipId[];
  trackId?: TrackId;
  markerId?: string;
  textOverlayId?: string;
}

export interface EditorState {
  project: SpikxProject;
  projectPath?: string;
  selection: EditorSelection;
  playheadFrame: number;
  status: string;
}

export interface ImportMediaError {
  path: string;
  error: string;
}

export interface ImportMediaResult {
  assets: MediaAsset[];
  errors: ImportMediaError[];
}

export interface RelinkMediaResult {
  ok: boolean;
  asset?: MediaAsset;
  error?: string;
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

export interface ExportProgress {
  running: boolean;
  percent: number;
  message: string;
  outputPath?: string;
}

export interface RecentProject {
  path: string;
  name: string;
  openedAt: string;
}

export interface ToolStatus {
  ffmpeg: boolean;
  ffprobe: boolean;
}
