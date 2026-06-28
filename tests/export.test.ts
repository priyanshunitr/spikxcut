import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addClipToTimeline,
  addMediaAssets,
  addTextOverlay,
  addTrack,
  createEmptyProject,
  updateClip
} from "../src/shared/editing";
import type { ExportSettings, MediaAsset, SpikxProject } from "../src/shared/types";
import { buildTimelineExportArgsForTest } from "../src/main/ffmpeg";

const exportSettings: ExportSettings = {
  fps: 30,
  width: 1280,
  height: 720,
  bitrateKbps: 8000,
  codec: "libx264"
};

function createAsset(id: string, type: MediaAsset["type"], path: string): MediaAsset {
  return {
    id,
    name: path.split("\\").at(-1) ?? path,
    path,
    type,
    durationFrames: 90,
    durationSeconds: 3,
    width: type === "audio" ? undefined : 1280,
    height: type === "audio" ? undefined : 720,
    hasAudio: type !== "image",
    importedAt: new Date(0).toISOString()
  };
}

function createMultiClipProject(): SpikxProject {
  const projectWithMedia = addMediaAssets(createEmptyProject("Export"), [
    createAsset("video_a", "video", "D:\\media\\a.mp4"),
    createAsset("image_b", "image", "D:\\media\\b.png"),
    createAsset("audio_c", "audio", "D:\\media\\c.wav")
  ]);
  const videoTrack = projectWithMedia.timeline.tracks.find((track) => track.type === "video");
  const audioTrack = projectWithMedia.timeline.tracks.find((track) => track.type === "audio");
  assert.ok(videoTrack);
  assert.ok(audioTrack);

  const firstClip = addClipToTimeline(projectWithMedia, "video_a", videoTrack.id, 30);
  const secondTrack = addTrack(firstClip.project, "video");
  const secondClip = addClipToTimeline(secondTrack.project, "image_b", secondTrack.track.id, 60);
  const audioClip = addClipToTimeline(secondClip.project, "audio_c", audioTrack.id, 15);

  return updateClip(
    updateClip(audioClip.project, secondClip.clip.id, { opacity: 0.5 }),
    audioClip.clip.id,
    { volume: 0.75 }
  );
}

test("buildTimelineExportArgsForTest builds a layered multi-clip export graph", () => {
  const args = buildTimelineExportArgsForTest(createMultiClipProject(), "D:\\out\\movie.mp4", exportSettings);
  const filterGraph = args[args.indexOf("-filter_complex") + 1];

  assert.ok(filterGraph.includes("color=c=black:s=1280x720"));
  assert.ok(filterGraph.includes("overlay=x=(W-w)/2+0:y=(H-h)/2+0:shortest=0"));
  assert.ok(filterGraph.includes("colorchannelmixer=aa=0.5"));
  assert.ok(filterGraph.includes("amix=inputs=2"));
  assert.ok(args.includes("libx264"));
  assert.ok(args.includes("8000k"));
  assert.ok(args.includes("D:\\out\\movie.mp4"));
});

test("buildTimelineExportArgsForTest rejects empty timelines", () => {
  assert.throws(
    () => buildTimelineExportArgsForTest(createEmptyProject("Empty"), "D:\\out\\empty.mp4", exportSettings),
    /Add at least one clip/
  );
});

test("buildTimelineExportArgsForTest uses timeline FPS for clip timing", () => {
  const args = buildTimelineExportArgsForTest(createMultiClipProject(), "D:\\out\\movie.mp4", {
    ...exportSettings,
    fps: 60
  });
  const filterGraph = args[args.indexOf("-filter_complex") + 1];
  const imageInputIndex = args.indexOf("D:\\media\\b.png");

  assert.equal(args[args.lastIndexOf("-r") + 1], "60");
  assert.equal(args[args.lastIndexOf("-t") + 1], "5.000");
  assert.equal(args[imageInputIndex - 2], "3.000");
  assert.ok(filterGraph.includes("color=c=black:s=1280x720:r=60:d=5.000"));
  assert.ok(filterGraph.includes("setpts=PTS+2.000/TB"));
});

test("buildTimelineExportArgsForTest exports transforms, fades, and text overlays", () => {
  const project = createMultiClipProject();
  const firstClip = project.timeline.tracks.find((track) => track.type === "video")?.clips[0];
  assert.ok(firstClip);

  const transformedProject = updateClip(project, firstClip.id, {
    transform: {
      ...firstClip.transform,
      x: 24,
      y: -12,
      scale: 1.25,
      rotation: 15,
      fit: "cover",
      cropLeft: 0.1
    },
    transitions: {
      kind: "fade",
      inFrames: 15,
      outFrames: 15
    }
  });
  const titledProject = addTextOverlay(transformedProject, 45, "Launch Title").project;
  const args = buildTimelineExportArgsForTest(titledProject, "D:\\out\\movie.mp4", exportSettings);
  const filterGraph = args[args.indexOf("-filter_complex") + 1];

  assert.ok(filterGraph.includes("crop=iw*0.9"));
  assert.ok(filterGraph.includes("force_original_aspect_ratio=increase"));
  assert.ok(filterGraph.includes("rotate=0.262"));
  assert.ok(filterGraph.includes("fade=t=in"));
  assert.ok(filterGraph.includes("afade=t=in"));
  assert.ok(filterGraph.includes("overlay=x=(W-w)/2+24:y=(H-h)/2+-12"));
  assert.ok(filterGraph.includes("drawtext=text='Launch Title'"));
});

test("buildTimelineExportArgsForTest exports speed and effects filters", () => {
  const project = createMultiClipProject();
  const firstClip = project.timeline.tracks.find((track) => track.type === "video")?.clips[0];
  assert.ok(firstClip);

  const effectedProject = updateClip(project, firstClip.id, {
    effects: {
      brightness: 0.2,
      contrast: 1.4,
      saturation: 0.8,
      blur: 3,
      sharpen: 0.5,
      vignette: 0.25
    },
    speed: {
      rate: 2,
      reverse: true,
      freezeFrame: false
    },
    transitions: {
      kind: "dissolve",
      inFrames: 15,
      outFrames: 15
    }
  });
  const args = buildTimelineExportArgsForTest(effectedProject, "D:\\out\\movie.mp4", exportSettings);
  const filterGraph = args[args.indexOf("-filter_complex") + 1];
  const videoInputIndex = args.indexOf("D:\\media\\a.mp4");

  assert.equal(args[videoInputIndex - 2], "6.000");
  assert.ok(filterGraph.includes("reverse"));
  assert.ok(filterGraph.includes("setpts=PTS/2"));
  assert.ok(filterGraph.includes("areverse"));
  assert.ok(filterGraph.includes("atempo=2"));
  assert.ok(filterGraph.includes("eq=brightness=0.2:contrast=1.4:saturation=0.8"));
  assert.ok(filterGraph.includes("boxblur=3:1"));
  assert.ok(filterGraph.includes("unsharp=5:5:0.5"));
  assert.ok(filterGraph.includes("vignette=angle=0.196"));
  assert.ok(filterGraph.includes("fade=t=in"));
});
