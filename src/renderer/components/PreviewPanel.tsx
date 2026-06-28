import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { findAsset, resolveClipAtFrame, secondsFromFrames } from "../../shared/editing";
import type { Clip, MediaAsset, SpikxProject, Track } from "../../shared/types";

interface PreviewPanelProps {
  project: SpikxProject;
  selectedAsset?: MediaAsset;
  selectedClip?: Clip;
  playheadFrame: number;
  isPlaying: boolean;
}

interface ActiveClip {
  asset: MediaAsset;
  clip: Clip;
  track: Track;
}

export function PreviewPanel({ project, selectedAsset, selectedClip, playheadFrame, isPlaying }: PreviewPanelProps) {
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const activeVisualClips = useMemo(
    () => findActiveVisualClips(project, playheadFrame),
    [project, playheadFrame]
  );
  const activeAudioClips = useMemo(
    () => findActiveAudioClips(project, playheadFrame),
    [project, playheadFrame]
  );
  const activeTextOverlays = useMemo(
    () => project.timeline.textOverlays.filter((overlay) => containsRange(overlay.startFrame, overlay.durationFrames, playheadFrame)),
    [playheadFrame, project.timeline.textOverlays]
  );
  const previewAsset = activeVisualClips.at(-1)?.asset ?? selectedAsset;
  const previewClip = activeVisualClips.at(-1)?.clip ?? selectedClip;
  const fps = project.timeline.settings.fps;

  useEffect(() => {
    const activeClipIds = new Set(activeVisualClips.map((item) => item.clip.id));

    videoRefs.current.forEach((video, clipId) => {
      if (!activeClipIds.has(clipId)) {
        video.pause();
      }
    });

    for (const item of activeVisualClips) {
      if (item.asset.type !== "video") {
        continue;
      }

      const video = videoRefs.current.get(item.clip.id);

      if (!video) {
        continue;
      }

      syncMediaElement(video, item.clip, playheadFrame, fps);
      video.volume = Math.min(1, item.clip.volume);
      video.playbackRate = item.clip.speed.freezeFrame || item.clip.speed.reverse ? 1 : item.clip.speed.rate;

      if (isPlaying && !item.clip.speed.freezeFrame && !item.clip.speed.reverse) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    }
  }, [activeVisualClips, fps, isPlaying, playheadFrame]);

  useEffect(() => {
    const activeClipIds = new Set(activeAudioClips.map((item) => item.clip.id));

    audioRefs.current.forEach((audio, clipId) => {
      if (!activeClipIds.has(clipId)) {
        audio.pause();
      }
    });

    for (const item of activeAudioClips) {
      const audio = audioRefs.current.get(item.clip.id);

      if (!audio) {
        continue;
      }

      syncMediaElement(audio, item.clip, playheadFrame, fps);
      audio.volume = Math.min(1, item.clip.volume);
      audio.playbackRate = item.clip.speed.freezeFrame || item.clip.speed.reverse ? 1 : item.clip.speed.rate;

      if (isPlaying && !item.clip.speed.freezeFrame && !item.clip.speed.reverse) {
        void audio.play().catch(() => undefined);
      } else {
        audio.pause();
      }
    }
  }, [activeAudioClips, fps, isPlaying, playheadFrame]);

  return (
    <section className="panel preview-panel">
      <div className="panel-header">
        <h2>Preview</h2>
        {previewClip ? <span>{secondsFromFrames(previewClip.durationFrames, fps).toFixed(2)}s</span> : null}
      </div>
      <div className="preview-stage">
        {!previewAsset && activeTextOverlays.length === 0 ? (
          <div className="preview-empty">Select media or a clip</div>
        ) : activeVisualClips.length > 0 || activeTextOverlays.length > 0 ? (
          <div className="preview-composition">
            {activeVisualClips.map((item) => (
              item.asset.type === "image" ? (
                <img
                  key={item.clip.id}
                  className="preview-media-layer"
                  src={item.asset.previewUrl}
                  alt={item.asset.name}
                  style={clipPreviewStyle(item.clip)}
                />
              ) : (
                <video
                  key={item.clip.id}
                  ref={(element) => {
                    if (element) {
                      videoRefs.current.set(item.clip.id, element);
                    } else {
                      videoRefs.current.delete(item.clip.id);
                    }
                  }}
                  className="preview-media-layer"
                  src={item.asset.previewUrl}
                  muted={item.clip.volume === 0}
                  style={clipPreviewStyle(item.clip)}
                />
              )
            ))}
            {activeTextOverlays.map((overlay) => (
              <div
                key={overlay.id}
                className={`preview-text-layer ${overlay.role}`}
                style={{
                  left: `calc(50% + ${overlay.x}px)`,
                  top: `calc(50% + ${overlay.y}px)`,
                  fontSize: `${overlay.fontSize}px`,
                  color: overlay.color,
                  backgroundColor: hexToRgba(overlay.backgroundColor, 0.65),
                  opacity: overlay.opacity,
                  textAlign: overlay.align
                }}
              >
                {overlay.text}
              </div>
            ))}
          </div>
        ) : previewAsset ? (
          selectedClip === undefined ? (
            renderAssetPreview(previewAsset)
          ) : previewAsset.type === "image" ? (
            <img src={previewAsset.previewUrl} alt={previewAsset.name} />
          ) : previewAsset.type === "video" ? (
            <video src={previewAsset.previewUrl} controls={!isPlaying} />
          ) : (
            <div className="audio-preview">
              <strong>{previewAsset.name}</strong>
              <audio src={previewAsset.previewUrl} controls />
            </div>
          )
        ) : (
          <div className="preview-empty">Select media or a clip</div>
        )}
        <div className="timeline-audio-layer">
          {activeAudioClips.map((item) => (
            <audio
              key={item.clip.id}
              ref={(element) => {
                if (element) {
                  audioRefs.current.set(item.clip.id, element);
                } else {
                  audioRefs.current.delete(item.clip.id);
                }
              }}
              src={item.asset.previewUrl}
            />
          ))}
        </div>
        {activeAudioClips.length > 0 ? (
          <div className="active-audio-list">
            {activeAudioClips.map((item) => (
              <span key={item.clip.id}>{item.clip.name}</span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function renderAssetPreview(asset: MediaAsset) {
  if (asset.type === "image") {
    return <img src={asset.previewUrl} alt={asset.name} />;
  }

  if (asset.type === "video") {
    return <video src={asset.previewUrl} controls />;
  }

  return (
    <div className="audio-preview">
      <strong>{asset.name}</strong>
      <audio src={asset.previewUrl} controls />
    </div>
  );
}

function findActiveVisualClips(project: SpikxProject, playheadFrame: number): ActiveClip[] {
  return project.timeline.tracks.flatMap((track) => (
    track.type === "video" && !track.muted
      ? track.clips
          .filter((clip) => clip.type !== "audio" && !clip.muted && containsFrame(clip, playheadFrame))
          .map((clip) => resolveClipAtFrame(clip, playheadFrame))
          .filter((clip) => clip.opacity > 0)
          .map((clip) => {
            const asset = findAsset(project, clip.assetId);
            return asset ? { asset, clip, track } : undefined;
          })
      : []
  )).filter((item): item is ActiveClip => Boolean(item));
}

function findActiveAudioClips(project: SpikxProject, playheadFrame: number): ActiveClip[] {
  return project.timeline.tracks.flatMap((track) => (
    track.type === "audio" && !track.muted
      ? track.clips
          .filter((clip) => clip.type === "audio" && !clip.muted && containsFrame(clip, playheadFrame))
          .map((clip) => resolveClipAtFrame(clip, playheadFrame))
          .filter((clip) => clip.volume > 0)
          .map((clip) => {
            const asset = findAsset(project, clip.assetId);
            return asset ? { asset, clip, track } : undefined;
          })
      : []
  )).filter((item): item is ActiveClip => Boolean(item));
}

function containsFrame(clip: Clip, frame: number): boolean {
  return frame >= clip.startFrame && frame < clip.startFrame + clip.durationFrames;
}

function containsRange(startFrame: number, durationFrames: number, frame: number): boolean {
  return frame >= startFrame && frame < startFrame + durationFrames;
}

function syncMediaElement(element: HTMLMediaElement, clip: Clip, playheadFrame: number, fps: number): void {
  const localFrame = Math.max(0, Math.min(clip.durationFrames - 1, playheadFrame - clip.startFrame));
  const playbackRate = Math.max(0.1, clip.speed.rate);
  const sourceFrame = clip.speed.freezeFrame
    ? clip.trimStartFrame
    : clip.speed.reverse
      ? clip.trimStartFrame + Math.max(0, clip.durationFrames * playbackRate - 1 - localFrame * playbackRate)
      : clip.trimStartFrame + localFrame * playbackRate;
  const targetTime = secondsFromFrames(sourceFrame, fps);

  if (Math.abs(element.currentTime - targetTime) > 0.18) {
    element.currentTime = targetTime;
  }
}

function clipPreviewStyle(clip: Clip): CSSProperties {
  const { transform } = clip;
  const { effects } = clip;
  const filter = [
    `brightness(${Math.max(0, 1 + effects.brightness)})`,
    `contrast(${effects.contrast})`,
    `saturate(${effects.saturation})`,
    effects.blur > 0 ? `blur(${effects.blur}px)` : ""
  ].filter(Boolean).join(" ");

  return {
    opacity: clip.opacity,
    filter,
    objectFit: transform.fit,
    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotate(${transform.rotation}deg)`,
    clipPath: `inset(${transform.cropTop * 100}% ${transform.cropRight * 100}% ${transform.cropBottom * 100}% ${transform.cropLeft * 100}%)`,
    boxShadow: effects.vignette > 0 ? `inset 0 0 ${Math.round(120 * effects.vignette)}px rgba(0, 0, 0, ${0.65 * effects.vignette})` : undefined
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "000000";
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
