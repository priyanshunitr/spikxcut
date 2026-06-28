import { useMemo, useState } from "react";
import type { MediaAsset } from "../../shared/types";

interface MediaPanelProps {
  assets: MediaAsset[];
  selectedAssetId?: string;
  missingAssetIds: string[];
  usedAssetIds: string[];
  onSelectAsset: (assetId: string) => void;
  onImportMedia: () => void;
  onRemoveAsset: (assetId: string) => void;
  onRevealAsset: (asset: MediaAsset) => void;
  onRelinkAsset: (assetId: string) => void;
}

export function MediaPanel({
  assets,
  selectedAssetId,
  missingAssetIds,
  usedAssetIds,
  onSelectAsset,
  onImportMedia,
  onRemoveAsset,
  onRevealAsset,
  onRelinkAsset
}: MediaPanelProps) {
  const [query, setQuery] = useState("");
  const [binFilter, setBinFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortMode, setSortMode] = useState("name");
  const usedAssets = useMemo(() => new Set(usedAssetIds), [usedAssetIds]);
  const bins = useMemo(() => (
    Array.from(new Set(assets.map((asset) => asset.bin?.trim() || "Unsorted"))).sort((left, right) => left.localeCompare(right))
  ), [assets]);
  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return assets
      .filter((asset) => {
        const bin = asset.bin?.trim() || "Unsorted";
        const matchesQuery = !normalizedQuery || `${asset.name} ${asset.path} ${bin}`.toLowerCase().includes(normalizedQuery);
        const matchesBin = binFilter === "all" || bin === binFilter;
        const matchesType = typeFilter === "all" || asset.type === typeFilter || (typeFilter === "unused" && !usedAssets.has(asset.id));

        return matchesQuery && matchesBin && matchesType;
      })
      .sort((left, right) => {
        if (sortMode === "duration") {
          return (right.durationFrames ?? 0) - (left.durationFrames ?? 0);
        }

        if (sortMode === "type") {
          return left.type.localeCompare(right.type) || left.name.localeCompare(right.name);
        }

        return left.name.localeCompare(right.name);
      });
  }, [assets, binFilter, query, sortMode, typeFilter, usedAssets]);

  return (
    <section className="panel media-panel">
      <div className="panel-header">
        <h2>Media</h2>
        <button type="button" onClick={onImportMedia}>Import</button>
      </div>
      <div className="media-controls">
        <input aria-label="Search media" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search" />
        <select aria-label="Filter bin" value={binFilter} onChange={(event) => setBinFilter(event.currentTarget.value)}>
          <option value="all">All bins</option>
          {bins.map((bin) => <option key={bin} value={bin}>{bin}</option>)}
        </select>
        <select aria-label="Filter media type" value={typeFilter} onChange={(event) => setTypeFilter(event.currentTarget.value)}>
          <option value="all">All types</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
          <option value="image">Image</option>
          <option value="unused">Unused</option>
        </select>
        <select aria-label="Sort media" value={sortMode} onChange={(event) => setSortMode(event.currentTarget.value)}>
          <option value="name">Name</option>
          <option value="type">Type</option>
          <option value="duration">Duration</option>
        </select>
      </div>
      <div className="media-list">
        {assets.length === 0 ? (
          <button type="button" className="empty-state" onClick={onImportMedia}>
            Import media
          </button>
        ) : filteredAssets.length === 0 ? (
          <div className="empty-state media-empty">No media matches</div>
        ) : filteredAssets.map((asset) => {
          const missing = missingAssetIds.includes(asset.id);
          const unused = !usedAssets.has(asset.id);

          return (
            <div
              key={asset.id}
              className={`media-item ${selectedAssetId === asset.id ? "selected" : ""} ${missing ? "missing" : ""}`}
              draggable
              onClick={() => onSelectAsset(asset.id)}
              onDragStart={(event) => {
                event.dataTransfer.setData("application/x-spikx-asset", asset.id);
                event.dataTransfer.effectAllowed = "copy";
              }}
            >
              <div className={`media-thumb ${asset.type}`}>
                {asset.type === "image" ? (
                  <img src={asset.previewUrl} alt="" />
                ) : asset.type === "video" ? (
                  <video src={asset.previewUrl} muted preload="metadata" />
                ) : (
                  <span className="waveform">
                    {Array.from({ length: 12 }).map((_, index) => (
                      <i key={index} style={{ height: `${20 + ((index * 17) % 38)}%` }} />
                    ))}
                  </span>
                )}
              </div>
              <div className="media-copy">
                <span className={`media-kind ${asset.type}`}>{missing ? "missing" : asset.type}</span>
                <span className="media-name">{asset.name}</span>
                <span className="media-bin">{asset.bin?.trim() || "Unsorted"}{unused ? " - unused" : ""}</span>
                <span className="media-meta">
                  {asset.width && asset.height ? `${asset.width}x${asset.height}` : asset.type}
                  {asset.durationSeconds ? ` - ${asset.durationSeconds.toFixed(1)}s` : ""}
                  {asset.hasAudio ? " - audio" : ""}
                </span>
              </div>
              <div className="media-actions">
                <button type="button" onClick={(event) => {
                  event.stopPropagation();
                  onRevealAsset(asset);
                }}>Reveal</button>
                <button type="button" onClick={(event) => {
                  event.stopPropagation();
                  onRelinkAsset(asset.id);
                }}>Relink</button>
                <button type="button" className="danger" onClick={(event) => {
                  event.stopPropagation();
                  onRemoveAsset(asset.id);
                }}>Remove</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
