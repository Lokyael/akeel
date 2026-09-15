declare module "@earendil-works/pi-coding-agent" {
  export interface SessionManager {
    getSessionId(): string;
    getCwd(): string;
    getSessionName(): string | undefined;
    getEntries(): readonly unknown[];
    buildContextEntries(): readonly unknown[];
  }

  export interface ModelInfo {
    id: string;
    provider: string;
    reasoning?: boolean;
  }

  export interface ExtensionUI {
    confirm(title: string, message: string, settings?: unknown): Promise<boolean>;
    select(prompt: string, options: string[], settings?: unknown): Promise<string | undefined>;
    notify(message: string, level?: "info" | "warning" | "error"): void;
    setStatus(id: string, text: string | undefined): void;
  }

  export interface ExtensionContext {
    mode?: "tui" | "rpc" | "json" | "print";
    cwd: string;
    isProjectTrusted?(): boolean;
    hasUI: boolean;
    ui: ExtensionUI;
    sessionManager?: SessionManager;
    model?: ModelInfo;
    getContextUsage?(): { percent: number | null; contextWindow: number } | undefined;
  }

  export interface SessionStartEvent {
    reason?: "startup" | "reload" | "new" | "resume" | "fork";
    previousSessionFile?: string;
  }

  export interface ContextEvent {
    messages: unknown[];
  }

  export interface ToolCallEvent {
    toolName: string;
    input: unknown;
  }

  interface ExtensionEventMap {
    session_start: SessionStartEvent;
    session_compact: unknown;
    session_shutdown: unknown;
    context: ContextEvent;
    tool_call: ToolCallEvent;
  }

  export interface ExtensionAPI {
    on<K extends keyof ExtensionEventMap>(
      event: K,
      handler: (
        event: ExtensionEventMap[K],
        ctx: ExtensionContext,
      ) => unknown | Promise<unknown>,
    ): void;
    registerCommand(
      name: string,
      options: {
        description: string;
        handler: (args: string, ctx: ExtensionContext) => unknown | Promise<unknown>;
      },
    ): void;
  }
}
