import { useEffect, useRef } from "react";
import { findAsset, getTimelineDurationFrames } from "../../shared/editing";
import type { Clip, EditorSelection, SpikxProject, Track, TrackId } from "../../shared/types";

interface TimelineCanvasProps {
  project: SpikxProject;
  selection: EditorSelection;
  playheadFrame: number;
  onSelectClip: (clip: Clip) => void;
  onAddClip: (assetId: string, trackId: TrackId, startFrame: number) => void;
  onSetPlayhead: (frame: number) => void;
}

interface TimelineMetrics {
  headerWidth: number;
  rulerHeight: number;
  rowHeight: number;
  pixelsPerFrame: number;
  totalFrames: number;
}

export function TimelineCanvas({
  project,
  selection,
  playheadFrame,
  onSelectClip,
  onAddClip,
  onSetPlayhead
}: TimelineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => drawTimeline(canvas, project, selection, playheadFrame));
    resizeObserver.observe(canvas);
    drawTimeline(canvas, project, selection, playheadFrame);

    return () => resizeObserver.disconnect();
  }, [project, selection, playheadFrame]);

  function handleDrop(event: React.DragEvent<HTMLCanvasElement>): void {
    event.preventDefault();
    const assetId = event.dataTransfer.getData("application/x-spikx-asset");

    if (!assetId) {
      return;
    }

    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const metrics = getMetrics(canvas.clientWidth, project);
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const trackIndex = Math.floor((y - metrics.rulerHeight) / metrics.rowHeight);
    const track = project.timeline.tracks[trackIndex];

    if (!track) {
      return;
    }

    const startFrame = Math.max(0, Math.round((x - metrics.headerWidth) / metrics.pixelsPerFrame));
    onAddClip(assetId, track.id, startFrame);
  }

  function handleMouseDown(event: React.MouseEvent<HTMLCanvasElement>): void {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = hitTestClip(project, canvas.clientWidth, x, y);

    if (hit) {
      onSelectClip(hit);
      return;
    }

    const metrics = getMetrics(canvas.clientWidth, project);
    onSetPlayhead(Math.max(0, Math.round((x - metrics.headerWidth) / metrics.pixelsPerFrame)));
  }

  return (
    <section className="panel timeline-panel">
      <div className="panel-header">
        <h2>Timeline</h2>
        <span>{project.timeline.settings.fps} fps · {project.timeline.settings.width}x{project.timeline.settings.height}</span>
      </div>
      <canvas
        ref={canvasRef}
        className="timeline-canvas"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onMouseDown={handleMouseDown}
      />
    </section>
  );
}

function drawTimeline(canvas: HTMLCanvasElement, project: SpikxProject, selection: EditorSelection, playheadFrame: number): void {
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

  const metrics = getMetrics(width, project);
  drawBackground(context, width, height);
  drawRuler(context, metrics, width, project.timeline.settings.fps);
  drawTracks(context, project, selection, metrics, width);
  drawPlayhead(context, playheadFrame, metrics, height);
}

function drawBackground(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.fillStyle = "#111315";
  context.fillRect(0, 0, width, height);
}

function drawRuler(context: CanvasRenderingContext2D, metrics: TimelineMetrics, width: number, fps: number): void {
  context.fillStyle = "#16191c";
  context.fillRect(0, 0, width, metrics.rulerHeight);
  context.fillStyle = "#8c969f";
  context.font = "12px Inter, system-ui, sans-serif";
  context.textBaseline = "middle";

  const stepFrames = fps * 2;

  for (let frame = 0; frame <= metrics.totalFrames; frame += stepFrames) {
    const x = metrics.headerWidth + frame * metrics.pixelsPerFrame;

    if (x > width) {
      break;
    }

    context.strokeStyle = "#2a2f34";
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, metrics.rulerHeight);
    context.stroke();
    context.fillText(`${Math.round(frame / fps)}s`, x + 6, metrics.rulerHeight / 2);
  }
}

function drawTracks(
  context: CanvasRenderingContext2D,
  project: SpikxProject,
  selection: EditorSelection,
  metrics: TimelineMetrics,
  width: number
): void {
  project.timeline.tracks.forEach((track, index) => {
    const y = metrics.rulerHeight + index * metrics.rowHeight;
    context.fillStyle = index % 2 === 0 ? "#15181b" : "#181b1f";
    context.fillRect(0, y, width, metrics.rowHeight);
    context.fillStyle = "#20252a";
    context.fillRect(0, y, metrics.headerWidth, metrics.rowHeight);
    context.fillStyle = "#d8dde2";
    context.font = "600 13px Inter, system-ui, sans-serif";
    context.textBaseline = "middle";
    context.fillText(track.name, 18, y + metrics.rowHeight / 2);
    context.strokeStyle = "#2a2f34";
    context.beginPath();
    context.moveTo(0, y + metrics.rowHeight);
    context.lineTo(width, y + metrics.rowHeight);
    context.stroke();

    drawClips(context, project, track, selection, metrics, y);
  });
}

function drawClips(
  context: CanvasRenderingContext2D,
  project: SpikxProject,
  track: Track,
  selection: EditorSelection,
  metrics: TimelineMetrics,
  trackY: number
): void {
  for (const clip of track.clips) {
    const asset = findAsset(project, clip.assetId);
    const x = metrics.headerWidth + clip.startFrame * metrics.pixelsPerFrame;
    const y = trackY + 9;
    const width = Math.max(18, clip.durationFrames * metrics.pixelsPerFrame);
    const height = metrics.rowHeight - 18;
    const selected = selection.clipId === clip.id;

    context.fillStyle = selected ? "#f2c94c" : clipColor(clip.type);
    roundedRect(context, x, y, width, height, 7);
    context.fill();
    context.strokeStyle = selected ? "#fff2a8" : "#00000055";
    context.lineWidth = selected ? 2 : 1;
    context.stroke();
    context.fillStyle = selected ? "#151515" : "#f5f7f8";
    context.font = "600 12px Inter, system-ui, sans-serif";
    context.textBaseline = "middle";
    context.save();
    context.beginPath();
    roundedRect(context, x, y, width, height, 7);
    context.clip();
    context.fillText(asset?.name ?? clip.name, x + 10, y + height / 2);
    context.restore();
  }
}

function drawPlayhead(context: CanvasRenderingContext2D, frame: number, metrics: TimelineMetrics, height: number): void {
  const x = metrics.headerWidth + frame * metrics.pixelsPerFrame;
  context.strokeStyle = "#ff6b4a";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x, 0);
  context.lineTo(x, height);
  context.stroke();
}

function hitTestClip(project: SpikxProject, canvasWidth: number, x: number, y: number): Clip | undefined {
  const metrics = getMetrics(canvasWidth, project);

  for (let index = 0; index < project.timeline.tracks.length; index += 1) {
    const track = project.timeline.tracks[index];
    const trackY = metrics.rulerHeight + index * metrics.rowHeight;

    if (y < trackY || y > trackY + metrics.rowHeight) {
      continue;
    }

    for (const clip of track.clips) {
      const clipX = metrics.headerWidth + clip.startFrame * metrics.pixelsPerFrame;
      const clipWidth = Math.max(18, clip.durationFrames * metrics.pixelsPerFrame);

      if (x >= clipX && x <= clipX + clipWidth) {
        return clip;
      }
    }
  }

  return undefined;
}

function getMetrics(width: number, project: SpikxProject): TimelineMetrics {
  const headerWidth = 84;
  const rulerHeight = 34;
  const rowHeight = 66;
  const totalFrames = Math.max(project.timeline.settings.fps * 20, getTimelineDurationFrames(project.timeline));
  const pixelsPerFrame = Math.max(0.22, (width - headerWidth - 36) / totalFrames);

  return {
    headerWidth,
    rulerHeight,
    rowHeight,
    pixelsPerFrame,
    totalFrames
  };
}

function clipColor(type: Clip["type"]): string {
  switch (type) {
    case "image":
      return "#4cae8f";
    case "audio":
      return "#9b7cff";
    case "video":
    default:
      return "#377bd2";
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
