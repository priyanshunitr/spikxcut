import { readFile, writeFile } from "node:fs/promises";
import type { PalmierProject } from "../shared/types";
import { hydrateMediaAsset, stripRuntimeMediaFields } from "./ffmpeg";

export async function readProjectFile(filePath: string): Promise<PalmierProject> {
  const raw = await readFile(filePath, "utf8");
  const project = JSON.parse(raw) as PalmierProject;

  if (project.app !== "palmier-js" || project.version !== 1) {
    throw new Error("Unsupported project file.");
  }

  return {
    ...project,
    mediaAssets: project.mediaAssets.map(hydrateMediaAsset)
  };
}

export async function writeProjectFile(filePath: string, project: PalmierProject): Promise<void> {
  const data: PalmierProject = {
    ...project,
    mediaAssets: project.mediaAssets.map(stripRuntimeMediaFields)
  };

  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
