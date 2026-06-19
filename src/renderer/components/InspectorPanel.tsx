import type { Clip, MediaAsset } from "../../shared/types";

interface InspectorPanelProps {
  asset?: MediaAsset;
  clip?: Clip;
  fps: number;
  onUpdateClip: (clipId: string, changes: Partial<Clip>) => void;
  onDeleteClip: (clipId: string) => void;
}

export function InspectorPanel({ asset, clip, fps, onUpdateClip, onDeleteClip }: InspectorPanelProps) {
  return (
    <aside className="panel inspector-panel">
      <div className="panel-header">
        <h2>Inspector</h2>
      </div>
      {!asset ? (
        <div className="inspector-empty">Nothing selected</div>
      ) : (
        <div className="inspector-fields">
          <label>
            <span>Name</span>
            <input value={clip?.name ?? asset.name} readOnly />
          </label>
          <label>
            <span>Type</span>
            <input value={asset.type} readOnly />
          </label>
          <label>
            <span>Path</span>
            <input value={asset.path} readOnly />
          </label>
          {clip ? (
            <>
              <label>
                <span>Start frame</span>
                <input
                  type="number"
                  value={clip.startFrame}
                  min={0}
                  onChange={(event) => onUpdateClip(clip.id, { startFrame: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                <span>Duration frames</span>
                <input
                  type="number"
                  value={clip.durationFrames}
                  min={1}
                  onChange={(event) => onUpdateClip(clip.id, { durationFrames: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                <span>Trim start</span>
                <input
                  type="number"
                  value={clip.trimStartFrame}
                  min={0}
                  onChange={(event) => onUpdateClip(clip.id, { trimStartFrame: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                <span>Opacity</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={clip.opacity}
                  onChange={(event) => onUpdateClip(clip.id, { opacity: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                <span>Volume</span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.01}
                  value={clip.volume}
                  onChange={(event) => onUpdateClip(clip.id, { volume: Number(event.currentTarget.value) })}
                />
              </label>
              <div className="inspector-summary">
                {(clip.durationFrames / fps).toFixed(2)} seconds at {fps} fps
              </div>
              <button type="button" className="danger" onClick={() => onDeleteClip(clip.id)}>Delete Clip</button>
            </>
          ) : null}
        </div>
      )}
    </aside>
  );
}
