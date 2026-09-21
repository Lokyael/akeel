import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";

type PackageManifest = Readonly<{
  readonly name: string;
  readonly pi?: Readonly<{
    readonly extensions?: readonly string[];
    readonly skills?: readonly string[];
  }>;
}>;

type ArchiveFile = Readonly<{ readonly path: string }>;

type ArchiveResult = Readonly<{
  readonly id: string;
  readonly files: readonly ArchiveFile[];
}>;

const root = resolve(import.meta.dirname!, "..");
const packageRoots = ["packages/guidance", "packages/access-gate", "packages/context-pruner"] as const;
const FORBIDDEN_ARCHIVE_PATH = /(?:^|\/)node_modules(?:\/|$)|(?:^|\/)tests(?:\/|$)|(?:^|\/)(?:package-lock|npm-shrinkwrap)\.json$|\.test\.[cm]?[jt]sx?$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function npmInvocation(args: readonly string[], cwd: string): { readonly command: string; readonly args: readonly string[]; readonly cwd: string } {
  return process.env.npm_execpath
    ? { command: process.execPath, args: [process.env.npm_execpath, ...args], cwd }
    : { command: "npm", args, cwd };
}

function runNpm(args: readonly string[], cwd: string): string {
  const invocation = npmInvocation(args, cwd);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`npm ${args[0]} failed in ${cwd}\n${result.stderr.trim()}`);
  }
  return result.stdout;
}

function readPackageManifest(packageRoot: string): PackageManifest {
  const value: unknown = JSON.parse(readFileSync(join(root, packageRoot, "package.json"), "utf8"));
  if (!isRecord(value) || typeof value.name !== "string") {
    throw new Error(`${packageRoot}: invalid package manifest`);
  }
  return value as PackageManifest;
}

function readArchiveResult(packageRoot: string): ArchiveResult {
  const npmArgs = ["pack", "--dry-run", "--json", "--workspace", packageRoot];
  let parsed: unknown;
  try {
    parsed = JSON.parse(runNpm(npmArgs, root));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${packageRoot}: npm pack returned invalid JSON`);
    throw error;
  }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !isRecord(parsed[0]) || !Array.isArray(parsed[0].files)) {
    throw new Error(`${packageRoot}: unexpected npm pack result`);
  }

  const files = parsed[0].files.filter(isRecord).map((file) => {
    if (typeof file.path !== "string") throw new Error(`${packageRoot}: archive entry has no path`);
    return { path: file.path };
  });
  return { id: typeof parsed[0].id === "string" ? parsed[0].id : packageRoot, files };
}

function assertArchive(packageRoot: string): void {
  const manifest = readPackageManifest(packageRoot);
  const archive = readArchiveResult(packageRoot);
  const paths = new Set(archive.files.map((file) => file.path));

  for (const required of ["package.json", "LICENSE"]) {
    if (!paths.has(required)) throw new Error(`${packageRoot}: archive is missing ${required}`);
  }

  const resources = [...(manifest.pi?.extensions ?? []), ...(manifest.pi?.skills ?? [])];
  for (const resource of resources) {
    const normalized = resource.replace(/^\.\//u, "");
    if (!archive.files.some((file) => file.path === normalized || file.path.startsWith(`${normalized}/`))) {
      throw new Error(`${packageRoot}: archive is missing declared resource ${resource}`);
    }
  }

  const forbidden = archive.files.map((file) => file.path).filter((path) => FORBIDDEN_ARCHIVE_PATH.test(path));
  if (forbidden.length > 0) {
    throw new Error(`${packageRoot}: forbidden archive entries: ${forbidden.join(", ")}`);
  }

  console.log(`${archive.id}: ${archive.files.length} archive entries`);
}

function archiveFile(packageRoot: string, destination: string): string {
  const output = runNpm(["pack", "--json", "--workspace", packageRoot, "--pack-destination", destination], root);
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(`${packageRoot}: npm pack returned invalid archive JSON`);
  }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !isRecord(parsed[0]) || typeof parsed[0].filename !== "string") {
    throw new Error(`${packageRoot}: npm pack did not return an archive filename`);
  }
  return join(destination, parsed[0].filename);
}

function stageHostDependencies(installRoot: string): void {
  const hostRoot = join(installRoot, "node_modules", "@earendil-works");
  mkdirSync(hostRoot, { recursive: true });
  for (const [name, source] of [
    ["pi-coding-agent", join(root, "node_modules", "@earendil-works", "pi-coding-agent")],
    ["typebox", join(root, "node_modules", "typebox")],
  ] as const) {
    const target = name === "typebox" ? join(installRoot, "node_modules", name) : join(hostRoot, name);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    symlinkSync(source, target, "junction");
  }
}

async function assertInstalledPackage(packageRoot: string): Promise<void> {
  const packageTemp = mkdtempSync(join(tmpdir(), "akeel-package-archive-"));
  const archiveTemp = join(packageTemp, "archives");
  const installRoot = join(packageTemp, "install");
  mkdirSync(archiveTemp, { recursive: true, mode: 0o700 });
  mkdirSync(installRoot, { recursive: true, mode: 0o700 });
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(packageTemp, "agent");

  try {
    const archive = archiveFile(packageRoot, archiveTemp);
    runNpm(["install", "--ignore-scripts", "--omit=dev", "--legacy-peer-deps", "--prefix", installRoot, archive], root);
    stageHostDependencies(installRoot);

    const manifest = readPackageManifest(packageRoot);
    const installedRoot = join(installRoot, "node_modules", manifest.name);
    const extensionPaths = (manifest.pi?.extensions ?? []).map((path) => join(installedRoot, path.replace(/^\.\//u, "")));
    const result = await discoverAndLoadExtensions(extensionPaths, installRoot, process.env.PI_CODING_AGENT_DIR);
    if (result.errors.length > 0) {
      throw new Error(`${packageRoot}: installed package loader errors: ${result.errors.map((error) => error.error).join("; ")}`);
    }
    console.log(`${manifest.name}: installed and loaded ${result.extensions.length} extensions`);
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(packageTemp, { recursive: true, force: true });
  }
}

for (const packageRoot of packageRoots) assertArchive(packageRoot);
for (const packageRoot of packageRoots) await assertInstalledPackage(packageRoot);
