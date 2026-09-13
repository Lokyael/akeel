import assert from "node:assert/strict";
import test from "node:test";
import {
  compileDirect,
  compileShell,
  projectDisplay,
  projectShellDisplay,
  type DirectRequest,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/index";

const request: DirectRequest = {
  surface: "write",
  arguments: { path: "notes.md", content: "updated\n" },
  cwd: "/workspace/project",
  hasUI: true,
};

test("a complete Direct compilation projects a minimal immutable Display View", () => {
  const compilation = compileDirect(request);
  const display = projectDisplay(compilation);

  assert.deepEqual(display, {
    kind: "direct",
    operation: "write",
    path: "/workspace/project/notes.md",
  });
  assert.equal(Object.isFrozen(display), true);
});

test("a copied Direct compilation cannot project a Display View", () => {
  const compilation = compileDirect(request);

  assert.equal(projectDisplay({ ...compilation }), undefined);
});

test("a complete Shell compilation projects an immutable Display View", () => {
  const compilation = compileShell({
    surface: "bash",
    arguments: { command: "mkdir generated && cat README.md" },
    cwd: "/workspace/project",
    hasUI: true,
  });
  const display = projectShellDisplay(compilation);

  assert.deepEqual(display, {
    kind: "shell",
    command: "mkdir generated && cat README.md",
    operations: [
      { commandClass: "modify", effects: ["write"] },
      { commandClass: "inspect", effects: ["read"] },
    ],
  });
  assert.equal(Object.isFrozen(display), true);
  assert.equal(Object.isFrozen(display?.operations), true);
});

test("a copied Shell compilation cannot project a Display View", () => {
  const compilation = compileShell({
    surface: "bash",
    arguments: { command: "cat README.md" },
    cwd: "/workspace/project",
    hasUI: true,
  });

  assert.equal(projectShellDisplay({ ...compilation }), undefined);
});
