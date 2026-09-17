export type ExecutableIdentity =
  | Readonly<{ readonly kind: "bare"; readonly name: string }>
  | Readonly<{ readonly kind: "system"; readonly name: string; readonly path: string }>
  | Readonly<{ readonly kind: "system-unmodeled"; readonly name: string; readonly path: string }>
  | Readonly<{ readonly kind: "path-form"; readonly path: string; readonly basename: string }>;

const TRUSTED_SYSTEM_PREFIXES = ["/usr/bin/", "/bin/"] as const;

export function resolveExecutableIdentity(
  executable: string,
  isKnownProgram: (name: string) => boolean,
): ExecutableIdentity {
  if (!executable.includes("/")) {
    return Object.freeze({ kind: "bare" as const, name: executable });
  }

  for (const prefix of TRUSTED_SYSTEM_PREFIXES) {
    if (executable.startsWith(prefix)) {
      const rest = executable.slice(prefix.length);
      if (rest.length > 0 && !rest.includes("/") && !rest.includes("..")) {
        if (isKnownProgram(rest)) {
          return Object.freeze({
            kind: "system" as const,
            name: rest,
            path: executable,
          });
        }
        return Object.freeze({
          kind: "system-unmodeled" as const,
          name: rest,
          path: executable,
        });
      }
    }
  }

  const separator = executable.lastIndexOf("/");
  const basename = executable.slice(separator + 1);
  return Object.freeze({
    kind: "path-form" as const,
    path: executable,
    basename,
  });
}
