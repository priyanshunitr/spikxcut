import { spawn } from "node:child_process";
import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { defaultExportSettings, framesFromSeconds, secondsFromFrames } from "../shared/editing";
import type {
  Clip,
  ExportProgress,
  ExportResult,
  ExportSettings,
  MediaAsset,
  MediaType,
  SpikxProject,
  TextOverlay,
  ToolStatus,
  Track
} from "../shared/types";
import { createId } from "../shared/editing";

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

interface ExportClip {
  asset?: MediaAsset;
  clip: Clip;
  track: Track;
  trackIndex: number;
}

interface RenderableExportClip extends ExportClip {
  asset: MediaAsset;
  inputIndex: number;
}

interface ExportOptions {
  settings?: ExportSettings;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}

interface ExportPlan {
  args: string[];
  totalSeconds: number;
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

export async function exportTimeline(project: SpikxProject, outputPath: string, options: ExportOptions = {}): Promise<ExportResult> {
  const status = await getToolStatus();

  if (!status.ffmpeg) {
    return {
      ok: false,
      outputPath,
      message: "Install FFmpeg and add it to PATH to export."
    };
  }

  const settings = normalizeExportSettings(options.settings, project);
  const plan = buildTimelineExportPlan(project, outputPath, settings);

  options.onProgress?.({
    running: true,
    percent: 0,
    message: "Exporting 0%",
    outputPath
  });

  const result = await runCommand("ffmpeg", plan.args, {
    signal: options.signal,
    totalSeconds: plan.totalSeconds,
    outputPath,
    onProgress: options.onProgress
  });

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

export function buildTimelineExportArgsForTest(
  project: SpikxProject,
  outputPath: string,
  settings: ExportSettings = defaultExportSettings
): string[] {
  return buildTimelineExportPlan(project, outputPath, normalizeExportSettings(settings, project)).args;
}

function buildTimelineExportPlan(project: SpikxProject, outputPath: string, settings: ExportSettings): ExportPlan {
  const timelineFps = coercePositiveInteger(project.timeline.settings.fps, defaultExportSettings.fps);
  const visualClips = collectVisibleClips(project);
  const explicitAudioClips = collectExplicitAudioClips(project);
  const allClips = [...visualClips, ...explicitAudioClips];
  const missingClip = allClips.find((item) => !item.asset);

  if (allClips.length === 0 && project.timeline.textOverlays.length === 0) {
    throw new Error("Add at least one clip before exporting.");
  }

  if (missingClip) {
    throw new Error(`Clip "${missingClip.clip.name}" media is missing.`);
  }

  const visualInputs = visualClips.filter(hasAsset).map((item, inputIndex) => ({
    ...item,
    inputIndex
  }));
  const explicitAudioInputs = explicitAudioClips.filter(hasAsset).map((item, index) => ({
    ...item,
    inputIndex: visualInputs.length + index
  }));
  const totalFrames = getExportDurationFrames([...visualInputs, ...explicitAudioInputs], project.timeline.textOverlays);
  const totalSeconds = secondsFromFrames(totalFrames, timelineFps);
  const args = ["-y", "-nostdin", "-progress", "pipe:2", "-nostats"];

  for (const item of [...visualInputs, ...explicitAudioInputs]) {
    addClipInput(args, item.asset, item.clip, timelineFps);
  }

  const filterParts = buildFilterGraph(visualInputs, explicitAudioInputs, project.timeline.textOverlays, settings, timelineFps, totalSeconds);

  args.push(
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[vout]"
  );

  if (filterParts.some((part) => part.endsWith("[aout]"))) {
    args.push("-map", "[aout]", "-c:a", "aac");
  } else {
    args.push("-an");
  }

  args.push(
    "-c:v",
    settings.codec,
    "-b:v",
    `${settings.bitrateKbps}k`,
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(settings.fps),
    "-t",
    formatSeconds(totalSeconds),
    outputPath
  );

  return { args, totalSeconds };
}

function buildFilterGraph(
  visualInputs: RenderableExportClip[],
  explicitAudioInputs: RenderableExportClip[],
  textOverlays: TextOverlay[],
  settings: ExportSettings,
  timelineFps: number,
  totalSeconds: number
): string[] {
  const filterParts = [
    `color=c=black:s=${settings.width}x${settings.height}:r=${settings.fps}:d=${formatSeconds(totalSeconds)}[base0]`
  ];
  let currentVideoLabel = "base0";

  visualInputs
    .sort((left, right) => left.trackIndex - right.trackIndex || left.clip.startFrame - right.clip.startFrame)
    .forEach((item, index) => {
      const startSeconds = secondsFromFrames(item.clip.startFrame, timelineFps);
      const clipLabel = `v${index}`;
      const outputLabel = `base${index + 1}`;
      const transform = item.clip.transform;
      const targetWidth = Math.max(1, Math.round(settings.width * transform.scale));
      const targetHeight = Math.max(1, Math.round(settings.height * transform.scale));
      const filters = [
        buildCropFilter(item.clip),
        `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=${transform.fit === "cover" ? "increase" : "decrease"}`,
        "setsar=1",
        ...buildVisualTimingFilters(item.asset, item.clip, timelineFps),
        ...buildClipEffectFilters(item.clip),
        `fps=${settings.fps}`,
        "format=rgba",
        buildRotateFilter(item.clip),
        `colorchannelmixer=aa=${formatFilterNumber(item.clip.opacity)}`,
        ...buildVideoFadeFilters(item.clip, timelineFps),
        `setpts=PTS+${formatSeconds(startSeconds)}/TB`
      ].filter(Boolean);

      filterParts.push(
        `[${item.inputIndex}:v:0]${filters.join(",")}[${clipLabel}]`
      );
      filterParts.push(
        `[${currentVideoLabel}][${clipLabel}]overlay=x=(W-w)/2+${formatFilterNumber(transform.x)}:` +
        `y=(H-h)/2+${formatFilterNumber(transform.y)}:shortest=0:eof_action=pass:format=auto[${outputLabel}]`
      );
      currentVideoLabel = outputLabel;
    });

  textOverlays
    .sort((left, right) => left.startFrame - right.startFrame)
    .forEach((overlay, index) => {
      const outputLabel = `text${index}`;
      filterParts.push(buildTextOverlayFilter(currentVideoLabel, outputLabel, overlay, timelineFps));
      currentVideoLabel = outputLabel;
    });

  filterParts.push(`[${currentVideoLabel}]format=yuv420p[vout]`);

  const audioLabels: string[] = [];

  for (const item of visualInputs) {
    if (item.asset.type === "video" && item.asset.hasAudio === true && shouldExportClipAudio(item.clip)) {
      const label = `a${audioLabels.length}`;
      filterParts.push(buildAudioFilter(item.inputIndex, item.clip, timelineFps, totalSeconds, label));
      audioLabels.push(label);
    }
  }

  for (const item of explicitAudioInputs) {
    if (!shouldExportClipAudio(item.clip)) {
      continue;
    }

    const label = `a${audioLabels.length}`;
    filterParts.push(buildAudioFilter(item.inputIndex, item.clip, timelineFps, totalSeconds, label));
    audioLabels.push(label);
  }

  if (audioLabels.length === 1) {
    filterParts.push(`[${audioLabels[0]}]atrim=duration=${formatSeconds(totalSeconds)},asetpts=PTS-STARTPTS[aout]`);
  } else if (audioLabels.length > 1) {
    const inputs = audioLabels.map((label) => `[${label}]`).join("");
    filterParts.push(
      `${inputs}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0,` +
      `atrim=duration=${formatSeconds(totalSeconds)},asetpts=PTS-STARTPTS[aout]`
    );
  }

  return filterParts;
}

function addClipInput(args: string[], asset: MediaAsset, clip: Clip, fps: number): void {
  const durationSeconds = asset.type === "image"
    ? secondsFromFrames(clip.durationFrames, fps)
    : clipSourceDurationSeconds(clip, fps);

  if (asset.type === "image") {
    args.push("-loop", "1", "-t", formatSeconds(durationSeconds), "-i", asset.path);
    return;
  }

  args.push(
    "-ss",
    formatSeconds(secondsFromFrames(clip.trimStartFrame, fps)),
    "-t",
    formatSeconds(durationSeconds),
    "-i",
    asset.path
  );
}

function buildVisualTimingFilters(asset: MediaAsset, clip: Clip, fps: number): string[] {
  const clipSeconds = secondsFromFrames(clip.durationFrames, fps);

  if (asset.type === "image") {
    return [
      `trim=duration=${formatSeconds(clipSeconds)}`,
      "setpts=PTS-STARTPTS"
    ];
  }

  const filters = [
    `trim=duration=${formatSeconds(clipSourceDurationSeconds(clip, fps))}`,
    clip.speed.reverse ? "reverse" : "",
    "setpts=PTS-STARTPTS"
  ].filter(Boolean);

  if (clip.speed.freezeFrame) {
    filters.push(
      `tpad=stop_mode=clone:stop_duration=${formatSeconds(clipSeconds)}`,
      `trim=duration=${formatSeconds(clipSeconds)}`,
      "setpts=PTS-STARTPTS"
    );
    return filters;
  }

  const playbackRate = clipPlaybackRate(clip);

  if (Math.abs(playbackRate - 1) > 0.001) {
    filters.push(`setpts=PTS/${formatFilterNumber(playbackRate)}`);
  }

  filters.push(
    `trim=duration=${formatSeconds(clipSeconds)}`,
    "setpts=PTS-STARTPTS"
  );

  return filters;
}

function buildClipEffectFilters(clip: Clip): string[] {
  const { effects } = clip;
  const filters: string[] = [];

  if (Math.abs(effects.brightness) > 0.001 || Math.abs(effects.contrast - 1) > 0.001 || Math.abs(effects.saturation - 1) > 0.001) {
    filters.push(
      `eq=brightness=${formatFilterNumber(effects.brightness)}:` +
      `contrast=${formatFilterNumber(effects.contrast)}:` +
      `saturation=${formatFilterNumber(effects.saturation)}`
    );
  }

  if (effects.blur > 0.001) {
    filters.push(`boxblur=${formatFilterNumber(effects.blur)}:1`);
  }

  if (effects.sharpen > 0.001) {
    filters.push(`unsharp=5:5:${formatFilterNumber(effects.sharpen)}:5:5:0`);
  }

  if (effects.vignette > 0.001) {
    filters.push(`vignette=angle=${formatFilterNumber(Math.PI * 0.25 * effects.vignette)}`);
  }

  return filters;
}

function buildAudioFilter(inputIndex: number, clip: Clip, fps: number, totalSeconds: number, label: string): string {
  const delayMs = Math.max(0, Math.round(secondsFromFrames(clip.startFrame, fps) * 1000));
  const filters = [
    `atrim=duration=${formatSeconds(clipSourceDurationSeconds(clip, fps))}`,
    clip.speed.reverse ? "areverse" : "",
    "asetpts=PTS-STARTPTS",
    ...buildAtempoFilters(clipPlaybackRate(clip)),
    `atrim=duration=${formatSeconds(secondsFromFrames(clip.durationFrames, fps))}`,
    "asetpts=PTS-STARTPTS",
    ...buildAudioFadeFilters(clip, fps),
    `volume=${formatFilterNumber(clip.volume)}`
  ].filter(Boolean);

  if (delayMs > 0) {
    filters.push(`adelay=${delayMs}:all=1`);
  }

  filters.push("apad", `atrim=duration=${formatSeconds(totalSeconds)}`, "asetpts=PTS-STARTPTS");

  return `[${inputIndex}:a:0]${filters.join(",")}[${label}]`;
}

function buildAtempoFilters(rate: number): string[] {
  const filters: string[] = [];
  let remainingRate = rate;

  while (remainingRate > 2) {
    filters.push("atempo=2");
    remainingRate /= 2;
  }

  while (remainingRate < 0.5) {
    filters.push("atempo=0.5");
    remainingRate /= 0.5;
  }

  if (Math.abs(remainingRate - 1) > 0.001) {
    filters.push(`atempo=${formatFilterNumber(remainingRate)}`);
  }

  return filters;
}

function shouldExportClipAudio(clip: Clip): boolean {
  return clip.volume > 0 && !clip.speed.freezeFrame;
}

function clipSourceDurationSeconds(clip: Clip, fps: number): number {
  if (clip.speed.freezeFrame) {
    return secondsFromFrames(1, fps);
  }

  return secondsFromFrames(clip.durationFrames, fps) * clipPlaybackRate(clip);
}

function clipPlaybackRate(clip: Clip): number {
  return Math.min(8, Math.max(0.1, clip.speed.rate));
}

function buildCropFilter(clip: Clip): string {
  const { cropTop, cropRight, cropBottom, cropLeft } = clip.transform;

  if (cropTop === 0 && cropRight === 0 && cropBottom === 0 && cropLeft === 0) {
    return "";
  }

  const widthScale = Math.max(0.05, 1 - cropLeft - cropRight);
  const heightScale = Math.max(0.05, 1 - cropTop - cropBottom);

  return `crop=iw*${formatFilterNumber(widthScale)}:ih*${formatFilterNumber(heightScale)}:` +
    `iw*${formatFilterNumber(cropLeft)}:ih*${formatFilterNumber(cropTop)}`;
}

function buildRotateFilter(clip: Clip): string {
  const rotation = clip.transform.rotation;

  if (Math.abs(rotation) < 0.01) {
    return "";
  }

  return `rotate=${formatFilterNumber(rotation * Math.PI / 180)}:ow=rotw(iw):oh=roth(ih):c=black@0`;
}

function buildVideoFadeFilters(clip: Clip, fps: number): string[] {
  if (clip.transitions.kind === "none") {
    return [];
  }

  const clipSeconds = secondsFromFrames(clip.durationFrames, fps);
  const inSeconds = secondsFromFrames(Math.min(clip.transitions.inFrames, Math.floor(clip.durationFrames / 2)), fps);
  const outSeconds = secondsFromFrames(Math.min(clip.transitions.outFrames, Math.floor(clip.durationFrames / 2)), fps);
  const filters: string[] = [];

  if (inSeconds > 0) {
    filters.push(`fade=t=in:st=0:d=${formatSeconds(inSeconds)}:alpha=1`);
  }

  if (outSeconds > 0) {
    filters.push(`fade=t=out:st=${formatSeconds(Math.max(0, clipSeconds - outSeconds))}:d=${formatSeconds(outSeconds)}:alpha=1`);
  }

  return filters;
}

function buildAudioFadeFilters(clip: Clip, fps: number): string[] {
  if (clip.transitions.kind === "none") {
    return [];
  }

  const clipSeconds = secondsFromFrames(clip.durationFrames, fps);
  const inSeconds = secondsFromFrames(Math.min(clip.transitions.inFrames, Math.floor(clip.durationFrames / 2)), fps);
  const outSeconds = secondsFromFrames(Math.min(clip.transitions.outFrames, Math.floor(clip.durationFrames / 2)), fps);
  const filters: string[] = [];

  if (inSeconds > 0) {
    filters.push(`afade=t=in:st=0:d=${formatSeconds(inSeconds)}`);
  }

  if (outSeconds > 0) {
    filters.push(`afade=t=out:st=${formatSeconds(Math.max(0, clipSeconds - outSeconds))}:d=${formatSeconds(outSeconds)}`);
  }

  return filters;
}

function buildTextOverlayFilter(inputLabel: string, outputLabel: string, overlay: TextOverlay, fps: number): string {
  const startSeconds = secondsFromFrames(overlay.startFrame, fps);
  const endSeconds = secondsFromFrames(overlay.startFrame + overlay.durationFrames, fps);
  const xExpression = textXExpression(overlay);
  const yExpression = `(h-text_h)/2+${formatFilterNumber(overlay.y)}`;

  return `[${inputLabel}]drawtext=text='${escapeDrawText(overlay.text)}':` +
    `x=${xExpression}:y=${yExpression}:fontsize=${Math.round(overlay.fontSize)}:` +
    `fontcolor=${hexToFfmpegColor(overlay.color, overlay.opacity)}:` +
    `box=1:boxcolor=${hexToFfmpegColor(overlay.backgroundColor, 0.55 * overlay.opacity)}:boxborderw=18:` +
    `enable='between(t,${formatSeconds(startSeconds)},${formatSeconds(endSeconds)})'[${outputLabel}]`;
}

function textXExpression(overlay: TextOverlay): string {
  if (overlay.align === "left") {
    return `w*0.1+${formatFilterNumber(overlay.x)}`;
  }

  if (overlay.align === "right") {
    return `w-text_w-w*0.1+${formatFilterNumber(overlay.x)}`;
  }

  return `(w-text_w)/2+${formatFilterNumber(overlay.x)}`;
}

function hexToFfmpegColor(hex: string, alpha: number): string {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "ffffff";
  return `0x${normalized}@${formatFilterNumber(Math.min(1, Math.max(0, alpha)))}`;
}

function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/%/g, "\\%")
    .replace(/\r?\n/g, "\\n");
}

function collectVisibleClips(project: SpikxProject): ExportClip[] {
  return project.timeline.tracks
    .flatMap((track, trackIndex) => (
      track.type === "video" && !track.muted
        ? track.clips
            .filter((clip) => clip.type !== "audio" && !clip.muted && clip.opacity > 0)
            .map((clip) => ({
              asset: project.mediaAssets.find((asset) => asset.id === clip.assetId),
              clip,
              track,
              trackIndex
            }))
        : []
    ));
}

function collectExplicitAudioClips(project: SpikxProject): ExportClip[] {
  return project.timeline.tracks
    .flatMap((track, trackIndex) => (
      track.type === "audio" && !track.muted
        ? track.clips
            .filter((clip) => clip.type === "audio" && !clip.muted && clip.volume > 0)
            .map((clip) => ({
              asset: project.mediaAssets.find((asset) => asset.id === clip.assetId),
              clip,
              track,
              trackIndex
            }))
        : []
    ));
}

function getExportDurationFrames(clips: RenderableExportClip[], textOverlays: TextOverlay[]): number {
  return Math.max(
    1,
    ...clips.map((item) => item.clip.startFrame + item.clip.durationFrames),
    ...textOverlays.map((overlay) => overlay.startFrame + overlay.durationFrames)
  );
}

function normalizeExportSettings(settings: ExportSettings | undefined, project: SpikxProject): ExportSettings {
  return {
    fps: coercePositiveInteger(settings?.fps ?? project.timeline.settings.fps, defaultExportSettings.fps),
    width: coercePositiveInteger(settings?.width ?? project.timeline.settings.width, defaultExportSettings.width),
    height: coercePositiveInteger(settings?.height ?? project.timeline.settings.height, defaultExportSettings.height),
    bitrateKbps: coercePositiveInteger(settings?.bitrateKbps ?? defaultExportSettings.bitrateKbps, defaultExportSettings.bitrateKbps),
    codec: settings?.codec === "libx265" ? "libx265" : "libx264"
  };
}

function coercePositiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function hasAsset(clip: ExportClip): clip is Omit<RenderableExportClip, "inputIndex"> {
  return Boolean(clip.asset);
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
  const result = await runCommand(command, args, { timeoutMs: 3000 });
  return result.exitCode === 0;
}

function runCommand(
  command: string,
  args: string[],
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
    totalSeconds?: number;
    outputPath?: string;
    onProgress?: (progress: ExportProgress) => void;
  } = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let stderrLineBuffer = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const settle = (exitCode: number, nextStderr = stderr): void => {
      if (settled) {
        return;
      }

      settled = true;

      if (timer) {
        clearTimeout(timer);
      }

      options.signal?.removeEventListener("abort", abort);
      resolve({ exitCode, stdout, stderr: nextStderr });
    };

    const abort = (): void => {
      child.kill();
      settle(-1, "Export canceled.");
    };

    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill();
        settle(-1, "Command timed out.");
      }, options.timeoutMs);
    }

    if (options.signal) {
      if (options.signal.aborted) {
        abort();
      } else {
        options.signal.addEventListener("abort", abort);
      }
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      stderrLineBuffer += text;
      const lines = stderrLineBuffer.split(/\r?\n/);
      stderrLineBuffer = lines.pop() ?? "";

      for (const line of lines) {
        parseProgressLine(line, options);
      }
    });

    child.on("error", (error) => {
      settle(-1, error.message);
    });

    child.on("close", (exitCode) => {
      settle(exitCode ?? -1);
    });
  });
}

function parseProgressLine(
  line: string,
  options: {
    totalSeconds?: number;
    outputPath?: string;
    onProgress?: (progress: ExportProgress) => void;
  }
): void {
  if (!options.onProgress || !options.totalSeconds || !line.startsWith("out_time_")) {
    return;
  }

  const [, rawValue] = line.split("=");
  const elapsedSeconds = line.startsWith("out_time_ms=") || line.startsWith("out_time_us=")
    ? Number(rawValue) / 1_000_000
    : secondsFromTimestamp(rawValue);

  if (!Number.isFinite(elapsedSeconds)) {
    return;
  }

  const percent = Math.min(99, Math.max(0, Math.round((elapsedSeconds / options.totalSeconds) * 100)));

  options.onProgress({
    running: true,
    percent,
    message: `Exporting ${percent}%`,
    outputPath: options.outputPath
  });
}

function secondsFromTimestamp(value: string): number {
  const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(value);

  if (!match) {
    return Number.NaN;
  }

  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function formatSeconds(seconds: number): string {
  return Math.max(0, seconds).toFixed(3);
}

function formatFilterNumber(value: number): string {
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
