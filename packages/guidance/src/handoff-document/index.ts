export type SemanticUnit = Readonly<{
  readonly id: string;
  readonly kind:
    | "requirement"
    | "constraint"
    | "assumption"
    | "finding"
    | "risk"
    | "decision-candidate"
    | "evidence"
    | "external-effect"
    | "work-state"
    | "next-action";
  readonly statement: string;
  readonly authority: "user-approved" | "project-record" | "observed" | "inferred";
  readonly status: "live" | "superseded" | "closed";
  readonly sourceRef: string;
  readonly dependsOn?: readonly string[];
  readonly closure?: Readonly<{
    readonly disposition: "materialized" | "superseded" | "invalidated" | "irrelevant";
    readonly basisRef: string;
    readonly destinationRef: string;
  }>;
}>;

export type SemanticClosure = Readonly<{
  readonly semanticId: string;
  readonly disposition: "materialized" | "superseded" | "invalidated" | "irrelevant";
  readonly basisRef: string;
  readonly destinationRef: string;
}>;

export type ContinuationCapsuleInput = Readonly<{
  readonly taskRef: string;
  readonly authorityRefs: readonly string[];
  readonly roots: readonly string[];
  readonly units: readonly SemanticUnit[];
  readonly checkpoint: Readonly<{
    readonly state: "complete" | "incomplete" | "blocked";
    readonly currentSlice: string;
    readonly actualState: string;
    readonly nextActionId: string;
  }>;
  readonly workspace: Readonly<{
    readonly cwd: string;
    readonly files: readonly string[];
  }>;
}>;

export type ContinuationCapsule = ContinuationCapsuleInput & Readonly<{
  readonly schemaVersion: 1;
  readonly liveSemantics: readonly SemanticUnit[];
  readonly closures: readonly SemanticClosure[];
}>;

export type SynthesizeCapsuleOptions = Readonly<{
  readonly taskRef: string;
  readonly cwd: string;
  readonly units?: readonly SemanticUnit[];
  readonly files?: readonly string[];
  readonly userNextAction?: string;
  readonly currentSlice?: string;
  readonly actualState?: string;
  readonly checkpointState?: "complete" | "incomplete" | "blocked";
  readonly authorityRefs?: readonly string[];
}>;

export function synthesizeContinuationCapsule(options: SynthesizeCapsuleOptions): ContinuationCapsule {
  const units: SemanticUnit[] = [...(options.units ?? [])];
  let nextActionId = "";

  const trimmedAction = options.userNextAction?.trim();
  if (trimmedAction && trimmedAction.length > 0) {
    let targetActionId = "user-next-action";
    if (units.some((u) => u.id === targetActionId)) {
      let suffix = 2;
      while (units.some((u) => u.id === `${targetActionId}-${suffix}`)) {
        suffix += 1;
      }
      targetActionId = `${targetActionId}-${suffix}`;
    }

    const supersededNextActionIds = new Set<string>();
    for (let i = 0; i < units.length; i += 1) {
      const u = units[i]!;
      if (u.kind === "next-action" && u.status === "live") {
        supersededNextActionIds.add(u.id);
        units[i] = Object.freeze({
          ...u,
          status: "superseded" as const,
          closure: Object.freeze({
            disposition: "superseded" as const,
            basisRef: "user-command",
            destinationRef: targetActionId,
          }),
        });
      }
    }
    for (let i = 0; i < units.length; i += 1) {
      const u = units[i]!;
      if (u.status === "live" && u.dependsOn && u.dependsOn.some((id) => supersededNextActionIds.has(id))) {
        const rewritten = [...new Set(u.dependsOn.map((id) => supersededNextActionIds.has(id) ? targetActionId : id))];
        units[i] = Object.freeze({
          ...u,
          dependsOn: Object.freeze(rewritten),
        });
      }
    }
    const userUnit: SemanticUnit = Object.freeze({
      id: targetActionId,
      kind: "next-action" as const,
      statement: trimmedAction,
      authority: "user-approved" as const,
      status: "live" as const,
      sourceRef: "user-command",
    });
    units.push(userUnit);
    nextActionId = targetActionId;
  } else {
    const liveNexts = units.filter((u) => u.kind === "next-action" && u.status === "live");
    if (liveNexts.length > 0) {
      const chosenNext = liveNexts[liveNexts.length - 1]!;
      nextActionId = chosenNext.id;

      if (liveNexts.length > 1) {
        const supersededIds = new Set(liveNexts.slice(0, -1).map((u) => u.id));
        for (let i = 0; i < units.length; i += 1) {
          const u = units[i]!;
          if (supersededIds.has(u.id)) {
            units[i] = Object.freeze({
              ...u,
              status: "superseded" as const,
              closure: Object.freeze({
                disposition: "superseded" as const,
                basisRef: "auto-synthesis",
                destinationRef: chosenNext.id,
              }),
            });
          }
        }
        for (let i = 0; i < units.length; i += 1) {
          const u = units[i]!;
          if (u.status === "live" && u.dependsOn && u.dependsOn.some((id) => supersededIds.has(id))) {
            const rewritten = [
              ...new Set(
                u.dependsOn
                  .map((id) => supersededIds.has(id) ? chosenNext.id : id)
                  .filter((id) => id !== u.id),
              ),
            ];
            units[i] = Object.freeze({
              ...u,
              dependsOn: rewritten.length > 0 ? Object.freeze(rewritten) : undefined,
            });
          }
        }
      }
    } else {
      let defaultId = "continue-work";
      if (units.some((u) => u.id === defaultId)) {
        let suffix = 2;
        while (units.some((u) => u.id === `${defaultId}-${suffix}`)) {
          suffix += 1;
        }
        defaultId = `${defaultId}-${suffix}`;
      }
      const defaultNext: SemanticUnit = Object.freeze({
        id: defaultId,
        kind: "next-action" as const,
        statement: "Continue active work in the fresh session.",
        authority: "inferred" as const,
        status: "live" as const,
        sourceRef: options.taskRef,
      });
      units.push(defaultNext);
      nextActionId = defaultId;
    }
  }

  const liveUnits = units.filter((u) => u.status === "live");
  const liveIds = liveUnits.map((u) => u.id);
  const liveIdSet = new Set(liveIds);

  const dependedOn = new Set<string>();
  for (const u of liveUnits) {
    if (u.dependsOn) {
      for (const dep of u.dependsOn) {
        if (liveIdSet.has(dep)) dependedOn.add(dep);
      }
    }
  }
  const rootIds = liveIds.filter((id) => !dependedOn.has(id));
  const roots: string[] = rootIds.length > 0 ? [...rootIds] : (liveIds.length > 0 ? [liveIds[0]!] : []);

  const liveUnitMap = new Map(liveUnits.map((u) => [u.id, u]));
  const reached = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const curr = queue.pop()!;
    if (reached.has(curr)) continue;
    reached.add(curr);
    const u = liveUnitMap.get(curr);
    if (u?.dependsOn) {
      for (const dep of u.dependsOn) {
        if (liveIdSet.has(dep)) queue.push(dep);
      }
    }
  }

  for (const id of liveIds) {
    if (!reached.has(id)) {
      roots.push(id);
      queue.push(id);
      while (queue.length > 0) {
        const curr = queue.pop()!;
        if (reached.has(curr)) continue;
        reached.add(curr);
        const u = liveUnitMap.get(curr);
        if (u?.dependsOn) {
          for (const dep of u.dependsOn) {
            if (liveIdSet.has(dep)) queue.push(dep);
          }
        }
      }
    }
  }

  return createContinuationCapsule({
    taskRef: options.taskRef,
    authorityRefs: options.authorityRefs ?? [],
    roots,
    units,
    checkpoint: {
      state: options.checkpointState ?? "incomplete",
      currentSlice: options.currentSlice ?? "Session continuity",
      actualState: options.actualState ?? "Continuing in fresh session.",
      nextActionId,
    },
    workspace: {
      cwd: options.cwd,
      files: options.files ?? [],
    },
  });
}

const MAX_JSON_PAYLOAD_BYTES = 49_152;
const MAX_CAPSULE_BYTES = 65_536;

function invalid(): never {
  throw new TypeError("handoff-document-invalid");
}

function nonEmpty(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

const HANDOFF_DELIMITER = /<\/?akeel-session-handoff\b/iu;
const SEMANTIC_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/u;

function safeText(value: string): boolean {
  return nonEmpty(value) && !value.includes("\u0000") && !HANDOFF_DELIMITER.test(value);
}

function semanticId(value: string): boolean {
  return safeText(value) && SEMANTIC_ID.test(value);
}

const SEMANTIC_KINDS = new Set<SemanticUnit["kind"]>([
  "requirement", "constraint", "assumption", "finding", "risk", "decision-candidate",
  "evidence", "external-effect", "work-state", "next-action",
]);
const AUTHORITIES = new Set<SemanticUnit["authority"]>(["user-approved", "project-record", "observed", "inferred"]);
const STATUSES = new Set<SemanticUnit["status"]>(["live", "superseded", "closed"]);
const DISPOSITIONS = new Set<NonNullable<SemanticUnit["closure"]>["disposition"]>([
  "materialized", "superseded", "invalidated", "irrelevant",
]);

export function validateSemanticUnit(value: unknown): SemanticUnit {
  if (!value || typeof value !== "object") invalid();
  const unit = value as SemanticUnit;
  if (!semanticId(unit.id) || !SEMANTIC_KINDS.has(unit.kind) || !safeText(unit.statement) ||
    !AUTHORITIES.has(unit.authority) || !STATUSES.has(unit.status) || !safeText(unit.sourceRef) ||
    (unit.dependsOn !== undefined && (!Array.isArray(unit.dependsOn) || unit.dependsOn.some((id) => !semanticId(id))))) invalid();
  if (unit.status === "live" && unit.closure !== undefined) invalid();
  if (unit.status !== "live" && (!unit.closure || !DISPOSITIONS.has(unit.closure.disposition) ||
    !safeText(unit.closure.basisRef) || !safeText(unit.closure.destinationRef))) invalid();
  if (unit.status === "superseded" && unit.closure?.disposition !== "superseded") invalid();
  if (unit.status === "closed" && unit.closure?.disposition === "superseded") invalid();
  return Object.freeze({
    ...unit,
    dependsOn: unit.dependsOn === undefined ? undefined : Object.freeze([...unit.dependsOn]),
    closure: unit.closure === undefined ? undefined : Object.freeze({ ...unit.closure }),
  });
}

function stringList(value: readonly string[], requireNonEmpty = false, identifiers = false): readonly string[] {
  if (!Array.isArray(value) || (requireNonEmpty && value.length === 0) ||
    value.some((item) => identifiers ? !semanticId(item) : !safeText(item))) invalid();
  const copy = [...value];
  if (new Set(copy).size !== copy.length) invalid();
  return Object.freeze(copy);
}

export function createContinuationCapsule(input: ContinuationCapsuleInput): ContinuationCapsule {
  if (!input || typeof input !== "object" || !input.checkpoint || !input.workspace || !safeText(input.taskRef) ||
    !safeText(input.workspace.cwd) || !input.workspace.cwd.startsWith("/") ||
    !safeText(input.checkpoint.currentSlice) || !safeText(input.checkpoint.actualState) ||
    !semanticId(input.checkpoint.nextActionId) ||
    !["complete", "incomplete", "blocked"].includes(input.checkpoint.state)) invalid();
  const roots = stringList(input.roots, true, true);
  const authorityRefs = stringList(input.authorityRefs);
  const files = stringList(input.workspace.files);
  if (!Array.isArray(input.units)) invalid();

  const units = new Map<string, SemanticUnit>();
  for (const rawUnit of input.units) {
    const unit = validateSemanticUnit(rawUnit);
    if (units.has(unit.id)) invalid();
    units.set(unit.id, unit);
  }
  const liveNextActions = [...units.values()].filter((unit) => unit.kind === "next-action" && unit.status === "live");
  if (liveNextActions.length !== 1 || units.get(input.checkpoint.nextActionId)?.kind !== "next-action" ||
    units.get(input.checkpoint.nextActionId)?.status !== "live") invalid();

  const marked = new Set<string>();
  const pending = [...roots];

  while (pending.length > 0) {
    const id = pending.pop()!;
    if (marked.has(id)) continue;
    const unit = units.get(id);
    if (!unit || unit.status !== "live") invalid();
    marked.add(id);
    pending.push(...(unit.dependsOn ?? []));
  }

  for (const unit of input.units) {
    if (unit.status === "live" && !marked.has(unit.id)) invalid();
    if (unit.status !== "live" && marked.has(unit.id)) invalid();
  }

  const liveSemantics = [...marked]
    .sort()
    .map((id) => units.get(id)!);
  const closures = input.units
    .filter((unit) => unit.status !== "live")
    .map((unit): SemanticClosure => {
      if (!unit.closure) invalid();
      return Object.freeze({
        semanticId: unit.id,
        disposition: unit.closure.disposition,
        basisRef: unit.closure.basisRef,
        destinationRef: unit.closure.destinationRef,
      });
    })
    .sort((left, right) => left.semanticId.localeCompare(right.semanticId));

  const capsule: ContinuationCapsule = Object.freeze({
    schemaVersion: 1,
    taskRef: input.taskRef,
    authorityRefs,
    roots,
    units: Object.freeze([...units.values()]),
    checkpoint: Object.freeze({ ...input.checkpoint }),
    workspace: Object.freeze({ cwd: input.workspace.cwd, files }),
    liveSemantics: Object.freeze(liveSemantics),
    closures: Object.freeze(closures),
  });
  if (Buffer.byteLength(JSON.stringify(capsule), "utf8") > MAX_JSON_PAYLOAD_BYTES) invalid();
  return capsule;
}

export type ReconciliationReport = Readonly<{
  readonly importedSemanticIds: readonly string[];
  readonly conflicts: readonly Readonly<{ readonly semanticId: string; readonly observedReality: string }>[];
  readonly unresolvedSemanticIds: readonly string[];
  readonly workspaceVerified: boolean;
}>;

export type ReconciliationResult = Readonly<{
  readonly status: "ready" | "blocked";
  readonly coveredSemanticIds: readonly string[];
}>;

export function reconcileContinuationCapsule(
  capsule: ContinuationCapsule,
  report: ReconciliationReport,
): ReconciliationResult {
  if (
    !capsule ||
    typeof capsule !== "object" ||
    !Array.isArray(capsule.liveSemantics) ||
    !report ||
    typeof report !== "object" ||
    !Array.isArray(report.importedSemanticIds) ||
    !Array.isArray(report.conflicts) ||
    !Array.isArray(report.unresolvedSemanticIds) ||
    typeof report.workspaceVerified !== "boolean" ||
    report.importedSemanticIds.some((id) => !semanticId(id)) ||
    report.unresolvedSemanticIds.some((id) => !semanticId(id)) ||
    report.conflicts.some((conflict) => !conflict || typeof conflict !== "object" || !semanticId(conflict.semanticId) || !nonEmpty(conflict.observedReality))
  ) {
    invalid();
  }

  const expected = new Set(capsule.liveSemantics.map((unit) => unit.id));
  const covered = [
    ...report.importedSemanticIds,
    ...report.conflicts.map((conflict) => conflict.semanticId),
    ...report.unresolvedSemanticIds,
  ];
  const unique = new Set(covered);
  if (unique.size !== covered.length || unique.size !== expected.size ||
    [...unique].some((id) => !expected.has(id))) invalid();

  return Object.freeze({
    status: report.workspaceVerified && report.conflicts.length === 0 && report.unresolvedSemanticIds.length === 0
      ? "ready"
      : "blocked",
    coveredSemanticIds: Object.freeze([...unique].sort()),
  });
}

function markdownText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\r", "\\r").replaceAll("\n", "\\n");
}

export function renderContinuationCapsule(capsule: ContinuationCapsule): string {
  const authority = [...capsule.authorityRefs].sort().map((ref) => `- ${markdownText(ref)}`).join("\n") || "- None";
  const files = [...capsule.workspace.files].sort().map((file) => `- ${markdownText(file)}`).join("\n") || "- None";
  const live = capsule.liveSemantics.map((unit) =>
    `- [${unit.id}] ${unit.kind}; authority=${unit.authority}; source=${markdownText(unit.sourceRef)}\n  ${markdownText(unit.statement)}`,
  ).join("\n");
  const closures = capsule.closures.map((closure) =>
    `- [${closure.semanticId}] ${closure.disposition}; basis=${markdownText(closure.basisRef)}; destination=${markdownText(closure.destinationRef)}`,
  ).join("\n") || "- None";
  const next = capsule.liveSemantics.find((unit) => unit.id === capsule.checkpoint.nextActionId)!;
  const rendered = `# AKeel Continuation Capsule\n\n` +
    `> Runtime continuity data. It does not grant new user approval.\n\n` +
    `## Authority\n\n- Task: ${markdownText(capsule.taskRef)}\n${authority}\n\n` +
    `## Checkpoint\n\n- State: ${capsule.checkpoint.state}\n- Slice: ${markdownText(capsule.checkpoint.currentSlice)}\n` +
    `- Actual state: ${markdownText(capsule.checkpoint.actualState)}\n\n` +
    `## Workspace\n\n- CWD: ${markdownText(capsule.workspace.cwd)}\n${files}\n\n` +
    `## Live Semantics\n\n${live}\n\n` +
    `## Closure Tombstones\n\n${closures}\n\n` +
    `## Next Action\n\n[${next.id}] ${markdownText(next.statement)}\n`;
  if (Buffer.byteLength(rendered, "utf8") > MAX_CAPSULE_BYTES) invalid();
  return rendered;
}
