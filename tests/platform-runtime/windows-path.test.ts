import assert from "node:assert/strict";
import test from "node:test";
import {
  createWindowsPathSession,
  isControlledWindowsSecurityDescriptor,
  isPlatformPathProof,
  matchRootRelations,
  projectPathAuthorization,
  validateWindowsPathSyntax,
  WINDOWS_SYSTEM_SID,
  FILE_ALL_ACCESS,
} from "../../packages/platform-runtime/src";
import { createPlatformValueIssuer } from "../../packages/platform-runtime/src/internal/sealed-values";

test("validateWindowsPathSyntax strictly enforces the closed v1 rejection matrix", () => {
  // 1. UNC rejection
  assert.equal(validateWindowsPathSyntax("\\\\server\\share\\file.txt").ok, false);
  assert.equal(validateWindowsPathSyntax("//server/share/file.txt").ok, false);

  // 2. Namespace and device rejection
  assert.equal(validateWindowsPathSyntax("\\\\?\\C:\\file.txt").ok, false);
  assert.equal(validateWindowsPathSyntax("\\\\.\\NUL").ok, false);

  // 3. Drive-relative rejection
  assert.equal(validateWindowsPathSyntax("C:relative.txt").ok, false);
  assert.equal(validateWindowsPathSyntax("D:file").ok, false);

  // 4. Rooted-without-drive rejection
  assert.equal(validateWindowsPathSyntax("\\Windows\\System32").ok, false);
  assert.equal(validateWindowsPathSyntax("/unix/style/root").ok, false);

  // 5. Alternate data streams (ADS) rejection
  assert.equal(validateWindowsPathSyntax("C:\\file.txt:stream").ok, false);
  assert.equal(validateWindowsPathSyntax("relative.txt:hidden").ok, false);
  assert.equal(validateWindowsPathSyntax("C:\\file.txt:$DATA").ok, false);

  // 6. Reserved device names rejection
  assert.equal(validateWindowsPathSyntax("CON").ok, false);
  assert.equal(validateWindowsPathSyntax("C:\\dir\\PRN.txt").ok, false);
  assert.equal(validateWindowsPathSyntax("COM1").ok, false);
  assert.equal(validateWindowsPathSyntax("C:\\workspace\\nul").ok, false);

  // 7. Trailing dot or space rejection
  assert.equal(validateWindowsPathSyntax("C:\\workspace\\trailing. ").ok, false);
  assert.equal(validateWindowsPathSyntax("C:\\workspace\\trailing.").ok, false);
  assert.equal(validateWindowsPathSyntax("file.txt ").ok, false);

  // 8. Forbidden characters rejection
  assert.equal(validateWindowsPathSyntax("C:\\workspace\\bad*char").ok, false);
  assert.equal(validateWindowsPathSyntax("C:\\workspace\\bad?char").ok, false);
  assert.equal(validateWindowsPathSyntax("C:\\workspace\\bad\"char").ok, false);
  assert.equal(validateWindowsPathSyntax("C:\\workspace\\bad<char").ok, false);
  assert.equal(validateWindowsPathSyntax("C:\\workspace\\bad|char").ok, false);

  // 9. Valid relative and drive-absolute forms
  assert.equal(validateWindowsPathSyntax("src/index.ts").ok, true);
  assert.equal(validateWindowsPathSyntax("src\\index.ts").ok, true);
  assert.equal(validateWindowsPathSyntax("C:\\workspace\\src\\index.ts").ok, true);
  assert.equal(validateWindowsPathSyntax("c:/workspace/src/index.ts").ok, true);
});

test("Windows path session normalizes separators, resolves relative paths, and matches RootCatalog relations", async () => {
  const session = createWindowsPathSession({
    purpose: "access-gate",
    cwd: "c:/workspace/project",
  });

  assert.equal(session.workspace.canonicalDisplay, "C:\\workspace\\project");
  assert.equal(session.domain.platform, "windows");

  const catalog = session.compileCatalogSync([
    "C:\\workspace\\project",
    "c:/workspace/project/blocked",
    "C:\\credentials",
  ]);

  // 1. Resolve relative path with forward slashes
  const relResult = await session.path.resolve({
    workspace: session.workspace,
    catalog,
    base: session.workspace,
    literal: "src/file.ts",
    kind: "literal",
  });

  assert.equal(relResult.kind, "resolved");
  if (relResult.kind !== "resolved") return;
  assert.equal(isPlatformPathProof(relResult.proof), true);

  const view = projectPathAuthorization(relResult.proof);
  assert.ok(view);
  assert.equal(view.canonicalDisplay, "C:\\workspace\\project\\src\\file.ts");

  // Verify case-insensitive match against root 0 (workspace)
  const matched = matchRootRelations(view, new Set([catalog.roots[0]!]));
  assert.equal(matched.has("descendant"), true);
  assert.equal(matched.has("traversed"), true);
  assert.equal(matched.has("equal"), false);

  // 2. Resolve drive-absolute with mixed case
  const absResult = await session.path.resolve({
    workspace: session.workspace,
    catalog,
    base: session.workspace,
    literal: "C:/WORKSPACE/PROJECT/BLOCKED/secret.txt",
    kind: "literal",
  });
  assert.equal(absResult.kind, "resolved");
  if (absResult.kind === "resolved") {
    const absView = projectPathAuthorization(absResult.proof)!;
    assert.equal(absView.canonicalDisplay.toLowerCase(), "c:\\workspace\\project\\blocked\\secret.txt");
    const blockedRelations = matchRootRelations(absView, new Set([catalog.roots[1]!]));
    assert.equal(blockedRelations.has("descendant"), true);
  }

  // 3. Ancestor relation: search on parent directory of credentials
  const ancestorResult = await session.path.resolve({
    workspace: session.workspace,
    catalog,
    base: session.workspace,
    literal: "C:\\",
    kind: "literal",
  });
  assert.equal(ancestorResult.kind, "resolved");
  if (ancestorResult.kind === "resolved") {
    const ancestorView = projectPathAuthorization(ancestorResult.proof)!;
    const credRelations = matchRootRelations(ancestorView, new Set([catalog.roots[2]!]));
    assert.equal(credRelations.has("ancestor"), true);
  }

  // 4. Stamping and revalidation
  const stamp = session.path.stampWorkspace(session.workspace);
  assert.equal(stamp.platform, "windows");
  assert.equal(stamp.canonicalDisplay, "C:\\workspace\\project");
  const revalidated = await session.path.revalidateWorkspace(stamp);
  assert.ok(revalidated);
  assert.equal(revalidated.canonicalDisplay, "C:\\workspace\\project");

  await session.close();
  await assert.rejects(() => session.path.resolve({
    workspace: session.workspace,
    catalog,
    base: session.workspace,
    literal: "src/file.ts",
    kind: "literal",
  }), /closed/u);
});

test("Windows path proofs cannot cross into Linux domain", () => {
  const session = createWindowsPathSession({ purpose: "access-gate", cwd: "C:\\workspace" });
  const linuxIssuer = createPlatformValueIssuer("linux");

  assert.equal(linuxIssuer.readWorkspace(session.workspace), undefined);
  assert.throws(
    () => linuxIssuer.issueRuntimeRoot("session-envelope", session.workspace, {} as never),
    /invalid runtime root evidence/u,
  );
});

test("isControlledWindowsSecurityDescriptor strictly validates closed protected DACL template", () => {
  const userSid = "S-1-5-21-123456789-1001";
  const valid = {
    ownerSid: userSid,
    isDaclProtected: true,
    isReparsePoint: false,
    aces: [
      { sid: userSid, mask: FILE_ALL_ACCESS, type: "access-allowed" as const, isInherited: false },
      { sid: WINDOWS_SYSTEM_SID, mask: FILE_ALL_ACCESS, type: "access-allowed" as const, isInherited: false },
    ],
  };
  assert.equal(isControlledWindowsSecurityDescriptor(valid, userSid), true);

  // Reparse root is rejected
  assert.equal(isControlledWindowsSecurityDescriptor({ ...valid, isReparsePoint: true }, userSid), false);

  // Unprotected DACL (inheritance enabled) is rejected
  assert.equal(isControlledWindowsSecurityDescriptor({ ...valid, isDaclProtected: false }, userSid), false);

  // Owner mismatch is rejected
  assert.equal(isControlledWindowsSecurityDescriptor({ ...valid, ownerSid: "S-1-5-21-999" }, userSid), false);

  // Extra identity (e.g. Everyone or Guests) is rejected fail-closed
  assert.equal(isControlledWindowsSecurityDescriptor({
    ...valid,
    aces: [
      ...valid.aces,
      { sid: "S-1-1-0", mask: FILE_ALL_ACCESS, type: "access-allowed" as const, isInherited: false },
    ],
  }, userSid), false);

  // Inherited ACE is rejected
  assert.equal(isControlledWindowsSecurityDescriptor({
    ...valid,
    aces: [
      { sid: userSid, mask: FILE_ALL_ACCESS, type: "access-allowed" as const, isInherited: true },
      { sid: WINDOWS_SYSTEM_SID, mask: FILE_ALL_ACCESS, type: "access-allowed" as const, isInherited: false },
    ],
  }, userSid), false);
});
