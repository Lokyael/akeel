declare module "@earendil-works/pi-coding-agent" {
  export interface SessionManager {
    getSessionId(): string;
  }

  export interface ExtensionUI {
    select(prompt: string, options: string[], settings?: unknown): Promise<string | undefined>;
    notify(message: string, level?: "info" | "warning" | "error"): void;
    setStatus(id: string, text: string | undefined): void;
  }

  export interface ExtensionContext {
    cwd: string;
    isProjectTrusted?(): boolean;
    hasUI: boolean;
    ui: ExtensionUI;
    sessionManager?: SessionManager;
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
