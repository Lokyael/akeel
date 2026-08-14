// shell builtins 命令族（shell-builtins.ts adapter）：source/.

import { defineAdapterTests } from "./semantics-dsl";

defineAdapterTests("builtins", [
  { cmd: "source file.sh", name: "source file.sh is execute with conservative read intent", cls: "execute", effects: ["execute"], intents: [{ operation: "read", rawPath: "file.sh", confidence: "conservative" }] },
  { cmd: "source ./file.sh", name: "source ./file.sh is execute with exact read intent", cls: "execute", intents: [{ operation: "read", rawPath: "./file.sh", confidence: "exact" }] },
  { cmd: ". ./file.sh", name: ". ./file.sh is execute (dot command)", cls: "execute", intents: [{ operation: "read", rawPath: "./file.sh", confidence: "exact" }] },
  { cmd: "source -", name: "source - has no path intent (stdin)", cls: "execute", intents: [] },
  { cmd: "source", name: "source with no args has no path intent", cls: "execute", intents: [] },
  { cmd: "source file.sh arg1 arg2", name: "source file.sh arg1 arg2 only extracts first non-option arg", cls: "execute", intents: [{ operation: "read", rawPath: "file.sh" }] },
  { cmd: "source /absolute/path.sh", name: "source /absolute/path.sh is execute with exact read intent", cls: "execute", intents: [{ operation: "read", rawPath: "/absolute/path.sh", confidence: "exact" }] },
  { cmd: ".", name: ". with no args has no path intent", cls: "execute", intents: [] },
  { cmd: "source --help", name: "source --help has path intent (source has no options)", cls: "execute", intents: [{ operation: "read", rawPath: "--help", confidence: "conservative" }] },
  { cmd: ". file.sh", name: ". file.sh has exact confidence (POSIX dot does not search PATH)", cls: "execute", intents: [{ operation: "read", rawPath: "file.sh", confidence: "exact" }] },
]);
