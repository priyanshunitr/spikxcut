import assert from "node:assert/strict";
import { test } from "node:test";
import { addClipToTimeline, addMediaAssets, addTextOverlay, createEmptyProject, defaultClipEffects, defaultClipSpeed } from "../src/shared/editing";
import type { MediaAsset } from "../src/shared/types";
import { validateProject } from "../src/main/projectIo";

function createVideoAsset(): MediaAsset {
  return {
    id: "asset_video",
    name: "video.mp4",
    path: "D:\\media\\video.mp4",
    type: "video",
    durationFrames: 90,
    durationSeconds: 3,
    hasAudio: true,
    importedAt: new Date(0).toISOString()
  };
}

test("validateProject accepts a well-formed Spikx project", () => {
  const project = createEmptyProject("Validation");
  const validated = validateProject(project);

  assert.equal(validated.app, "spikx-js");
  assert.equal(validated.name, "Validation");
  assert.equal(validated.timeline.tracks.length, 2);
});

test("validateProject supplies defaults for older project fields", () => {
  const projectWithMedia = addMediaAssets(createEmptyProject("Validation"), [createVideoAsset()]);
  const videoTrack = projectWithMedia.timeline.tracks.find((track) => track.type === "video");
  assert.ok(videoTrack);

  const { project } = addClipToTimeline(projectWithMedia, "asset_video", videoTrack.id, 0);
  const legacyProject = structuredClone(project) as Record<string, any>;
  delete legacyProject.timeline.markers;
  delete legacyProject.timeline.textOverlays;
  delete legacyProject.timeline.tracks[0].clips[0].transform;
  delete legacyProject.timeline.tracks[0].clips[0].transitions;
  delete legacyProject.timeline.tracks[0].clips[0].effects;
  delete legacyProject.timeline.tracks[0].clips[0].speed;
  delete legacyProject.timeline.tracks[0].clips[0].keyframes;

  const validated = validateProject(legacyProject);
  const validatedClip = validated.timeline.tracks[0].clips[0];

  assert.deepEqual(validated.timeline.markers, []);
  assert.deepEqual(validated.timeline.textOverlays, []);
  assert.equal(validatedClip.transform.fit, "contain");
  assert.equal(validatedClip.transitions.kind, "none");
  assert.deepEqual(validatedClip.effects, defaultClipEffects);
  assert.deepEqual(validatedClip.speed, defaultClipSpeed);
  assert.deepEqual(validatedClip.keyframes, []);
});

test("validateProject supplies a title role for older text overlays", () => {
  const titledProject = addTextOverlay(createEmptyProject("Validation"), 0, "Legacy title").project;
  const legacyProject = structuredClone(titledProject) as Record<string, any>;
  delete legacyProject.timeline.textOverlays[0].role;

  const validated = validateProject(legacyProject);

  assert.equal(validated.timeline.textOverlays[0].role, "title");
});

test("validateProject rejects unsupported project identifiers", () => {
  const project = createEmptyProject("Validation") as Record<string, unknown>;
  project.app = "other-app";

  assert.throws(() => validateProject(project), /Unsupported project file/);
});

test("validateProject rejects clips that reference missing media", () => {
  const projectWithMedia = addMediaAssets(createEmptyProject("Validation"), [createVideoAsset()]);
  const videoTrack = projectWithMedia.timeline.tracks.find((track) => track.type === "video");
  assert.ok(videoTrack);

  const { project } = addClipToTimeline(projectWithMedia, "asset_video", videoTrack.id, 0);
  const invalidProject = structuredClone(project);
  invalidProject.timeline.tracks[0].clips[0].assetId = "missing_asset";

  assert.throws(() => validateProject(invalidProject), /missing media/);
});

test("validateProject rejects clips whose type differs from their media asset", () => {
  const projectWithMedia = addMediaAssets(createEmptyProject("Validation"), [createVideoAsset()]);
  const videoTrack = projectWithMedia.timeline.tracks.find((track) => track.type === "video");
  assert.ok(videoTrack);

  const { project } = addClipToTimeline(projectWithMedia, "asset_video", videoTrack.id, 0);
  const invalidProject = structuredClone(project);
  invalidProject.timeline.tracks[0].clips[0].type = "audio";

  assert.throws(() => validateProject(invalidProject), /type does not match/);
});

test("validateProject rejects media placed on incompatible tracks", () => {
  const projectWithMedia = addMediaAssets(createEmptyProject("Validation"), [createVideoAsset()]);
  const videoTrack = projectWithMedia.timeline.tracks.find((track) => track.type === "video");
  assert.ok(videoTrack);

  const { project } = addClipToTimeline(projectWithMedia, "asset_video", videoTrack.id, 0);
  const invalidProject = structuredClone(project);
  invalidProject.mediaAssets[0].type = "audio";
  invalidProject.timeline.tracks[0].clips[0].type = "audio";

  assert.throws(() => validateProject(invalidProject), /cannot be placed on a video track/);
});

test("validateProject rejects non-finite timeline settings", () => {
  const project = createEmptyProject("Validation");
  project.timeline.settings.fps = Number.NaN;

  assert.throws(() => validateProject(project), /Timeline FPS/);
});
