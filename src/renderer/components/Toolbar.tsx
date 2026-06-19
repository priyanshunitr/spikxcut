import type { PalmierProject } from "../../shared/types";

interface ToolbarProps {
  project: PalmierProject;
  projectPath?: string;
  status: string;
  onNewProject: () => void;
  onImportMedia: () => void;
  onSaveProject: () => void;
  onLoadProject: () => void;
  onExportTimeline: () => void;
}

export function Toolbar({
  project,
  projectPath,
  status,
  onNewProject,
  onImportMedia,
  onSaveProject,
  onLoadProject,
  onExportTimeline
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="project-title">
        <strong>{project.name}</strong>
        <span>{projectPath ?? "Unsaved project"}</span>
      </div>
      <div className="toolbar-actions">
        <button type="button" onClick={onNewProject}>New</button>
        <button type="button" onClick={onLoadProject}>Open</button>
        <button type="button" onClick={onSaveProject}>Save</button>
        <button type="button" onClick={onImportMedia}>Import</button>
        <button type="button" className="primary" onClick={onExportTimeline}>Export</button>
      </div>
      <div className="status-line">{status}</div>
    </header>
  );
}
