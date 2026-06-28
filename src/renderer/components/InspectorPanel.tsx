import type {
  Clip,
  ClipEffects,
  ClipKeyframe,
  ClipSpeed,
  ClipTransform,
  ClipTransitions,
  ExportSettings,
  KeyframeProperty,
  MediaAsset,
  SpikxProject,
  TextOverlay,
  TimelineMarker,
  TimelineSettings,
  Track
} from "../../shared/types";

interface InspectorPanelProps {
  project: SpikxProject;
  asset?: MediaAsset;
  clip?: Clip;
  track?: Track;
  marker?: TimelineMarker;
  textOverlay?: TextOverlay;
  playheadFrame: number;
  fps: number;
  exportSettings: ExportSettings;
  missingAssetIds: string[];
  onUpdateAsset: (assetId: string, changes: Partial<Pick<MediaAsset, "name" | "bin">>) => void;
  onUpdateClip: (clipId: string, changes: Partial<Clip>) => void;
  onDeleteClip: () => void;
  onAddClipKeyframe: (clipId: string, property: KeyframeProperty) => void;
  onDeleteClipKeyframe: (clipId: string, keyframeId: string) => void;
  onUpdateMarker: (markerId: string, changes: Partial<TimelineMarker>) => void;
  onDeleteMarker: (markerId: string) => void;
  onUpdateTextOverlay: (textOverlayId: string, changes: Partial<TextOverlay>) => void;
  onDeleteTextOverlay: (textOverlayId: string) => void;
  onUpdateTrack: (trackId: string, changes: Partial<Omit<Track, "id" | "clips">>) => void;
  onRemoveTrack: (trackId: string) => void;
  onUpdateProjectName: (name: string) => void;
  onUpdateTimelineSettings: (changes: Partial<TimelineSettings>) => void;
  onUpdateExportSettings: (changes: Partial<ExportSettings>) => void;
  onRelinkAsset: (assetId: string) => void;
  onRevealAsset: (asset: MediaAsset) => void;
  onRemoveAsset: (assetId: string) => void;
}

export function InspectorPanel({
  project,
  asset,
  clip,
  track,
  marker,
  textOverlay,
  playheadFrame,
  fps,
  exportSettings,
  missingAssetIds,
  onUpdateAsset,
  onUpdateClip,
  onDeleteClip,
  onAddClipKeyframe,
  onDeleteClipKeyframe,
  onUpdateMarker,
  onDeleteMarker,
  onUpdateTextOverlay,
  onDeleteTextOverlay,
  onUpdateTrack,
  onRemoveTrack,
  onUpdateProjectName,
  onUpdateTimelineSettings,
  onUpdateExportSettings,
  onRelinkAsset,
  onRevealAsset,
  onRemoveAsset
}: InspectorPanelProps) {
  function updateClipNumber(clipId: string, key: keyof Pick<Clip, "startFrame" | "durationFrames" | "trimStartFrame" | "opacity" | "volume">, rawValue: string): void {
    const value = Number(rawValue);

    if (Number.isFinite(value)) {
      onUpdateClip(clipId, { [key]: value });
    }
  }

  function updateTransformNumber(clip: Clip, key: keyof Omit<ClipTransform, "fit">, rawValue: string): void {
    const value = Number(rawValue);

    if (Number.isFinite(value)) {
      onUpdateClip(clip.id, { transform: { ...clip.transform, [key]: value } });
    }
  }

  function updateTransitionNumber(clip: Clip, key: keyof Omit<ClipTransitions, "kind">, rawValue: string): void {
    const value = Number(rawValue);

    if (Number.isFinite(value)) {
      onUpdateClip(clip.id, { transitions: { ...clip.transitions, kind: clip.transitions.kind === "none" ? "fade" : clip.transitions.kind, [key]: value } });
    }
  }

  function updateEffectNumber(clip: Clip, key: keyof ClipEffects, rawValue: string): void {
    const value = Number(rawValue);

    if (Number.isFinite(value)) {
      onUpdateClip(clip.id, { effects: { ...clip.effects, [key]: value } });
    }
  }

  function updateSpeedNumber(clip: Clip, key: keyof Pick<ClipSpeed, "rate">, rawValue: string): void {
    const value = Number(rawValue);

    if (Number.isFinite(value)) {
      onUpdateClip(clip.id, { speed: { ...clip.speed, [key]: value } });
    }
  }

  function updateMarkerNumber(marker: TimelineMarker, rawValue: string): void {
    const value = Number(rawValue);

    if (Number.isFinite(value)) {
      onUpdateMarker(marker.id, { frame: value });
    }
  }

  function updateTextNumber(textOverlay: TextOverlay, key: keyof Pick<TextOverlay, "startFrame" | "durationFrames" | "x" | "y" | "fontSize" | "opacity">, rawValue: string): void {
    const value = Number(rawValue);

    if (Number.isFinite(value)) {
      onUpdateTextOverlay(textOverlay.id, { [key]: value });
    }
  }

  function updateNumber<T extends TimelineSettings | ExportSettings>(callback: (changes: Partial<T>) => void, key: keyof T, rawValue: string): void {
    const value = Number(rawValue);

    if (Number.isFinite(value)) {
      callback({ [key]: value } as Partial<T>);
    }
  }

  return (
    <aside className="panel inspector-panel">
      <div className="panel-header">
        <h2>Inspector</h2>
      </div>
      {clip && asset ? (
        <div className="inspector-fields">
          <label>
            <span>Name</span>
            <input value={clip.name} onChange={(event) => onUpdateClip(clip.id, { name: event.currentTarget.value })} />
          </label>
          <label>
            <span>Type</span>
            <input value={asset.type} readOnly />
          </label>
          <label>
            <span>Path</span>
            <input value={asset.path} readOnly />
          </label>
          <label>
            <span>Start frame</span>
            <input type="number" value={clip.startFrame} min={0} onChange={(event) => updateClipNumber(clip.id, "startFrame", event.currentTarget.value)} />
          </label>
          <label>
            <span>Duration frames</span>
            <input type="number" value={clip.durationFrames} min={1} onChange={(event) => updateClipNumber(clip.id, "durationFrames", event.currentTarget.value)} />
          </label>
          <label>
            <span>Trim start</span>
            <input type="number" value={clip.trimStartFrame} min={0} onChange={(event) => updateClipNumber(clip.id, "trimStartFrame", event.currentTarget.value)} />
          </label>
          <label>
            <span>Opacity</span>
            <input type="range" min={0} max={1} step={0.01} value={clip.opacity} onChange={(event) => updateClipNumber(clip.id, "opacity", event.currentTarget.value)} />
          </label>
          <label>
            <span>Volume</span>
            <input type="range" min={0} max={2} step={0.01} value={clip.volume} onChange={(event) => updateClipNumber(clip.id, "volume", event.currentTarget.value)} />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={clip.muted} onChange={(event) => onUpdateClip(clip.id, { muted: event.currentTarget.checked })} />
            <span>Muted</span>
          </label>
          <div className="field-group-title">Speed</div>
          <label>
            <span>Rate</span>
            <input type="number" min={0.1} max={8} step={0.05} value={clip.speed.rate} onChange={(event) => updateSpeedNumber(clip, "rate", event.currentTarget.value)} />
          </label>
          <div className="field-grid two">
            <label className="checkbox-field">
              <input type="checkbox" checked={clip.speed.reverse} onChange={(event) => onUpdateClip(clip.id, { speed: { ...clip.speed, reverse: event.currentTarget.checked } })} />
              <span>Reverse</span>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={clip.speed.freezeFrame} onChange={(event) => onUpdateClip(clip.id, { speed: { ...clip.speed, freezeFrame: event.currentTarget.checked } })} />
              <span>Freeze frame</span>
            </label>
          </div>
          {clip.type !== "audio" ? (
            <>
              <div className="field-group-title">Transform</div>
              <label>
                <span>Fit</span>
                <select value={clip.transform.fit} onChange={(event) => onUpdateClip(clip.id, { transform: { ...clip.transform, fit: event.currentTarget.value === "cover" ? "cover" : "contain" } })}>
                  <option value="contain">Contain</option>
                  <option value="cover">Cover</option>
                </select>
              </label>
              <div className="field-grid two">
                <label>
                  <span>X</span>
                  <input type="number" value={clip.transform.x} onChange={(event) => updateTransformNumber(clip, "x", event.currentTarget.value)} />
                </label>
                <label>
                  <span>Y</span>
                  <input type="number" value={clip.transform.y} onChange={(event) => updateTransformNumber(clip, "y", event.currentTarget.value)} />
                </label>
                <label>
                  <span>Scale</span>
                  <input type="number" min={0.05} max={8} step={0.05} value={clip.transform.scale} onChange={(event) => updateTransformNumber(clip, "scale", event.currentTarget.value)} />
                </label>
                <label>
                  <span>Rotation</span>
                  <input type="number" min={-360} max={360} value={clip.transform.rotation} onChange={(event) => updateTransformNumber(clip, "rotation", event.currentTarget.value)} />
                </label>
              </div>
              <div className="field-grid two">
                <label>
                  <span>Crop top</span>
                  <input type="number" min={0} max={0.95} step={0.01} value={clip.transform.cropTop} onChange={(event) => updateTransformNumber(clip, "cropTop", event.currentTarget.value)} />
                </label>
                <label>
                  <span>Crop right</span>
                  <input type="number" min={0} max={0.95} step={0.01} value={clip.transform.cropRight} onChange={(event) => updateTransformNumber(clip, "cropRight", event.currentTarget.value)} />
                </label>
                <label>
                  <span>Crop bottom</span>
                  <input type="number" min={0} max={0.95} step={0.01} value={clip.transform.cropBottom} onChange={(event) => updateTransformNumber(clip, "cropBottom", event.currentTarget.value)} />
                </label>
                <label>
                  <span>Crop left</span>
                  <input type="number" min={0} max={0.95} step={0.01} value={clip.transform.cropLeft} onChange={(event) => updateTransformNumber(clip, "cropLeft", event.currentTarget.value)} />
                </label>
              </div>
              <div className="field-group-title">Effects</div>
              <label>
                <span>Brightness</span>
                <input type="range" min={-1} max={1} step={0.01} value={clip.effects.brightness} onChange={(event) => updateEffectNumber(clip, "brightness", event.currentTarget.value)} />
              </label>
              <label>
                <span>Contrast</span>
                <input type="range" min={0} max={3} step={0.01} value={clip.effects.contrast} onChange={(event) => updateEffectNumber(clip, "contrast", event.currentTarget.value)} />
              </label>
              <label>
                <span>Saturation</span>
                <input type="range" min={0} max={3} step={0.01} value={clip.effects.saturation} onChange={(event) => updateEffectNumber(clip, "saturation", event.currentTarget.value)} />
              </label>
              <div className="field-grid two">
                <label>
                  <span>Blur</span>
                  <input type="number" min={0} max={20} step={0.1} value={clip.effects.blur} onChange={(event) => updateEffectNumber(clip, "blur", event.currentTarget.value)} />
                </label>
                <label>
                  <span>Sharpen</span>
                  <input type="number" min={0} max={5} step={0.1} value={clip.effects.sharpen} onChange={(event) => updateEffectNumber(clip, "sharpen", event.currentTarget.value)} />
                </label>
                <label>
                  <span>Vignette</span>
                  <input type="number" min={0} max={1} step={0.05} value={clip.effects.vignette} onChange={(event) => updateEffectNumber(clip, "vignette", event.currentTarget.value)} />
                </label>
              </div>
            </>
          ) : null}
          <div className="field-group-title">Transition</div>
          <label>
            <span>Type</span>
            <select value={clip.transitions.kind} onChange={(event) => onUpdateClip(clip.id, { transitions: { ...clip.transitions, kind: event.currentTarget.value as ClipTransitions["kind"] } })}>
              <option value="none">None</option>
              <option value="fade">Fade</option>
              <option value="dissolve">Dissolve</option>
              <option value="slide">Slide</option>
              <option value="wipe">Wipe</option>
              <option value="zoom">Zoom</option>
              <option value="blur">Blur</option>
              <option value="glitch">Glitch</option>
            </select>
          </label>
          <div className="field-grid two">
            <label>
              <span>Fade in frames</span>
              <input type="number" min={0} value={clip.transitions.inFrames} onChange={(event) => updateTransitionNumber(clip, "inFrames", event.currentTarget.value)} />
            </label>
            <label>
              <span>Fade out frames</span>
              <input type="number" min={0} value={clip.transitions.outFrames} onChange={(event) => updateTransitionNumber(clip, "outFrames", event.currentTarget.value)} />
            </label>
          </div>
          <div className="inspector-summary">
            {(clip.durationFrames / fps).toFixed(2)} seconds at {fps} fps
          </div>
          <ClipKeyframesPanel
            clip={clip}
            playheadFrame={playheadFrame}
            onAddClipKeyframe={onAddClipKeyframe}
            onDeleteClipKeyframe={onDeleteClipKeyframe}
          />
          <button type="button" className="danger" onClick={onDeleteClip}>Delete Clip</button>
        </div>
      ) : textOverlay ? (
        <div className="inspector-fields">
          <label>
            <span>Text</span>
            <textarea value={textOverlay.text} onChange={(event) => onUpdateTextOverlay(textOverlay.id, { text: event.currentTarget.value })} />
          </label>
          <label>
            <span>Role</span>
            <select value={textOverlay.role} onChange={(event) => onUpdateTextOverlay(textOverlay.id, { role: event.currentTarget.value === "caption" ? "caption" : "title" })}>
              <option value="title">Title</option>
              <option value="caption">Caption</option>
            </select>
          </label>
          <div className="field-grid two">
            <label>
              <span>Start frame</span>
              <input type="number" min={0} value={textOverlay.startFrame} onChange={(event) => updateTextNumber(textOverlay, "startFrame", event.currentTarget.value)} />
            </label>
            <label>
              <span>Duration frames</span>
              <input type="number" min={1} value={textOverlay.durationFrames} onChange={(event) => updateTextNumber(textOverlay, "durationFrames", event.currentTarget.value)} />
            </label>
            <label>
              <span>X</span>
              <input type="number" value={textOverlay.x} onChange={(event) => updateTextNumber(textOverlay, "x", event.currentTarget.value)} />
            </label>
            <label>
              <span>Y</span>
              <input type="number" value={textOverlay.y} onChange={(event) => updateTextNumber(textOverlay, "y", event.currentTarget.value)} />
            </label>
            <label>
              <span>Font size</span>
              <input type="number" min={8} max={256} value={textOverlay.fontSize} onChange={(event) => updateTextNumber(textOverlay, "fontSize", event.currentTarget.value)} />
            </label>
            <label>
              <span>Opacity</span>
              <input type="number" min={0} max={1} step={0.05} value={textOverlay.opacity} onChange={(event) => updateTextNumber(textOverlay, "opacity", event.currentTarget.value)} />
            </label>
          </div>
          <label>
            <span>Alignment</span>
            <select value={textOverlay.align} onChange={(event) => onUpdateTextOverlay(textOverlay.id, { align: event.currentTarget.value === "left" || event.currentTarget.value === "right" ? event.currentTarget.value : "center" })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <div className="field-grid two">
            <label>
              <span>Text color</span>
              <input type="color" value={textOverlay.color} onChange={(event) => onUpdateTextOverlay(textOverlay.id, { color: event.currentTarget.value })} />
            </label>
            <label>
              <span>Box color</span>
              <input type="color" value={textOverlay.backgroundColor} onChange={(event) => onUpdateTextOverlay(textOverlay.id, { backgroundColor: event.currentTarget.value })} />
            </label>
          </div>
          <button type="button" className="danger" onClick={() => onDeleteTextOverlay(textOverlay.id)}>Delete {textOverlay.role === "caption" ? "Caption" : "Title"}</button>
        </div>
      ) : marker ? (
        <div className="inspector-fields">
          <label>
            <span>Label</span>
            <input value={marker.label} onChange={(event) => onUpdateMarker(marker.id, { label: event.currentTarget.value })} />
          </label>
          <label>
            <span>Frame</span>
            <input type="number" min={0} value={marker.frame} onChange={(event) => updateMarkerNumber(marker, event.currentTarget.value)} />
          </label>
          <label>
            <span>Color</span>
            <input type="color" value={marker.color} onChange={(event) => onUpdateMarker(marker.id, { color: event.currentTarget.value })} />
          </label>
          <button type="button" className="danger" onClick={() => onDeleteMarker(marker.id)}>Delete Marker</button>
        </div>
      ) : track ? (
        <div className="inspector-fields">
          <label>
            <span>Track name</span>
            <input value={track.name} onChange={(event) => onUpdateTrack(track.id, { name: event.currentTarget.value })} />
          </label>
          <label>
            <span>Type</span>
            <input value={track.type} readOnly />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={track.muted} onChange={(event) => onUpdateTrack(track.id, { muted: event.currentTarget.checked })} />
            <span>Muted</span>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={track.locked} onChange={(event) => onUpdateTrack(track.id, { locked: event.currentTarget.checked })} />
            <span>Locked</span>
          </label>
          <div className="inspector-summary">{track.clips.length} clips</div>
          <button type="button" className="danger" onClick={() => onRemoveTrack(track.id)}>Remove Track</button>
        </div>
      ) : asset ? (
        <div className="inspector-fields">
          <label>
            <span>Name</span>
            <input value={asset.name} onChange={(event) => onUpdateAsset(asset.id, { name: event.currentTarget.value })} />
          </label>
          <label>
            <span>Bin</span>
            <input value={asset.bin ?? ""} onChange={(event) => onUpdateAsset(asset.id, { bin: event.currentTarget.value })} placeholder="Unsorted" />
          </label>
          <label>
            <span>Type</span>
            <input value={asset.type} readOnly />
          </label>
          <label>
            <span>Path</span>
            <input value={asset.path} readOnly />
          </label>
          <div className="metadata-grid">
            <span>Duration</span>
            <strong>{asset.durationSeconds ? `${asset.durationSeconds.toFixed(2)}s` : "Unknown"}</strong>
            <span>Frames</span>
            <strong>{asset.durationFrames ?? "Unknown"}</strong>
            <span>Size</span>
            <strong>{asset.width && asset.height ? `${asset.width}x${asset.height}` : "Unknown"}</strong>
            <span>Audio</span>
            <strong>{asset.hasAudio ? "Yes" : "No"}</strong>
          </div>
          {missingAssetIds.includes(asset.id) ? <div className="warning-note">Media file is missing.</div> : null}
          <button type="button" onClick={() => onRevealAsset(asset)}>Reveal in Explorer</button>
          <button type="button" onClick={() => onRelinkAsset(asset.id)}>Relink Media</button>
          <button type="button" className="danger" onClick={() => onRemoveAsset(asset.id)}>Remove Media</button>
        </div>
      ) : (
        <div className="inspector-fields">
          <label>
            <span>Project name</span>
            <input value={project.name} onChange={(event) => onUpdateProjectName(event.currentTarget.value)} />
          </label>
          <div className="field-group-title">Timeline</div>
          <label>
            <span>FPS</span>
            <input type="number" min={1} value={project.timeline.settings.fps} onChange={(event) => updateNumber<TimelineSettings>(onUpdateTimelineSettings, "fps", event.currentTarget.value)} />
          </label>
          <label>
            <span>Width</span>
            <input type="number" min={1} value={project.timeline.settings.width} onChange={(event) => updateNumber<TimelineSettings>(onUpdateTimelineSettings, "width", event.currentTarget.value)} />
          </label>
          <label>
            <span>Height</span>
            <input type="number" min={1} value={project.timeline.settings.height} onChange={(event) => updateNumber<TimelineSettings>(onUpdateTimelineSettings, "height", event.currentTarget.value)} />
          </label>
          <div className="field-group-title">Export</div>
          <label>
            <span>FPS</span>
            <input type="number" min={1} value={exportSettings.fps} onChange={(event) => updateNumber<ExportSettings>(onUpdateExportSettings, "fps", event.currentTarget.value)} />
          </label>
          <label>
            <span>Width</span>
            <input type="number" min={1} value={exportSettings.width} onChange={(event) => updateNumber<ExportSettings>(onUpdateExportSettings, "width", event.currentTarget.value)} />
          </label>
          <label>
            <span>Height</span>
            <input type="number" min={1} value={exportSettings.height} onChange={(event) => updateNumber<ExportSettings>(onUpdateExportSettings, "height", event.currentTarget.value)} />
          </label>
          <label>
            <span>Bitrate kbps</span>
            <input type="number" min={1} value={exportSettings.bitrateKbps} onChange={(event) => updateNumber<ExportSettings>(onUpdateExportSettings, "bitrateKbps", event.currentTarget.value)} />
          </label>
          <label>
            <span>Codec</span>
            <select value={exportSettings.codec} onChange={(event) => onUpdateExportSettings({ codec: event.currentTarget.value === "libx265" ? "libx265" : "libx264" })}>
              <option value="libx264">H.264</option>
              <option value="libx265">H.265</option>
            </select>
          </label>
        </div>
      )}
    </aside>
  );
}

const keyframeProperties: { property: KeyframeProperty; label: string }[] = [
  { property: "x", label: "X" },
  { property: "y", label: "Y" },
  { property: "scale", label: "Scale" },
  { property: "rotation", label: "Rotate" },
  { property: "opacity", label: "Opacity" },
  { property: "volume", label: "Volume" }
];

function ClipKeyframesPanel({
  clip,
  playheadFrame,
  onAddClipKeyframe,
  onDeleteClipKeyframe
}: {
  clip: Clip;
  playheadFrame: number;
  onAddClipKeyframe: (clipId: string, property: KeyframeProperty) => void;
  onDeleteClipKeyframe: (clipId: string, keyframeId: string) => void;
}) {
  const localFrame = Math.round(playheadFrame - clip.startFrame);
  const withinClip = localFrame >= 0 && localFrame < clip.durationFrames;
  const sortedKeyframes = [...clip.keyframes].sort((left, right) => (
    left.frame - right.frame || left.property.localeCompare(right.property)
  ));

  return (
    <>
      <div className="field-group-title">Keyframes</div>
      <div className="keyframe-panel">
        <div className="keyframe-meta">
          {withinClip ? `Local frame ${localFrame}` : "Move the playhead inside this clip"}
        </div>
        <div className="keyframe-actions">
          {keyframeProperties.map((item) => (
            <button
              key={item.property}
              type="button"
              disabled={!withinClip}
              onClick={() => onAddClipKeyframe(clip.id, item.property)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {sortedKeyframes.length > 0 ? (
          <div className="keyframe-list">
            {sortedKeyframes.map((keyframe) => (
              <KeyframeRow
                key={keyframe.id}
                keyframe={keyframe}
                onDelete={() => onDeleteClipKeyframe(clip.id, keyframe.id)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-inline">No keyframes yet.</div>
        )}
      </div>
    </>
  );
}

function KeyframeRow({ keyframe, onDelete }: { keyframe: ClipKeyframe; onDelete: () => void }) {
  return (
    <div className="keyframe-row">
      <span>{keyframeLabel(keyframe.property)}</span>
      <strong>{keyframe.frame}</strong>
      <span>{formatKeyframeValue(keyframe)}</span>
      <button type="button" aria-label={`Delete ${keyframe.property} keyframe`} onClick={onDelete}>Delete</button>
    </div>
  );
}

function keyframeLabel(property: KeyframeProperty): string {
  switch (property) {
    case "x":
      return "X";
    case "y":
      return "Y";
    case "scale":
      return "Scale";
    case "rotation":
      return "Rotation";
    case "opacity":
      return "Opacity";
    case "volume":
      return "Volume";
  }
}

function formatKeyframeValue(keyframe: ClipKeyframe): string {
  if (keyframe.property === "opacity" || keyframe.property === "volume" || keyframe.property === "scale") {
    return keyframe.value.toFixed(2);
  }

  return String(Math.round(keyframe.value));
}
