import { useMemo, useReducer } from "react";
import {
  addClipToTimeline,
  addMediaAssets,
  createEmptyProject,
  deleteClip,
  findAsset,
  findClip,
  updateClip
} from "../shared/editing";
import type { Clip, EditorSelection, EditorState, MediaAsset, PalmierProject, TrackId } from "../shared/types";
import { InspectorPanel } from "./components/InspectorPanel";
import { MediaPanel } from "./components/MediaPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { TimelineCanvas } from "./components/TimelineCanvas";
import { Toolbar } from "./components/Toolbar";

type Action =
  | { type: "set-status"; status: string }
  | { type: "set-project"; project: PalmierProject; projectPath?: string; status: string }
  | { type: "set-project-path"; projectPath: string; status: string }
  | { type: "add-media"; assets: MediaAsset[] }
  | { type: "select"; selection: EditorSelection }
  | { type: "add-clip"; assetId: string; trackId: TrackId; startFrame: number }
  | { type: "update-clip"; clipId: string; changes: Partial<Clip> }
  | { type: "delete-clip"; clipId: string }
  | { type: "set-playhead"; frame: number };

const initialState: EditorState = {
  project: createEmptyProject("Untitled"),
  selection: {},
  playheadFrame: 0,
  status: "Ready."
};

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "set-status":
      return { ...state, status: action.status };
    case "set-project":
      return {
        project: action.project,
        projectPath: action.projectPath,
        selection: {},
        playheadFrame: 0,
        status: action.status
      };
    case "set-project-path":
      return {
        ...state,
        projectPath: action.projectPath,
        status: action.status
      };
    case "add-media":
      return {
        ...state,
        project: addMediaAssets(state.project, action.assets),
        status: action.assets.length === 0 ? "Import canceled." : `Imported ${action.assets.length} asset${action.assets.length === 1 ? "" : "s"}.`
      };
    case "select":
      return {
        ...state,
        selection: action.selection
      };
    case "add-clip": {
      try {
        const result = addClipToTimeline(state.project, action.assetId, action.trackId, action.startFrame);

        return {
          ...state,
          project: result.project,
          selection: {
            clipId: result.clip.id,
            trackId: result.clip.trackId,
            assetId: result.clip.assetId
          },
          status: "Clip placed."
        };
      } catch (error) {
        return {
          ...state,
          status: error instanceof Error ? error.message : "Clip placement failed."
        };
      }
    }
    case "update-clip":
      return {
        ...state,
        project: updateClip(state.project, action.clipId, action.changes),
        status: "Clip updated."
      };
    case "delete-clip":
      return {
        ...state,
        project: deleteClip(state.project, action.clipId),
        selection: {},
        status: "Clip deleted."
      };
    case "set-playhead":
      return {
        ...state,
        playheadFrame: Math.max(0, Math.round(action.frame))
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

  async function importMedia(): Promise<void> {
    dispatch({ type: "set-status", status: "Importing media..." });
    const assets = await window.palmier.importMedia(state.project.timeline.settings.fps);
    dispatch({ type: "add-media", assets });
  }

  async function saveProject(): Promise<void> {
    dispatch({ type: "set-status", status: "Saving project..." });
    const result = await window.palmier.saveProject(state.project, state.projectPath);

    if (result.ok && result.projectPath) {
      dispatch({ type: "set-project-path", projectPath: result.projectPath, status: "Project saved." });
    } else {
      dispatch({ type: "set-status", status: result.error ?? "Save failed." });
    }
  }

  async function loadProject(): Promise<void> {
    dispatch({ type: "set-status", status: "Opening project..." });
    const result = await window.palmier.loadProject();

    if (result.ok && result.project) {
      dispatch({
        type: "set-project",
        project: result.project,
        projectPath: result.projectPath,
        status: "Project opened."
      });
    } else {
      dispatch({ type: "set-status", status: result.error ?? "Open failed." });
    }
  }

  async function newProject(): Promise<void> {
    const project = await window.palmier.newProject();
    dispatch({ type: "set-project", project, status: "New project." });
  }

  async function exportTimeline(): Promise<void> {
    dispatch({ type: "set-status", status: "Exporting..." });
    const result = await window.palmier.exportTimeline(state.project);
    dispatch({ type: "set-status", status: result.message });
  }

  return (
    <div className="app-shell">
      <Toolbar
        project={state.project}
        projectPath={state.projectPath}
        status={state.status}
        onNewProject={newProject}
        onImportMedia={importMedia}
        onSaveProject={saveProject}
        onLoadProject={loadProject}
        onExportTimeline={exportTimeline}
      />
      <main className="editor-grid">
        <MediaPanel
          assets={state.project.mediaAssets}
          selectedAssetId={state.selection.assetId}
          onSelectAsset={(assetId) => dispatch({ type: "select", selection: { assetId } })}
          onImportMedia={importMedia}
        />
        <PreviewPanel asset={selectedAsset} clip={selectedClip} fps={state.project.timeline.settings.fps} />
        <InspectorPanel
          asset={selectedAsset}
          clip={selectedClip}
          fps={state.project.timeline.settings.fps}
          onUpdateClip={(clipId, changes) => dispatch({ type: "update-clip", clipId, changes })}
          onDeleteClip={(clipId) => dispatch({ type: "delete-clip", clipId })}
        />
        <TimelineCanvas
          project={state.project}
          selection={state.selection}
          playheadFrame={state.playheadFrame}
          onSelectClip={(clip) => dispatch({
            type: "select",
            selection: {
              clipId: clip.id,
              trackId: clip.trackId,
              assetId: clip.assetId
            }
          })}
          onAddClip={(assetId, trackId, startFrame) => dispatch({ type: "add-clip", assetId, trackId, startFrame })}
          onSetPlayhead={(frame) => dispatch({ type: "set-playhead", frame })}
        />
      </main>
    </div>
  );
}
