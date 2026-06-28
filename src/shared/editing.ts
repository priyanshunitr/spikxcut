import type {
  Clip,
  ClipId,
  ClipEffects,
  ClipKeyframe,
  ClipSpeed,
  ClipTransform,
  ClipTransitions,
  EditorSelection,
  ExportPreset,
  ExportSettings,
  KeyframeProperty,
  MediaAsset,
  MediaAssetId,
  MediaType,
  SpikxProject,
  TextOverlay,
  Timeline,
  TimelineMarker,
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

export const defaultExportSettings: ExportSettings = {
  fps: 30,
  width: 1920,
  height: 1080,
  bitrateKbps: 12000,
  codec: "libx264"
};

export const defaultClipTransform: ClipTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  fit: "contain",
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  cropLeft: 0
};

export const defaultClipTransitions: ClipTransitions = {
  kind: "none",
  inFrames: 0,
  outFrames: 0
};

export const defaultClipEffects: ClipEffects = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  blur: 0,
  sharpen: 0,
  vignette: 0
};

export const defaultClipSpeed: ClipSpeed = {
  rate: 1,
  reverse: false,
  freezeFrame: false
};

export const defaultExportPresets: ExportPreset[] = [
  {
    id: "youtube-1080p",
    name: "YouTube 1080p",
    settings: { fps: 30, width: 1920, height: 1080, bitrateKbps: 12000, codec: "libx264" }
  },
  {
    id: "vertical-1080p",
    name: "Vertical 1080p",
    settings: { fps: 30, width: 1080, height: 1920, bitrateKbps: 10000, codec: "libx264" }
  },
  {
    id: "square-social",
    name: "Square Social",
    settings: { fps: 30, width: 1080, height: 1080, bitrateKbps: 8000, codec: "libx264" }
  },
  {
    id: "small-file",
    name: "Small File",
    settings: { fps: 24, width: 1280, height: 720, bitrateKbps: 3500, codec: "libx264" }
  },
  {
    id: "archive-h265",
    name: "Archive H.265",
    settings: { fps: 30, width: 3840, height: 2160, bitrateKbps: 24000, codec: "libx265" }
  }
];

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
      settings: { ...defaultSettings },
      tracks: [
        createTrack("video", "V1"),
        createTrack("audio", "A1")
      ],
      markers: [],
      textOverlays: []
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

export function updateMediaAsset(
  project: SpikxProject,
  assetId: MediaAssetId,
  changes: Partial<Pick<MediaAsset, "name" | "bin">>
): SpikxProject {
  const existingAsset = findAsset(project, assetId);

  if (!existingAsset) {
    return project;
  }

  const nextName = changes.name?.trim() || existingAsset.name;
  const nextBin = changes.bin?.trim();

  return withUpdatedTimestamp({
    ...project,
    mediaAssets: project.mediaAssets.map((asset) => (
      asset.id === assetId
        ? {
            ...asset,
            name: nextName,
            bin: nextBin || undefined
          }
        : asset
    )),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => (
          clip.assetId === assetId ? { ...clip, name: nextName } : clip
        ))
      }))
    }
  });
}

export function removeMediaAsset(project: SpikxProject, assetId: MediaAssetId): SpikxProject {
  if (isAssetUsedOnLockedTrack(project, assetId)) {
    return project;
  }

  return withUpdatedTimestamp({
    ...project,
    mediaAssets: project.mediaAssets.filter((asset) => asset.id !== assetId),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.assetId !== assetId)
      }))
    }
  });
}

export function canRelinkMediaAsset(project: SpikxProject, assetId: MediaAssetId, nextAsset: MediaAsset): boolean {
  if (!findAsset(project, assetId) || isAssetUsedOnLockedTrack(project, assetId)) {
    return false;
  }

  return project.timeline.tracks.every((track) => (
    track.clips.every((clip) => (
      clip.assetId !== assetId || isMediaTypeCompatibleWithTrack(nextAsset.type, track.type)
    ))
  ));
}

export function relinkMediaAsset(project: SpikxProject, assetId: MediaAssetId, nextAsset: MediaAsset): SpikxProject {
  const existingAsset = findAsset(project, assetId);

  if (!existingAsset || !canRelinkMediaAsset(project, assetId, nextAsset)) {
    return project;
  }

  return withUpdatedTimestamp({
    ...project,
    mediaAssets: project.mediaAssets.map((asset) => (
      asset.id === assetId
        ? {
            ...nextAsset,
            id: asset.id,
            importedAt: asset.importedAt
          }
        : asset
    )),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => (
          clip.assetId === assetId
            ? {
                ...clip,
                name: nextAsset.name,
                type: nextAsset.type,
                trimStartFrame: nextAsset.type === "image" ? 0 : clip.trimStartFrame
              }
            : clip
        ))
      }))
    }
  });
}

export function updateProjectName(project: SpikxProject, name: string): SpikxProject {
  const nextName = name.trim() || "Untitled";

  return withUpdatedTimestamp({
    ...project,
    name: nextName
  });
}

export function updateTimelineSettings(project: SpikxProject, changes: Partial<TimelineSettings>): SpikxProject {
  return withUpdatedTimestamp({
    ...project,
    timeline: {
      ...project.timeline,
      settings: {
        fps: safeFrame(changes.fps, project.timeline.settings.fps, 1),
        width: safeFrame(changes.width, project.timeline.settings.width, 1),
        height: safeFrame(changes.height, project.timeline.settings.height, 1)
      }
    }
  });
}

export function addTrack(project: SpikxProject, type: TrackType): { project: SpikxProject; track: Track } {
  const trackNumber = project.timeline.tracks.filter((track) => track.type === type).length + 1;
  const track = createTrack(type, `${type === "video" ? "V" : "A"}${trackNumber}`);

  return {
    project: withUpdatedTimestamp({
      ...project,
      timeline: {
        ...project.timeline,
        tracks: [...project.timeline.tracks, track]
      }
    }),
    track
  };
}

export function updateTrack(project: SpikxProject, trackId: TrackId, changes: Partial<Omit<Track, "id" | "clips">>): SpikxProject {
  return withUpdatedTimestamp({
    ...project,
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => (
        track.id === trackId
          ? {
              ...track,
              ...changes,
              name: changes.name?.trim() || track.name
            }
          : track
      ))
    }
  });
}

export function removeTrack(project: SpikxProject, trackId: TrackId): SpikxProject {
  const track = findTrack(project.timeline, trackId);

  if (!track || track.locked) {
    return project;
  }

  const remainingTracksOfType = project.timeline.tracks.filter((item) => item.type === track.type && item.id !== trackId);

  if (remainingTracksOfType.length === 0) {
    return project;
  }

  return withUpdatedTimestamp({
    ...project,
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.filter((item) => item.id !== trackId)
    }
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

  if (track.locked) {
    throw new Error("Track is locked.");
  }

  if (!isMediaTypeCompatibleWithTrack(asset.type, track.type)) {
    throw new Error(track.type === "audio"
      ? "Only audio assets can be placed on audio tracks."
      : "Audio assets cannot be placed on video tracks.");
  }

  const durationFrames = asset.durationFrames ?? framesFromSeconds(asset.type === "image" ? 5 : 10, project.timeline.settings.fps);
  const clip: Clip = {
    id: createId("clip"),
    assetId,
    trackId,
    name: asset.name,
    type: asset.type,
    startFrame: safeFrame(startFrame, 0),
    durationFrames: safeFrame(durationFrames, 1, 1),
    trimStartFrame: 0,
    opacity: 1,
    volume: 1,
    muted: false,
    transform: { ...defaultClipTransform },
    transitions: { ...defaultClipTransitions },
    effects: { ...defaultClipEffects },
    speed: { ...defaultClipSpeed },
    keyframes: []
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
  const sourceTrack = clip ? findClipTrack(project.timeline, clipId) : undefined;
  const destinationTrack = findTrack(project.timeline, trackId);

  if (!clip || !sourceTrack || !destinationTrack || sourceTrack.locked || destinationTrack.locked) {
    return project;
  }

  if (!isMediaTypeCompatibleWithTrack(clip.type, destinationTrack.type)) {
    return project;
  }

  const timeline = removeClipFromTimeline(project.timeline, clipId);
  const nextClip = {
    ...clip,
    trackId,
    startFrame: safeFrame(startFrame, clip.startFrame)
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

export function moveClips(project: SpikxProject, clipIds: ClipId[], frameDelta: number): SpikxProject {
  const uniqueClipIds = new Set(clipIds);

  if (uniqueClipIds.size === 0 || !Number.isFinite(frameDelta)) {
    return project;
  }

  let changed = false;
  const tracks = project.timeline.tracks.map((track) => {
    if (track.locked) {
      return track;
    }

    return {
      ...track,
      clips: sortClips(track.clips.map((clip) => {
        if (!uniqueClipIds.has(clip.id)) {
          return clip;
        }

        const startFrame = safeFrame(clip.startFrame + frameDelta, clip.startFrame);

        if (startFrame !== clip.startFrame) {
          changed = true;
        }

        return {
          ...clip,
          startFrame
        };
      }))
    };
  });

  if (!changed) {
    return project;
  }

  return withUpdatedTimestamp({
    ...project,
    timeline: {
      ...project.timeline,
      tracks
    }
  });
}

export function trimClip(project: SpikxProject, clipId: ClipId, startDeltaFrames: number, endDeltaFrames: number): SpikxProject {
  const clip = findClip(project.timeline, clipId);
  const track = clip ? findClipTrack(project.timeline, clipId) : undefined;

  if (!clip || !track || track.locked) {
    return project;
  }

  const safeStartDelta = safeFrame(startDeltaFrames, 0, Number.NEGATIVE_INFINITY);
  const safeEndDelta = safeFrame(endDeltaFrames, 0, Number.NEGATIVE_INFINITY);
  const nextStart = Math.max(0, clip.startFrame + safeStartDelta);
  const consumedStart = nextStart - clip.startFrame;
  const nextDuration = Math.max(1, clip.durationFrames - consumedStart + safeEndDelta);

  return updateClip(project, clipId, {
    startFrame: nextStart,
    trimStartFrame: Math.max(0, clip.trimStartFrame + consumedStart),
    durationFrames: nextDuration
  });
}

export function splitClip(project: SpikxProject, clipId: ClipId, frame: number): SpikxProject {
  const clip = findClip(project.timeline, clipId);
  const track = clip ? findTrack(project.timeline, clip.trackId) : undefined;
  const splitFrame = clip ? safeFrame(frame, clip.startFrame) : 0;

  if (!Number.isFinite(frame) || !clip || !track || track.locked || splitFrame <= clip.startFrame || splitFrame >= clip.startFrame + clip.durationFrames) {
    return project;
  }

  const leftDuration = splitFrame - clip.startFrame;
  const rightDuration = clip.durationFrames - leftDuration;
  const rightClip: Clip = {
    ...clip,
    id: createId("clip"),
    startFrame: splitFrame,
    durationFrames: rightDuration,
    trimStartFrame: clip.trimStartFrame + leftDuration,
    keyframes: clip.keyframes
      .filter((keyframe) => keyframe.frame >= leftDuration)
      .map((keyframe) => ({
        ...keyframe,
        id: createId("keyframe"),
        frame: keyframe.frame - leftDuration
      }))
  };

  const nextTrack: Track = {
    ...track,
    clips: sortClips([
      ...track.clips.map((item) => (
        item.id === clipId
          ? {
              ...item,
              durationFrames: leftDuration,
              keyframes: item.keyframes.filter((keyframe) => keyframe.frame < leftDuration)
            }
          : item
      )),
      rightClip
    ])
  };

  return replaceTrack(project, track.id, nextTrack);
}

export function deleteClip(project: SpikxProject, clipId: ClipId): SpikxProject {
  const track = findClipTrack(project.timeline, clipId);

  if (!track || track.locked) {
    return project;
  }

  return withUpdatedTimestamp({
    ...project,
    timeline: removeClipFromTimeline(project.timeline, clipId)
  });
}

export function deleteClips(project: SpikxProject, clipIds: ClipId[]): SpikxProject {
  const uniqueClipIds = new Set(clipIds);

  if (uniqueClipIds.size === 0) {
    return project;
  }

  let changed = false;
  const tracks = project.timeline.tracks.map((track) => {
    if (track.locked) {
      return track;
    }

    const clips = track.clips.filter((clip) => !uniqueClipIds.has(clip.id));
    changed = changed || clips.length !== track.clips.length;

    return {
      ...track,
      clips
    };
  });

  if (!changed) {
    return project;
  }

  return withUpdatedTimestamp({
    ...project,
    timeline: {
      ...project.timeline,
      tracks
    }
  });
}

export function updateClip(project: SpikxProject, clipId: ClipId, changes: Partial<Clip>): SpikxProject {
  const track = findClipTrack(project.timeline, clipId);

  if (!track || track.locked) {
    return project;
  }

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
                startFrame: safeFrame(changes.startFrame, clip.startFrame),
                durationFrames: safeFrame(changes.durationFrames, clip.durationFrames, 1),
                trimStartFrame: safeFrame(changes.trimStartFrame, clip.trimStartFrame),
                opacity: clampFinite(changes.opacity, clip.opacity, 0, 1),
                volume: clampFinite(changes.volume, clip.volume, 0, 2),
                transform: sanitizeClipTransform(changes.transform, clip.transform),
                transitions: sanitizeClipTransitions(changes.transitions, clip.transitions, clip.durationFrames),
                effects: sanitizeClipEffects(changes.effects, clip.effects),
                speed: sanitizeClipSpeed(changes.speed, clip.speed),
                keyframes: sanitizeClipKeyframes(changes.keyframes, clip.keyframes, clip.durationFrames)
              }
            : clip
        )))
      }))
    }
  });
}

export function addTimelineMarker(project: SpikxProject, frame: number, label = "Marker"): { project: SpikxProject; marker: TimelineMarker } {
  const marker: TimelineMarker = {
    id: createId("marker"),
    frame: safeFrame(frame, 0),
    label: label.trim() || "Marker",
    color: "#f2c94c"
  };

  return {
    project: withUpdatedTimestamp({
      ...project,
      timeline: {
        ...project.timeline,
        markers: sortMarkers([...project.timeline.markers, marker])
      }
    }),
    marker
  };
}

export function updateTimelineMarker(project: SpikxProject, markerId: string, changes: Partial<TimelineMarker>): SpikxProject {
  if (!project.timeline.markers.some((marker) => marker.id === markerId)) {
    return project;
  }

  return withUpdatedTimestamp({
    ...project,
    timeline: {
      ...project.timeline,
      markers: sortMarkers(project.timeline.markers.map((marker) => (
        marker.id === markerId
          ? {
              ...marker,
              ...changes,
              frame: safeFrame(changes.frame, marker.frame),
              label: changes.label?.trim() || marker.label,
              color: sanitizeColor(changes.color, marker.color)
            }
          : marker
      )))
    }
  });
}

export function deleteTimelineMarker(project: SpikxProject, markerId: string): SpikxProject {
  if (!project.timeline.markers.some((marker) => marker.id === markerId)) {
    return project;
  }

  return withUpdatedTimestamp({
    ...project,
    timeline: {
      ...project.timeline,
      markers: project.timeline.markers.filter((marker) => marker.id !== markerId)
    }
  });
}

export function addTextOverlay(project: SpikxProject, startFrame: number, text = "Title"): { project: SpikxProject; overlay: TextOverlay } {
  const overlay: TextOverlay = {
    id: createId("text"),
    text,
    startFrame: safeFrame(startFrame, 0),
    durationFrames: framesFromSeconds(3, project.timeline.settings.fps),
    x: 0,
    y: 0,
    fontSize: 64,
    color: "#ffffff",
    backgroundColor: "#000000",
    opacity: 1,
    align: "center",
    role: "title"
  };

  return {
    project: withUpdatedTimestamp({
      ...project,
      timeline: {
        ...project.timeline,
        textOverlays: sortTextOverlays([...project.timeline.textOverlays, overlay])
      }
    }),
    overlay
  };
}

export function addCaptionOverlay(project: SpikxProject, startFrame: number, text = "Caption"): { project: SpikxProject; overlay: TextOverlay } {
  const overlay: TextOverlay = {
    id: createId("caption"),
    text,
    startFrame: safeFrame(startFrame, 0),
    durationFrames: framesFromSeconds(3, project.timeline.settings.fps),
    x: 0,
    y: Math.round(project.timeline.settings.height * 0.32),
    fontSize: 38,
    color: "#ffffff",
    backgroundColor: "#000000",
    opacity: 1,
    align: "center",
    role: "caption"
  };

  return {
    project: withUpdatedTimestamp({
      ...project,
      timeline: {
        ...project.timeline,
        textOverlays: sortTextOverlays([...project.timeline.textOverlays, overlay])
      }
    }),
    overlay
  };
}

export function updateTextOverlay(project: SpikxProject, overlayId: string, changes: Partial<TextOverlay>): SpikxProject {
  if (!project.timeline.textOverlays.some((overlay) => overlay.id === overlayId)) {
    return project;
  }

  return withUpdatedTimestamp({
    ...project,
    timeline: {
      ...project.timeline,
      textOverlays: sortTextOverlays(project.timeline.textOverlays.map((overlay) => (
        overlay.id === overlayId ? sanitizeTextOverlay({ ...overlay, ...changes }, overlay) : overlay
      )))
    }
  });
}

export function deleteTextOverlay(project: SpikxProject, overlayId: string): SpikxProject {
  if (!project.timeline.textOverlays.some((overlay) => overlay.id === overlayId)) {
    return project;
  }

  return withUpdatedTimestamp({
    ...project,
    timeline: {
      ...project.timeline,
      textOverlays: project.timeline.textOverlays.filter((overlay) => overlay.id !== overlayId)
    }
  });
}

export function addClipKeyframe(
  project: SpikxProject,
  clipId: ClipId,
  property: KeyframeProperty,
  timelineFrame: number
): SpikxProject {
  const clip = findClip(project.timeline, clipId);

  if (!clip) {
    return project;
  }

  const frame = safeFrame(timelineFrame - clip.startFrame, 0);
  const value = clipValueAtFrame(clip, property, frame);
  const keyframe: ClipKeyframe = {
    id: createId("keyframe"),
    frame,
    property,
    value
  };

  return updateClip(project, clipId, {
    keyframes: [...clip.keyframes.filter((item) => !(item.property === property && item.frame === frame)), keyframe]
  });
}

export function deleteClipKeyframe(project: SpikxProject, clipId: ClipId, keyframeId: string): SpikxProject {
  const clip = findClip(project.timeline, clipId);

  if (!clip || !clip.keyframes.some((keyframe) => keyframe.id === keyframeId)) {
    return project;
  }

  return updateClip(project, clipId, {
    keyframes: clip.keyframes.filter((keyframe) => keyframe.id !== keyframeId)
  });
}

export function resolveClipAtFrame(clip: Clip, timelineFrame: number): Clip {
  const localFrame = safeFrame(timelineFrame - clip.startFrame, 0);

  return {
    ...clip,
    opacity: clipValueAtFrame(clip, "opacity", localFrame),
    volume: clipValueAtFrame(clip, "volume", localFrame),
    transform: {
      ...clip.transform,
      x: clipValueAtFrame(clip, "x", localFrame),
      y: clipValueAtFrame(clip, "y", localFrame),
      scale: clipValueAtFrame(clip, "scale", localFrame),
      rotation: clipValueAtFrame(clip, "rotation", localFrame)
    }
  };
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

export function isMediaTypeCompatibleWithTrack(mediaType: MediaType, trackType: TrackType): boolean {
  return trackType === "audio" ? mediaType === "audio" : mediaType !== "audio";
}

export function framesFromSeconds(seconds: number, fps: number): number {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : defaultSettings.fps;

  return Math.max(1, Math.round(safeSeconds * safeFps));
}

export function secondsFromFrames(frames: number, fps: number): number {
  const safeFrames = Number.isFinite(frames) ? Math.max(0, frames) : 0;
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : defaultSettings.fps;

  return safeFrames / safeFps;
}

export function getTimelineDurationFrames(timeline: Timeline): number {
  return Math.max(
    timeline.settings.fps * 10,
    ...timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.startFrame + clip.durationFrames))
  );
}

export function snapFrame(timeline: Timeline, frame: number, options: { playheadFrame?: number; thresholdFrames?: number } = {}): number {
  const thresholdFrames = options.thresholdFrames ?? Math.max(2, Math.round(timeline.settings.fps / 5));
  const candidates = [
    0,
    ...(options.playheadFrame !== undefined ? [options.playheadFrame] : []),
    ...timeline.tracks.flatMap((track) => track.clips.flatMap((clip) => [
      clip.startFrame,
      clip.startFrame + clip.durationFrames
    ])),
    ...timeline.markers.map((marker) => marker.frame),
    ...timeline.textOverlays.flatMap((overlay) => [overlay.startFrame, overlay.startFrame + overlay.durationFrames])
  ];

  const secondFrame = Math.round(frame / timeline.settings.fps) * timeline.settings.fps;
  candidates.push(secondFrame);

  let snappedFrame = safeFrame(frame, 0);
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = Math.abs(candidate - frame);

    if (distance <= thresholdFrames && distance < closestDistance) {
      closestDistance = distance;
      snappedFrame = safeFrame(candidate, snappedFrame);
    }
  }

  return snappedFrame;
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

function isAssetUsedOnLockedTrack(project: SpikxProject, assetId: MediaAssetId): boolean {
  return project.timeline.tracks.some((track) => (
    track.locked && track.clips.some((clip) => clip.assetId === assetId)
  ));
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

function sortMarkers(markers: TimelineMarker[]): TimelineMarker[] {
  return [...markers].sort((left, right) => left.frame - right.frame);
}

function sortTextOverlays(overlays: TextOverlay[]): TextOverlay[] {
  return [...overlays].sort((left, right) => left.startFrame - right.startFrame);
}

function sanitizeClipTransform(value: ClipTransform | undefined, fallback: ClipTransform | undefined): ClipTransform {
  const base = fallback ?? defaultClipTransform;
  const cropLeft = clampFinite(value?.cropLeft, base.cropLeft, 0, 0.9);
  const cropRight = clampFinite(value?.cropRight, base.cropRight, 0, 0.9);
  const cropTop = clampFinite(value?.cropTop, base.cropTop, 0, 0.9);
  const cropBottom = clampFinite(value?.cropBottom, base.cropBottom, 0, 0.9);
  const horizontalCropScale = cropLeft + cropRight > 0.95 ? 0.95 / (cropLeft + cropRight) : 1;
  const verticalCropScale = cropTop + cropBottom > 0.95 ? 0.95 / (cropTop + cropBottom) : 1;

  return {
    x: safeFrame(value?.x, base.x, Number.NEGATIVE_INFINITY),
    y: safeFrame(value?.y, base.y, Number.NEGATIVE_INFINITY),
    scale: clampFinite(value?.scale, base.scale, 0.05, 8),
    rotation: clampFinite(value?.rotation, base.rotation, -360, 360),
    fit: value?.fit === "cover" ? "cover" : "contain",
    cropTop: cropTop * verticalCropScale,
    cropRight: cropRight * horizontalCropScale,
    cropBottom: cropBottom * verticalCropScale,
    cropLeft: cropLeft * horizontalCropScale
  };
}

function sanitizeClipTransitions(
  value: ClipTransitions | undefined,
  fallback: ClipTransitions | undefined,
  durationFrames: number
): ClipTransitions {
  const base = fallback ?? defaultClipTransitions;
  const maximumFadeFrames = Math.max(0, Math.floor(durationFrames / 2));
  const inFrames = Math.min(maximumFadeFrames, safeFrame(value?.inFrames, base.inFrames));
  const outFrames = Math.min(maximumFadeFrames, safeFrame(value?.outFrames, base.outFrames));
  const kind = sanitizeTransitionKind(value?.kind, inFrames, outFrames);

  return {
    kind,
    inFrames: kind === "none" ? 0 : inFrames,
    outFrames: kind === "none" ? 0 : outFrames
  };
}

function sanitizeTransitionKind(kind: ClipTransitions["kind"] | undefined, inFrames: number, outFrames: number): ClipTransitions["kind"] {
  switch (kind) {
    case "fade":
    case "dissolve":
    case "slide":
    case "wipe":
    case "zoom":
    case "blur":
    case "glitch":
      return kind;
    case "none":
      return inFrames > 0 || outFrames > 0 ? "fade" : "none";
    default:
      return inFrames > 0 || outFrames > 0 ? "fade" : "none";
  }
}

function sanitizeClipEffects(value: ClipEffects | undefined, fallback: ClipEffects | undefined): ClipEffects {
  const base = fallback ?? defaultClipEffects;

  return {
    brightness: clampFinite(value?.brightness, base.brightness, -1, 1),
    contrast: clampFinite(value?.contrast, base.contrast, 0, 3),
    saturation: clampFinite(value?.saturation, base.saturation, 0, 3),
    blur: clampFinite(value?.blur, base.blur, 0, 20),
    sharpen: clampFinite(value?.sharpen, base.sharpen, 0, 5),
    vignette: clampFinite(value?.vignette, base.vignette, 0, 1)
  };
}

function sanitizeClipSpeed(value: ClipSpeed | undefined, fallback: ClipSpeed | undefined): ClipSpeed {
  const base = fallback ?? defaultClipSpeed;

  return {
    rate: clampFinite(value?.rate, base.rate, 0.1, 8),
    reverse: typeof value?.reverse === "boolean" ? value.reverse : base.reverse,
    freezeFrame: typeof value?.freezeFrame === "boolean" ? value.freezeFrame : base.freezeFrame
  };
}

function sanitizeClipKeyframes(value: ClipKeyframe[] | undefined, fallback: ClipKeyframe[] | undefined, durationFrames: number): ClipKeyframe[] {
  const items = Array.isArray(value) ? value : fallback ?? [];
  const byPropertyAndFrame = new Map<string, ClipKeyframe>();

  for (const item of items) {
    if (!isKeyframeProperty(item.property)) {
      continue;
    }

    const frame = safeFrame(item.frame, 0);
    const clampedFrame = Math.min(Math.max(0, frame), Math.max(0, durationFrames - 1));
    const value = sanitizeKeyframeValue(item.property, item.value);
    const id = item.id.trim() || createId("keyframe");

    byPropertyAndFrame.set(`${item.property}:${clampedFrame}`, {
      id,
      frame: clampedFrame,
      property: item.property,
      value
    });
  }

  return [...byPropertyAndFrame.values()].sort((left, right) => (
    left.frame - right.frame || left.property.localeCompare(right.property)
  ));
}

function isKeyframeProperty(value: unknown): value is KeyframeProperty {
  return value === "x" || value === "y" || value === "scale" || value === "rotation" || value === "opacity" || value === "volume";
}

function sanitizeKeyframeValue(property: KeyframeProperty, value: number): number {
  switch (property) {
    case "scale":
      return clampFinite(value, 1, 0.05, 8);
    case "rotation":
      return clampFinite(value, 0, -360, 360);
    case "opacity":
      return clampFinite(value, 1, 0, 1);
    case "volume":
      return clampFinite(value, 1, 0, 2);
    case "x":
    case "y":
      return safeFrame(value, 0, Number.NEGATIVE_INFINITY);
  }
}

function sanitizeTextOverlay(value: TextOverlay, fallback: TextOverlay): TextOverlay {
  return {
    id: fallback.id,
    text: value.text.trim() || fallback.text,
    startFrame: safeFrame(value.startFrame, fallback.startFrame),
    durationFrames: safeFrame(value.durationFrames, fallback.durationFrames, 1),
    x: safeFrame(value.x, fallback.x, Number.NEGATIVE_INFINITY),
    y: safeFrame(value.y, fallback.y, Number.NEGATIVE_INFINITY),
    fontSize: clampFinite(value.fontSize, fallback.fontSize, 8, 256),
    color: sanitizeColor(value.color, fallback.color),
    backgroundColor: sanitizeColor(value.backgroundColor, fallback.backgroundColor),
    opacity: clampFinite(value.opacity, fallback.opacity, 0, 1),
    align: value.align === "left" || value.align === "right" ? value.align : "center",
    role: value.role === "caption" ? "caption" : "title"
  };
}

function clipValueAtFrame(clip: Clip, property: KeyframeProperty, localFrame: number): number {
  const baseValue = baseClipPropertyValue(clip, property);
  const keyframes = clip.keyframes
    .filter((keyframe) => keyframe.property === property)
    .sort((left, right) => left.frame - right.frame);

  if (keyframes.length === 0) {
    return baseValue;
  }

  const safeLocalFrame = safeFrame(localFrame, 0);
  const previous = [...keyframes].reverse().find((keyframe) => keyframe.frame <= safeLocalFrame);
  const next = keyframes.find((keyframe) => keyframe.frame >= safeLocalFrame);

  if (!previous && next) {
    return next.value;
  }

  if (previous && !next) {
    return previous.value;
  }

  if (!previous || !next || previous.id === next.id || previous.frame === next.frame) {
    return previous?.value ?? next?.value ?? baseValue;
  }

  const progress = (safeLocalFrame - previous.frame) / (next.frame - previous.frame);
  return previous.value + (next.value - previous.value) * progress;
}

function baseClipPropertyValue(clip: Clip, property: KeyframeProperty): number {
  switch (property) {
    case "x":
      return clip.transform.x;
    case "y":
      return clip.transform.y;
    case "scale":
      return clip.transform.scale;
    case "rotation":
      return clip.transform.rotation;
    case "opacity":
      return clip.opacity;
    case "volume":
      return clip.volume;
  }
}

function sanitizeColor(value: string | undefined, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

function safeFrame(value: number | undefined, fallback: number, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    const safeFallback = Number.isFinite(fallback) ? fallback : minimum;
    return Math.max(minimum, Math.round(safeFallback));
  }

  return Math.max(minimum, Math.round(value));
}

function clampFinite(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    const safeFallback = Number.isFinite(fallback) ? fallback : minimum;
    return clamp(safeFallback, minimum, maximum);
  }

  return clamp(value, minimum, maximum);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
