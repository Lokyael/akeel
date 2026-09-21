import assert from "node:assert/strict";
import test from "node:test";
import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import akeelBootstrap from "../../../packages/guidance/src/bootstrap/index";

type Handler = (event: unknown, context: ExtensionContext) => unknown | Promise<unknown>;

function fakePi() {
  const handlers = new Map<string, Handler>();
  const pi = {
    on(event: string, handler: Handler): void {
      handlers.set(event, handler);
    },
  } as unknown as ExtensionAPI;
  return { handlers, pi };
}

test("akeelBootstrap registers before_agent_start and injects akeel_principles section", () => {
  const { handlers, pi } = fakePi();
  akeelBootstrap(pi);

  assert.equal(handlers.size, 1);
  const handler = handlers.get("before_agent_start");
  assert.ok(handler, "before_agent_start handler must be registered");

  const event = {
    prompt: "hello",
    systemPrompt: "You are an assistant.",
    systemPromptOptions: {
      sections: {},
    },
  } as unknown as BeforeAgentStartEvent;

  handler(event, {} as ExtensionContext);

  assert.ok(event.systemPromptOptions.sections?.akeel_principles);
  assert.ok(event.systemPromptOptions.sections.akeel_principles.includes("## Core Behavioral Principles"));
  assert.ok(event.systemPromptOptions.sections.akeel_principles.includes("### 1. Think Before Coding"));
  assert.ok(!event.systemPromptOptions.sections.akeel_principles.includes("<AKEEL_PRINCIPLES>"));
});

test("akeelBootstrap initializes sections if missing", () => {
  const { handlers, pi } = fakePi();
  akeelBootstrap(pi);

  const handler = handlers.get("before_agent_start");
  assert.ok(handler);

  const event = {
    prompt: "hello",
    systemPrompt: "You are an assistant.",
    systemPromptOptions: {} as any,
  } as unknown as BeforeAgentStartEvent;

  handler(event, {} as ExtensionContext);

  assert.ok(event.systemPromptOptions.sections?.akeel_principles);
});

test("akeelBootstrap preserves existing prompt sections while patching principles", () => {
  const { handlers, pi } = fakePi();
  akeelBootstrap(pi);

  const handler = handlers.get("before_agent_start");
  assert.ok(handler);

  const event = {
    prompt: "hello",
    systemPrompt: "You are an assistant.",
    systemPromptOptions: {
      sections: { existing: "Keep this section." },
    },
  } as unknown as BeforeAgentStartEvent;

  handler(event, {} as ExtensionContext);

  assert.equal(event.systemPromptOptions.sections?.existing, "Keep this section.");
  assert.ok(event.systemPromptOptions.sections?.akeel_principles);
});
