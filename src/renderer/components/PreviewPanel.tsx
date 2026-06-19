import { secondsFromFrames } from "../../shared/editing";
import type { Clip, MediaAsset } from "../../shared/types";

interface PreviewPanelProps {
  asset?: MediaAsset;
  clip?: Clip;
  fps: number;
}

export function PreviewPanel({ asset, clip, fps }: PreviewPanelProps) {
  return (
    <section className="panel preview-panel">
      <div className="panel-header">
        <h2>Preview</h2>
        {clip ? <span>Clip · {secondsFromFrames(clip.durationFrames, fps).toFixed(2)}s</span> : null}
      </div>
      <div className="preview-stage">
        {!asset ? (
          <div className="preview-empty">Select media or a clip</div>
        ) : asset.type === "image" ? (
          <img src={asset.previewUrl} alt={asset.name} />
        ) : asset.type === "video" ? (
          <video src={asset.previewUrl} controls />
        ) : (
          <div className="audio-preview">
            <strong>{asset.name}</strong>
            <audio src={asset.previewUrl} controls />
          </div>
        )}
      </div>
    </section>
  );
}
