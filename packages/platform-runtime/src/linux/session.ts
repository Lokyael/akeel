import type {
  AtomicTextPublicationAuthority,
  PathAuthority,
  PlatformSession,
  PlatformSessionInput,
  PrivateFilesystemAuthority,
  ProcessAuthority,
  RuntimeRootAuthority,
} from "../contracts";
import { createPlatformValueIssuer } from "../internal/sealed-values";
import { createLinuxFilesystemAuthorities } from "./filesystem";
import { createLinuxPathAuthority, resolveLinuxWorkspaceRoot } from "./path";
import { createLinuxProcessAuthority } from "./process";
import { createLinuxRuntimeRootAuthority } from "./runtime-root";

export type LinuxPlatformSession = PlatformSession & Readonly<{
  readonly path: PathAuthority;
  readonly process: ProcessAuthority;
  readonly runtime: RuntimeRootAuthority;
  readonly filesystem: PrivateFilesystemAuthority;
  readonly publication: AtomicTextPublicationAuthority;
}>;

export async function createLinuxPlatformSession(input: PlatformSessionInput): Promise<LinuxPlatformSession> {
  if (input.purpose !== "access-gate" && input.purpose !== "guidance") {
    throw new TypeError("invalid Linux platform session input");
  }

  const accessRoot = resolveLinuxWorkspaceRoot(input.cwd);
  const home = input.home === undefined ? undefined : resolveLinuxWorkspaceRoot(input.home);
  const issuer = createPlatformValueIssuer("linux");

  let closed = false;
  const requireOpen = (): void => {
    if (closed) throw new Error("Linux platform session is closed");
  };

  const workspace = issuer.issueWorkspace(accessRoot, accessRoot);
  const path = createLinuxPathAuthority(issuer, accessRoot, home, requireOpen);
  const processAuthority = createLinuxProcessAuthority(issuer, requireOpen);
  const runtime = createLinuxRuntimeRootAuthority(issuer, path, requireOpen);
  const { filesystem, publication } = createLinuxFilesystemAuthorities(issuer, runtime, requireOpen);

  return Object.freeze({
    domain: issuer.domain,
    workspace,
    path,
    process: processAuthority,
    runtime,
    filesystem,
    publication,
    async close() {
      closed = true;
    },
  });
}
