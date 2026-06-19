import { spawn } from "node:child_process";
import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { createId, framesFromSeconds, secondsFromFrames } from "../shared/editing";
import type { Clip, ExportResult, MediaAsset, MediaType, SpikxProject, ToolStatus } from "../shared/types";

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
}

interface FfprobeResult {
  streams?: FfprobeStream[];
  format?: {
    duration?: string;
  };
}

export async function getToolStatus(): Promise<ToolStatus> {
  const [ffmpeg, ffprobe] = await Promise.all([
    commandAvailable("ffmpeg", ["-version"]),
    commandAvailable("ffprobe", ["-version"])
  ]);

  return { ffmpeg, ffprobe };
}

export async function createMediaAsset(filePath: string, fps: number): Promise<MediaAsset> {
  const probe = await probeMedia(filePath);
  const durationSeconds = probe.durationSeconds;

  return {
    id: createId("asset"),
    name: basename(filePath),
    path: filePath,
    previewUrl: pathToFileURL(filePath).toString(),
    type: probe.type,
    durationSeconds,
    durationFrames: durationSeconds ? framesFromSeconds(durationSeconds, fps) : undefined,
    width: probe.width,
    height: probe.height,
    hasAudio: probe.hasAudio,
    importedAt: new Date().toISOString()
  };
}

export function hydrateMediaAsset(asset: MediaAsset): MediaAsset {
  return {
    ...asset,
    previewUrl: pathToFileURL(asset.path).toString()
  };
}

export function stripRuntimeMediaFields(asset: MediaAsset): MediaAsset {
  const { previewUrl: _previewUrl, ...rest } = asset;
  return rest;
}

export async function exportTimeline(project: SpikxProject, outputPath: string): Promise<ExportResult> {
  const clip = findSingleRenderableClip(project);

  if (!clip) {
    return {
      ok: false,
      outputPath,
      message: "Export supports one video or image clip on one video track for now."
    };
  }

  const asset = project.mediaAssets.find((item) => item.id === clip.assetId);

  if (!asset) {
    return {
      ok: false,
      outputPath,
      message: "Clip media is missing."
    };
  }

  const status = await getToolStatus();

  if (!status.ffmpeg) {
    return {
      ok: false,
      outputPath,
      message: "Install FFmpeg and add it to PATH to export."
    };
  }

  const args = buildSingleClipExportArgs(project, asset, clip, outputPath);
  const result = await runCommand("ffmpeg", args);

  if (result.exitCode !== 0) {
    return {
      ok: false,
      outputPath,
      message: result.stderr || "FFmpeg export failed."
    };
  }

  return {
    ok: true,
    outputPath,
    message: "Export complete."
  };
}

async function probeMedia(filePath: string): Promise<{
  type: MediaType;
  durationSeconds?: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
}> {
  const fallback = mediaTypeFromExtension(filePath);

  if (!(await commandAvailable("ffprobe", ["-version"]))) {
    return {
      type: fallback,
      hasAudio: fallback === "audio"
    };
  }

  const result = await runCommand("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath
  ]);

  if (result.exitCode !== 0) {
    return {
      type: fallback,
      hasAudio: fallback === "audio"
    };
  }

  try {
    const data = JSON.parse(result.stdout) as FfprobeResult;
    const videoStream = data.streams?.find((stream) => stream.codec_type === "video");
    const audioStream = data.streams?.find((stream) => stream.codec_type === "audio");
    const rawDuration = data.format?.duration ?? videoStream?.duration ?? audioStream?.duration;
    const durationSeconds = rawDuration ? Number.parseFloat(rawDuration) : undefined;
    const type: MediaType = videoStream ? (isImageFile(filePath) ? "image" : "video") : "audio";

    return {
      type,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
      width: videoStream?.width,
      height: videoStream?.height,
      hasAudio: Boolean(audioStream)
    };
  } catch {
    return {
      type: fallback,
      hasAudio: fallback === "audio"
    };
  }
}

function buildSingleClipExportArgs(project: SpikxProject, asset: MediaAsset, clip: Clip, outputPath: string): string[] {
  const { fps, width, height } = project.timeline.settings;
  const durationSeconds = secondsFromFrames(clip.durationFrames, fps);
  const trimStartSeconds = secondsFromFrames(clip.trimStartFrame, fps);
  const fitFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

  if (asset.type === "image") {
    return [
      "-y",
      "-loop",
      "1",
      "-t",
      durationSeconds.toFixed(3),
      "-i",
      asset.path,
      "-vf",
      fitFilter,
      "-r",
      String(fps),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      outputPath
    ];
  }

  return [
    "-y",
    "-ss",
    trimStartSeconds.toFixed(3),
    "-t",
    durationSeconds.toFixed(3),
    "-i",
    asset.path,
    "-vf",
    fitFilter,
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    outputPath
  ];
}

function findSingleRenderableClip(project: SpikxProject): Clip | undefined {
  const videoTracks = project.timeline.tracks.filter((track) => track.type === "video");
  const clips = videoTracks.flatMap((track) => track.clips).filter((clip) => clip.type !== "audio");

  return clips.length === 1 ? clips[0] : undefined;
}

function mediaTypeFromExtension(filePath: string): MediaType {
  if (isImageFile(filePath)) {
    return "image";
  }

  const ext = extname(filePath).toLowerCase();
  const audio = new Set([".aac", ".aiff", ".flac", ".m4a", ".mp3", ".ogg", ".wav"]);

  return audio.has(ext) ? "audio" : "video";
}

function isImageFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return new Set([".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".tiff", ".webp"]).has(ext);
}

async function commandAvailable(command: string, args: string[]): Promise<boolean> {
  const result = await runCommand(command, args, 3000);
  return result.exitCode === 0;
}

function runCommand(command: string, args: string[], timeoutMs = 0): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill();
          resolve({ exitCode: -1, stdout, stderr: "Command timed out." });
        }
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        if (timer) {
          clearTimeout(timer);
        }
        resolve({ exitCode: -1, stdout, stderr: error.message });
      }
    });

    child.on("close", (exitCode) => {
      if (!settled) {
        settled = true;
        if (timer) {
          clearTimeout(timer);
        }
        resolve({ exitCode: exitCode ?? -1, stdout, stderr });
      }
    });
  });
}
