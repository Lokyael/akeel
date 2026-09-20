declare module "@earendil-works/pi-coding-agent" {
  export interface SessionManager {
    getSessionId(): string;
    getCwd(): string;
    getSessionName(): string | undefined;
    getSessionFile(): string | undefined;
    getBranch(): readonly unknown[];
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

  export interface ReplacedSessionContext extends ExtensionCommandContext {
    sendUserMessage(content: string | readonly unknown[], options?: { deliverAs?: "steer" | "followUp" }): Promise<void>;
  }

  export interface BuildSystemPromptOptions {
    customPrompt?: string;
    forceSystemPrompt?: string;
    selectedTools?: string[];
    toolSnippets?: Record<string, string>;
    toolGuidelines?: Record<string, string[]>;
    promptGuidelines?: string[];
    sections?: Record<string, string | null>;
    appendSystemPrompt?: string;
    cwd?: string;
    contextFiles?: unknown[];
    skills?: unknown[];
  }

  export interface BeforeAgentStartEvent {
    prompt: string;
    images?: unknown[];
    systemPrompt: string;
    systemPromptOptions: BuildSystemPromptOptions;
  }

  export interface BeforeAgentStartResult {
    message?: {
      customType?: string;
      content: string | readonly unknown[];
      display?: boolean;
    };
    systemPrompt?: string;
  }

  export interface UIPromptStartEvent {
    reason: "ui_prompt";
    kind: "select" | "confirm" | "input" | "editor" | "custom";
    title?: string;
  }

  export interface ExtensionCommandContext extends ExtensionContext {
    isIdle(): boolean;
    waitForIdle?(): Promise<void>;
    newSession(options?: {
      parentSession?: string;
      withSession?: (context: ReplacedSessionContext) => unknown | Promise<unknown>;
    }): Promise<{ cancelled: boolean }>;
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

  export interface ToolCallResult {
    block?: boolean;
    reason?: string;
    terminate?: boolean;
  }

  interface ExtensionEventMap {
    session_start: SessionStartEvent;
    session_compact: unknown;
    session_shutdown: unknown;
    context: ContextEvent;
    tool_call: ToolCallEvent;
    before_agent_start: BeforeAgentStartEvent;
    agent_start: unknown;
    agent_end: { messages: unknown[] };
    agent_settled: unknown;
    ui_prompt_start: UIPromptStartEvent;
    ui_prompt_end: unknown;
    cache_warming_decision: unknown;
  }

  export interface ExtensionToolDefinition {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    executionMode?: "sequential" | "parallel";
    execute(
      toolCallId: string,
      params: any,
      signal: AbortSignal | undefined,
      onUpdate: ((result: unknown) => void) | undefined,
      ctx: ExtensionContext,
    ): unknown | Promise<unknown>;
  }

  export interface ExtensionAPI {
    on<K extends keyof ExtensionEventMap>(
      event: K,
      handler: (
        event: ExtensionEventMap[K],
        ctx: ExtensionContext,
      ) => unknown | Promise<unknown>,
    ): () => void;
    registerCommand(
      name: string,
      options: {
        description: string;
        handler: (args: string, ctx: ExtensionCommandContext) => unknown | Promise<unknown>;
      },
    ): void;
    registerFlag(name: string, options: { description: string; type: "boolean" | "string" | "number"; default?: unknown }): void;
    appendEntry(customType: string, data?: unknown): void;
    getFlag(name: string): unknown;
    registerTool(definition: ExtensionToolDefinition): void;
    getActiveTools(): string[];
    setActiveTools(names: string[]): void;
  }
}
