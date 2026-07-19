/**
 * taxonomy/commands.ts — Command classification definitions.
 *
 * Extracted from taxonomy/index.ts as part of the taxonomy/ module split.
 * Single source of truth for all shell command rules.
 *
 * Architecture:
 *   CMDS: commands indexed by command name (git, npm, ls, eval…). O(1) lookup.
 *   PATTERNS: full-segment patterns ($(…), >file, cat>…).
 *   FULL_COMMAND_PATTERNS: pre-split checks (curl|sh, wget|sh).
 *   byCmd Map: built at module load time from CMDS for O(1) lookup by command name.
 */

import type { CmdDef, PatDef, CommandCategory, CommandRule } from "./types";
import { containsUnquoted } from "./helpers";
import { extractRedirections } from "./parser";

// ─── Category priority (higher = wins) ───

export const PRIORITY: Record<CommandCategory, number> = {
  "read-only": 0, "vcs-mutate": 1, "fs-mutate": 2,
  "shell-write": 3, "privilege": 4, "destructive": 5, "remote-exec": 6,
};

// ─── Helpers ───

/** Shortcut: read-only command rule. */
function ro(cmd: string, description: string, opts?: { id?: string; sub?: RegExp }): CmdDef {
  const def: CmdDef = { cmd, rule: { id: opts?.id || cmd, description, plan: "allow", build: "allow", category: "read-only", severity: "safe" } };
  if (opts?.sub) def.sub = opts.sub;
  return def;
}

/** Build package manager rules for npm/pnpm/yarn. IDs follow {cmd}-{operation}. */
function pkgRules(cmd: string, subs: { readonly: RegExp; install: RegExp; remove: RegExp; update: RegExp; init: RegExp; publish: RegExp }): CmdDef[] {
  return [
    { cmd, sub: subs.readonly,  rule: { id: `${cmd}-readonly`, description: `${cmd} read-only operations`, plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
    { cmd, sub: subs.install,  rule: { id: `${cmd}-install`,  description: `Install ${cmd} packages`, plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
    { cmd, sub: subs.remove,   rule: { id: `${cmd}-remove`,   description: `Remove ${cmd} packages`, plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
    { cmd, sub: subs.update,   rule: { id: `${cmd}-update`,   description: `Update ${cmd} packages`, plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
    { cmd, sub: subs.init,     rule: { id: `${cmd}-init`,     description: "Create package.json", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
    { cmd, sub: subs.publish,  rule: { id: `${cmd}-publish`,  description: "Publish a package", plan: "block", build: "block", category: "vcs-mutate", severity: "critical" } },
  ];
}

// ─── Command definitions ───

export const CMDS: CmdDef[] = [

  // ── git

  { cmd: "git", sub: /^status\b/i,
    rule: { id: "git-status", description: "Show working tree status", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "git", sub: /^diff\b/i,
    rule: { id: "git-diff", description: "Show changes between commits", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "git", sub: /^log\b/i,
    rule: { id: "git-log", description: "Show commit logs", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "git", sub: /^branch\b(?!\s+.*-[dD]\b)/i,
    rule: { id: "git-branch-list", description: "List branches", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "git", sub: /^show\b/i,
    rule: { id: "git-show", description: "Show various types of objects", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "git", sub: /^grep\b/i,
    rule: { id: "git-grep", description: "Print lines matching a pattern", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "git", sub: /^blame\b/i,
    rule: { id: "git-blame", description: "Show what revision last modified each line", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "git", sub: /^stash\s+(list|show)\b/i,
    rule: { id: "git-stash-list", description: "List stashed changes", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "git", sub: /^stash\b(?!\s+(push|pop|apply|drop|clear|branch|create|save)\b)/i,
    rule: { id: "git-stash-show", description: "Show stash contents", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },

  { cmd: "git", sub: /^add\b/i,
    rule: { id: "git-add", description: "Add file contents to the index", plan: "block", build: "allow", category: "vcs-mutate", severity: "safe" } },
  { cmd: "git", sub: /^commit\b/i,
    rule: { id: "git-commit", description: "Record changes to the repository", plan: "block", build: "ask", category: "vcs-mutate", severity: "dangerous" } },
  { cmd: "git", sub: /^push\b(?!\s+.*(--force|--delete|-f\b))/i,
    rule: { id: "git-push", description: "Push to remote (non-force)", plan: "block", build: "ask", category: "vcs-mutate", severity: "dangerous" } },
  { cmd: "git", sub: /^push\s+.*(--force|--delete|-f\b)/i,
    rule: { id: "git-push-force", description: "Force push — overwrites remote history", plan: "block", build: "block", category: "destructive", severity: "critical" } },
  { cmd: "git", sub: /^(checkout|switch)\b(?!\s+--(?:\s|$))/i,
    rule: { id: "git-checkout", description: "Switch branches or restore files", plan: "block", build: "allow", category: "vcs-mutate", severity: "safe" } },
  { cmd: "git", sub: /^(checkout|restore)\s+--(?:\s|$)(?!.*-b\b)/i,
    rule: { id: "git-checkout-discard", description: "Discard working directory changes", plan: "block", build: "ask", category: "vcs-mutate", severity: "dangerous" } },
  { cmd: "git", sub: /^merge\b/i,
    rule: { id: "git-merge", description: "Join two or more development histories", plan: "block", build: "ask", category: "vcs-mutate", severity: "dangerous" } },
  { cmd: "git", sub: /^rebase\b/i,
    rule: { id: "git-rebase", description: "Reapply commits on top of another base", plan: "block", build: "ask", category: "vcs-mutate", severity: "dangerous" } },
  { cmd: "git", sub: /^tag\b/i,
    rule: { id: "git-tag", description: "Create/list/delete tags", plan: "block", build: "ask", category: "vcs-mutate", severity: "dangerous" } },
  { cmd: "git", sub: /^stash\s+(push|save)\b/i,
    rule: { id: "git-stash-push", description: "Stash working directory changes", plan: "block", build: "allow", category: "vcs-mutate", severity: "safe" } },
  { cmd: "git", sub: /^stash\s+pop\b/i,
    rule: { id: "git-stash-pop", description: "Apply and remove stashed changes", plan: "block", build: "ask", category: "vcs-mutate", severity: "dangerous" } },
  { cmd: "git", sub: /^stash\s+apply\b/i,
    rule: { id: "git-stash-apply", description: "Apply stashed changes", plan: "block", build: "allow", category: "vcs-mutate", severity: "safe" } },
  { cmd: "git", sub: /^stash\s+drop\b/i,
    rule: { id: "git-stash-drop", description: "Remove a stashed state", plan: "block", build: "ask", category: "vcs-mutate", severity: "dangerous" } },
  { cmd: "git", sub: /^stash\s+clear\b/i,
    rule: { id: "git-stash-clear", description: "Remove all stashed states", plan: "block", build: "block", category: "destructive", severity: "critical" } },

  { cmd: "git", sub: /^reset\s+--hard\b/i,
    rule: { id: "git-reset-hard", description: "Reset HEAD and working directory", plan: "block", build: "block", category: "destructive", severity: "critical" } },
  { cmd: "git", sub: /^clean\s+-[fdx]+/i,
    rule: { id: "git-clean-force", description: "Remove untracked files", plan: "block", build: "block", category: "destructive", severity: "critical" } },
  { cmd: "git", sub: /^branch\s+-D\b/i,
    rule: { id: "git-branch-delete-force", description: "Force delete an unmerged branch", plan: "block", build: "block", category: "destructive", severity: "critical" } },

  // ── package managers ──

  ...pkgRules("npm",  { readonly: /^(test|run|ls|list|view|info|outdated)\b/, install: /^(install|i)\b/, remove: /^(uninstall|un|remove|rm)\b/, update: /^update\b/, init: /^init\b/, publish: /^publish\b/ }),
  ...pkgRules("pnpm", { readonly: /^(test|run|ls|list)\b/,              install: /^(install|add)\b/, remove: /^(remove|rm|uninstall)\b/, update: /^update\b/, init: /^init\b/, publish: /^publish\b/ }),
  ...pkgRules("yarn", { readonly: /^(test|run|list|info)\b/,             install: /^add\b/,          remove: /^remove\b/,             update: /^upgrade\b/, init: /^init\b/, publish: /^publish\b/ }),

  ro("cargo", "cargo build/test/check (read-only)", { id: "cargo-readonly", sub: /^(test|check|build)\b/ }),
  ro("go", "go build/test/vet (read-only)", { id: "go-readonly", sub: /^(test|vet|build)\b/ }),

  // ── interpreters

  { cmd: "node", sub: /^(-v|--?version)\b/,
    rule: { id: "node-version", description: "Node.js version check", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "node", sub: /^-e\b/,
    rule: { id: "node-eval", description: "Node.js inline script execution", plan: "block", build: "ask", category: "remote-exec", severity: "dangerous" } },
  { cmd: "python", sub: /^(-V|--?version)\b/,
    rule: { id: "python-version", description: "Python version check", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "python", sub: /^-c\b/,
    rule: { id: "python-eval", description: "Python inline script execution", plan: "block", build: "ask", category: "remote-exec", severity: "dangerous" } },
  { cmd: "python3", sub: /^(-V|--?version)\b/,
    rule: { id: "python3-version", description: "Python version check", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "python3", sub: /^-c\b/,
    rule: { id: "python3-eval", description: "Python inline script execution", plan: "block", build: "ask", category: "remote-exec", severity: "dangerous" } },
  { cmd: "bash", sub: /^-c\b/,
    rule: { id: "bash-c", description: "Execute a nested shell command", plan: "block", build: "block", category: "remote-exec", severity: "critical" } },
  { cmd: "sh", sub: /^-c\b/,
    rule: { id: "sh-c", description: "Execute a nested shell command", plan: "block", build: "block", category: "remote-exec", severity: "critical" } },

  // ── read-only ──

  ...[
    ["ls", "List directory contents"],
    ["cat", "Print file contents"],
    ["head", "Output first part of files"],
    ["tail", "Output last part of files"],
    ["wc", "Print newline/word/byte counts"],
    ["find", "Search for files in a directory hierarchy"],
    ["grep", "Print lines matching a pattern"],
    ["rg", "ripgrep — recursively search directories"],
    ["echo", "Display a line of text"],
    ["printf", "Print formatted output"],
    ["cd", "Change working directory"],
    ["pwd", "Print working directory"],
    ["which", "Locate a command"],
    ["type", "Display information about command type"],
    ["whoami", "Print effective user ID"],
    ["uname", "Print system information"],
    ["df", "Report filesystem disk space usage"],
    ["du", "Estimate file space usage"],
    ["tree", "List contents of directories"],
    ["file", "Determine file type"],
    ["sort", "Sort lines of text"],
    ["uniq", "Report or omit repeated lines"],
    ["cut", "Remove sections from each line"],
    ["tr", "Translate or delete characters"],
    ["awk", "awk pattern scanning (non-inline)"],
    ["sed", "sed stream editor (non-inline)"],
    ["diff", "Compare files line by line"],
    ["stat", "Display file or filesystem status"],
    ["dirname", "Strip last component from file name"],
    ["basename", "Strip directory and suffix from filenames"],
    ["realpath", "Print resolved absolute file path"],
  ].map(([c, d]) => ro(c, d!, c === "awk" || c === "sed" ? { id: `${c}-readonly` } : undefined)),

  // ── destructive / privileged / remote-exec

  { cmd: "eval", rule: { id: "eval", description: "Execute arguments as a shell command", plan: "block", build: "block", category: "remote-exec", severity: "critical" } },
  { cmd: "sudo", rule: { id: "sudo", description: "Execute a command as another user", plan: "block", build: "block", category: "privilege", severity: "critical" } },
  { cmd: "su", rule: { id: "su", description: "Switch user with login shell", plan: "block", build: "block", category: "privilege", severity: "critical" } },

  // ── filesystem-mutate

  { cmd: "mkdir", rule: { id: "mkdir", description: "Make directories", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "touch", rule: { id: "touch", description: "Change file timestamps", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "rm", sub: /^(?!.*-(?:rf?\b|recursive\b))/,
    rule: { id: "rm", description: "Remove files or directories", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "rm", sub: /-(?:rf?|recursive)\b(?!\s+\/|\s+~)/i,
    rule: { id: "rm-rf", description: "Recursive force remove", plan: "block", build: "block", category: "destructive", severity: "critical" } },
  { cmd: "rm", sub: /-(?:rf?|recursive)\s+\/(\*|\S*)/i,
    rule: { id: "rm-rf-root", description: "Recursive delete from filesystem root", plan: "block", build: "block", category: "destructive", severity: "critical" } },
  { cmd: "rm", sub: /-(?:rf?|recursive)\s+~(\/|$)/i,
    rule: { id: "rm-rf-home", description: "Recursive delete from home directory", plan: "block", build: "block", category: "destructive", severity: "critical" } },
  { cmd: "chmod", sub: /^(?!.*\b777\b)/,
    rule: { id: "chmod", description: "Change file mode bits", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "chmod", sub: /\b777\b/,
    rule: { id: "chmod-777", description: "World-writable permissions", plan: "block", build: "block", category: "privilege", severity: "critical" } },
  { cmd: "chown", rule: { id: "chown", description: "Change file owner and group", plan: "block", build: "block", category: "privilege", severity: "critical" } },

  // ── shell-write (cmd-based)

  { cmd: "cp", rule: { id: "cp-write", description: "Copy files via shell", plan: "block", build: "ask", category: "shell-write", severity: "dangerous",
    extractPath: (c) => { const m = c.match(/\bcp\s+(-[a-zA-Z]*\s+)?\S+\s+(\S+)/i); return m ? m[2] : null; } } },
  { cmd: "mv", rule: { id: "mv-write", description: "Move/rename files via shell", plan: "block", build: "ask", category: "shell-write", severity: "dangerous",
    extractPath: (c) => { const m = c.match(/\bmv\s+(-[a-zA-Z]*\s+)?\S+\s+(\S+)/i); return m ? m[2] : null; } } },
  { cmd: "tee", rule: { id: "tee-write", description: "Write to file via tee", plan: "block", build: "ask", category: "shell-write", severity: "dangerous",
    extractPath: (c) => { const m = c.match(/\btee\s+(-a\s+)?(\S+)/i); return m ? m[2] : null; } } },
  { cmd: "dd", rule: { id: "dd-write", description: "Write to file via dd", plan: "block", build: "ask", category: "shell-write", severity: "dangerous",
    extractPath: (c) => { const m = c.match(/\bdd\s+.*\bof=(\S+)/i); return m ? m[1] : null; } } },
  { cmd: "truncate", rule: { id: "truncate-write", description: "Shrink or extend file via truncate", plan: "block", build: "ask", category: "shell-write", severity: "dangerous",
    extractPath: (c) => { const m = c.match(/\btruncate\s+.*\s(\S+)$/i); return m ? m[1] : null; } } },
];

// ── Patterns (no single command word)

export const PATTERNS: PatDef[] = [
  { match: (s) => /^\s*(?:\.|source)\b/.test(s),
    rule: { id: "source", description: "Execute commands from a file", plan: "block", build: "block", category: "remote-exec", severity: "critical" } },
  { match: (s) => containsUnquoted(s, (ch, next) => (ch === "$" && next === "(") || ch === "`"),
    rule: { id: "command-substitution", description: "Command substitution or backtick", plan: "block", build: "block", category: "remote-exec", severity: "critical" } },
  { match: (s) => extractRedirections(s).some((redirect) => redirect.kind === "file-write"),
    rule: { id: "redirect-overwrite", description: "Write to file via shell redirect", plan: "block", build: "ask", category: "shell-write", severity: "dangerous",
      extractPath: (c) => { const m = c.match(/(?:echo|cat|printf|printenv|env)\s+.*?\s*>\s*(\S+)/i); return m ? m[1] : null; } } },
  { match: (s) => extractRedirections(s).some((redirect) => redirect.kind === "file-append"),
    rule: { id: "redirect-append", description: "Append to file via shell redirect", plan: "block", build: "ask", category: "shell-write", severity: "dangerous",
      extractPath: (c) => { const m = c.match(/(?:echo|cat|printf)\s+.*?\s*>>\s*(\S+)/i); return m ? m[1] : null; } } },
  { match: (s) => /\bsed\s+-i\b/i.test(s),
    rule: { id: "sed-inline", description: "Edit files in-place with sed", plan: "block", build: "ask", category: "shell-write", severity: "dangerous",
      extractPath: (c) => { const m = c.match(/\bsed\s+(?:-i[^\s]*|--in-place[^\s]*)\s+[^>]*?\s+(\S+)/i); return m ? m[1] : null; } } },
  { match: (s) => /\bcat\s+>/.test(s),
    rule: { id: "heredoc-write", description: "Write to file via heredoc", plan: "block", build: "ask", category: "shell-write", severity: "dangerous",
      extractPath: (c) => { const m = c.match(/\bcat\s+>\s*(\S+)/i); return m ? m[1] : null; } } },
  { match: (s) => /\bawk\s+.*-i\s+(?:inplace\s+)?\S+/i.test(s),
    rule: { id: "awk-inline", description: "Edit files in-place with awk", plan: "block", build: "ask", category: "shell-write", severity: "dangerous",
      extractPath: (c) => { const m = c.match(/\bawk\s+.*-i\s+(?:inplace\s+)?\S+\s+(\S+)/i); return m ? m[1] : null; } } },

  { match: (s) => /\bmkfs\.\S+/i.test(s),
    rule: { id: "mkfs", description: "Build a Linux filesystem — destroys existing data", plan: "block", build: "block", category: "destructive", severity: "critical" } },
  { match: (s) => /\bdd\s+if=.*\s+of=\/dev\/(sd|nvme|hd)/i.test(s),
    rule: { id: "dd-overwrite", description: "Raw disk overwrite via dd", plan: "block", build: "block", category: "destructive", severity: "critical" } },
];

// ── Full-command patterns (checked before splitting)

export const FULL_COMMAND_PATTERNS: PatDef[] = [
  { match: (c) => /\bcurl\s+\S+\s*\|.*(?:sh|bash|dash|python|perl|ruby)/i.test(c),
    rule: { id: "curl-pipe-shell", description: "Download and pipe to interpreter", plan: "block", build: "block", category: "remote-exec", severity: "critical" } },
  { match: (c) => /\bwget\s+\S+\s*-O\s*-\s*\|.*(?:sh|bash)/i.test(c),
    rule: { id: "wget-pipe-shell", description: "Download and pipe to interpreter", plan: "block", build: "block", category: "remote-exec", severity: "critical" } },
];

// ─── Index for O(1) lookup ───

export const byCmd = new Map<string, CmdDef[]>();
for (const d of CMDS) {
  const list = byCmd.get(d.cmd) || [];
  list.push(d);
  byCmd.set(d.cmd, list);
}
