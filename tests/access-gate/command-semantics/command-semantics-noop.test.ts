// noop 命令族（noop.ts adapter）：true/false/echo/: /printf

import { defineAdapterTests } from "./semantics-dsl";

defineAdapterTests("noop", [
  { cmd: "true", name: "true is inspect", cls: "inspect" },
  { cmd: "false", name: "false is inspect", cls: "inspect" },
  { cmd: "echo hello", name: "echo is inspect", cls: "inspect" },
  { cmd: ": 'no operation'", name: ": (colon noop) is inspect", cls: "inspect" },
  { cmd: "printf 'hello\\n'", name: "printf is inspect", cls: "inspect" },
]);
