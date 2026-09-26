import assert from "node:assert/strict";
import test from "node:test";
import {
  compileManagedCall,
  createCompileEnvironment,
} from "../../packages/access-gate/src/access-gate/access-decision/core/compilation";
import {
  authorizeAdmission,
  createMandatoryBoundaries,
  freezeUnifiedPolicySnapshot,
  projectUnifiedAdmission,
} from "../../packages/access-gate/src/access-gate/access-decision/core/authorization";
import {
  createPowerShellExecutor,
  freezeVerifiedPowerShellExecutable,
} from "../../packages/access-gate/src/access-gate/windows";
import { issuePowerShellExecutionTicket } from "../../packages/access-gate/src/access-gate/windows/ticket";

function mockEnvironment(cwd = "C:\\workspace") {
  return createCompileEnvironment({
    cwd,
    pathEvidence: {
      resolve(base: string, path: string) {
        const candidate = path.startsWith("C:\\") || path.startsWith("/") ? path : `${base}\\${path}`;
        return {
          candidate,
          traversed: [candidate],
        };
      },
    },
  });
}

test("PowerShell compilation strictly rejects v1 unproved syntax fail-closed", () => {
  const env = mockEnvironment();

  for (const badCommand of [
    "Get-Process | Out-Null",
    "npm.cmd test > out.txt",
    "git.exe status; git.exe add .",
    "git.exe status && git.exe add .",
    "$x = 1; Get-ChildItem",
    "Get-ChildItem $(pwd)",
    "Get-ChildItem `n dir",
    "& 'C:\\app.exe'",
    "{ Get-ChildItem }",
    "node.exe app.js 2>&1",
    "Get-ChildItem 'src", // unclosed quote
  ]) {
    const result = compileManagedCall({ surface: "powershell", arguments: { command: badCommand } }, env);
    assert.equal("kind" in result && result.kind === "reject", true, `expected rejection for: ${badCommand}`);
    if ("kind" in result && result.kind === "reject") {
      assert.equal(result.code, "unsupported-syntax");
    }
  }
});

test("PowerShell compilation accurately extracts commands, effects, and paths for admitted forms", () => {
  const env = mockEnvironment("C:\\workspace");
  const mandatory = createMandatoryBoundaries({ credentialRoots: ["C:\\credentials"] });
  const developPolicy = freezeUnifiedPolicySnapshot({
    paths: {
      read: "allow", write: "allow", edit: "allow", list: "allow", search: "allow",
      allowedRoots: ["C:\\workspace"], blockedRoots: [], blockedPaths: [],
    },
    commands: {
      inspect: "allow", modify: "allow", execute: "allow", opaque: "allow", destroy: "deny", unknown: "allow",
    },
  });

  // 1. Filesystem inspection cmdlet: Get-ChildItem
  const gciComp = compileManagedCall({
    surface: "powershell",
    arguments: { command: "Get-ChildItem -LiteralPath 'src' -Recurse" },
  }, env);
  assert.equal("kind" in gciComp, false);
  assert.deepEqual(authorizeAdmission(projectUnifiedAdmission(gciComp)!, mandatory, developPolicy), { kind: "allow" });

  // 2. Git mutating command: git add
  const gitAddComp = compileManagedCall({
    surface: "powershell",
    arguments: { command: "git.exe add 'file.txt'" },
  }, env);
  assert.equal("kind" in gitAddComp, false);
  assert.deepEqual(authorizeAdmission(projectUnifiedAdmission(gitAddComp)!, mandatory, developPolicy), { kind: "allow" });

  // 3. Git destructive clean command: git clean -> hard-boundary
  const gitCleanComp = compileManagedCall({
    surface: "powershell",
    arguments: { command: "git.exe clean" },
  }, env);
  assert.equal("kind" in gitCleanComp, false);
  assert.deepEqual(authorizeAdmission(projectUnifiedAdmission(gitCleanComp)!, mandatory, developPolicy), { kind: "deny", code: "hard-boundary" });

  // 4. Node script execution: node app.js
  const nodeComp = compileManagedCall({
    surface: "powershell",
    arguments: { command: "node.exe 'app.js'" },
  }, env);
  assert.equal("kind" in nodeComp, false);
  assert.deepEqual(authorizeAdmission(projectUnifiedAdmission(nodeComp)!, mandatory, developPolicy), { kind: "allow" });

  // 5. Destructive cmdlet Remove-Item -> hard-boundary
  const rmComp = compileManagedCall({
    surface: "powershell",
    arguments: { command: "Remove-Item 'file.txt'" },
  }, env);
  assert.equal("kind" in rmComp, false);
  assert.deepEqual(authorizeAdmission(projectUnifiedAdmission(rmComp)!, mandatory, developPolicy), { kind: "deny", code: "hard-boundary" });
});

test("PowerShell compilation seamlessly connects to authorization kernel", () => {
  const env = mockEnvironment("C:\\workspace");
  const mandatory = createMandatoryBoundaries({
    credentialRoots: ["C:\\credentials"],
  });
  const reviewPolicy = freezeUnifiedPolicySnapshot({
    paths: {
      read: "allow",
      write: "deny",
      edit: "deny",
      list: "allow",
      search: "allow",
      allowedRoots: ["C:\\workspace"],
      blockedRoots: [],
      blockedPaths: [],
    },
    commands: {
      inspect: "allow",
      modify: "deny",
      execute: "deny",
      opaque: "deny",
      destroy: "deny",
      unknown: "deny",
    },
  });

  // Get-ChildItem allowed under review
  const gciComp = compileManagedCall({ surface: "powershell", arguments: { command: "Get-ChildItem -LiteralPath 'src'" } }, env);
  const gciVerdict = authorizeAdmission(projectUnifiedAdmission(gciComp)!, mandatory, reviewPolicy);
  assert.deepEqual(gciVerdict, { kind: "allow" });

  // git add is modify -> denied under review policy
  const gitAddComp = compileManagedCall({ surface: "powershell", arguments: { command: "git.exe add 'file.txt'" } }, env);
  const gitAddVerdict = authorizeAdmission(projectUnifiedAdmission(gitAddComp)!, mandatory, reviewPolicy);
  assert.deepEqual(gitAddVerdict, { kind: "deny", code: "policy-denied" });

  // Remove-Item is destroy -> hard-boundary
  const rmComp = compileManagedCall({ surface: "powershell", arguments: { command: "Remove-Item 'file.txt'" } }, env);
  const rmVerdict = authorizeAdmission(projectUnifiedAdmission(rmComp)!, mandatory, reviewPolicy);
  assert.deepEqual(rmVerdict, { kind: "deny", code: "hard-boundary" });
});

test("Approved PowerShell execution issues single-use ticket and executes with verified executor", async () => {
  const verified = freezeVerifiedPowerShellExecutable("C:\\Program Files\\PowerShell\\7\\pwsh.exe", {
    edition: "Core",
    major: 7,
    minor: 4,
    languageMode: "FullLanguage",
    processPath: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    argumentPassing: "Standard",
  });

  const executedScripts: string[] = [];
  const executor = createPowerShellExecutor(verified, "$trusted = $true", async (_executable, script) => {
    executedScripts.push(script);
    return { exitCode: 0, output: "simulated-ok", truncated: false };
  });

  const env = mockEnvironment("C:\\workspace");
  const developPolicy = freezeUnifiedPolicySnapshot({
    paths: {
      read: "allow", write: "allow", edit: "allow", list: "allow", search: "allow",
      allowedRoots: ["C:\\workspace"], blockedRoots: [], blockedPaths: [],
    },
    commands: {
      inspect: "allow", modify: "allow", execute: "allow", opaque: "allow", destroy: "deny", unknown: "allow",
    },
  });
  const mandatory = createMandatoryBoundaries({ credentialRoots: ["C:\\credentials"] });

  // 1. Approved command: issue ticket and execute
  const command = "git.exe status";
  const comp = compileManagedCall({ surface: "powershell", arguments: { command } }, env);
  const verdict = authorizeAdmission(projectUnifiedAdmission(comp)!, mandatory, developPolicy);
  assert.deepEqual(verdict, { kind: "allow" });

  const ticket = issuePowerShellExecutionTicket({
    toolCallId: "approved-call-1",
    command,
    cwd: "C:\\workspace",
    workspaceIdentity: "C:\\workspace",
    lifecycleGeneration: 1,
  });

  const runResult = await executor.execute(ticket, {
    toolCallId: "approved-call-1",
    command,
    lifecycleGeneration: 1,
  });
  assert.equal(runResult.exitCode, 0);
  assert.equal(executedScripts.length, 1);
  assert.match(executedScripts[0]!, /^\$trusted = \$true;git\.exe status/u);

  // 2. Replay fails closed
  await assert.rejects(
    () => executor.execute(ticket, { toolCallId: "approved-call-1", command, lifecycleGeneration: 1 }),
    /missing, replayed, or mismatched/u,
  );
});
