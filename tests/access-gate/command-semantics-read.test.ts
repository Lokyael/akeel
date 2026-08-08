// tests/access-gate/command-semantics-read.test.ts
// read 命令族（read.ts adapter）：head/tail/cat/wc/cut/diff/less/more/file/stat/du/df

import { defineAdapterTests } from "./helpers";

defineAdapterTests("read", [
  { cmd: "head -250", name: "head -250 reads stdin without a path intent", cls: "inspect", intents: [] },
  { cmd: "head -n 5 /etc/passwd", name: "head checks explicit files", cls: "inspect", intents: [{ operation: "read", rawPath: "/etc/passwd" }] },
  { cmd: "head -- -n file.txt", name: "head -- treats following tokens as files", cls: "inspect", intents: [{ operation: "read", rawPath: "-n" }, { operation: "read", rawPath: "file.txt" }] },
  { cmd: "cat first.txt second.txt", name: "cat checks multiple files", cls: "inspect", intents: [{ operation: "read", rawPath: "first.txt" }, { operation: "read", rawPath: "second.txt" }] },
  { cmd: "cat - file.txt", name: "cat - skips stdin and keeps files", cls: "inspect", intents: [{ operation: "read", rawPath: "file.txt" }] },
  { cmd: "tail --lines=5 file.txt", name: "tail skips line-count values and checks files", cls: "inspect", intents: [{ operation: "read", rawPath: "file.txt" }] },
  { cmd: "wc -l file.txt", name: "wc checks files after flags", cls: "inspect", intents: [{ operation: "read", rawPath: "file.txt" }] },
  { cmd: "cut -d : -f 1 /etc/passwd", name: "cut skips delimiter and field values", cls: "inspect", intents: [{ operation: "read", rawPath: "/etc/passwd" }] },
  { cmd: "diff -u a.txt b.txt", name: "diff reads both files", cls: "inspect", intents: [{ operation: "read", rawPath: "a.txt" }, { operation: "read", rawPath: "b.txt" }] },
  { cmd: "less notes.md", name: "less reads the file", cls: "inspect", intents: [{ operation: "read", rawPath: "notes.md" }] },
  { cmd: "more README.md", name: "more reads the file", cls: "inspect", intents: [{ operation: "read", rawPath: "README.md" }] },
  { cmd: "file logo.png", name: "file reads the file", cls: "inspect", intents: [{ operation: "read", rawPath: "logo.png" }] },
  { cmd: "stat -c %s file.txt", name: "stat format option value is skipped", cls: "inspect", intents: [{ operation: "read", rawPath: "file.txt" }] },
  { cmd: "du -sh dir", name: "du depth value is skipped", cls: "inspect", intents: [{ operation: "read", rawPath: "dir" }] },
  { cmd: "df -h", name: "df is inspect", cls: "inspect" },
  // od —— POSIX 只读检查工具（T-040）
  { cmd: "od -c file.bin", name: "od reads the file", cls: "inspect", intents: [{ operation: "read", rawPath: "file.bin" }] },
  { cmd: "od -j 16 file.bin", name: "od skips separated skip-bytes value", cls: "inspect", intents: [{ operation: "read", rawPath: "file.bin" }] },
  { cmd: "od -A d file.bin", name: "od skips separated address-radix value", cls: "inspect", intents: [{ operation: "read", rawPath: "file.bin" }] },
  { cmd: "od -j16 file.bin", name: "od skips attached skip-bytes value", cls: "inspect", intents: [{ operation: "read", rawPath: "file.bin" }] },
  { cmd: "od -N 64 file.bin", name: "od skips read-bytes value", cls: "inspect", intents: [{ operation: "read", rawPath: "file.bin" }] },
  { cmd: "od -t x1 file.bin", name: "od skips format type value", cls: "inspect", intents: [{ operation: "read", rawPath: "file.bin" }] },
  { cmd: "od -An -tx1 file.bin", name: "od skips attached radix and format values", cls: "inspect", intents: [{ operation: "read", rawPath: "file.bin" }] },
  { cmd: "od --skip-bytes=16 file.bin", name: "od skips long attached skip-bytes value", cls: "inspect", intents: [{ operation: "read", rawPath: "file.bin" }] },
  { cmd: "od -w file.bin", name: "od optional-arg width flag does not swallow the file", cls: "inspect", intents: [{ operation: "read", rawPath: "file.bin" }] },
  { cmd: "od -c a.bin b.bin", name: "od checks multiple files", cls: "inspect", intents: [{ operation: "read", rawPath: "a.bin" }, { operation: "read", rawPath: "b.bin" }] },
  { cmd: "od -c -", name: "od - skips stdin and has no path intent", cls: "inspect", intents: [] },
]);
