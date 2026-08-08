// tests/access-gate/command-semantics-git.test.ts
// git 命令族（git.ts adapter）：子命令分类 + 路径/网络 effect

import { defineAdapterTests } from "./helpers";

defineAdapterTests("git", [
  { cmd: "git status", name: "status is inspect", cls: "inspect" },
  { cmd: "git rev-list --left-right --count origin/main...HEAD", name: "rev-list is inspect", cls: "inspect", opaque: false },
  { cmd: "git add src/file.ts", name: "add produces read intents", cls: "modify", intents: [{ operation: "read", rawPath: "src/file.ts" }] },
  { cmd: "git rm --cached first.md second.md", name: "rm produces write intents for every path", cls: "modify", intents: [{ operation: "write", rawPath: "first.md" }, { operation: "write", rawPath: "second.md" }] },
  { cmd: "git checkout -- src/file.ts", name: "checkout -- writes path", cls: "modify", intents: [{ operation: "write", rawPath: "src/file.ts" }] },
  { cmd: "git clone https://example.test/repo", name: "clone is modify", cls: "modify" },
  { cmd: "git push --force origin main", name: "push --force is destroy", cls: "destroy" },
  { cmd: "git -C /repo status", name: "-C option adds list intent", cls: "inspect", intents: [{ operation: "list", rawPath: "/repo" }] },
  { cmd: "git --git-dir=/srv/repo status", name: "--git-dir adds a list intent", cls: "inspect", intents: [{ operation: "list", rawPath: "/srv/repo" }] },
  {
    cmd: ["git diff", "git log --oneline", "git show HEAD", "git blame src/a.ts", "git branch", "git grep pattern", "git stash list", "git stash show", "git ls-files", "git ls-tree HEAD", "git describe"],
    name: "inspect subcommands stay inspect",
    cls: "inspect",
  },
  {
    cmd: ["git commit -m msg", "git merge main", "git rebase main", "git tag v1.0", "git stash push", "git stash pop", "git stash apply", "git stash drop", "git reset HEAD~1", "git fetch origin", "git pull origin main", "git init", "git remote add origin url"],
    name: "modify subcommands are modify",
    cls: "modify",
  },
  {
    cmd: ["git reset --hard HEAD", "git stash clear"],
    name: "destroy subcommands are destroy",
    cls: "destroy",
  },
  { cmd: "git rm old.txt", name: "rm carries the delete effect", effects: ["delete"] },
  {
    cmd: ["git branch -d feature", "git branch -D feature", "git branch --delete feature"],
    name: "branch delete variants are destroy",
    cls: "destroy",
  },
  {
    cmd: ["git branch -f feature", "git branch --force feature main"],
    name: "branch force create/move is modify",
    cls: "modify",
  },
  {
    cmd: ["git branch", "git branch -a", "git branch --merged main", "git branch --list"],
    name: "branch listing variants stay inspect",
    cls: "inspect",
  },
  { cmd: "git clean -n", name: "clean dry-run is inspect", cls: "inspect" },
  { cmd: "git clean --dry-run", name: "clean --dry-run is inspect", cls: "inspect" },
  { cmd: "git clean -fd", name: "clean -fd is destroy", cls: "destroy" },
  { cmd: "git mv old.ts new.ts", name: "mv carries write intents", cls: "modify", intents: [{ operation: "write", rawPath: "old.ts" }, { operation: "write", rawPath: "new.ts" }] },
  { cmd: ["git cherry-pick abc123", "git revert abc123"], name: "cherry-pick and revert are modify", cls: "modify" },
  { cmd: "git config user.name zev", name: "config key value is modify write with conservative target", cls: "modify", opaque: false, intents: [{ operation: "write", rawPath: ".git/config", confidence: "conservative" }] },
  // ── T-037: config 读写分类与层级目标解析 ──
  { cmd: "git config user.name", name: "config single key is inspect without path intent", cls: "inspect", intents: [] },
  { cmd: "git config --global user.name zev", name: "config --global writes ~/.gitconfig", cls: "modify", intents: [{ operation: "write", rawPath: "~/.gitconfig", confidence: "exact" }] },
  { cmd: "git config --system core.filemode false", name: "config --system writes /etc/gitconfig", cls: "modify", intents: [{ operation: "write", rawPath: "/etc/gitconfig", confidence: "exact" }] },
  { cmd: "git config --file=conf.ini key v", name: "config --file= writes exact path", cls: "modify", intents: [{ operation: "write", rawPath: "conf.ini", confidence: "exact" }] },
  { cmd: "git config -f conf.ini key v", name: "config -f writes exact path", cls: "modify", intents: [{ operation: "write", rawPath: "conf.ini", confidence: "exact" }] },
  { cmd: "git config --local key v", name: "config --local writes .git/config conservative", cls: "modify", intents: [{ operation: "write", rawPath: ".git/config", confidence: "conservative" }] },
  { cmd: "git config --unset user.name", name: "config --unset is modify write", cls: "modify", intents: [{ operation: "write", rawPath: ".git/config", confidence: "conservative" }] },
  { cmd: "git config --list", name: "config --list is inspect without path intent", cls: "inspect", intents: [] },
  { cmd: "git config --global user.name", name: "config --global read is inspect without path intent", cls: "inspect", intents: [] },
  { cmd: "git config --bogus key v", name: "config unknown option is opaque", cls: "modify", opaque: true },
  { cmd: ["git apply patch.diff", "git gc"], name: "apply and gc are modify", cls: "modify" },
  { cmd: "git submodule update --init", name: "submodule carries network effect", cls: "modify", effects: ["network"] },
  { cmd: "git ls-remote origin", name: "ls-remote carries network effect", cls: "inspect", effects: ["network"] },
  { cmd: ["git fsck", "git archive HEAD"], name: "fsck and archive are inspect", cls: "inspect" },
  { cmd: "git push origin main", name: "push carries the network effect", effects: ["network"] },
  {
    cmd: ["git fetch origin", "git pull origin main", "git clone https://github.com/x/y.git", "git remote add origin url"],
    name: "fetch, pull, clone, remote carry the network effect",
    effects: ["network"],
  },
]);
