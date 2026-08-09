// access-gate/agent-dir.ts — 用户 agent 目录解析唯一来源（T-046 R8）
// profile 加载与命令覆盖层共用；PI_CODING_AGENT_DIR 环境变量优先，默认 ~/.pi/agent。

import { homedir } from "node:os";
import { join } from "node:path";

export function getAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}
