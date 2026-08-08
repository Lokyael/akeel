/**
 * validate-docs.ts — Next-ID slots 不变量结构校验
 *
 * 断言每个记录容器（docs/candidates.md、docs/task.md、docs/decisions.md）：
 *   1. 恰有一个占位槽位行 `## X-0NN: 待创建`
 *   2. 槽位是文件最后非空行（记录只能出现在槽位之前）
 *   3. 槽位前缀字母与容器匹配（C→candidates、T→task、D→decisions）
 *
 * 只做结构性校验，不做编号 vs Git 历史的比对——编号可被合法重编号
 * （如 2026-08-08 的 T-046→T-042 迭代编号回收），历史比对会对合法操作误报。
 * 编号正确性由消费式占位结构（填充即消费）+ 记录纪律保障。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONTAINERS: ReadonlyArray<{ file: string; prefix: "C" | "T" | "D" }> = [
  { file: "docs/candidates.md", prefix: "C" },
  { file: "docs/task.md", prefix: "T" },
  { file: "docs/decisions.md", prefix: "D" },
];

const SLOT_RE = /^## ([CTD])-0\d{2,}: 待创建$/;

interface CheckResult {
  ok: boolean;
  errors: string[];
}

function checkContainer(file: string, expectedPrefix: string, content: string): CheckResult {
  const errors: string[] = [];
  const nonEmpty = content
    .split(/\r?\n/)
    .map((line, index) => ({ line, index }))
    .filter((x) => x.line.trim().length > 0);
  const slots = nonEmpty.filter((x) => SLOT_RE.test(x.line));
  const last = nonEmpty[nonEmpty.length - 1];

  if (slots.length !== 1) {
    errors.push(`${file}: expected exactly one slot heading (## X-0NN: 待创建), found ${slots.length}`);
  } else {
    const slot = slots[0]!;
    const prefix = SLOT_RE.exec(slot.line)![1]!;
    if (prefix !== expectedPrefix) {
      errors.push(`${file}: slot prefix ${prefix} does not match container (expected ${expectedPrefix})`);
    }
    if (slot.index !== last.index) {
      errors.push(
        `${file}: slot heading is not the last non-empty line (line ${slot.index + 1}; last non-empty is line ${last.index + 1})`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

// ─── 自检：违规样例必须被拒绝（负向验证，锁规则防回归） ───

function selfCheck(): void {
  const cases: Array<[string, string, "C" | "T" | "D", boolean]> = [
    ["valid", "# Tasks\n\n> header\n\n## T-044: 待创建\n", "T", true],
    ["no-slot", "# Tasks\n\n> header\n", "T", false],
    ["two-slots", "# Tasks\n\n## T-044: 待创建\n\n## T-045: 待创建\n", "T", false],
    ["slot-not-last", "# Tasks\n\n## T-044: 待创建\n\nsomething after\n", "T", false],
    ["wrong-prefix", "# Candidates\n\n## T-008: 待创建\n", "C", false],
  ];
  for (const [name, content, expectedPrefix, expectOk] of cases) {
    const result = checkContainer("docs/task.md", expectedPrefix, content);
    if (result.ok !== expectOk) {
      const detail = result.errors[0] ? ` (${result.errors[0]})` : "";
      console.error(`❌ self-check FAILED: [${name}] expected ok=${expectOk}, got ok=${result.ok}${detail}`);
      process.exit(1);
    }
  }
}

// ─── main ───

function main(): void {
  selfCheck();
  let totalErrors = 0;
  for (const { file, prefix } of CONTAINERS) {
    const content = readFileSync(join(import.meta.dirname!, "..", file), "utf-8");
    const result = checkContainer(file, prefix, content);
    if (result.ok) {
      console.log(`  ✅ ${file} — slot invariant ok`);
    } else {
      for (const e of result.errors) console.log(`  ❌ ${e}`);
      totalErrors += result.errors.length;
    }
  }
  console.log(`\n${CONTAINERS.length} containers checked. ${totalErrors} error(s).`);
  if (totalErrors > 0) {
    console.log("❌ Validation FAILED — fix before committing.");
    process.exit(1);
  }
  console.log("✅ All slot invariants hold.");
}

main();
