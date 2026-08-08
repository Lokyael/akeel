// tests/access-gate/command-semantics-fs.test.ts
// filesystem 命令族（filesystem.ts adapter）：rm/cp/mv/chmod/chown/touch/mkdir/tee/truncate/ln/rmdir/install/mktemp/shred/dd

import { defineAdapterTests, analyzeNormalizedCommand } from "./helpers";

defineAdapterTests("fs", [
  { cmd: "rm file.txt", name: "rm produces write intent", cls: "modify", intents: [{ operation: "write", rawPath: "file.txt" }] },
  { cmd: "cp src.txt dst.txt", name: "cp produces read + write intents", cls: "modify", intents: [{ operation: "read", rawPath: "src.txt" }, { operation: "write", rawPath: "dst.txt" }] },
  { cmd: "mv old.txt new.txt", name: "mv produces write intents", cls: "modify", intents: [{ operation: "write", rawPath: "old.txt" }, { operation: "write", rawPath: "new.txt" }] },
  { cmd: "chmod 644 file.txt", name: "chmod skips mode arg", cls: "modify", intents: [{ operation: "write", rawPath: "file.txt" }] },
  { cmd: "chown user:group file.txt", name: "chown skips owner arg", cls: "modify", intents: [{ operation: "write", rawPath: "file.txt" }] },
  { cmd: "rm ~/.ssh/id_rsa", name: "rm produces write intent on protected path", cls: "modify", intents: [{ operation: "write", rawPath: "~/.ssh/id_rsa" }] },
  {
    cmd: "env rm ~/.ssh/id_rsa",
    name: "env rm after normalization produces same intents",
    analyze: analyzeNormalizedCommand,
    cls: "modify",
    intents: [{ operation: "write", rawPath: "~/.ssh/id_rsa" }],
  },
  {
    cmd: "command cp src dst",
    name: "command cp after normalization produces read+write",
    analyze: analyzeNormalizedCommand,
    cls: "modify",
    intents: [{ operation: "read", rawPath: "src" }, { operation: "write", rawPath: "dst" }],
  },
  { cmd: "touch new.txt", name: "touch produces write intent", cls: "modify", intents: [{ operation: "write", rawPath: "new.txt" }] },
  { cmd: "mkdir -p src/components", name: "mkdir produces write intent", cls: "modify", intents: [{ operation: "write", rawPath: "src/components" }] },
  { cmd: "tee output.log", name: "tee produces write intent", cls: "modify", intents: [{ operation: "write", rawPath: "output.log" }] },
  { cmd: "truncate -s 0 log.txt", name: "truncate produces write intent", cls: "modify", intents: [{ operation: "write", rawPath: "log.txt" }] },
  { cmd: "ln -s target.txt link.txt", name: "ln -s produces read source and write link", cls: "modify", intents: [{ operation: "read", rawPath: "target.txt" }, { operation: "write", rawPath: "link.txt" }] },
  { cmd: "rmdir empty-dir", name: "rmdir produces delete effect", cls: "modify", effects: ["delete"], intents: [{ operation: "write", rawPath: "empty-dir" }] },
  { cmd: "install -m 755 src.sh /usr/local/bin/", name: "install reads source and writes destination", cls: "modify", intents: [{ operation: "read", rawPath: "src.sh" }, { operation: "write", rawPath: "/usr/local/bin/" }] },
  { cmd: "mktemp -d", name: "mktemp is modify without opaque", cls: "modify", opaque: false, intents: [] },
  { cmd: "shred -u secret.txt", name: "shred is destroy", cls: "destroy", intents: [{ operation: "write", rawPath: "secret.txt" }] },
  { cmd: "dd if=/dev/zero of=out.bin bs=1M count=1", name: "dd is modify without opaque", cls: "modify", opaque: false, intents: [] },
  { cmd: "rm -rf build/", name: "rm -rf filters flags and keeps the path", cls: "modify", effects: ["delete"], intents: [{ operation: "write", rawPath: "build/" }] },
  { cmd: "cp source.ts", name: "cp with a single arg has no path intents", cls: "modify", intents: [] },
  // ── 同类问题修复：选项表补全（-t/--reference/-m/-n 值消费与目标语义） ──
  { cmd: "cp -t /tmp src.txt", name: "cp -t writes target directory", cls: "modify", intents: [{ operation: "read", rawPath: "src.txt" }, { operation: "write", rawPath: "/tmp" }] },
  { cmd: "mv -t /tmp a.txt b.txt", name: "mv -t writes target directory", cls: "modify", intents: [{ operation: "write", rawPath: "a.txt" }, { operation: "write", rawPath: "b.txt" }, { operation: "write", rawPath: "/tmp" }] },
  { cmd: "ln -t /tmp target.txt", name: "ln -t writes target directory", cls: "modify", intents: [{ operation: "read", rawPath: "target.txt" }, { operation: "write", rawPath: "/tmp" }] },
  { cmd: "touch -t 202401011200 file.txt", name: "touch -t consumes timestamp", cls: "modify", intents: [{ operation: "write", rawPath: "file.txt" }] },
  { cmd: "touch -r ref.txt file.txt", name: "touch -r consumes reference and reads it", cls: "modify", intents: [{ operation: "read", rawPath: "ref.txt" }, { operation: "write", rawPath: "file.txt" }] },
  { cmd: "mkdir -m 755 src", name: "mkdir -m consumes mode", cls: "modify", intents: [{ operation: "write", rawPath: "src" }] },
  { cmd: "chmod --reference=ref.txt file.txt", name: "chmod --reference keeps file arg and reads reference", cls: "modify", intents: [{ operation: "read", rawPath: "ref.txt" }, { operation: "write", rawPath: "file.txt" }] },
  { cmd: "chown --reference=ref.txt file.txt", name: "chown --reference keeps file arg and reads reference", cls: "modify", intents: [{ operation: "read", rawPath: "ref.txt" }, { operation: "write", rawPath: "file.txt" }] },
  { cmd: "shred -n 3 file.txt", name: "shred -n consumes iterations", cls: "destroy", intents: [{ operation: "write", rawPath: "file.txt" }] },
]);
