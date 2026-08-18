// domain 类语义模型测试（A + F 证明侧锁定）
// COMMAND_CLASS_EFFECTS / EFFECT_AXIS / WRITE_SIDE_EFFECTS 的结构完整性：
// 三形态契约之外的派生映射表是封闭世界的语义资产，结构被破坏 = 编译错或本测试红。

import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMAND_CLASS_EFFECTS,
  COMMAND_CLASS_VALUES,
  EFFECT_AXIS,
  EFFECT_VALUES,
  WRITE_SIDE_EFFECTS,
  type EffectRequirement,
} from "../../src/access-gate/domain";

test("effect axis covers every effect", () => {
  for (const effect of EFFECT_VALUES) {
    assert.ok(EFFECT_AXIS[effect] === "path" || EFFECT_AXIS[effect] === "shell", `missing axis for ${effect}`);
  }
});

test("write-side effects are all on the path axis (D-017 写侧守恒)", () => {
  for (const effect of WRITE_SIDE_EFFECTS) {
    assert.equal(EFFECT_AXIS[effect], "path", `write-side ${effect} must be path axis`);
  }
});

test("every command class has a model entry with valid defaults/requires", () => {
  for (const cls of COMMAND_CLASS_VALUES) {
    const model = COMMAND_CLASS_EFFECTS[cls];
    assert.ok(model, `missing model for ${cls}`);
    for (const effect of model.defaults) {
      assert.ok(EFFECT_VALUES.includes(effect), `${cls}.defaults has unknown effect ${effect}`);
    }
    const requirements: readonly EffectRequirement[] = model.requires;
    assert.ok(Array.isArray(requirements), `${cls}.requires must be an array`);
  }
});

test("requires 语义不变量：destroy/execute 必须带 execute，modify 必须带 write-side（F 证明侧前提）", () => {
  assert.ok(COMMAND_CLASS_EFFECTS.destroy.requires.includes("execute"));
  assert.ok(COMMAND_CLASS_EFFECTS.execute.requires.includes("execute"));
  assert.ok(COMMAND_CLASS_EFFECTS.modify.requires.includes("write-side"));
  assert.equal(COMMAND_CLASS_EFFECTS.inspect.requires.length, 0);
  assert.equal(COMMAND_CLASS_EFFECTS.unknown.requires.length, 0);
});

test("defaults 语义不变量：inspect→read，modify/execute/destroy 各自基础面，unknown 无", () => {
  assert.deepEqual(COMMAND_CLASS_EFFECTS.inspect.defaults, ["read"]);
  assert.deepEqual(COMMAND_CLASS_EFFECTS.modify.defaults, ["write"]);
  assert.deepEqual(COMMAND_CLASS_EFFECTS.execute.defaults, ["execute"]);
  assert.deepEqual(COMMAND_CLASS_EFFECTS.destroy.defaults, ["execute"]);
  assert.deepEqual(COMMAND_CLASS_EFFECTS.unknown.defaults, []);
});
