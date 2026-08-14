// 解释器命令族（interpreters.ts + python-tools.ts adapter）：python/node/ruby/perl/tsx + ruff/mypy/black/isort/pytest/pyright/pylint

import { defineAdapterTests } from "./semantics-dsl";

defineAdapterTests("interp", [
  // ─── 语言解释器 ───
  { cmd: "python script.py", name: "python execute script is execute", cls: "execute" },
  { cmd: "python3 -c \"print(1)\"", name: "python3 execute inline is execute", cls: "execute" },
  { cmd: "python --version", name: "python version flag is inspect", cls: "inspect" },
  { cmd: "python3 -V", name: "python3 -V flag is inspect", cls: "inspect" },
  { cmd: "python -", name: "python - reads the script from stdin as execute", cls: "execute" },
  { cmd: ".venv/bin/python --version", name: "venv interpreter version is inspect", cls: "inspect" },
  { cmd: "/usr/bin/python3 --version", name: "system path interpreter version is inspect", cls: "inspect" },
  { cmd: "./.venv/bin/python -m pytest", name: "venv interpreter module run is execute", cls: "execute" },
  { cmd: "python3.11 --version", name: "versioned python is inspect", cls: "inspect" },
  { cmd: "python3.12 -m pip list", name: "versioned python module run is execute", cls: "execute" },
  { cmd: "nodejs --version", name: "nodejs alias is inspect", cls: "inspect" },
  { cmd: "node server.js", name: "node execute script is execute", cls: "execute" },
  { cmd: "node --version", name: "node version flag is inspect", cls: "inspect" },
  { cmd: "node --help", name: "node --help is inspect", cls: "inspect" },
  { cmd: "ruby script.rb", name: "ruby execute is execute", cls: "execute" },
  { cmd: "perl --version", name: "perl version is inspect", cls: "inspect" },
  // ─── tsx（TS 解释器）───
  { cmd: "tsx --version", name: "tsx version is inspect", cls: "inspect" },
  { cmd: "tsx -v", name: "tsx -v is inspect", cls: "inspect" },
  { cmd: "tsx --help", name: "tsx --help is inspect", cls: "inspect" },
  { cmd: "tsx script.ts", name: "tsx execute script is execute", cls: "execute" },
  { cmd: "tsx watch src/x.ts", name: "tsx watch is execute", cls: "execute" },
  { cmd: "tsx -e 'console.log(1)'", name: "tsx inline is execute", cls: "execute" },
  { cmd: "./node_modules/.bin/tsx run.ts", name: "tsx path form executes", cls: "execute" },
  { cmd: "node_modules/.bin/tsx --version", name: "tsx path form version is inspect", cls: "inspect" },
  // ─── Python 工具 ───
  { cmd: "ruff check src/", name: "ruff check is inspect", cls: "inspect" },
  { cmd: "ruff format src/", name: "ruff format is modify", cls: "modify" },
  { cmd: "ruff format --check src/", name: "ruff format --check is inspect (check-only)", cls: "inspect" },
  { cmd: "ruff check --fix src/", name: "ruff check --fix upgrades to modify", cls: "modify" },
  { cmd: "ruff", name: "ruff defaults to inspect", cls: "inspect" },
  { cmd: "mypy src/", name: "mypy is inspect", cls: "inspect" },
  { cmd: "mypy src/ --ignore-missing-imports", name: "mypy with flags is inspect", cls: "inspect" },
  { cmd: "black src/", name: "black is modify", cls: "modify" },
  { cmd: "black --check src/", name: "black --check is inspect", cls: "inspect" },
  { cmd: "isort --check-only src/", name: "isort --check-only is inspect", cls: "inspect" },
  { cmd: "pytest tests/", name: "pytest is execute", cls: "execute" },
  { cmd: "pyright src/", name: "pyright is inspect", cls: "inspect" },
  { cmd: "pylint src/", name: "pylint is inspect", cls: "inspect" },
]);
