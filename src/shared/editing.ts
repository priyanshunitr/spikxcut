import type {
  Clip,
  ClipId,
  EditorSelection,
  MediaAsset,
  MediaAssetId,
  SpikxProject,
  Timeline,
  TimelineSettings,
  Track,
  TrackId,
  TrackType
} from "./types";

const defaultSettings: TimelineSettings = {
  fps: 30,
  width: 1920,
  height: 1080
};

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function createEmptyProject(name = "Untitled"): SpikxProject {
  const now = new Date().toISOString();

  return {
    app: "spikx-js",
    version: 1,
    name,
    createdAt: now,
    updatedAt: now,
    mediaAssets: [],
    timeline: {
      settings: defaultSettings,
      tracks: [
        createTrack("video", "V1"),
        createTrack("audio", "A1")
      ]
    }
  };
}

export function createTrack(type: TrackType, name: string): Track {
  return {
    id: createId("track"),
    name,
    type,
    clips: [],
    locked: false,
    muted: false
  };
}

export function withUpdatedTimestamp(project: SpikxProject): SpikxProject {
  return {
    ...project,
    updatedAt: new Date().toISOString()
  };
}

export function addMediaAssets(project: SpikxProject, assets: MediaAsset[]): SpikxProject {
  const existingPaths = new Set(project.mediaAssets.map((asset) => asset.path));
  const uniqueAssets = assets.filter((asset) => !existingPaths.has(asset.path));

  return withUpdatedTimestamp({
    ...project,
    mediaAssets: [...project.mediaAssets, ...uniqueAssets]
  });
}

export function addClipToTimeline(
  project: SpikxProject,
  assetId: MediaAssetId,
  trackId: TrackId,
  startFrame: number
): { project: SpikxProject; clip: Clip } {
  const asset = findAsset(project, assetId);
  const track = findTrack(project.timeline, trackId);

  if (!asset) {
    throw new Error("Media asset not found.");
  }

  if (!track) {
    throw new Error("Track not found.");
  }

  if (track.type === "audio" && asset.type !== "audio") {
    throw new Error("Only audio assets can be placed on audio tracks.");
  }

  if (track.type === "video" && asset.type === "audio") {
    throw new Error("Audio assets cannot be placed on video tracks.");
  }

  const durationFrames = asset.durationFrames ?? framesFromSeconds(asset.type === "image" ? 5 : 10, project.timeline.settings.fps);
  const clip: Clip = {
    id: createId("clip"),
    assetId,
    trackId,
    name: asset.name,
    type: asset.type,
    startFrame: Math.max(0, Math.round(startFrame)),
    durationFrames: Math.max(1, durationFrames),
    trimStartFrame: 0,
    opacity: 1,
    volume: 1,
    muted: false
  };

  return {
    project: replaceTrack(project, trackId, {
      ...track,
      clips: sortClips([...track.clips, clip])
    }),
    clip
  };
}

export function moveClip(project: SpikxProject, clipId: ClipId, trackId: TrackId, startFrame: number): SpikxProject {
  const clip = findClip(project.timeline, clipId);
  const destinationTrack = findTrack(project.timeline, trackId);

  if (!clip || !destinationTrack) {
    return project;
  }

  if (destinationTrack.type === "audio" && clip.type !== "audio") {
    return project;
  }

  if (destinationTrack.type === "video" && clip.type === "audio") {
    return project;
  }

  const timeline = removeClipFromTimeline(project.timeline, clipId);
  const nextClip = {
    ...clip,
    trackId,
    startFrame: Math.max(0, Math.round(startFrame))
  };

  return withUpdatedTimestamp({
    ...project,
    timeline: {
      ...timeline,
      tracks: timeline.tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        return {
          ...track,
          clips: sortClips([...track.clips, nextClip])
        };
      })
    }
  });
}

export function trimClip(project: SpikxProject, clipId: ClipId, startDeltaFrames: number, endDeltaFrames: number): SpikxProject {
  const clip = findClip(project.timeline, clipId);

  if (!clip) {
    return project;
  }

  const nextStart = Math.max(0, clip.startFrame + startDeltaFrames);
  const consumedStart = nextStart - clip.startFrame;
  const nextDuration = Math.max(1, clip.durationFrames - consumedStart + endDeltaFrames);

  return updateClip(project, clipId, {
    startFrame: nextStart,
    trimStartFrame: Math.max(0, clip.trimStartFrame + consumedStart),
    durationFrames: nextDuration
  });
}

export function splitClip(project: SpikxProject, clipId: ClipId, frame: number): SpikxProject {
  const clip = findClip(project.timeline, clipId);
  const track = clip ? findTrack(project.timeline, clip.trackId) : undefined;

  if (!clip || !track || frame <= clip.startFrame || frame >= clip.startFrame + clip.durationFrames) {
    return project;
  }

  const leftDuration = frame - clip.startFrame;
  const rightDuration = clip.durationFrames - leftDuration;
  const rightClip: Clip = {
    ...clip,
    id: createId("clip"),
    startFrame: frame,
    durationFrames: rightDuration,
    trimStartFrame: clip.trimStartFrame + leftDuration
  };

  const nextTrack: Track = {
    ...track,
    clips: sortClips([
      ...track.clips.map((item) => (
        item.id === clipId ? { ...item, durationFrames: leftDuration } : item
      )),
      rightClip
    ])
  };

  return replaceTrack(project, track.id, nextTrack);
}

export function deleteClip(project: SpikxProject, clipId: ClipId): SpikxProject {
  return withUpdatedTimestamp({
    ...project,
    timeline: removeClipFromTimeline(project.timeline, clipId)
  });
}

export function updateClip(project: SpikxProject, clipId: ClipId, changes: Partial<Clip>): SpikxProject {
  return withUpdatedTimestamp({
    ...project,
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => ({
        ...track,
        clips: sortClips(track.clips.map((clip) => (
          clip.id === clipId
            ? {
                ...clip,
                ...changes,
                startFrame: Math.max(0, Math.round(changes.startFrame ?? clip.startFrame)),
                durationFrames: Math.max(1, Math.round(changes.durationFrames ?? clip.durationFrames)),
                trimStartFrame: Math.max(0, Math.round(changes.trimStartFrame ?? clip.trimStartFrame)),
                opacity: clamp(changes.opacity ?? clip.opacity, 0, 1),
                volume: clamp(changes.volume ?? clip.volume, 0, 2)
              }
            : clip
        )))
      }))
    }
  });
}

export function setSelection(selection: EditorSelection, changes: EditorSelection): EditorSelection {
  return {
    ...selection,
    ...changes
  };
}

export function findAsset(project: SpikxProject, assetId: MediaAssetId): MediaAsset | undefined {
  return project.mediaAssets.find((asset) => asset.id === assetId);
}

export function findTrack(timeline: Timeline, trackId: TrackId): Track | undefined {
  return timeline.tracks.find((track) => track.id === trackId);
}

export function findClip(timeline: Timeline, clipId: ClipId): Clip | undefined {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((item) => item.id === clipId);

    if (clip) {
      return clip;
    }
  }

  return undefined;
}

export function findClipTrack(timeline: Timeline, clipId: ClipId): Track | undefined {
  return timeline.tracks.find((track) => track.clips.some((clip) => clip.id === clipId));
}

export function framesFromSeconds(seconds: number, fps: number): number {
  return Math.max(1, Math.round(seconds * fps));
}

export function secondsFromFrames(frames: number, fps: number): number {
  return frames / fps;
}

export function getTimelineDurationFrames(timeline: Timeline): number {
  return Math.max(
    timeline.settings.fps * 10,
    ...timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.startFrame + clip.durationFrames))
  );
}

function replaceTrack(project: SpikxProject, trackId: TrackId, nextTrack: Track): SpikxProject {
  return withUpdatedTimestamp({
    ...project,
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => (track.id === trackId ? nextTrack : track))
    }
  });
}

function removeClipFromTimeline(timeline: Timeline, clipId: ClipId): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((clip) => clip.id !== clipId)
    }))
  };
}

function sortClips(clips: Clip[]): Clip[] {
  return [...clips].sort((left, right) => left.startFrame - right.startFrame);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
