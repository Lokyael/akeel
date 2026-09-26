import type {
  PlatformId,
  PlatformSession,
  PlatformSessionInput,
} from "../contracts";

export interface PlatformRuntimeFactory<TSession extends PlatformSession = PlatformSession> {
  readonly id: PlatformId;
  openSession(input: PlatformSessionInput): Promise<TSession>;
}

export type PlatformRuntimeRegistry = Readonly<{
  readonly factories: readonly PlatformRuntimeFactory[];
  find(id: PlatformId): PlatformRuntimeFactory | undefined;
}>;

export function createPlatformRuntimeRegistry(
  factories: readonly PlatformRuntimeFactory[],
): PlatformRuntimeRegistry {
  if (!Array.isArray(factories) || factories.length === 0) throw new TypeError("platform registry is empty");
  const ids = new Set<PlatformId>();
  for (const factory of factories) {
    if (!factory || (factory.id !== "linux" && factory.id !== "windows") ||
      typeof factory.openSession !== "function" || ids.has(factory.id)) {
      throw new TypeError("invalid platform registry");
    }
    ids.add(factory.id);
  }
  const frozen = Object.freeze([...factories]);
  return Object.freeze({
    factories: frozen,
    find(id: PlatformId): PlatformRuntimeFactory | undefined {
      return frozen.find((factory) => factory.id === id);
    },
  });
}
