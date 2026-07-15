/**
 * command-taxonomy.ts — Single source of truth for shell command classification.
 * add a rule here, all modules update automatically.
 *
 * Architecture:
 *   CMDS: commands indexed by command name (git, npm, ls, eval…). O(1) lookup.
 *   PATTERNS: full-segment patterns ($(…), >file, cat>…).
 *   FULL_COMMAND_PATTERNS: pre-split checks (curl|sh, wget|sh).
 *   findRule(seg): patterns → extractCmd → CMDS lookup.
 */

// ─── Types ───

export type CommandCategory =
  | "read-only" | "vcs-mutate" | "fs-mutate"
  | "destructive" | "privilege" | "remote-exec" | "shell-write";

export type Severity = "safe" | "dangerous" | "critical";
export type PlanAction = "allow" | "block";
export type BuildAction = "allow" | "ask" | "block";

export interface CommandRule {
  id: string;
  description: string;
  plan: PlanAction;
  build: BuildAction;
  category: CommandCategory;
  severity: Severity;
  extractPath?: (cmd: string) => string | null;
}

interface CmdDef {
  cmd: string;
  sub?: RegExp;  // matches subcommand/args portion after cmd name
  rule: CommandRule;
}

interface PatDef {
  match: (seg: string) => boolean;
  rule: CommandRule;
}

// ─── Helper: extract first command word ───

function cmdName(seg: string): string | null {
  const clean = seg.replace(/^\s*(?:\w+=\S+\s+)*/, "").trim();
  const word = clean.split(/\s+/)[0];
  return /^[a-z][\w.-]*$/i.test(word) ? word.toLowerCase() : null;
}

// ─── Category priority (higher = wins) ───

const PRIORITY: Record<CommandCategory, number> = {
  "read-only": 0, "vcs-mutate": 1, "fs-mutate": 2,
  "shell-write": 3, "privilege": 4, "destructive": 5, "remote-exec": 6,
};

// ─── Command definitions ───

const CMDS: CmdDef[] = [

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

  // ── npm / pnpm / yarn

  { cmd: "npm", sub: /^(test|run|ls|list|view|info|outdated)\b/,
    rule: { id: "npm-readonly", description: "npm read-only operations", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "npm", sub: /^(install|i)\b/,
    rule: { id: "npm-install", description: "Install npm packages", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "npm", sub: /^(uninstall|un|remove|rm)\b/,
    rule: { id: "npm-uninstall", description: "Uninstall npm packages", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "npm", sub: /^update\b/,
    rule: { id: "npm-update", description: "Update npm packages", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "npm", sub: /^init\b/,
    rule: { id: "npm-init", description: "Create package.json", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "npm", sub: /^publish\b/,
    rule: { id: "npm-publish", description: "Publish a package", plan: "block", build: "block", category: "vcs-mutate", severity: "critical" } },

  { cmd: "pnpm", sub: /^(test|run|ls|list)\b/,
    rule: { id: "pnpm-readonly", description: "pnpm read-only operations", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "pnpm", sub: /^(install|add)\b/,
    rule: { id: "pnpm-install", description: "Install pnpm packages", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "pnpm", sub: /^(remove|rm|uninstall)\b/,
    rule: { id: "pnpm-remove", description: "Remove pnpm packages", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "pnpm", sub: /^update\b/,
    rule: { id: "pnpm-update", description: "Update pnpm packages", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "pnpm", sub: /^init\b/,
    rule: { id: "pnpm-init", description: "Create package.json", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "pnpm", sub: /^publish\b/,
    rule: { id: "pnpm-publish", description: "Publish a package", plan: "block", build: "block", category: "vcs-mutate", severity: "critical" } },

  { cmd: "yarn", sub: /^(test|run|list|info)\b/,
    rule: { id: "yarn-readonly", description: "yarn read-only operations", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "yarn", sub: /^add\b/,
    rule: { id: "yarn-add", description: "Install yarn packages", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "yarn", sub: /^remove\b/,
    rule: { id: "yarn-remove", description: "Remove yarn packages", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "yarn", sub: /^upgrade\b/,
    rule: { id: "yarn-upgrade", description: "Upgrade yarn packages", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "yarn", sub: /^init\b/,
    rule: { id: "yarn-init", description: "Create package.json", plan: "block", build: "ask", category: "fs-mutate", severity: "dangerous" } },
  { cmd: "yarn", sub: /^publish\b/,
    rule: { id: "yarn-publish", description: "Publish a package", plan: "block", build: "block", category: "vcs-mutate", severity: "critical" } },

  { cmd: "cargo", sub: /^(test|check|build)\b/,
    rule: { id: "cargo-readonly", description: "cargo read-only operations", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "go", sub: /^(test|vet|build)\b/,
    rule: { id: "go-readonly", description: "go read-only operations", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },

  // ── interpreters

  { cmd: "node", sub: /^(-v|--?version)\b/,
    rule: { id: "node-version", description: "Node.js version check", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "node", sub: /^-e\b/,
    rule: { id: "node-eval", description: "Node.js inline script execution", plan: "allow", build: "ask", category: "remote-exec", severity: "dangerous" } },
  { cmd: "python", sub: /^(-V|--?version)\b/,
    rule: { id: "python-version", description: "Python version check", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "python", sub: /^-c\b/,
    rule: { id: "python-eval", description: "Python inline script execution", plan: "allow", build: "ask", category: "remote-exec", severity: "dangerous" } },
  { cmd: "python3", sub: /^(-V|--?version)\b/,
    rule: { id: "python3-version", description: "Python version check", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "python3", sub: /^-c\b/,
    rule: { id: "python3-eval", description: "Python inline script execution", plan: "allow", build: "ask", category: "remote-exec", severity: "dangerous" } },

  // ── read-only

  { cmd: "ls", rule: { id: "ls", description: "List directory contents", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "cat", rule: { id: "cat", description: "Print file contents", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "head", rule: { id: "head", description: "Output first part of files", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "tail", rule: { id: "tail", description: "Output last part of files", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "wc", rule: { id: "wc", description: "Print newline/word/byte counts", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "find", rule: { id: "find", description: "Search for files in a directory hierarchy", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "grep", rule: { id: "grep", description: "Print lines matching a pattern", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "rg", rule: { id: "rg", description: "ripgrep — recursively search directories", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "echo", rule: { id: "echo", description: "Display a line of text", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "cd", rule: { id: "cd", description: "Change working directory", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "pwd", rule: { id: "pwd", description: "Print working directory", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "which", rule: { id: "which", description: "Locate a command", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "type", rule: { id: "type", description: "Display information about command type", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "whoami", rule: { id: "whoami", description: "Print effective user ID", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "uname", rule: { id: "uname", description: "Print system information", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "df", rule: { id: "df", description: "Report filesystem disk space usage", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "du", rule: { id: "du", description: "Estimate file space usage", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "tree", rule: { id: "tree", description: "List contents of directories", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "file", rule: { id: "file", description: "Determine file type", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },

  { cmd: "sort", rule: { id: "sort", description: "Sort lines of text", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "uniq", rule: { id: "uniq", description: "Report or omit repeated lines", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "cut", rule: { id: "cut", description: "Remove sections from each line", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "tr", rule: { id: "tr", description: "Translate or delete characters", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "awk", rule: { id: "awk-readonly", description: "awk pattern scanning (non-inline)", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "sed", rule: { id: "sed-readonly", description: "sed stream editor (non-inline)", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "diff", rule: { id: "diff", description: "Compare files line by line", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "stat", rule: { id: "stat", description: "Display file or filesystem status", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "dirname", rule: { id: "dirname", description: "Strip last component from file name", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "basename", rule: { id: "basename", description: "Strip directory and suffix from filenames", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },
  { cmd: "realpath", rule: { id: "realpath", description: "Print resolved absolute file path", plan: "allow", build: "allow", category: "read-only", severity: "safe" } },

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

const PATTERNS: PatDef[] = [
  { match: (s) => /\$\(/.test(s) || /`[^`]+`/.test(s),
    rule: { id: "command-substitution", description: "Command substitution or backtick", plan: "block", build: "block", category: "remote-exec", severity: "critical" } },
  { match: (s) => /[^>]>[^>]/.test(s) && !/\d*>&[12-]/.test(s),
    rule: { id: "redirect-overwrite", description: "Write to file via shell redirect", plan: "block", build: "ask", category: "shell-write", severity: "dangerous",
      extractPath: (c) => { const m = c.match(/(?:echo|cat|printf|printenv|env)\s+.*?\s*>\s*(\S+)/i); return m ? m[1] : null; } } },
  { match: (s) => />>/.test(s),
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

const byCmd = new Map<string, CmdDef[]>();
for (const d of CMDS) {
  const list = byCmd.get(d.cmd) || [];
  list.push(d);
  byCmd.set(d.cmd, list);
}

// ─── Public API ───

/** Find rule by id (for testing). */
export function findRuleById(id: string): CommandRule | null {
  for (const d of CMDS) { if (d.rule.id === id) return d.rule; }
  for (const p of PATTERNS) { if (p.rule.id === id) return p.rule; }
  for (const p of FULL_COMMAND_PATTERNS) { if (p.rule.id === id) return p.rule; }
  return null;
}

/** Get all rules for iteration (testing). */
export function getAllRules(): CommandRule[] {
  const rules: CommandRule[] = [];
  for (const d of CMDS) rules.push(d.rule);
  for (const p of PATTERNS) rules.push(p.rule);
  for (const p of FULL_COMMAND_PATTERNS) rules.push(p.rule);
  return rules;
}

/** Find the most severe rule matching a segment. */
export function findRule(segment: string): CommandRule | null {
  // Patterns first (highest priority)
  for (const p of PATTERNS) {
    if (p.match(segment)) return p.rule;
  }

  // Command-based lookup
  const cmd = cmdName(segment);
  if (cmd && byCmd.has(cmd)) {
    let best: CommandRule | null = null;
    for (const d of byCmd.get(cmd)!) {
      if (d.sub) {
        const idx = segment.toLowerCase().indexOf(d.cmd);
        const rest = idx >= 0 ? segment.slice(idx + d.cmd.length).trim() : "";
        if (!d.sub.test(rest)) continue;
      }
      const r = d.rule;
      if (!best || PRIORITY[r.category] > PRIORITY[best.category]) {
        best = r;
      }
    }
    if (best) return best;
  }

  return null;
}

/** Split compound command on && || ; |, quote-aware. */
export function splitCommand(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let inSingle = false, inDouble = false, escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === "\\" && !inSingle) { escaped = true; current += ch; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; current += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; current += ch; continue; }
    if (!inSingle && !inDouble) {
      const next = command[i + 1] || "";
      if (ch + next === "&&" || ch + next === "||") {
        if (current.trim()) segments.push(current.trim());
        current = ""; i++; continue;
      }
      if (ch === ";" || ch === "|" || ch === "&") {
        if (current.trim()) segments.push(current.trim());
        current = ""; continue;
      }
    }
    current += ch;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

/** Skip pure-output commands in compound segments. */
export function isSkippableOutput(segment: string): boolean {
  return /^(echo|cat|printf)\s+[^>]/.test(segment) && !/[>]/.test(segment);
}
