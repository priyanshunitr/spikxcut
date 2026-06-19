import type { MediaAsset } from "../../shared/types";

interface MediaPanelProps {
  assets: MediaAsset[];
  selectedAssetId?: string;
  onSelectAsset: (assetId: string) => void;
  onImportMedia: () => void;
}

export function MediaPanel({ assets, selectedAssetId, onSelectAsset, onImportMedia }: MediaPanelProps) {
  return (
    <section className="panel media-panel">
      <div className="panel-header">
        <h2>Media</h2>
        <button type="button" onClick={onImportMedia}>Import</button>
      </div>
      <div className="media-list">
        {assets.length === 0 ? (
          <button type="button" className="empty-state" onClick={onImportMedia}>
            Import media
          </button>
        ) : assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className={`media-item ${selectedAssetId === asset.id ? "selected" : ""}`}
            draggable
            onClick={() => onSelectAsset(asset.id)}
            onDragStart={(event) => {
              event.dataTransfer.setData("application/x-palmier-asset", asset.id);
              event.dataTransfer.effectAllowed = "copy";
            }}
          >
            <span className={`media-kind ${asset.type}`}>{asset.type}</span>
            <span className="media-name">{asset.name}</span>
            <span className="media-meta">
              {asset.width && asset.height ? `${asset.width}x${asset.height}` : "No dimensions"}
              {asset.durationSeconds ? ` · ${asset.durationSeconds.toFixed(1)}s` : ""}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
