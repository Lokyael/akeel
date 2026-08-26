// D-056 / C1: decision/expansion-view —— 归约展示数据查询（坐标映射 + 去重组键）
// 单测聚焦三个语义：expanded 段命令级映射（迭代拷贝同 original、不同命令异 original）、
// verbatim 段线性位移（骨架删除量由段自身差吸收）、未命中恒等。另附真实管线集成用例。

import assert from "node:assert/strict";
import test from "node:test";
import { lex } from "../../../src/access-gate/shell-parse/lexer";
import { parse } from "../../../src/access-gate/shell-parse/parser";
import { verifyLoopScope } from "../../../src/access-gate/command-semantics/loop";
import { reduceToFlat } from "../../../src/access-gate/command-semantics/reduce";
import { mapOriginal, originalGroupKey } from "../../../src/access-gate/gate/decision/expansion-view";
import type { ExpansionData, ExpansionSegment } from "../../../src/access-gate/gate/plan";

function seg(kind: ExpansionSegment["kind"], rStart: number, rEnd: number, oStart: number, oEnd: number): ExpansionSegment {
  return { kind, reduced: { start: rStart, end: rEnd }, original: { start: oStart, end: oEnd } };
}

// 模拟 `cmd1; for f in a b; do touch "$f" && touch x; done; cmd2` 的段结构：
// verbatim(cmd1) → 迭代0: touch-a + touch-x → 迭代1(tile 含 "; " 前缀) → verbatim(cmd2, 尾部位移)。
function sampleExpansion(): ExpansionData {
  return {
    expandedText: "touch \"a\" && touch x; touch \"b\" && touch x",
    segments: [
      seg("verbatim", 0, 5, 0, 5), // cmd1 原样
      seg("expanded", 5, 19, 8, 22), // 迭代0 touch "$f"（原始 span 命令级）
      seg("expanded", 19, 27, 23, 30), // 迭代0 touch x
      seg("expanded", 27, 43, 8, 22), // 迭代1 touch "$f"（同 original —— 去重组键）
      seg("expanded", 43, 51, 23, 30), // 迭代1 touch x
      seg("verbatim", 51, 56, 80, 85), // cmd2：尾部位移 -29
    ],
  };
}

test("expansion-view: 迭代拷贝同 original 映射（命令级展开段）", () => {
  const ex = sampleExpansion();
  assert.deepEqual(mapOriginal(ex, { start: 5, end: 18 }), { start: 8, end: 22 });
  assert.deepEqual(mapOriginal(ex, { start: 27, end: 42 }), { start: 8, end: 22 }, "迭代1 同命令同 original");
  assert.deepEqual(mapOriginal(ex, { start: 19, end: 26 }), { start: 23, end: 30 }, "body 内不同命令异 original");
});

test("expansion-view: verbatim 段线性位移（骨架删除量由段自身差吸收）", () => {
  const ex = sampleExpansion();
  // cmd2 在归约文本 51..56，原始文本 80..85：段内 offset 恒定，无需累计骨架推导
  assert.deepEqual(mapOriginal(ex, { start: 51, end: 55 }), { start: 80, end: 84 });
  assert.deepEqual(mapOriginal(ex, { start: 1, end: 4 }), { start: 1, end: 4 }, "前段 verbatim offset 0");
});

test("expansion-view: 未命中恒等（防御路径）", () => {
  const ex = sampleExpansion();
  assert.deepEqual(mapOriginal(ex, { start: 99, end: 100 }), { start: 99, end: 100 });
});

test("expansion-view: 去重组键——迭代拷贝同键、不同命令异键", () => {
  const ex = sampleExpansion();
  const it0Copy = originalGroupKey(ex, { start: 5, end: 18 });
  const it1Copy = originalGroupKey(ex, { start: 27, end: 42 });
  const otherCmd = originalGroupKey(ex, { start: 19, end: 26 });
  assert.equal(it0Copy, it1Copy, "同命令迭代拷贝同键 → 渲染折叠");
  assert.notEqual(it0Copy, otherCmd, "不同 body 命令异键 → 不折叠");
});

test("expansion-view: 真实管线产出命令级段（集成：echo x && echo y 两条命令）", () => {
  const cmd = "for f in a b; do echo x && echo y; done";
  const { program } = parse(lex(cmd).tokens);
  const pairs = program.loopScopes.map((s) => {
    const r = verifyLoopScope(s, { maxCommands: 100_000 });
    assert.ok(r);
    return { scope: s, values: r!.wordValues };
  });
  const reduced = reduceToFlat(cmd, program.loopScopes, pairs);
  assert.ok(reduced);
  const expansion: ExpansionData = {
    segments: reduced!.segments.map((s) => ({ kind: s.kind, reduced: s.spanInReduced, original: s.originalSpan })),
    expandedText: reduced!.expandedText,
  };
  const expanded = expansion.segments.filter((s) => s.kind === "expanded");
  assert.equal(expanded.length, 4, "2 迭代 × 2 命令 = 4 条命令级段");
  // 按 original 分组：body 两条命令 → 2 组，每组 2 条迭代拷贝；映射精确命令级
  const groups = new Map<string, ExpansionSegment[]>();
  for (const s of expanded) {
    const key = `${s.original.start}:${s.original.end}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  assert.equal(groups.size, 2, "body 内两条不同命令 → 异 original 分组");
  const keys = [...groups.keys()];
  assert.notEqual(keys[0], keys[1], "组键互异（渲染不折叠）");
  for (const group of groups.values()) {
    assert.equal(group.length, 2, "同命令两迭代拷贝同键");
    for (const s of group) {
      assert.deepEqual(mapOriginal(expansion, s.reduced), s.original, "映射命中命令级 original");
    }
  }
  assert.equal(expansion.expandedText, "echo x && echo y; echo x && echo y");
});