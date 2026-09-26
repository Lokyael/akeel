export type PlatformComposition = "linux" | "windows" | "unsupported";

export function selectPlatformComposition(platform: NodeJS.Platform = process.platform): PlatformComposition {
  if (platform === "win32") return "windows";
  if (platform === "linux") return "linux";
  return "unsupported";
}
