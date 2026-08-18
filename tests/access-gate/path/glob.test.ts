// path/glob 语言测试（C：globstar 语义修正——* 单段、** 跨段含零段、/** 自身）
// 锁定编译一次、匹配 N 次的契约；含 blocked 全量回归矩阵（侧面证明覆盖面不减）。

import assert from "node:assert/strict";
import test from "node:test";
import { compileGlob, globMatches } from "../../../src/access-gate/path/glob";
import { DEFAULT_BLOCKED_PATHS } from "../../../src/access-gate/path/blocked-paths";

const match = (pattern: string, value: string): boolean => globMatches(compileGlob(pattern), value);

// ─── 单段通配符 `*` 与 `?`（不跨 `/`） ───

test("glob: single-segment star does not cross slash", () => {
  assert.ok(match("project/lib/*.ts", "project/lib/app.ts"));
  assert.ok(match("project/lib/*.ts", "project/lib/x.ts"));
  assert.ok(!match("project/lib/*.ts", "project/lib/sub/app.ts")); // * 不跨段
  assert.ok(match("project/*", "project/docs"));
  assert.ok(!match("project/*", "project/docs/file.ts")); // 单段
});

test("glob: question mark matches single non-slash char", () => {
  assert.ok(match("a?.ts", "ab.ts"));
  assert.ok(!match("a?.ts", "a.ts")); // 需恰一字符
  assert.ok(!match("a?.ts", "a/b.ts")); // ? 不跨段
});

// ─── 转义与大小写 ───

test("glob: regex metachars in pattern are literal", () => {
  assert.ok(match("a.b", "a.b"));
  assert.ok(!match("a.b", "axb")); // 点字面
  assert.ok(match("a+b", "a+b"));
});

test("glob: matching is case-insensitive", () => {
  assert.ok(match("Project/Readme.md", "project/readme.md"));
});

// ─── globstar 开头 `**/x` ───

test("glob: leading globstar matches zero or more segments", () => {
  assert.ok(match("**/id_rsa", "id_rsa")); // 零段
  assert.ok(match("**/id_rsa", "x/id_rsa"));
  assert.ok(match("**/id_rsa", "a/b/id_rsa"));
  assert.ok(!match("**/id_rsa", "a/id_rsa.pub")); // 需精确尾部
});

// ─── globstar 中间 `a/**/b`（含零段） ───

test("glob: middle globstar matches zero or more segments", () => {
  assert.ok(match("project/**/.env", "project/.env")); // 零段（globstar 修正点）
  assert.ok(match("project/**/.env", "project/x/.env"));
  assert.ok(match("project/**/.env", "project/a/b/.env"));
  assert.ok(!match("project/**/.env", "project/x/.env.dist")); // 末尾需 .env
});

// ─── globstar 结尾 `a/**`（匹配自身及其下全部） ───

test("glob: trailing globstar matches self and descendants", () => {
  assert.ok(match("~/.ssh/**", "~/.ssh")); // 自身（prefix 特判）
  assert.ok(match("~/.ssh/**", "~/.ssh/config"));
  assert.ok(match("~/.ssh/**", "~/.ssh/a/b"));
  assert.ok(!match("~/.ssh/**", "~/.sshx")); // 非自身子路径
});

// ─── 绝对路径前导斜杠 ───

test("glob: absolute path keeps leading slash", () => {
  assert.ok(match("/etc/passwd", "/etc/passwd"));
  assert.ok(!match("/etc/passwd", "etc/passwd"));
});

// ─── blocked 全量回归：DEFAULT_BLOCKED_PATHS 每条在 globstar 语义下覆盖不减 ───

test("blocked matrix: representative hits per pattern (coverage not reduced)", () => {
  const representative: ReadonlyArray<[string, string]> = [
    ["project/.git/**", "project/.git/config"],
    ["project/**/.git/**", "project/sub/.git/config"],
    ["project/.env", "project/.env"],
    ["project/.env.*", "project/.env.production"],
    ["project/**/*.env", "project/sub/service.env"],
    ["project/**/*.env.*", "project/sub/service.env.prod"],
    ["project/**/*.pem", "project/certs/key.pem"],
    ["project/**/*.key", "project/certs/key.key"],
    ["project/**/*.pfx", "project/certs/cert.pfx"],
    ["project/**/*.p12", "project/certs/cert.p12"],
    ["project/**/*.ppk", "project/certs/cert.ppk"],
    ["project/**/*.cred", "project/config/aws.cred"],
    ["project/**/*.credentials", "project/config/gcloud.credentials"],
    ["project/.netrc", "project/.netrc"],
    ["project/.npmrc", "project/.npmrc"],
    ["project/.pypirc", "project/.pypirc"],
    ["project/**/.git/config", "project/sub/.git/config"],
    ["~/.ssh/**", "~/.ssh/id_rsa"],
    ["~/.aws/**", "~/.aws/credentials"],
    ["~/.gnupg/**", "~/.gnupg/gpg.conf"],
    ["~/.kube/**", "~/.kube/config"],
    ["~/.docker/config.json", "~/.docker/config.json"],
    ["~/.config/gcloud/**", "~/.config/gcloud/credentials"],
    ["~/.git-credentials", "~/.git-credentials"],
    ["~/.netrc", "~/.netrc"],
    ["~/.pypirc", "~/.pypirc"],
    ["~/.config/gh/**", "~/.config/gh/hosts.yml"],
    ["**/.git-credentials", ".git-credentials"],
    ["**/.git-credentials", "a/.git-credentials"],
    ["**/.netrc", ".netrc"],
    ["**/.pypirc", ".pypirc"],
    ["**/id_rsa*", "id_rsa"],
    ["**/id_ed25519*", "id_ed25519"],
    ["**/id_ecdsa*", "a/b/id_ecdsa"],
    ["**/authorized_keys*", "authorized_keys"],
    ["**/known_hosts*", "known_hosts"],
    ["/etc/passwd", "/etc/passwd"],
    ["/etc/shadow", "/etc/shadow"],
  ];
  for (const [pattern, value] of representative) {
    assert.ok(match(pattern, value), `blocked pattern ${pattern} should hit ${value}`);
  }
  const coveredPatterns = new Set(representative.map(([p]) => p));
  for (const pattern of DEFAULT_BLOCKED_PATHS) {
    assert.ok(coveredPatterns.has(pattern), `blocked pattern ${pattern} missing a representative case`);
  }
});

// ─── 编译制品契约：compileGlob 纯函数，重复编译结果一致（记忆化不改变语义） ───

test("compile + reset keeps matching correct (compile-boundary contract)", () => {
  assert.ok(match("project/**/.env", "project/a/.env"));
  const a = compileGlob("project/**/.env");
  const b = compileGlob("project/**/.env");
  assert.equal(a.regex.source, b.regex.source);
  assert.equal(a.pattern, b.pattern);
});
