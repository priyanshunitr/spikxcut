import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addCaptionOverlay,
  addClipToTimeline,
  addClipKeyframe,
  addMediaAssets,
  addTextOverlay,
  addTimelineMarker,
  addTrack,
  canRelinkMediaAsset,
  createEmptyProject,
  deleteClips,
  deleteClipKeyframe,
  findAsset,
  findClip,
  moveClip,
  moveClips,
  relinkMediaAsset,
  resolveClipAtFrame,
  splitClip,
  trimClip,
  updateClip,
  updateMediaAsset,
  updateTextOverlay,
  updateTimelineMarker,
  updateTrack
} from "../src/shared/editing";
import type { MediaAsset } from "../src/shared/types";

function createAsset(id: string, type: MediaAsset["type"], path: string): MediaAsset {
  return {
    id,
    name: path.split("\\").at(-1) ?? path,
    path,
    type,
    durationFrames: 90,
    durationSeconds: 3,
    hasAudio: type !== "image",
    importedAt: new Date(0).toISOString()
  };
}

function createVideoAsset(): MediaAsset {
  return createAsset("asset_video", "video", "D:\\media\\video.mp4");
}

test("updateClip keeps previous values when numeric edits are not finite", () => {
  const projectWithMedia = addMediaAssets(createEmptyProject("Test"), [createVideoAsset()]);
  const videoTrack = projectWithMedia.timeline.tracks.find((track) => track.type === "video");
  assert.ok(videoTrack);

  const { project, clip } = addClipToTimeline(projectWithMedia, "asset_video", videoTrack.id, 12);
  const updatedProject = updateClip(project, clip.id, {
    durationFrames: Number.POSITIVE_INFINITY,
    opacity: Number.NaN,
    startFrame: Number.NaN,
    trimStartFrame: Number.NEGATIVE_INFINITY,
    volume: Number.POSITIVE_INFINITY
  });
  const updatedClip = findClip(updatedProject.timeline, clip.id);

  assert.ok(updatedClip);
  assert.equal(updatedClip.startFrame, clip.startFrame);
  assert.equal(updatedClip.durationFrames, clip.durationFrames);
  assert.equal(updatedClip.trimStartFrame, clip.trimStartFrame);
  assert.equal(updatedClip.opacity, clip.opacity);
  assert.equal(updatedClip.volume, clip.volume);
});

test("updateClip clamps finite numeric edits to valid clip ranges", () => {
  const projectWithMedia = addMediaAssets(createEmptyProject("Test"), [createVideoAsset()]);
  const videoTrack = projectWithMedia.timeline.tracks.find((track) => track.type === "video");
  assert.ok(videoTrack);

  const { project, clip } = addClipToTimeline(projectWithMedia, "asset_video", videoTrack.id, 12);
  const updatedProject = updateClip(project, clip.id, {
    durationFrames: 0,
    opacity: 2,
    startFrame: -4,
    trimStartFrame: -7,
    volume: -1
  });
  const updatedClip = findClip(updatedProject.timeline, clip.id);

  assert.ok(updatedClip);
  assert.equal(updatedClip.startFrame, 0);
  assert.equal(updatedClip.durationFrames, 1);
  assert.equal(updatedClip.trimStartFrame, 0);
  assert.equal(updatedClip.opacity, 1);
  assert.equal(updatedClip.volume, 0);
});

test("clip edits on locked tracks are ignored", () => {
  const projectWithMedia = addMediaAssets(createEmptyProject("Test"), [createVideoAsset()]);
  const videoTrack = projectWithMedia.timeline.tracks.find((track) => track.type === "video");
  assert.ok(videoTrack);

  const placed = addClipToTimeline(projectWithMedia, "asset_video", videoTrack.id, 12);
  const lockedProject = updateTrack(placed.project, placed.clip.trackId, { locked: true });

  assert.equal(moveClip(lockedProject, placed.clip.id, placed.clip.trackId, 30), lockedProject);
  assert.equal(trimClip(lockedProject, placed.clip.id, 5, -5), lockedProject);
  assert.equal(updateClip(lockedProject, placed.clip.id, { name: "Changed", startFrame: 30 }), lockedProject);
  assert.equal(deleteClips(lockedProject, [placed.clip.id]), lockedProject);

  const splitProject = splitClip(lockedProject, placed.clip.id, 30);
  const lockedClip = findClip(splitProject.timeline, placed.clip.id);
  const lockedTrack = splitProject.timeline.tracks.find((track) => track.id === placed.clip.trackId);

  assert.ok(lockedClip);
  assert.ok(lockedTrack);
  assert.equal(lockedClip.name, placed.clip.name);
  assert.equal(lockedClip.startFrame, placed.clip.startFrame);
  assert.equal(lockedTrack.clips.length, 1);
});

test("moveClips skips clips on locked tracks", () => {
  const projectWithMedia = addMediaAssets(createEmptyProject("Test"), [
    createAsset("asset_a", "video", "D:\\media\\a.mp4"),
    createAsset("asset_b", "video", "D:\\media\\b.mp4")
  ]);
  const firstTrack = projectWithMedia.timeline.tracks.find((track) => track.type === "video");
  assert.ok(firstTrack);

  const firstPlaced = addClipToTimeline(projectWithMedia, "asset_a", firstTrack.id, 10);
  const secondTrack = addTrack(firstPlaced.project, "video");
  const secondPlaced = addClipToTimeline(secondTrack.project, "asset_b", secondTrack.track.id, 20);
  const lockedProject = updateTrack(secondPlaced.project, firstTrack.id, { locked: true });
  const movedProject = moveClips(lockedProject, [firstPlaced.clip.id, secondPlaced.clip.id], 15);

  assert.equal(findClip(movedProject.timeline, firstPlaced.clip.id)?.startFrame, 10);
  assert.equal(findClip(movedProject.timeline, secondPlaced.clip.id)?.startFrame, 35);
});

test("relinkMediaAsset updates clip type only when the replacement fits the timeline", () => {
  const imageAsset = createAsset("asset_image", "image", "D:\\media\\image.png");
  const audioAsset = createAsset("asset_audio", "audio", "D:\\media\\audio.wav");
  const projectWithMedia = addMediaAssets(createEmptyProject("Test"), [createVideoAsset()]);
  const videoTrack = projectWithMedia.timeline.tracks.find((track) => track.type === "video");
  assert.ok(videoTrack);

  const placed = addClipToTimeline(projectWithMedia, "asset_video", videoTrack.id, 0);
  const relinkedProject = relinkMediaAsset(placed.project, "asset_video", imageAsset);

  assert.equal(canRelinkMediaAsset(placed.project, "asset_video", imageAsset), true);
  assert.equal(findAsset(relinkedProject, "asset_video")?.type, "image");
  assert.equal(findClip(relinkedProject.timeline, placed.clip.id)?.type, "image");
  assert.equal(findClip(relinkedProject.timeline, placed.clip.id)?.name, "image.png");
  assert.equal(canRelinkMediaAsset(placed.project, "asset_video", audioAsset), false);
  assert.equal(relinkMediaAsset(placed.project, "asset_video", audioAsset), placed.project);
});

test("media bins, timeline markers, and text overlays can be edited", () => {
  const projectWithMedia = addMediaAssets(createEmptyProject("Test"), [createVideoAsset()]);
  const organizedProject = updateMediaAsset(projectWithMedia, "asset_video", {
    name: "Interview A",
    bin: "Interviews"
  });
  const markerResult = addTimelineMarker(organizedProject, 45, "Beat");
  const markedProject = updateTimelineMarker(markerResult.project, markerResult.marker.id, {
    frame: 60,
    color: "#00ffaa"
  });
  const titleResult = addTextOverlay(markedProject, 30, "Hello");
  const titledProject = updateTextOverlay(titleResult.project, titleResult.overlay.id, {
    text: "Hello World",
    x: 12,
    opacity: 0.75
  });

  assert.equal(findAsset(titledProject, "asset_video")?.name, "Interview A");
  assert.equal(findAsset(titledProject, "asset_video")?.bin, "Interviews");
  assert.equal(titledProject.timeline.markers[0].frame, 60);
  assert.equal(titledProject.timeline.markers[0].color, "#00ffaa");
  assert.equal(titledProject.timeline.textOverlays[0].text, "Hello World");
  assert.equal(titledProject.timeline.textOverlays[0].x, 12);
  assert.equal(titledProject.timeline.textOverlays[0].opacity, 0.75);
  assert.equal(titledProject.timeline.textOverlays[0].role, "title");
});

test("captions and clip effect controls are sanitized", () => {
  const projectWithMedia = addMediaAssets(createEmptyProject("Test"), [createVideoAsset()]);
  const videoTrack = projectWithMedia.timeline.tracks.find((track) => track.type === "video");
  assert.ok(videoTrack);

  const { project, clip } = addClipToTimeline(projectWithMedia, "asset_video", videoTrack.id, 0);
  const captionResult = addCaptionOverlay(project, 12, "Caption text");
  const updatedProject = updateClip(captionResult.project, clip.id, {
    effects: {
      brightness: 3,
      contrast: -1,
      saturation: 4,
      blur: 99,
      sharpen: 99,
      vignette: 2
    },
    speed: {
      rate: 12,
      reverse: true,
      freezeFrame: true
    }
  });
  const updatedClip = findClip(updatedProject.timeline, clip.id);

  assert.equal(captionResult.overlay.role, "caption");
  assert.ok(captionResult.overlay.y > 0);
  assert.ok(updatedClip);
  assert.deepEqual(updatedClip.effects, {
    brightness: 1,
    contrast: 0,
    saturation: 3,
    blur: 20,
    sharpen: 5,
    vignette: 1
  });
  assert.deepEqual(updatedClip.speed, {
    rate: 8,
    reverse: true,
    freezeFrame: true
  });
});

test("clip keyframes can be added, resolved, deleted, and split", () => {
  const projectWithMedia = addMediaAssets(createEmptyProject("Test"), [createVideoAsset()]);
  const videoTrack = projectWithMedia.timeline.tracks.find((track) => track.type === "video");
  assert.ok(videoTrack);

  const { project, clip } = addClipToTimeline(projectWithMedia, "asset_video", videoTrack.id, 10);
  const keyedProject = updateClip(project, clip.id, {
    keyframes: [
      { id: "kf_x0", frame: 0, property: "x", value: 0 },
      { id: "kf_x30", frame: 30, property: "x", value: 60 },
      { id: "kf_o45", frame: 45, property: "opacity", value: 0.4 }
    ]
  });
  const keyedClip = findClip(keyedProject.timeline, clip.id);
  assert.ok(keyedClip);

  const resolvedClip = resolveClipAtFrame(keyedClip, clip.startFrame + 15);
  assert.equal(resolvedClip.transform.x, 30);

  const addedProject = addClipKeyframe(keyedProject, clip.id, "volume", clip.startFrame + 12);
  const addedClip = findClip(addedProject.timeline, clip.id);
  assert.ok(addedClip);
  const addedKeyframe = addedClip.keyframes.find((keyframe) => keyframe.property === "volume" && keyframe.frame === 12);
  assert.ok(addedKeyframe);

  const deletedProject = deleteClipKeyframe(addedProject, clip.id, addedKeyframe.id);
  assert.equal(findClip(deletedProject.timeline, clip.id)?.keyframes.some((keyframe) => keyframe.id === addedKeyframe.id), false);

  const splitProject = splitClip(keyedProject, clip.id, clip.startFrame + 30);
  const splitTrack = splitProject.timeline.tracks.find((track) => track.id === videoTrack.id);
  assert.ok(splitTrack);
  const leftClip = splitTrack.clips.find((item) => item.id === clip.id);
  const rightClip = splitTrack.clips.find((item) => item.id !== clip.id);
  assert.ok(leftClip);
  assert.ok(rightClip);
  assert.deepEqual(leftClip.keyframes.map((keyframe) => keyframe.frame), [0]);
  assert.deepEqual(rightClip.keyframes.map((keyframe) => keyframe.frame), [0, 15]);
});
