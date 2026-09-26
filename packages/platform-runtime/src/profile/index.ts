import type {
  ExecutionBridge,
  PathAuthority,
  PlatformDomain,
  PlatformId,
  PrivateFilesystemAuthority,
  ProcessAuthority,
  RuntimeRootAuthority,
} from "../contracts";

export type PlatformProfile = Readonly<{
  readonly id: PlatformId;
  readonly domain: PlatformDomain;
  readonly path: PathAuthority;
  readonly privateFilesystem: PrivateFilesystemAuthority;
  readonly process: ProcessAuthority;
  readonly runtime: RuntimeRootAuthority;
  readonly execution: ExecutionBridge;
  readonly modelShell: "bash" | "powershell";
  readonly unsupportedModelShells: readonly string[];
}>;

export interface PlatformProfileFactory {
  readonly id: PlatformId;
  create(): Promise<PlatformProfile>;
}

export type PlatformProfileRegistry = Readonly<{
  readonly profiles: readonly PlatformProfileFactory[];
  find(id: PlatformId): PlatformProfileFactory | undefined;
}>;

export function createPlatformProfileRegistry(
  profiles: readonly PlatformProfileFactory[],
): PlatformProfileRegistry {
  const frozen = Object.freeze([...profiles]);
  return Object.freeze({
    profiles: frozen,
    find(id: PlatformId): PlatformProfileFactory | undefined {
      return frozen.find((profile) => profile.id === id);
    },
  });
}
