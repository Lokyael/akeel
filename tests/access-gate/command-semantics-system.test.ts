// tests/access-gate/command-semantics-system.test.ts
// system 命令族（system.ts adapter）：date

import { defineAdapterTests } from "./helpers";

defineAdapterTests("system", [
  { cmd: "date", name: "date defaults to inspect", cls: "inspect", intents: [] },
  { cmd: "date +%F", name: "date +FORMAT is inspect without a path intent", cls: "inspect", intents: [] },
  { cmd: "date -d tomorrow", name: "date -d consumes the value without a path intent", cls: "inspect", intents: [] },
  { cmd: "date --date=2024-01-01", name: "date --date= consumes the value without a path intent", cls: "inspect", intents: [] },
  { cmd: "date --date tomorrow", name: "date --date (space form) consumes the value without a path intent", cls: "inspect", intents: [] },
  { cmd: "date -u", name: "date -u is inspect", cls: "inspect", intents: [] },
  { cmd: "date -R", name: "date -R is inspect", cls: "inspect", intents: [] },
  { cmd: "date -Iseconds", name: "date -I attached value is consumed without a path intent", cls: "inspect", intents: [] },
  { cmd: "date -r file.txt", name: "date -r reads the reference file", cls: "inspect", intents: [{ operation: "read", rawPath: "file.txt" }] },
  { cmd: "date --reference=file.txt", name: "date --reference= reads the reference file", cls: "inspect", intents: [{ operation: "read", rawPath: "file.txt" }] },
  { cmd: "date --reference file.txt", name: "date --reference (space form) reads the reference file", cls: "inspect", intents: [{ operation: "read", rawPath: "file.txt" }] },
  { cmd: "date -f dates.txt", name: "date -f reads the date file", cls: "inspect", intents: [{ operation: "read", rawPath: "dates.txt" }] },
  { cmd: "date --file dates.txt", name: "date --file (space form) reads the date file", cls: "inspect", intents: [{ operation: "read", rawPath: "dates.txt" }] },
  { cmd: "date -s 2024-01-01", name: "date -s is modify (sets system clock)", cls: "modify", intents: [] },
  { cmd: "date --set=2024-01-01", name: "date --set= is modify (sets system clock)", cls: "modify", intents: [] },
  { cmd: "date --set 2024-01-01", name: "date --set (space form) is modify (sets system clock)", cls: "modify", intents: [] },
  { cmd: "date --bogus", name: "date unknown option sets opaque", opaque: true },
]);
