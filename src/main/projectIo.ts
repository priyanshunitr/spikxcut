import { readFile, writeFile } from "node:fs/promises";
import type {
  Clip,
  ClipEffects,
  ClipFit,
  ClipKeyframe,
  ClipSpeed,
  ClipTransform,
  ClipTransitions,
  KeyframeProperty,
  MediaAsset,
  MediaType,
  SpikxProject,
  TextOverlay,
  Timeline,
  TimelineMarker,
  TimelineSettings,
  Track,
  TrackType,
  TransitionKind
} from "../shared/types";
import { defaultClipEffects, defaultClipSpeed, defaultClipTransform, defaultClipTransitions, isMediaTypeCompatibleWithTrack } from "../shared/editing";
import { hydrateMediaAsset, stripRuntimeMediaFields } from "./ffmpeg";

export async function readProjectFile(filePath: string): Promise<SpikxProject> {
  const raw = await readFile(filePath, "utf8");
  const project = validateProject(JSON.parse(raw));

  return {
    ...project,
    mediaAssets: project.mediaAssets.map(hydrateMediaAsset)
  };
}

export async function writeProjectFile(filePath: string, project: SpikxProject): Promise<void> {
  const validatedProject = validateProject(project);
  const data: SpikxProject = {
    ...validatedProject,
    mediaAssets: validatedProject.mediaAssets.map(stripRuntimeMediaFields)
  };

  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function validateProject(value: unknown): SpikxProject {
  const project = expectRecord(value, "Project");

  if (project.app !== "spikx-js" || project.version !== 1) {
    throw new Error("Unsupported project file.");
  }

  const mediaAssets = expectArray(project.mediaAssets, "Project media assets").map(validateMediaAsset);
  const timeline = validateTimeline(project.timeline, mediaAssets);

  return {
    app: "spikx-js",
    version: 1,
    name: expectString(project.name, "Project name"),
    createdAt: expectString(project.createdAt, "Project creation date"),
    updatedAt: expectString(project.updatedAt, "Project update date"),
    mediaAssets,
    timeline
  };
}

function validateTimeline(value: unknown, mediaAssets: MediaAsset[]): Timeline {
  const timeline = expectRecord(value, "Timeline");
  const settings = validateTimelineSettings(timeline.settings);
  const tracks = expectArray(timeline.tracks, "Timeline tracks").map(validateTrack);
  const markers = expectOptionalArray(timeline.markers, "Timeline markers").map(validateTimelineMarker);
  const textOverlays = expectOptionalArray(timeline.textOverlays, "Timeline text overlays").map(validateTextOverlay);
  const assetsById = new Map(mediaAssets.map((asset) => [asset.id, asset]));
  const trackIds = new Set<string>();

  for (const track of tracks) {
    if (trackIds.has(track.id)) {
      throw new Error(`Duplicate track id "${track.id}".`);
    }

    trackIds.add(track.id);

    for (const clip of track.clips) {
      if (clip.trackId !== track.id) {
        throw new Error(`Clip "${clip.id}" is assigned to the wrong track.`);
      }

      const asset = assetsById.get(clip.assetId);

      if (!asset) {
        throw new Error(`Clip "${clip.id}" references missing media.`);
      }

      if (clip.type !== asset.type) {
        throw new Error(`Clip "${clip.id}" type does not match its media asset.`);
      }

      if (!isMediaTypeCompatibleWithTrack(asset.type, track.type)) {
        throw new Error(`Clip "${clip.id}" cannot be placed on a ${track.type} track.`);
      }
    }
  }

  return {
    settings,
    tracks,
    markers,
    textOverlays
  };
}

function validateTimelineSettings(value: unknown): TimelineSettings {
  const settings = expectRecord(value, "Timeline settings");

  return {
    fps: expectFiniteNumber(settings.fps, "Timeline FPS", 1),
    width: expectFiniteNumber(settings.width, "Timeline width", 1),
    height: expectFiniteNumber(settings.height, "Timeline height", 1)
  };
}

function validateMediaAsset(value: unknown): MediaAsset {
  const asset = expectRecord(value, "Media asset");

  return {
    id: expectString(asset.id, "Media asset id"),
    name: expectString(asset.name, "Media asset name"),
    path: expectString(asset.path, "Media asset path"),
    previewUrl: expectOptionalString(asset.previewUrl, "Media asset preview URL"),
    type: expectMediaType(asset.type, "Media asset type"),
    durationSeconds: expectOptionalFiniteNumber(asset.durationSeconds, "Media asset duration seconds", 0),
    durationFrames: expectOptionalFiniteNumber(asset.durationFrames, "Media asset duration frames", 1),
    width: expectOptionalFiniteNumber(asset.width, "Media asset width", 1),
    height: expectOptionalFiniteNumber(asset.height, "Media asset height", 1),
    hasAudio: expectOptionalBoolean(asset.hasAudio, "Media asset audio flag"),
    importedAt: expectString(asset.importedAt, "Media asset import date"),
    bin: expectOptionalString(asset.bin, "Media asset bin")
  };
}

function validateTrack(value: unknown): Track {
  const track = expectRecord(value, "Track");
  const id = expectString(track.id, "Track id");

  return {
    id,
    name: expectString(track.name, "Track name"),
    type: expectTrackType(track.type, "Track type"),
    clips: expectArray(track.clips, "Track clips").map(validateClip),
    locked: expectBoolean(track.locked, "Track lock flag"),
    muted: expectBoolean(track.muted, "Track mute flag")
  };
}

function validateClip(value: unknown): Clip {
  const clip = expectRecord(value, "Clip");

  return {
    id: expectString(clip.id, "Clip id"),
    assetId: expectString(clip.assetId, "Clip asset id"),
    trackId: expectString(clip.trackId, "Clip track id"),
    name: expectString(clip.name, "Clip name"),
    type: expectMediaType(clip.type, "Clip type"),
    startFrame: expectFiniteNumber(clip.startFrame, "Clip start frame", 0),
    durationFrames: expectFiniteNumber(clip.durationFrames, "Clip duration frames", 1),
    trimStartFrame: expectFiniteNumber(clip.trimStartFrame, "Clip trim start frame", 0),
    opacity: expectFiniteNumber(clip.opacity, "Clip opacity", 0, 1),
    volume: expectFiniteNumber(clip.volume, "Clip volume", 0, 2),
    muted: expectBoolean(clip.muted, "Clip mute flag"),
    transform: validateClipTransform(clip.transform),
    transitions: validateClipTransitions(clip.transitions),
    effects: validateClipEffects(clip.effects),
    speed: validateClipSpeed(clip.speed),
    keyframes: expectOptionalArray(clip.keyframes, "Clip keyframes").map(validateClipKeyframe)
  };
}

function validateClipTransform(value: unknown): ClipTransform {
  if (value === undefined) {
    return { ...defaultClipTransform };
  }

  const transform = expectRecord(value, "Clip transform");

  return {
    x: expectFiniteNumber(transform.x, "Clip transform x", Number.NEGATIVE_INFINITY),
    y: expectFiniteNumber(transform.y, "Clip transform y", Number.NEGATIVE_INFINITY),
    scale: expectFiniteNumber(transform.scale, "Clip transform scale", 0.05, 8),
    rotation: expectFiniteNumber(transform.rotation, "Clip transform rotation", -360, 360),
    fit: expectClipFit(transform.fit, "Clip transform fit"),
    cropTop: expectFiniteNumber(transform.cropTop, "Clip crop top", 0, 0.95),
    cropRight: expectFiniteNumber(transform.cropRight, "Clip crop right", 0, 0.95),
    cropBottom: expectFiniteNumber(transform.cropBottom, "Clip crop bottom", 0, 0.95),
    cropLeft: expectFiniteNumber(transform.cropLeft, "Clip crop left", 0, 0.95)
  };
}

function validateClipTransitions(value: unknown): ClipTransitions {
  if (value === undefined) {
    return { ...defaultClipTransitions };
  }

  const transitions = expectRecord(value, "Clip transitions");

  return {
    kind: expectTransitionKind(transitions.kind, "Clip transition kind"),
    inFrames: expectFiniteNumber(transitions.inFrames, "Clip transition in frames", 0),
    outFrames: expectFiniteNumber(transitions.outFrames, "Clip transition out frames", 0)
  };
}

function validateClipEffects(value: unknown): ClipEffects {
  if (value === undefined) {
    return { ...defaultClipEffects };
  }

  const effects = expectRecord(value, "Clip effects");

  return {
    brightness: expectFiniteNumber(effects.brightness, "Clip brightness", -1, 1),
    contrast: expectFiniteNumber(effects.contrast, "Clip contrast", 0, 3),
    saturation: expectFiniteNumber(effects.saturation, "Clip saturation", 0, 3),
    blur: expectFiniteNumber(effects.blur, "Clip blur", 0, 20),
    sharpen: expectFiniteNumber(effects.sharpen, "Clip sharpen", 0, 5),
    vignette: expectFiniteNumber(effects.vignette, "Clip vignette", 0, 1)
  };
}

function validateClipSpeed(value: unknown): ClipSpeed {
  if (value === undefined) {
    return { ...defaultClipSpeed };
  }

  const speed = expectRecord(value, "Clip speed");

  return {
    rate: expectFiniteNumber(speed.rate, "Clip speed rate", 0.1, 8),
    reverse: expectBoolean(speed.reverse, "Clip reverse flag"),
    freezeFrame: expectBoolean(speed.freezeFrame, "Clip freeze frame flag")
  };
}

function validateClipKeyframe(value: unknown): ClipKeyframe {
  const keyframe = expectRecord(value, "Clip keyframe");

  return {
    id: expectString(keyframe.id, "Clip keyframe id"),
    frame: expectFiniteNumber(keyframe.frame, "Clip keyframe frame", 0),
    property: expectKeyframeProperty(keyframe.property, "Clip keyframe property"),
    value: expectFiniteNumber(keyframe.value, "Clip keyframe value", Number.NEGATIVE_INFINITY)
  };
}

function validateTimelineMarker(value: unknown): TimelineMarker {
  const marker = expectRecord(value, "Timeline marker");

  return {
    id: expectString(marker.id, "Timeline marker id"),
    frame: expectFiniteNumber(marker.frame, "Timeline marker frame", 0),
    label: expectString(marker.label, "Timeline marker label"),
    color: expectHexColor(marker.color, "Timeline marker color")
  };
}

function validateTextOverlay(value: unknown): TextOverlay {
  const overlay = expectRecord(value, "Text overlay");

  return {
    id: expectString(overlay.id, "Text overlay id"),
    text: expectString(overlay.text, "Text overlay text"),
    startFrame: expectFiniteNumber(overlay.startFrame, "Text overlay start frame", 0),
    durationFrames: expectFiniteNumber(overlay.durationFrames, "Text overlay duration frames", 1),
    x: expectFiniteNumber(overlay.x, "Text overlay x", Number.NEGATIVE_INFINITY),
    y: expectFiniteNumber(overlay.y, "Text overlay y", Number.NEGATIVE_INFINITY),
    fontSize: expectFiniteNumber(overlay.fontSize, "Text overlay font size", 8, 256),
    color: expectHexColor(overlay.color, "Text overlay color"),
    backgroundColor: expectHexColor(overlay.backgroundColor, "Text overlay background color"),
    opacity: expectFiniteNumber(overlay.opacity, "Text overlay opacity", 0, 1),
    align: expectTextAlign(overlay.align, "Text overlay alignment"),
    role: expectTextRole(overlay.role, "Text overlay role")
  };
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value;
}

function expectOptionalArray(value: unknown, label: string): unknown[] {
  if (value === undefined) {
    return [];
  }

  return expectArray(value, label);
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function expectOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const text = expectString(value, label).trim();
  return text || undefined;
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function expectOptionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectBoolean(value, label);
}

function expectFiniteNumber(value: unknown, label: string, minimum: number, maximum = Number.POSITIVE_INFINITY): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a finite number between ${minimum} and ${maximum}.`);
  }

  return value;
}

function expectOptionalFiniteNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectFiniteNumber(value, label, minimum, maximum);
}

function expectMediaType(value: unknown, label: string): MediaType {
  if (value !== "video" && value !== "audio" && value !== "image") {
    throw new Error(`${label} must be video, audio, or image.`);
  }

  return value;
}

function expectTrackType(value: unknown, label: string): TrackType {
  if (value !== "video" && value !== "audio") {
    throw new Error(`${label} must be video or audio.`);
  }

  return value;
}

function expectClipFit(value: unknown, label: string): ClipFit {
  if (value !== "contain" && value !== "cover") {
    throw new Error(`${label} must be contain or cover.`);
  }

  return value;
}

function expectTransitionKind(value: unknown, label: string): TransitionKind {
  if (value !== "none" && value !== "fade" && value !== "dissolve" && value !== "slide" && value !== "wipe" && value !== "zoom" && value !== "blur" && value !== "glitch") {
    throw new Error(`${label} must be a supported transition kind.`);
  }

  return value;
}

function expectKeyframeProperty(value: unknown, label: string): KeyframeProperty {
  if (value !== "x" && value !== "y" && value !== "scale" && value !== "rotation" && value !== "opacity" && value !== "volume") {
    throw new Error(`${label} must be a supported keyframe property.`);
  }

  return value;
}

function expectTextAlign(value: unknown, label: string): TextOverlay["align"] {
  if (value !== "left" && value !== "center" && value !== "right") {
    throw new Error(`${label} must be left, center, or right.`);
  }

  return value;
}

function expectTextRole(value: unknown, label: string): TextOverlay["role"] {
  if (value === undefined) {
    return "title";
  }

  if (value !== "title" && value !== "caption") {
    throw new Error(`${label} must be title or caption.`);
  }

  return value;
}

function expectHexColor(value: unknown, label: string): string {
  const color = expectString(value, label);

  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error(`${label} must be a hex color.`);
  }

  return color.toLowerCase();
}
