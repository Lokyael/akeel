import { statSync } from "node:fs";
import type {
  ProcessAuthority,
  ProcessIdentity,
  ProcessIdentityStamp,
  ProcessLiveness,
} from "../contracts";
import type { PlatformValueIssuer } from "../internal/sealed-values";

function processCreationIdentity(pid: number): string {
  try {
    const stats = statSync(`/proc/${pid}`);
    return `${stats.dev}:${stats.ino}:${Math.floor(stats.ctimeMs)}`;
  } catch {
    return `${pid}:fallback-creation`;
  }
}

function isAlivePid(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return typeof err === "object" && err !== null && "code" in err &&
      (err as { code: string }).code === "EPERM";
  }
}

export function createLinuxProcessAuthority(
  issuer: PlatformValueIssuer,
  requireOpen: () => void,
): ProcessAuthority {
  const currentIdentity = processCreationIdentity(process.pid);

  return Object.freeze({
    domain: issuer.domain,
    async current(): Promise<ProcessIdentity> {
      requireOpen();
      return issuer.issueProcessIdentity(process.pid, currentIdentity);
    },
    stamp(identity: ProcessIdentity): ProcessIdentityStamp {
      requireOpen();
      const facts = issuer.readProcessIdentity(identity);
      if (!facts) throw new TypeError("invalid Linux process identity");
      return Object.freeze({
        schemaVersion: 1,
        platform: "linux",
        pid: facts.pid,
        creationIdentity: facts.creationIdentity,
      });
    },
    async liveness(stamp: ProcessIdentityStamp): Promise<ProcessLiveness> {
      requireOpen();
      if (!stamp || stamp.schemaVersion !== 1 || stamp.platform !== "linux" ||
        !Number.isSafeInteger(stamp.pid) || stamp.pid <= 0) {
        return "dead";
      }
      if (!isAlivePid(stamp.pid)) return "dead";
      if (stamp.pid === process.pid) {
        return stamp.creationIdentity === currentIdentity ? "alive" : "dead";
      }
      const existingCreation = processCreationIdentity(stamp.pid);
      if (existingCreation.endsWith(":fallback-creation") || stamp.creationIdentity.endsWith(":fallback-creation")) {
        return "alive";
      }
      return existingCreation === stamp.creationIdentity ? "alive" : "dead";
    },
  });
}
