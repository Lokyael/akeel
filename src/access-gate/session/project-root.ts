// session/project-root.ts — 项目根发现（fs 路径行走）
// 与 profile-state（会话状态）分离（H3）：文件内聚其名。

import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

export function findProjectRoot(cwd: string): string {
  // cwd 可能在会话中被删除（session_start 竞态）——回退到字面 cwd，不让启动崩溃
  let current: string;
  try {
    current = realpathSync(cwd);
  } catch {
    return cwd;
  }
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}
