import type { ExportPreset, ExportProgress, RecentProject, SpikxProject } from "../../shared/types";

interface ToolbarProps {
  project: SpikxProject;
  projectPath?: string;
  status: string;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isPlaying: boolean;
  timecode: string;
  recentProjects: RecentProject[];
  exportProgress?: ExportProgress;
  exportPresets: ExportPreset[];
  onNewProject: () => void;
  onImportMedia: () => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onLoadProject: () => void;
  onOpenRecentProject: (projectPath: string) => void;
  onExportTimeline: () => void;
  onCancelExport: () => void;
  onApplyExportPreset: (presetId: string) => void;
  onAddMarker: () => void;
  onAddTextOverlay: () => void;
  onAddCaptionOverlay: () => void;
  onStepFrame: (frames: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePlayback: () => void;
  onRenameProject: (name: string) => void;
}

export function Toolbar({
  project,
  projectPath,
  status,
  dirty,
  canUndo,
  canRedo,
  isPlaying,
  timecode,
  recentProjects,
  exportProgress,
  exportPresets,
  onNewProject,
  onImportMedia,
  onSaveProject,
  onSaveProjectAs,
  onLoadProject,
  onOpenRecentProject,
  onExportTimeline,
  onCancelExport,
  onApplyExportPreset,
  onAddMarker,
  onAddTextOverlay,
  onAddCaptionOverlay,
  onStepFrame,
  onUndo,
  onRedo,
  onTogglePlayback,
  onRenameProject
}: ToolbarProps) {
  const exportRunning = exportProgress?.running === true;

  return (
    <header className="toolbar">
      <div className="project-title">
        <div className="app-mark" aria-hidden="true">
          <span />
        </div>
        <div className="project-title-copy">
          <div className="brand-name">Spikx Cut</div>
          <input
            aria-label="Project name"
            className="project-name-input"
            value={project.name}
            onChange={(event) => onRenameProject(event.currentTarget.value)}
          />
          <span>{dirty ? "* " : ""}{projectPath ?? "Unsaved project"}</span>
        </div>
      </div>
      <div className="toolbar-actions">
        <div className="toolbar-group">
          <button type="button" onClick={onNewProject}>New</button>
          <button type="button" onClick={onLoadProject}>Open</button>
          <button type="button" onClick={onSaveProject}>Save</button>
          <button type="button" onClick={onSaveProjectAs}>Save As</button>
          <select
            aria-label="Recent projects"
            value=""
            onChange={(event) => {
              if (event.currentTarget.value) {
                onOpenRecentProject(event.currentTarget.value);
                event.currentTarget.value = "";
              }
            }}
          >
            <option value="">Recent</option>
            {recentProjects.map((recentProject) => (
              <option key={recentProject.path} value={recentProject.path}>
                {recentProject.name}
              </option>
            ))}
          </select>
        </div>
        <div className="toolbar-group">
          <button type="button" onClick={onImportMedia}>Import</button>
          <button type="button" onClick={onUndo} disabled={!canUndo}>Undo</button>
          <button type="button" onClick={onRedo} disabled={!canRedo}>Redo</button>
          <button type="button" onClick={onAddMarker}>Marker</button>
          <button type="button" onClick={onAddTextOverlay}>Title</button>
          <button type="button" onClick={onAddCaptionOverlay}>Caption</button>
        </div>
        <div className="toolbar-group playback-controls">
          <button type="button" aria-label="Previous frame" onClick={() => onStepFrame(-1)}>Prev</button>
          <button type="button" className="play-button" onClick={onTogglePlayback}>{isPlaying ? "Pause" : "Play"}</button>
          <button type="button" aria-label="Next frame" onClick={() => onStepFrame(1)}>Next</button>
        </div>
        <div className="toolbar-group export-controls">
          <select
            aria-label="Export preset"
            value=""
            onChange={(event) => {
              if (event.currentTarget.value) {
                onApplyExportPreset(event.currentTarget.value);
                event.currentTarget.value = "";
              }
            }}
          >
            <option value="">Preset</option>
            {exportPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          <button type="button" className="primary" onClick={onExportTimeline} disabled={exportRunning}>Export</button>
          {exportRunning ? (
            <button type="button" className="danger" onClick={onCancelExport}>Cancel</button>
          ) : null}
        </div>
      </div>
      <div className="status-line">
        <strong>{timecode}</strong>
        {exportProgress ? (
          <span className="export-progress">
            <span style={{ width: `${exportProgress.percent}%` }} />
          </span>
        ) : null}
        <span>{status}</span>
      </div>
    </header>
  );
}
