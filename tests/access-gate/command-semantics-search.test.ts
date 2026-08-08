// tests/access-gate/command-semantics-search.test.ts
// search 命令族（search.ts adapter）：find/tree/grep/rg/ls

import { defineAdapterTests } from "./helpers";

defineAdapterTests("search", [
  { cmd: "find . -type f", name: "find produces search intent", cls: "inspect", intents: [{ operation: "search", rawPath: "." }] },
  { cmd: "find -type f -name '*.ts'", name: "find without path defaults to .", cls: "inspect", intents: [{ operation: "search", rawPath: "." }] },
  { cmd: "find /etc -name shadow", name: "find /etc is protected", cls: "inspect", intents: [{ operation: "search", rawPath: "/etc" }] },
  { cmd: "find . -name '*.tmp' -delete", name: "find -delete upgrades to modify", cls: "modify", intents: [{ operation: "search", rawPath: "." }] },
  { cmd: "find . -name '*.log' -exec rm {} \\;", name: "find -exec upgrades to modify", cls: "modify", intents: [{ operation: "search", rawPath: "." }] },
  { cmd: "find . -name '*.js' -execdir rm {} +", name: "find -execdir upgrades to modify", cls: "modify", intents: [{ operation: "search", rawPath: "." }] },
  { cmd: "find . -ok rm {} \\;", name: "find -ok upgrades to modify", cls: "modify", intents: [{ operation: "search", rawPath: "." }] },
  { cmd: "find . -exec rm {} ';' extra-root", name: "find quoted ; terminates exec and keeps the following root", cls: "modify", intents: [{ operation: "search", rawPath: "." }, { operation: "search", rawPath: "extra-root" }] },
  { cmd: "find . -maxdepth 2 -name '*.ts'", name: "find -maxdepth skips the value", cls: "inspect", intents: [{ operation: "search", rawPath: "." }] },
  { cmd: "tree -L 2 .", name: "tree -L skips the level value", cls: "inspect", intents: [{ operation: "search", rawPath: "." }] },
  { cmd: "grep -r pattern src/", name: "grep -r searches directory", cls: "inspect", intents: [{ operation: "search", rawPath: "src/" }] },
  { cmd: "grep -rn pattern src/", name: "grep combined flags preserve recursive search", cls: "inspect", intents: [{ operation: "search", rawPath: "src/" }] },
  { cmd: "grep pattern file.txt", name: "grep without -r produces a read intent", cls: "inspect", intents: [{ operation: "read", rawPath: "file.txt" }] },
  { cmd: "grep -f patterns.txt src/", name: "grep -f extracts file opt read intent", cls: "inspect", intents: [{ operation: "read", rawPath: "patterns.txt" }, { operation: "read", rawPath: "src/" }] },
  { cmd: "rg pattern", name: "rg searches default root", cls: "inspect", intents: [{ operation: "search", rawPath: "." }] },
  { cmd: "rg -f patterns.txt", name: "rg -f extracts pattern file", cls: "inspect", intents: [{ operation: "read", rawPath: "patterns.txt" }, { operation: "search", rawPath: "." }] },
  { cmd: "rg --glob '*.ts' --type ts pattern src/ /etc", name: "rg skips values for glob and type options", cls: "inspect", intents: [{ operation: "search", rawPath: "src/" }, { operation: "search", rawPath: "/etc" }] },
  { cmd: "rg -n -C 3 pattern AGENTS.md", name: "rg skips context counts", cls: "inspect", intents: [{ operation: "search", rawPath: "AGENTS.md" }] },
  { cmd: "rg -f patterns.txt src/ /etc", name: "rg -f pattern file makes the first positional argument a root", cls: "inspect", intents: [{ operation: "read", rawPath: "patterns.txt" }, { operation: "search", rawPath: "src/" }, { operation: "search", rawPath: "/etc" }] },
  { cmd: "ls", name: "ls defaults to . list intent", cls: "inspect", intents: [{ operation: "list", rawPath: "." }] },
  { cmd: "ls /etc", name: "ls explicit path produces list intent", cls: "inspect", intents: [{ operation: "list", rawPath: "/etc" }] },
  { cmd: "ls src/ tests/", name: "ls multiple paths produce list intents", cls: "inspect", intents: [{ operation: "list", rawPath: "src/" }, { operation: "list", rawPath: "tests/" }] },
  { cmd: "ls -la /home", name: "ls flags like -la are skipped, path still recognized", cls: "inspect", intents: [{ operation: "list", rawPath: "/home" }] },
  { cmd: "ls -l -- -f", name: "ls -- after options treats everything as path", cls: "inspect", intents: [{ operation: "list", rawPath: "-f" }] },
  { cmd: "ls -w 80 /etc", name: "ls -w consumes width value", cls: "inspect", intents: [{ operation: "list", rawPath: "/etc" }] },
  { cmd: "ls --width=80 /etc", name: "ls --width= consumes attached value", cls: "inspect", intents: [{ operation: "list", rawPath: "/etc" }] },
]);
