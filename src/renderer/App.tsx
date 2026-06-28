import { useEffect, useMemo, useReducer } from "react";
import {
  addClipToTimeline,
  addCaptionOverlay,
  addClipKeyframe,
  addMediaAssets,
  addTextOverlay,
  addTimelineMarker,
  addTrack,
  canRelinkMediaAsset,
  createEmptyProject,
  defaultExportSettings,
  defaultExportPresets,
  deleteClips,
  deleteClipKeyframe,
  deleteTextOverlay,
  deleteTimelineMarker,
  findAsset,
  findClip,
  findTrack,
  getTimelineDurationFrames,
  moveClip,
  moveClips,
  relinkMediaAsset,
  removeMediaAsset,
  removeTrack,
  secondsFromFrames,
  splitClip,
  trimClip,
  updateClip,
  updateMediaAsset,
  updateProjectName,
  updateTextOverlay,
  updateTimelineMarker,
  updateTimelineSettings,
  updateTrack
} from "../shared/editing";
import type {
  Clip,
  EditorSelection,
  ExportProgress,
  ExportSettings,
  KeyframeProperty,
  MediaAsset,
  RecentProject,
  SpikxProject,
  TextOverlay,
  TimelineMarker,
  TimelineSettings,
  Track,
  TrackId,
  TrackType
} from "../shared/types";
import { InspectorPanel } from "./components/InspectorPanel";
import { MediaPanel } from "./components/MediaPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { TimelineCanvas } from "./components/TimelineCanvas";
import { Toolbar } from "./components/Toolbar";

interface AppState {
  project: SpikxProject;
  projectPath?: string;
  selection: EditorSelection;
  playheadFrame: number;
  status: string;
  undoStack: SpikxProject[];
  redoStack: SpikxProject[];
  dirty: boolean;
  isPlaying: boolean;
  timelineZoom: number;
  timelineScrollFrame: number;
  exportSettings: ExportSettings;
  exportProgress?: ExportProgress;
  recentProjects: RecentProject[];
  missingAssetIds: string[];
}

type Action =
  | { type: "set-status"; status: string }
  | { type: "set-recent-projects"; recentProjects: RecentProject[] }
  | { type: "set-missing-assets"; missingAssetIds: string[] }
  | { type: "set-export-progress"; progress?: ExportProgress }
  | { type: "set-project"; project: SpikxProject; projectPath?: string; status: string }
  | { type: "set-project-path"; projectPath: string; status: string }
  | { type: "add-media"; assets: MediaAsset[]; errorCount: number }
  | { type: "update-media"; assetId: string; changes: Partial<Pick<MediaAsset, "name" | "bin">> }
  | { type: "remove-media"; assetId: string }
  | { type: "relink-media"; assetId: string; asset: MediaAsset }
  | { type: "select-asset"; assetId: string }
  | { type: "select-track"; trackId: TrackId }
  | { type: "select-clip"; clip: Clip; additive: boolean }
  | { type: "select-marker"; markerId: string }
  | { type: "select-text-overlay"; textOverlayId: string }
  | { type: "add-clip"; assetId: string; trackId: TrackId; startFrame: number }
  | { type: "move-clip"; clipId: string; trackId: TrackId; startFrame: number }
  | { type: "move-clips"; clipIds: string[]; frameDelta: number }
  | { type: "trim-clip"; clipId: string; startDeltaFrames: number; endDeltaFrames: number }
  | { type: "split-selected" }
  | { type: "update-clip"; clipId: string; changes: Partial<Clip> }
  | { type: "delete-selected" }
  | { type: "add-marker"; frame: number }
  | { type: "update-marker"; markerId: string; changes: Partial<TimelineMarker> }
  | { type: "delete-marker"; markerId: string }
  | { type: "add-text-overlay"; frame: number }
  | { type: "add-caption-overlay"; frame: number }
  | { type: "update-text-overlay"; textOverlayId: string; changes: Partial<TextOverlay> }
  | { type: "delete-text-overlay"; textOverlayId: string }
  | { type: "add-clip-keyframe"; clipId: string; property: KeyframeProperty; frame: number }
  | { type: "delete-clip-keyframe"; clipId: string; keyframeId: string }
  | { type: "add-track"; trackType: TrackType }
  | { type: "update-track"; trackId: TrackId; changes: Partial<Omit<Track, "id" | "clips">> }
  | { type: "remove-track"; trackId: TrackId }
  | { type: "update-project-name"; name: string }
  | { type: "update-timeline-settings"; changes: Partial<TimelineSettings> }
  | { type: "update-export-settings"; changes: Partial<ExportSettings> }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "set-playhead"; frame: number }
  | { type: "advance-playhead"; frames: number }
  | { type: "set-playing"; playing: boolean }
  | { type: "set-zoom"; zoom: number }
  | { type: "set-scroll"; frame: number };

const autosaveKey = "spikxcut.autosave.v1";

const initialState: AppState = {
  project: createEmptyProject("Untitled"),
  selection: {},
  playheadFrame: 0,
  status: "Ready.",
  undoStack: [],
  redoStack: [],
  dirty: false,
  isPlaying: false,
  timelineZoom: 1,
  timelineScrollFrame: 0,
  exportSettings: defaultExportSettings,
  recentProjects: [],
  missingAssetIds: []
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "set-status":
      return { ...state, status: action.status };
    case "set-recent-projects":
      return { ...state, recentProjects: action.recentProjects };
    case "set-missing-assets":
      return { ...state, missingAssetIds: action.missingAssetIds };
    case "set-export-progress":
      return {
        ...state,
        exportProgress: action.progress,
        status: action.progress?.message ?? state.status
      };
    case "set-project":
      return {
        ...state,
        project: action.project,
        projectPath: action.projectPath,
        selection: {},
        playheadFrame: 0,
        undoStack: [],
        redoStack: [],
        dirty: false,
        isPlaying: false,
        timelineScrollFrame: 0,
        exportSettings: {
          ...state.exportSettings,
          fps: action.project.timeline.settings.fps,
          width: action.project.timeline.settings.width,
          height: action.project.timeline.settings.height
        },
        status: action.status
      };
    case "set-project-path":
      return {
        ...state,
        projectPath: action.projectPath,
        dirty: false,
        status: action.status
      };
    case "add-media":
      return commitProject(state, addMediaAssets(state.project, action.assets), {
        status: mediaImportStatus(action.assets.length, action.errorCount)
      });
    case "update-media":
      return commitProject(state, updateMediaAsset(state.project, action.assetId, action.changes), {
        status: "Media updated."
      });
    case "remove-media":
      return commitProject(state, removeMediaAsset(state.project, action.assetId), {
        selection: {},
        status: "Media removed."
      });
    case "relink-media": {
      const relinkedProject = relinkMediaAsset(state.project, action.assetId, action.asset);

      if (relinkedProject === state.project) {
        return {
          ...state,
          status: "Relinked media is not compatible with the current timeline."
        };
      }

      return {
        ...commitProject(state, relinkedProject, {
          status: "Media relinked."
        }),
        missingAssetIds: state.missingAssetIds.filter((assetId) => assetId !== action.assetId)
      };
    }
    case "select-asset":
      return {
        ...state,
        selection: { assetId: action.assetId }
      };
    case "select-track":
      return {
        ...state,
        selection: { trackId: action.trackId }
      };
    case "select-clip":
      return {
        ...state,
        selection: selectClip(state.selection, action.clip, action.additive)
      };
    case "select-marker":
      return {
        ...state,
        selection: { markerId: action.markerId }
      };
    case "select-text-overlay":
      return {
        ...state,
        selection: { textOverlayId: action.textOverlayId }
      };
    case "add-clip": {
      try {
        const result = addClipToTimeline(state.project, action.assetId, action.trackId, action.startFrame);

        return commitProject(state, result.project, {
          selection: {
            clipId: result.clip.id,
            clipIds: [result.clip.id],
            trackId: result.clip.trackId,
            assetId: result.clip.assetId
          },
          status: "Clip placed."
        });
      } catch (error) {
        return {
          ...state,
          status: error instanceof Error ? error.message : "Clip placement failed."
        };
      }
    }
    case "move-clip":
      return commitProject(state, moveClip(state.project, action.clipId, action.trackId, action.startFrame), {
        status: "Clip moved."
      });
    case "move-clips":
      return commitProject(state, moveClips(state.project, action.clipIds, action.frameDelta), {
        status: "Clips moved."
      });
    case "trim-clip":
      return commitProject(state, trimClip(state.project, action.clipId, action.startDeltaFrames, action.endDeltaFrames), {
        status: "Clip trimmed."
      });
    case "split-selected": {
      const clipIds = selectedClipIds(state.selection);
      const nextProject = clipIds.reduce((project, clipId) => splitClip(project, clipId, state.playheadFrame), state.project);

      return commitProject(state, nextProject, {
        status: "Clip split."
      });
    }
    case "update-clip":
      return commitProject(state, updateClip(state.project, action.clipId, action.changes), {
        status: "Clip updated."
      });
    case "delete-selected": {
      const clipIds = selectedClipIds(state.selection);

      if (state.selection.markerId) {
        return commitProject(state, deleteTimelineMarker(state.project, state.selection.markerId), {
          selection: {},
          status: "Marker deleted."
        });
      }

      if (state.selection.textOverlayId) {
        return commitProject(state, deleteTextOverlay(state.project, state.selection.textOverlayId), {
          selection: {},
          status: "Title deleted."
        });
      }

      if (clipIds.length === 0) {
        return state;
      }

      return commitProject(state, deleteClips(state.project, clipIds), {
        selection: {},
        status: "Clip deleted."
      });
    }
    case "add-marker": {
      const result = addTimelineMarker(state.project, action.frame);

      return commitProject(state, result.project, {
        selection: { markerId: result.marker.id },
        status: "Marker added."
      });
    }
    case "update-marker":
      return commitProject(state, updateTimelineMarker(state.project, action.markerId, action.changes), {
        status: "Marker updated."
      });
    case "delete-marker":
      return commitProject(state, deleteTimelineMarker(state.project, action.markerId), {
        selection: {},
        status: "Marker deleted."
      });
    case "add-text-overlay": {
      const result = addTextOverlay(state.project, action.frame);

      return commitProject(state, result.project, {
        selection: { textOverlayId: result.overlay.id },
        status: "Title added."
      });
    }
    case "add-caption-overlay": {
      const result = addCaptionOverlay(state.project, action.frame);

      return commitProject(state, result.project, {
        selection: { textOverlayId: result.overlay.id },
        status: "Caption added."
      });
    }
    case "update-text-overlay":
      return commitProject(state, updateTextOverlay(state.project, action.textOverlayId, action.changes), {
        status: "Title updated."
      });
    case "delete-text-overlay":
      return commitProject(state, deleteTextOverlay(state.project, action.textOverlayId), {
        selection: {},
        status: "Title deleted."
      });
    case "add-clip-keyframe":
      return commitProject(state, addClipKeyframe(state.project, action.clipId, action.property, action.frame), {
        status: "Keyframe added."
      });
    case "delete-clip-keyframe":
      return commitProject(state, deleteClipKeyframe(state.project, action.clipId, action.keyframeId), {
        status: "Keyframe deleted."
      });
    case "add-track": {
      const result = addTrack(state.project, action.trackType);

      return commitProject(state, result.project, {
        selection: { trackId: result.track.id },
        status: "Track added."
      });
    }
    case "update-track":
      return commitProject(state, updateTrack(state.project, action.trackId, action.changes), {
        status: "Track updated."
      });
    case "remove-track":
      return commitProject(state, removeTrack(state.project, action.trackId), {
        selection: {},
        status: "Track removed."
      });
    case "update-project-name":
      return commitProject(state, updateProjectName(state.project, action.name), {
        status: "Project renamed."
      });
    case "update-timeline-settings":
      return {
        ...commitProject(state, updateTimelineSettings(state.project, action.changes), {
          status: "Timeline settings updated."
        }),
        exportSettings: {
          ...state.exportSettings,
          ...action.changes
        }
      };
    case "update-export-settings":
      return {
        ...state,
        exportSettings: sanitizeExportSettings({
          ...state.exportSettings,
          ...action.changes
        })
      };
    case "undo": {
      const previousProject = state.undoStack.at(-1);

      if (!previousProject) {
        return state;
      }

      return {
        ...state,
        project: previousProject,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [state.project, ...state.redoStack].slice(0, 50),
        dirty: true,
        status: "Undo."
      };
    }
    case "redo": {
      const nextProject = state.redoStack[0];

      if (!nextProject) {
        return state;
      }

      return {
        ...state,
        project: nextProject,
        undoStack: [...state.undoStack, state.project].slice(-50),
        redoStack: state.redoStack.slice(1),
        dirty: true,
        status: "Redo."
      };
    }
    case "set-playhead":
      return {
        ...state,
        playheadFrame: clampFrame(action.frame, getTimelineDurationFrames(state.project.timeline)),
        isPlaying: false
      };
    case "advance-playhead": {
      const durationFrames = getTimelineDurationFrames(state.project.timeline);
      const nextFrame = clampFrame(state.playheadFrame + action.frames, durationFrames);

      return {
        ...state,
        playheadFrame: nextFrame,
        isPlaying: nextFrame < durationFrames
      };
    }
    case "set-playing":
      return {
        ...state,
        isPlaying: action.playing
      };
    case "set-zoom":
      return {
        ...state,
        timelineZoom: Math.min(12, Math.max(0.5, action.zoom))
      };
    case "set-scroll":
      return {
        ...state,
        timelineScrollFrame: clampFrame(action.frame, getTimelineDurationFrames(state.project.timeline))
      };
    default:
      return state;
  }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const selectedClip = useMemo(
    () => state.selection.clipId ? findClip(state.project.timeline, state.selection.clipId) : undefined,
    [state.project.timeline, state.selection.clipId]
  );
  const selectedAsset = useMemo(() => {
    if (selectedClip) {
      return findAsset(state.project, selectedClip.assetId);
    }

    return state.selection.assetId ? findAsset(state.project, state.selection.assetId) : undefined;
  }, [selectedClip, state.project, state.selection.assetId]);
  const selectedTrack = useMemo(
    () => state.selection.trackId ? findTrack(state.project.timeline, state.selection.trackId) : undefined,
    [state.project.timeline, state.selection.trackId]
  );
  const selectedMarker = useMemo(
    () => state.selection.markerId ? state.project.timeline.markers.find((marker) => marker.id === state.selection.markerId) : undefined,
    [state.project.timeline.markers, state.selection.markerId]
  );
  const selectedTextOverlay = useMemo(
    () => state.selection.textOverlayId ? state.project.timeline.textOverlays.find((overlay) => overlay.id === state.selection.textOverlayId) : undefined,
    [state.project.timeline.textOverlays, state.selection.textOverlayId]
  );
  const timecode = formatTimecode(state.playheadFrame, state.project.timeline.settings.fps);
  const usedAssetIds = useMemo(() => (
    Array.from(new Set(state.project.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.assetId))))
  ), [state.project.timeline.tracks]);

  useEffect(() => {
    void refreshRecentProjects();

    const rawAutosave = window.localStorage.getItem(autosaveKey);

    if (!rawAutosave) {
      return;
    }

    try {
      const autosave = JSON.parse(rawAutosave) as { project?: SpikxProject; savedAt?: string };

      if (autosave.project && window.confirm(`Restore autosaved project from ${autosave.savedAt ?? "a previous session"}?`)) {
        dispatch({ type: "set-project", project: autosave.project, status: "Autosave restored." });
      }
    } catch {
      window.localStorage.removeItem(autosaveKey);
    }
  }, []);

  useEffect(() => {
    if (!state.dirty) {
      return;
    }

    const timer = window.setTimeout(() => {
      window.localStorage.setItem(autosaveKey, JSON.stringify({
        savedAt: new Date().toLocaleString(),
        project: state.project
      }));
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [state.dirty, state.project]);

  useEffect(() => {
    const unsubscribe = window.spikx.onExportProgress((progress) => {
      dispatch({ type: "set-export-progress", progress });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    void checkMissingMedia(state.project.mediaAssets);
  }, [state.project.mediaAssets]);

  useEffect(() => {
    if (!state.isPlaying) {
      return;
    }

    let lastTimestamp = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsedSeconds = (now - lastTimestamp) / 1000;
      lastTimestamp = now;
      dispatch({
        type: "advance-playhead",
        frames: elapsedSeconds * state.project.timeline.settings.fps
      });
    }, 80);

    return () => window.clearInterval(timer);
  }, [state.isPlaying, state.project.timeline.settings.fps]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (!state.dirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", beforeUnload);

    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [state.dirty]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isEditable = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (isEditable && event.key !== "Escape") {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void (event.shiftKey ? saveProjectAs() : saveProject());
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void loadProject();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void newProject();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        dispatch({ type: "delete-selected" });
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        dispatch({
          type: "set-playhead",
          frame: state.playheadFrame + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 1)
        });
        return;
      }

      if (event.key === "," || event.key === ".") {
        const clipIds = selectedClipIds(state.selection);

        if (clipIds.length > 0) {
          event.preventDefault();
          dispatch({ type: "move-clips", clipIds, frameDelta: event.key === "." ? 1 : -1 });
        }

        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        dispatch({ type: "set-zoom", zoom: state.timelineZoom + 0.25 });
        return;
      }

      if (event.key === "-") {
        event.preventDefault();
        dispatch({ type: "set-zoom", zoom: state.timelineZoom - 0.25 });
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        dispatch({ type: "set-playing", playing: !state.isPlaying });
        return;
      }

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        dispatch({ type: "add-marker", frame: state.playheadFrame });
        return;
      }

      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        dispatch({ type: "add-text-overlay", frame: state.playheadFrame });
        return;
      }

      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        dispatch({ type: "add-caption-overlay", frame: state.playheadFrame });
        return;
      }

      if (event.key.toLowerCase() === "f" && selectedClip) {
        event.preventDefault();
        const fadeFrames = Math.max(1, Math.round(state.project.timeline.settings.fps / 2));
        dispatch({
          type: "update-clip",
          clipId: selectedClip.id,
          changes: {
            transitions: {
              kind: "fade",
              inFrames: fadeFrames,
              outFrames: fadeFrames
            }
          }
        });
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        dispatch({ type: "split-selected" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedClip, state.isPlaying, state.playheadFrame, state.project, state.projectPath, state.selection, state.timelineZoom]);

  async function refreshRecentProjects(): Promise<void> {
    const recentProjects = await window.spikx.getRecentProjects();
    dispatch({ type: "set-recent-projects", recentProjects });
  }

  async function checkMissingMedia(assets: MediaAsset[]): Promise<void> {
    if (assets.length === 0) {
      dispatch({ type: "set-missing-assets", missingAssetIds: [] });
      return;
    }

    const missingAssetIds = await window.spikx.checkMediaFiles(assets.map((asset) => ({ id: asset.id, path: asset.path })));
    dispatch({ type: "set-missing-assets", missingAssetIds });
  }

  async function importMedia(): Promise<void> {
    dispatch({ type: "set-status", status: "Importing media..." });
    const result = await window.spikx.importMedia(state.project.timeline.settings.fps);
    dispatch({ type: "add-media", assets: result.assets, errorCount: result.errors.length });
  }

  async function saveProject(): Promise<void> {
    dispatch({ type: "set-status", status: "Saving project..." });
    const result = await window.spikx.saveProject(state.project, state.projectPath);

    if (result.ok && result.projectPath) {
      window.localStorage.removeItem(autosaveKey);
      dispatch({ type: "set-project-path", projectPath: result.projectPath, status: "Project saved." });
      await refreshRecentProjects();
    } else {
      dispatch({ type: "set-status", status: result.error ?? "Save failed." });
    }
  }

  async function saveProjectAs(): Promise<void> {
    dispatch({ type: "set-status", status: "Saving project..." });
    const result = await window.spikx.saveProjectAs(state.project);

    if (result.ok && result.projectPath) {
      window.localStorage.removeItem(autosaveKey);
      dispatch({ type: "set-project-path", projectPath: result.projectPath, status: "Project saved." });
      await refreshRecentProjects();
    } else {
      dispatch({ type: "set-status", status: result.error ?? "Save failed." });
    }
  }

  async function loadProject(): Promise<void> {
    if (!confirmDiscardChanges(state.dirty)) {
      return;
    }

    dispatch({ type: "set-status", status: "Opening project..." });
    const result = await window.spikx.loadProject();
    await handleLoadResult(result);
  }

  async function openRecentProject(projectPath: string): Promise<void> {
    if (!confirmDiscardChanges(state.dirty)) {
      return;
    }

    dispatch({ type: "set-status", status: "Opening project..." });
    const result = await window.spikx.openRecentProject(projectPath);
    await handleLoadResult(result);
  }

  async function handleLoadResult(result: Awaited<ReturnType<typeof window.spikx.loadProject>>): Promise<void> {
    if (result.ok && result.project) {
      dispatch({
        type: "set-project",
        project: result.project,
        projectPath: result.projectPath,
        status: "Project opened."
      });
      await refreshRecentProjects();
    } else {
      dispatch({ type: "set-status", status: result.error ?? "Open failed." });
    }
  }

  async function newProject(): Promise<void> {
    if (!confirmDiscardChanges(state.dirty)) {
      return;
    }

    const project = await window.spikx.newProject();
    dispatch({ type: "set-project", project, status: "New project." });
  }

  async function relinkAsset(assetId: string): Promise<void> {
    const result = await window.spikx.relinkMedia(state.project.timeline.settings.fps);

    if (result.ok && result.asset) {
      if (!canRelinkMediaAsset(state.project, assetId, result.asset)) {
        dispatch({ type: "set-status", status: "Relinked media is not compatible with the current timeline." });
        return;
      }

      dispatch({ type: "relink-media", assetId, asset: result.asset });
    } else {
      dispatch({ type: "set-status", status: result.error ?? "Relink failed." });
    }
  }

  async function exportTimeline(): Promise<void> {
    dispatch({ type: "set-status", status: "Exporting..." });
    const result = await window.spikx.exportTimeline(state.project, state.exportSettings);
    dispatch({ type: "set-status", status: result.message });
  }

  async function cancelExport(): Promise<void> {
    await window.spikx.cancelExport();
  }

  function applyExportPreset(presetId: string): void {
    const preset = defaultExportPresets.find((item) => item.id === presetId);

    if (!preset) {
      return;
    }

    dispatch({ type: "update-export-settings", changes: preset.settings });
    dispatch({ type: "set-status", status: `${preset.name} preset applied.` });
  }

  return (
    <div className="app-shell">
      <Toolbar
        project={state.project}
        projectPath={state.projectPath}
        status={state.status}
        dirty={state.dirty}
        canUndo={state.undoStack.length > 0}
        canRedo={state.redoStack.length > 0}
        isPlaying={state.isPlaying}
        timecode={timecode}
        recentProjects={state.recentProjects}
        exportProgress={state.exportProgress}
        exportPresets={defaultExportPresets}
        onNewProject={newProject}
        onImportMedia={importMedia}
        onSaveProject={saveProject}
        onSaveProjectAs={saveProjectAs}
        onLoadProject={loadProject}
        onOpenRecentProject={openRecentProject}
        onExportTimeline={exportTimeline}
        onCancelExport={cancelExport}
        onApplyExportPreset={applyExportPreset}
        onAddMarker={() => dispatch({ type: "add-marker", frame: state.playheadFrame })}
        onAddTextOverlay={() => dispatch({ type: "add-text-overlay", frame: state.playheadFrame })}
        onAddCaptionOverlay={() => dispatch({ type: "add-caption-overlay", frame: state.playheadFrame })}
        onStepFrame={(frames) => dispatch({ type: "set-playhead", frame: state.playheadFrame + frames })}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onTogglePlayback={() => dispatch({ type: "set-playing", playing: !state.isPlaying })}
        onRenameProject={(name) => dispatch({ type: "update-project-name", name })}
      />
      <main className="editor-grid">
        <MediaPanel
          assets={state.project.mediaAssets}
          selectedAssetId={state.selection.assetId}
          missingAssetIds={state.missingAssetIds}
          usedAssetIds={usedAssetIds}
          onSelectAsset={(assetId) => dispatch({ type: "select-asset", assetId })}
          onImportMedia={importMedia}
          onRemoveAsset={(assetId) => dispatch({ type: "remove-media", assetId })}
          onRevealAsset={(asset) => window.spikx.revealMedia(asset.path)}
          onRelinkAsset={relinkAsset}
        />
        <PreviewPanel
          project={state.project}
          selectedAsset={selectedAsset}
          selectedClip={selectedClip}
          playheadFrame={state.playheadFrame}
          isPlaying={state.isPlaying}
        />
        <InspectorPanel
          project={state.project}
          asset={selectedAsset}
          clip={selectedClip}
          track={selectedTrack}
          marker={selectedMarker}
          textOverlay={selectedTextOverlay}
          playheadFrame={state.playheadFrame}
          fps={state.project.timeline.settings.fps}
          exportSettings={state.exportSettings}
          missingAssetIds={state.missingAssetIds}
          onUpdateAsset={(assetId, changes) => dispatch({ type: "update-media", assetId, changes })}
          onUpdateClip={(clipId, changes) => dispatch({ type: "update-clip", clipId, changes })}
          onDeleteClip={() => dispatch({ type: "delete-selected" })}
          onAddClipKeyframe={(clipId, property) => dispatch({ type: "add-clip-keyframe", clipId, property, frame: state.playheadFrame })}
          onDeleteClipKeyframe={(clipId, keyframeId) => dispatch({ type: "delete-clip-keyframe", clipId, keyframeId })}
          onUpdateMarker={(markerId, changes) => dispatch({ type: "update-marker", markerId, changes })}
          onDeleteMarker={(markerId) => dispatch({ type: "delete-marker", markerId })}
          onUpdateTextOverlay={(textOverlayId, changes) => dispatch({ type: "update-text-overlay", textOverlayId, changes })}
          onDeleteTextOverlay={(textOverlayId) => dispatch({ type: "delete-text-overlay", textOverlayId })}
          onUpdateTrack={(trackId, changes) => dispatch({ type: "update-track", trackId, changes })}
          onRemoveTrack={(trackId) => dispatch({ type: "remove-track", trackId })}
          onUpdateProjectName={(name) => dispatch({ type: "update-project-name", name })}
          onUpdateTimelineSettings={(changes) => dispatch({ type: "update-timeline-settings", changes })}
          onUpdateExportSettings={(changes) => dispatch({ type: "update-export-settings", changes })}
          onRelinkAsset={relinkAsset}
          onRevealAsset={(asset) => window.spikx.revealMedia(asset.path)}
          onRemoveAsset={(assetId) => dispatch({ type: "remove-media", assetId })}
        />
        <TimelineCanvas
          project={state.project}
          selection={state.selection}
          playheadFrame={state.playheadFrame}
          zoom={state.timelineZoom}
          scrollFrame={state.timelineScrollFrame}
          timecode={timecode}
          onSelectClip={(clip, additive) => dispatch({ type: "select-clip", clip, additive })}
          onSelectTrack={(trackId) => dispatch({ type: "select-track", trackId })}
          onSelectMarker={(markerId) => dispatch({ type: "select-marker", markerId })}
          onSelectTextOverlay={(textOverlayId) => dispatch({ type: "select-text-overlay", textOverlayId })}
          onAddClip={(assetId, trackId, startFrame) => dispatch({ type: "add-clip", assetId, trackId, startFrame })}
          onMoveClip={(clipId, trackId, startFrame) => dispatch({ type: "move-clip", clipId, trackId, startFrame })}
          onMoveClips={(clipIds, frameDelta) => dispatch({ type: "move-clips", clipIds, frameDelta })}
          onTrimClip={(clipId, startDeltaFrames, endDeltaFrames) => dispatch({ type: "trim-clip", clipId, startDeltaFrames, endDeltaFrames })}
          onSetPlayhead={(frame) => dispatch({ type: "set-playhead", frame })}
          onAddTrack={(trackType) => dispatch({ type: "add-track", trackType })}
          onSetZoom={(zoom) => dispatch({ type: "set-zoom", zoom })}
          onSetScrollFrame={(frame) => dispatch({ type: "set-scroll", frame })}
        />
      </main>
    </div>
  );
}

function commitProject(
  state: AppState,
  project: SpikxProject,
  options: { status: string; selection?: EditorSelection }
): AppState {
  if (project === state.project) {
    return {
      ...state,
      status: options.status,
      selection: options.selection ?? state.selection
    };
  }

  return {
    ...state,
    project,
    selection: options.selection ?? state.selection,
    undoStack: [...state.undoStack, state.project].slice(-50),
    redoStack: [],
    dirty: true,
    status: options.status
  };
}

function selectClip(selection: EditorSelection, clip: Clip, additive: boolean): EditorSelection {
  if (!additive) {
    return {
      clipId: clip.id,
      clipIds: [clip.id],
      trackId: clip.trackId,
      assetId: clip.assetId
    };
  }

  const currentClipIds = selectedClipIds(selection);
  const clipIds = currentClipIds.includes(clip.id)
    ? currentClipIds.filter((clipId) => clipId !== clip.id)
    : [...currentClipIds, clip.id];
  const fallbackClipIds = clipIds.length === 0 ? [clip.id] : clipIds;

  return {
    clipId: fallbackClipIds.at(-1),
    clipIds: fallbackClipIds,
    trackId: clip.trackId,
    assetId: clip.assetId
  };
}

function selectedClipIds(selection: EditorSelection): string[] {
  if (selection.clipIds && selection.clipIds.length > 0) {
    return selection.clipIds;
  }

  return selection.clipId ? [selection.clipId] : [];
}

function clampFrame(frame: number, maximumFrame: number): number {
  if (!Number.isFinite(frame)) {
    return 0;
  }

  return Math.min(Math.max(0, Math.round(frame)), Math.max(0, maximumFrame));
}

function sanitizeExportSettings(settings: ExportSettings): ExportSettings {
  return {
    fps: positiveInteger(settings.fps, defaultExportSettings.fps),
    width: positiveInteger(settings.width, defaultExportSettings.width),
    height: positiveInteger(settings.height, defaultExportSettings.height),
    bitrateKbps: positiveInteger(settings.bitrateKbps, defaultExportSettings.bitrateKbps),
    codec: settings.codec === "libx265" ? "libx265" : "libx264"
  };
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function mediaImportStatus(assetCount: number, errorCount: number): string {
  if (assetCount === 0 && errorCount === 0) {
    return "Import canceled.";
  }

  if (errorCount > 0) {
    return `Imported ${assetCount} asset${assetCount === 1 ? "" : "s"}; ${errorCount} failed.`;
  }

  return `Imported ${assetCount} asset${assetCount === 1 ? "" : "s"}.`;
}

function confirmDiscardChanges(dirty: boolean): boolean {
  return !dirty || window.confirm("Discard unsaved changes?");
}

function formatTimecode(frame: number, fps: number): string {
  const totalSeconds = secondsFromFrames(frame, fps);
  const wholeSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  const frames = Math.round(frame % fps);

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
