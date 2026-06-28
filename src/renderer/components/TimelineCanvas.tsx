import { useEffect, useRef, useState } from "react";
import type { DragEvent, MouseEvent, WheelEvent } from "react";
import { findAsset, findTrack, getTimelineDurationFrames, snapFrame } from "../../shared/editing";
import type { Clip, EditorSelection, SpikxProject, TextOverlay, TimelineMarker, Track, TrackId, TrackType } from "../../shared/types";

interface TimelineCanvasProps {
  project: SpikxProject;
  selection: EditorSelection;
  playheadFrame: number;
  zoom: number;
  scrollFrame: number;
  timecode: string;
  onSelectClip: (clip: Clip, additive: boolean) => void;
  onSelectTrack: (trackId: TrackId) => void;
  onSelectMarker: (markerId: string) => void;
  onSelectTextOverlay: (textOverlayId: string) => void;
  onAddClip: (assetId: string, trackId: TrackId, startFrame: number) => void;
  onMoveClip: (clipId: string, trackId: TrackId, startFrame: number) => void;
  onMoveClips: (clipIds: string[], frameDelta: number) => void;
  onTrimClip: (clipId: string, startDeltaFrames: number, endDeltaFrames: number) => void;
  onSetPlayhead: (frame: number) => void;
  onAddTrack: (trackType: TrackType) => void;
  onSetZoom: (zoom: number) => void;
  onSetScrollFrame: (frame: number) => void;
}

interface TimelineMetrics {
  headerWidth: number;
  rulerHeight: number;
  textRowHeight: number;
  rowHeight: number;
  pixelsPerFrame: number;
  totalFrames: number;
  visibleFrames: number;
  scrollFrame: number;
}

interface HitResult {
  clip: Clip;
  edge: "start" | "end" | "body";
}

interface DragState {
  mode: "move" | "move-group" | "trim-start" | "trim-end";
  clip: Clip;
  clipIds: string[];
  originTrackId: TrackId;
  originStartFrame: number;
  originEndFrame: number;
  pointerOffsetFrames: number;
}

interface DragPreview {
  starts: Record<string, number>;
  durations: Record<string, number>;
  activeClipId?: string;
}

const imageThumbnailCache = new Map<string, HTMLImageElement>();

export function TimelineCanvas({
  project,
  selection,
  playheadFrame,
  zoom,
  scrollFrame,
  timecode,
  onSelectClip,
  onSelectTrack,
  onSelectMarker,
  onSelectTextOverlay,
  onAddClip,
  onMoveClip,
  onMoveClips,
  onTrimClip,
  onSetPlayhead,
  onAddTrack,
  onSetZoom,
  onSetScrollFrame
}: TimelineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStateRef = useRef<DragState | undefined>(undefined);
  const [dragPreview, setDragPreview] = useState<DragPreview | undefined>();

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => drawTimeline(canvas, project, selection, playheadFrame, zoom, scrollFrame, dragPreview));
    resizeObserver.observe(canvas);
    drawTimeline(canvas, project, selection, playheadFrame, zoom, scrollFrame, dragPreview);

    return () => resizeObserver.disconnect();
  }, [dragPreview, playheadFrame, project, scrollFrame, selection, zoom]);

  function handleDrop(event: DragEvent<HTMLCanvasElement>): void {
    event.preventDefault();
    const assetId = event.dataTransfer.getData("application/x-spikx-asset");

    if (!assetId) {
      return;
    }

    const canvas = event.currentTarget;
    const metrics = getMetrics(canvas.clientWidth, project, zoom, scrollFrame);
    const point = pointFromMouseEvent(canvas, event);
    const track = trackAtY(project, metrics, point.y);

    if (!track || track.locked) {
      return;
    }

    const rawFrame = frameFromX(metrics, point.x);
    const startFrame = snapFrame(project.timeline, rawFrame, { playheadFrame });
    onAddClip(assetId, track.id, startFrame);
  }

  function handleMouseDown(event: MouseEvent<HTMLCanvasElement>): void {
    const canvas = event.currentTarget;
    const metrics = getMetrics(canvas.clientWidth, project, zoom, scrollFrame);
    const point = pointFromMouseEvent(canvas, event);
    const hit = hitTestClip(project, metrics, point.x, point.y);
    const markerHit = hitTestMarker(project.timeline.markers, metrics, point.x, point.y);
    const textHit = hitTestTextOverlay(project.timeline.textOverlays, metrics, point.x, point.y);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;

    if (markerHit) {
      onSelectMarker(markerHit.id);
      onSetPlayhead(markerHit.frame);
      return;
    }

    if (textHit) {
      onSelectTextOverlay(textHit.id);
      onSetPlayhead(textHit.startFrame);
      return;
    }

    if (hit) {
      const track = findTrack(project.timeline, hit.clip.trackId);
      onSelectClip(hit.clip, additive);

      if (track?.locked) {
        return;
      }

      const selectedIds = selectedClipIds(selection);
      const clipIds = selectedIds.includes(hit.clip.id) && selectedIds.length > 1 ? selectedIds : [hit.clip.id];
      const pointerFrame = frameFromX(metrics, point.x);

      dragStateRef.current = {
        mode: hit.edge === "body" ? (clipIds.length > 1 ? "move-group" : "move") : hit.edge === "start" ? "trim-start" : "trim-end",
        clip: hit.clip,
        clipIds,
        originTrackId: hit.clip.trackId,
        originStartFrame: hit.clip.startFrame,
        originEndFrame: hit.clip.startFrame + hit.clip.durationFrames,
        pointerOffsetFrames: pointerFrame - hit.clip.startFrame
      };
      setDragPreview({
        starts: Object.fromEntries(clipIds.map((clipId) => {
          const clip = findClipById(project, clipId);
          return [clipId, clip?.startFrame ?? hit.clip.startFrame];
        })),
        durations: Object.fromEntries(clipIds.map((clipId) => {
          const clip = findClipById(project, clipId);
          return [clipId, clip?.durationFrames ?? hit.clip.durationFrames];
        })),
        activeClipId: hit.clip.id
      });
      return;
    }

    const track = trackAtY(project, metrics, point.y);

    if (point.x < metrics.headerWidth && track) {
      onSelectTrack(track.id);
      return;
    }

    onSetPlayhead(snapFrame(project.timeline, frameFromX(metrics, point.x), { playheadFrame }));
  }

  function handleMouseMove(event: MouseEvent<HTMLCanvasElement>): void {
    const dragState = dragStateRef.current;

    if (!dragState) {
      return;
    }

    const canvas = event.currentTarget;
    const metrics = getMetrics(canvas.clientWidth, project, zoom, scrollFrame);
    const point = pointFromMouseEvent(canvas, event);
    const pointerFrame = frameFromX(metrics, point.x);

    if (dragState.mode === "trim-start") {
      const nextStart = Math.min(
        dragState.originEndFrame - 1,
        snapFrame(project.timeline, pointerFrame, { playheadFrame })
      );
      setDragPreview({
        starts: { [dragState.clip.id]: Math.max(0, nextStart) },
        durations: { [dragState.clip.id]: Math.max(1, dragState.originEndFrame - Math.max(0, nextStart)) },
        activeClipId: dragState.clip.id
      });
      return;
    }

    if (dragState.mode === "trim-end") {
      const nextEnd = Math.max(
        dragState.originStartFrame + 1,
        snapFrame(project.timeline, pointerFrame, { playheadFrame })
      );
      setDragPreview({
        starts: { [dragState.clip.id]: dragState.originStartFrame },
        durations: { [dragState.clip.id]: nextEnd - dragState.originStartFrame },
        activeClipId: dragState.clip.id
      });
      return;
    }

    const nextStart = snapFrame(project.timeline, pointerFrame - dragState.pointerOffsetFrames, { playheadFrame });
    const frameDelta = nextStart - dragState.originStartFrame;
    const starts: Record<string, number> = {};
    const durations: Record<string, number> = {};

    for (const clipId of dragState.clipIds) {
      const clip = findClipById(project, clipId);

      if (!clip) {
        continue;
      }

      starts[clipId] = Math.max(0, clip.startFrame + frameDelta);
      durations[clipId] = clip.durationFrames;
    }

    setDragPreview({
      starts,
      durations,
      activeClipId: dragState.clip.id
    });
  }

  function handleMouseUp(event: MouseEvent<HTMLCanvasElement>): void {
    const dragState = dragStateRef.current;

    if (!dragState || !dragPreview) {
      dragStateRef.current = undefined;
      setDragPreview(undefined);
      return;
    }

    const canvas = event.currentTarget;
    const metrics = getMetrics(canvas.clientWidth, project, zoom, scrollFrame);
    const point = pointFromMouseEvent(canvas, event);
    const targetTrack = trackAtY(project, metrics, point.y);

    if (dragState.mode === "trim-start") {
      const nextStart = dragPreview.starts[dragState.clip.id] ?? dragState.originStartFrame;
      onTrimClip(dragState.clip.id, nextStart - dragState.originStartFrame, 0);
    } else if (dragState.mode === "trim-end") {
      const nextDuration = dragPreview.durations[dragState.clip.id] ?? dragState.clip.durationFrames;
      onTrimClip(dragState.clip.id, 0, nextDuration - dragState.clip.durationFrames);
    } else if (dragState.mode === "move-group") {
      const nextStart = dragPreview.starts[dragState.clip.id] ?? dragState.originStartFrame;
      onMoveClips(dragState.clipIds, nextStart - dragState.originStartFrame);
    } else {
      const nextStart = dragPreview.starts[dragState.clip.id] ?? dragState.originStartFrame;
      onMoveClip(dragState.clip.id, targetTrack?.id ?? dragState.originTrackId, nextStart);
    }

    dragStateRef.current = undefined;
    setDragPreview(undefined);
  }

  function handleWheel(event: WheelEvent<HTMLCanvasElement>): void {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      onSetZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
      return;
    }

    const canvas = event.currentTarget;
    const metrics = getMetrics(canvas.clientWidth, project, zoom, scrollFrame);
    const deltaFrames = Math.round((event.deltaY + event.deltaX) / metrics.pixelsPerFrame);
    onSetScrollFrame(scrollFrame + deltaFrames);
  }

  return (
    <section className="panel timeline-panel">
      <div className="panel-header timeline-header">
        <h2>Timeline</h2>
        <div className="timeline-tools">
          <button type="button" onClick={() => onAddTrack("video")}>+ Video</button>
          <button type="button" onClick={() => onAddTrack("audio")}>+ Audio</button>
          <label>
            <span>Zoom</span>
            <input type="range" min={0.5} max={12} step={0.25} value={zoom} onChange={(event) => onSetZoom(Number(event.currentTarget.value))} />
          </label>
          <span>{timecode}</span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="timeline-canvas"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
    </section>
  );
}

function drawTimeline(
  canvas: HTMLCanvasElement,
  project: SpikxProject,
  selection: EditorSelection,
  playheadFrame: number,
  zoom: number,
  scrollFrame: number,
  dragPreview?: DragPreview
): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  context.scale(dpr, dpr);
  context.clearRect(0, 0, width, height);

  const metrics = getMetrics(width, project, zoom, scrollFrame);
  drawBackground(context, width, height);
  drawRuler(context, metrics, width, project.timeline.settings.fps, project.timeline.markers, selection);
  drawTextOverlays(context, project.timeline.textOverlays, selection, metrics, width);
  drawTracks(context, project, selection, metrics, width, dragPreview);
  drawPlayhead(context, playheadFrame, metrics, height);
}

function drawBackground(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.fillStyle = "#050505";
  context.fillRect(0, 0, width, height);
}

function drawRuler(
  context: CanvasRenderingContext2D,
  metrics: TimelineMetrics,
  width: number,
  fps: number,
  markers: TimelineMarker[],
  selection: EditorSelection
): void {
  context.fillStyle = "#09090a";
  context.fillRect(0, 0, width, metrics.rulerHeight);
  context.fillStyle = "#7d7872";
  context.font = "12px Inter, system-ui, sans-serif";
  context.textBaseline = "middle";

  const stepFrames = Math.max(fps, Math.round(fps * Math.max(1, 2 / metrics.pixelsPerFrame)));
  const firstFrame = Math.floor(metrics.scrollFrame / stepFrames) * stepFrames;

  for (let frame = firstFrame; frame <= metrics.scrollFrame + metrics.visibleFrames; frame += stepFrames) {
    const x = xFromFrame(metrics, frame);

    if (x > width) {
      break;
    }

    context.strokeStyle = "#242429";
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, metrics.rulerHeight);
    context.stroke();
    context.fillText(`${Math.round(frame / fps)}s`, x + 6, metrics.rulerHeight / 2);
  }

  for (const marker of markers) {
    const x = xFromFrame(metrics, marker.frame);

    if (x < metrics.headerWidth || x > width) {
      continue;
    }

    context.fillStyle = marker.color;
    context.beginPath();
    context.moveTo(x, 7);
    context.lineTo(x + 6, 17);
    context.lineTo(x, 27);
    context.lineTo(x - 6, 17);
    context.closePath();
    context.fill();

    if (selection.markerId === marker.id) {
      context.strokeStyle = "#ffffff";
      context.lineWidth = 2;
      context.stroke();
    }
  }
}

function drawTextOverlays(
  context: CanvasRenderingContext2D,
  overlays: TextOverlay[],
  selection: EditorSelection,
  metrics: TimelineMetrics,
  width: number
): void {
  const y = metrics.rulerHeight;

  context.fillStyle = "#09090a";
  context.fillRect(0, y, width, metrics.textRowHeight);
  context.fillStyle = "#141416";
  context.fillRect(0, y, metrics.headerWidth, metrics.textRowHeight);
  context.fillStyle = "#f6f1ea";
  context.font = "600 12px Inter, system-ui, sans-serif";
  context.textBaseline = "middle";
  context.fillText("Text", 14, y + metrics.textRowHeight / 2);
  context.strokeStyle = "#242429";
  context.beginPath();
  context.moveTo(0, y + metrics.textRowHeight);
  context.lineTo(width, y + metrics.textRowHeight);
  context.stroke();

  for (const overlay of overlays) {
    const x = xFromFrame(metrics, overlay.startFrame);
    const overlayWidth = Math.max(24, overlay.durationFrames * metrics.pixelsPerFrame);

    if (x + overlayWidth < metrics.headerWidth || x > width) {
      continue;
    }

    const selected = selection.textOverlayId === overlay.id;
    context.fillStyle = selected ? "#6eaffa" : "#0e2748";
    roundedRect(context, x, y + 7, overlayWidth, metrics.textRowHeight - 14, 6);
    context.fill();
    context.strokeStyle = selected ? "#cfe3ff" : "#6eaffa66";
    context.stroke();
    context.fillStyle = selected ? "#050505" : "#cfe3ff";
    context.font = "650 12px Inter, system-ui, sans-serif";
    context.save();
    context.beginPath();
    roundedRect(context, x, y + 7, overlayWidth, metrics.textRowHeight - 14, 6);
    context.clip();
    context.fillText(`${overlay.role === "caption" ? "Caption" : "Title"}: ${overlay.text}`, x + 10, y + metrics.textRowHeight / 2);
    context.restore();
  }
}

function drawTracks(
  context: CanvasRenderingContext2D,
  project: SpikxProject,
  selection: EditorSelection,
  metrics: TimelineMetrics,
  width: number,
  dragPreview?: DragPreview
): void {
  project.timeline.tracks.forEach((track, index) => {
    const y = metrics.rulerHeight + metrics.textRowHeight + index * metrics.rowHeight;
    const selectedTrack = selection.trackId === track.id && !selection.clipId;
    context.fillStyle = index % 2 === 0 ? "#0e0e0f" : "#111113";
    context.fillRect(0, y, width, metrics.rowHeight);
    context.fillStyle = selectedTrack ? "#0e2748" : "#141416";
    context.fillRect(0, y, metrics.headerWidth, metrics.rowHeight);
    context.fillStyle = "#f6f1ea";
    context.font = "600 13px Inter, system-ui, sans-serif";
    context.textBaseline = "middle";
    context.fillText(track.name, 14, y + metrics.rowHeight / 2 - 8);
    context.fillStyle = "#b9b0a7";
    context.font = "11px Inter, system-ui, sans-serif";
    context.fillText(`${track.muted ? "M" : "-"} ${track.locked ? "L" : "-"}`, 14, y + metrics.rowHeight / 2 + 11);
    context.strokeStyle = "#242429";
    context.beginPath();
    context.moveTo(0, y + metrics.rowHeight);
    context.lineTo(width, y + metrics.rowHeight);
    context.stroke();

    drawClips(context, project, track, selection, metrics, y, dragPreview);
  });
}

function drawClips(
  context: CanvasRenderingContext2D,
  project: SpikxProject,
  track: Track,
  selection: EditorSelection,
  metrics: TimelineMetrics,
  trackY: number,
  dragPreview?: DragPreview
): void {
  const selectedIds = selectedClipIds(selection);

  for (const clip of track.clips) {
    const asset = findAsset(project, clip.assetId);
    const startFrame = dragPreview?.starts[clip.id] ?? clip.startFrame;
    const durationFrames = dragPreview?.durations[clip.id] ?? clip.durationFrames;
    const x = xFromFrame(metrics, startFrame);
    const y = trackY + 9;
    const clipWidth = Math.max(18, durationFrames * metrics.pixelsPerFrame);
    const height = metrics.rowHeight - 18;
    const selected = selectedIds.includes(clip.id);
    const previewing = dragPreview?.activeClipId === clip.id;

    if (x + clipWidth < metrics.headerWidth || x > metrics.headerWidth + metrics.visibleFrames * metrics.pixelsPerFrame + 24) {
      continue;
    }

    context.globalAlpha = clip.muted ? 0.45 : previewing ? 0.75 : 1;
    context.fillStyle = selected ? "#6eaffa" : clipColor(clip.type);
    roundedRect(context, x, y, clipWidth, height, 7);
    context.fill();
    context.globalAlpha = 1;
    drawClipMediaPreview(context, asset, clip, x, y, clipWidth, height, selected);
    context.strokeStyle = selected ? "#cfe3ff" : "#00000055";
    context.lineWidth = selected ? 2 : 1;
    context.stroke();
    context.fillStyle = selected ? "#050505" : "#f6f1ea";
    context.font = "600 12px Inter, system-ui, sans-serif";
    context.textBaseline = "middle";
    context.save();
    context.beginPath();
    roundedRect(context, x, y, clipWidth, height, 7);
    context.clip();
    context.fillText(asset?.name ?? clip.name, x + 12, y + height / 2);

    if (clip.type === "audio") {
      drawWaveform(context, x + 8, y + height - 14, clipWidth - 16, 8, selected ? "#050505" : "#d9ccff");
    }

    context.restore();
    drawClipKeyframes(context, clip, metrics, x, y, height, selected);
    context.fillStyle = selected ? "#050505" : "#ffffff";
    context.fillRect(x + 3, y + 8, 4, height - 16);
    context.fillRect(x + clipWidth - 7, y + 8, 4, height - 16);
  }
}

function drawClipKeyframes(
  context: CanvasRenderingContext2D,
  clip: Clip,
  metrics: TimelineMetrics,
  clipX: number,
  clipY: number,
  clipHeight: number,
  selected: boolean
): void {
  if (clip.keyframes.length === 0) {
    return;
  }

  context.save();
  context.fillStyle = selected ? "#050505" : "#cfe3ff";
  context.strokeStyle = selected ? "#cfe3ff" : "#050505";

  for (const keyframe of clip.keyframes) {
    const x = xFromFrame(metrics, clip.startFrame + keyframe.frame);
    const y = clipY + clipHeight - 12;

    if (x < clipX || x > clipX + clip.durationFrames * metrics.pixelsPerFrame) {
      continue;
    }

    context.beginPath();
    context.moveTo(x, y - 4);
    context.lineTo(x + 4, y);
    context.lineTo(x, y + 4);
    context.lineTo(x - 4, y);
    context.closePath();
    context.fill();
    context.stroke();
  }

  context.restore();
}

function drawClipMediaPreview(
  context: CanvasRenderingContext2D,
  asset: ReturnType<typeof findAsset>,
  clip: Clip,
  x: number,
  y: number,
  width: number,
  height: number,
  selected: boolean
): void {
  if (!asset || clip.type === "audio") {
    return;
  }

  context.save();
  context.globalAlpha = selected ? 0.18 : 0.26;
  context.beginPath();
  roundedRect(context, x + 2, y + 2, width - 4, height - 4, 6);
  context.clip();

  if (asset.type === "image" && asset.previewUrl) {
    const image = getCachedImage(asset.previewUrl);

    if (image.complete && image.naturalWidth > 0) {
      context.drawImage(image, x, y, width, height);
      context.restore();
      return;
    }
  }

  context.fillStyle = "#ffffff";
  const frameWidth = Math.max(16, Math.min(42, width / 5));

  for (let frameX = x + 6; frameX < x + width - 6; frameX += frameWidth + 5) {
    context.fillRect(frameX, y + 8, frameWidth, Math.max(4, height - 16));
  }

  context.restore();
}

function getCachedImage(src: string): HTMLImageElement {
  const cached = imageThumbnailCache.get(src);

  if (cached) {
    return cached;
  }

  const image = new Image();
  image.src = src;
  imageThumbnailCache.set(src, image);

  return image;
}

function drawWaveform(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string): void {
  context.fillStyle = color;
  const barCount = Math.max(3, Math.floor(width / 8));

  for (let index = 0; index < barCount; index += 1) {
    const barHeight = 2 + ((index * 13) % Math.max(3, height));
    context.fillRect(x + index * 8, y + (height - barHeight) / 2, 3, barHeight);
  }
}

function drawPlayhead(context: CanvasRenderingContext2D, frame: number, metrics: TimelineMetrics, height: number): void {
  const x = xFromFrame(metrics, frame);

  if (x < metrics.headerWidth || x > metrics.headerWidth + metrics.visibleFrames * metrics.pixelsPerFrame) {
    return;
  }

  context.strokeStyle = "#6eaffa";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x, 0);
  context.lineTo(x, height);
  context.stroke();
}

function hitTestClip(project: SpikxProject, metrics: TimelineMetrics, x: number, y: number): HitResult | undefined {
  for (let index = 0; index < project.timeline.tracks.length; index += 1) {
    const track = project.timeline.tracks[index];
    const trackY = metrics.rulerHeight + metrics.textRowHeight + index * metrics.rowHeight;

    if (y < trackY || y > trackY + metrics.rowHeight) {
      continue;
    }

    for (const clip of [...track.clips].reverse()) {
      const clipX = xFromFrame(metrics, clip.startFrame);
      const clipWidth = Math.max(18, clip.durationFrames * metrics.pixelsPerFrame);

      if (x >= clipX && x <= clipX + clipWidth) {
        const edgeSize = Math.min(12, clipWidth / 3);

        return {
          clip,
          edge: x <= clipX + edgeSize ? "start" : x >= clipX + clipWidth - edgeSize ? "end" : "body"
        };
      }
    }
  }

  return undefined;
}

function getMetrics(width: number, project: SpikxProject, zoom: number, scrollFrame: number): TimelineMetrics {
  const headerWidth = 96;
  const rulerHeight = 34;
  const textRowHeight = 46;
  const rowHeight = 66;
  const totalFrames = Math.max(project.timeline.settings.fps * 20, getTimelineDurationFrames(project.timeline) + project.timeline.settings.fps * 4);
  const safeZoom = Math.min(12, Math.max(0.5, zoom));
  const visibleFrames = Math.max(project.timeline.settings.fps * 2, totalFrames / safeZoom);
  const pixelsPerFrame = Math.max(0.08, (width - headerWidth - 36) / visibleFrames);

  return {
    headerWidth,
    rulerHeight,
    textRowHeight,
    rowHeight,
    pixelsPerFrame,
    totalFrames,
    visibleFrames,
    scrollFrame: Math.min(Math.max(0, scrollFrame), Math.max(0, totalFrames - visibleFrames))
  };
}

function pointFromMouseEvent(canvas: HTMLCanvasElement, event: MouseEvent<HTMLCanvasElement> | DragEvent<HTMLCanvasElement>): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function frameFromX(metrics: TimelineMetrics, x: number): number {
  return Math.max(0, Math.round(metrics.scrollFrame + (x - metrics.headerWidth) / metrics.pixelsPerFrame));
}

function xFromFrame(metrics: TimelineMetrics, frame: number): number {
  return metrics.headerWidth + (frame - metrics.scrollFrame) * metrics.pixelsPerFrame;
}

function trackAtY(project: SpikxProject, metrics: TimelineMetrics, y: number): Track | undefined {
  const trackIndex = Math.floor((y - metrics.rulerHeight - metrics.textRowHeight) / metrics.rowHeight);
  return project.timeline.tracks[trackIndex];
}

function hitTestMarker(markers: TimelineMarker[], metrics: TimelineMetrics, x: number, y: number): TimelineMarker | undefined {
  if (y > metrics.rulerHeight) {
    return undefined;
  }

  return markers.find((marker) => Math.abs(xFromFrame(metrics, marker.frame) - x) <= 8);
}

function hitTestTextOverlay(overlays: TextOverlay[], metrics: TimelineMetrics, x: number, y: number): TextOverlay | undefined {
  const rowY = metrics.rulerHeight;

  if (y < rowY || y > rowY + metrics.textRowHeight) {
    return undefined;
  }

  return [...overlays].reverse().find((overlay) => {
    const overlayX = xFromFrame(metrics, overlay.startFrame);
    const overlayWidth = Math.max(24, overlay.durationFrames * metrics.pixelsPerFrame);

    return x >= overlayX && x <= overlayX + overlayWidth;
  });
}

function findClipById(project: SpikxProject, clipId: string): Clip | undefined {
  for (const track of project.timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId);

    if (clip) {
      return clip;
    }
  }

  return undefined;
}

function selectedClipIds(selection: EditorSelection): string[] {
  if (selection.clipIds && selection.clipIds.length > 0) {
    return selection.clipIds;
  }

  return selection.clipId ? [selection.clipId] : [];
}

function clipColor(type: Clip["type"]): string {
  switch (type) {
    case "image":
      return "#9be15d";
    case "audio":
      return "#8d6bff";
    case "video":
    default:
      return "#2f5f9d";
  }
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const nextRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + nextRadius, y);
  context.arcTo(x + width, y, x + width, y + height, nextRadius);
  context.arcTo(x + width, y + height, x, y + height, nextRadius);
  context.arcTo(x, y + height, x, y, nextRadius);
  context.arcTo(x, y, x + width, y, nextRadius);
  context.closePath();
}
