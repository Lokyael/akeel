// uv 命令族：uv run 的执行与网络语义

import { defineAdapterTests } from "./semantics-dsl";

defineAdapterTests("uv", [
  {
    cmd: "uv run pytest tests/test_reporting.py -q",
    name: "run pytest is execute without a network effect",
    cls: "execute",
    withoutEffects: ["network"],
  },
  {
    cmd: "uv run --locked pytest tests/test_reporting.py -q",
    name: "run options are consumed before the command",
    cls: "execute",
    withoutEffects: ["network"],
  },
  {
    cmd: "uv --directory project run pytest tests/test_reporting.py -q",
    name: "global options do not hide run execution",
    cls: "execute",
    withoutEffects: ["network"],
  },
  { cmd: ["uv --version", "uv -V", "uv --help", "uv -h", "uv help"], name: "version and help are inspect", cls: "inspect" },
  { cmd: ["uv run --help", "uv run -h", "uv --help run", "uv --version run"], name: "uv run help and version options are inspect", cls: "inspect" },
  { cmd: "uv run pytest --help", name: "child command help remains uv run execution", cls: "execute", withoutEffects: ["network"] },
  { cmd: "uv tree", name: "unmodeled uv subcommand stays unknown and opaque", cls: "unknown", opaque: true },
]);
