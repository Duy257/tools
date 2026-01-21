/* eslint-disable no-console */

const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

function printUsage() {
  console.log(`
Usage:
  node index.js --config ./config.json [--dry-run]

Options:
  --config <path>   Path to config JSON file
  --dry-run         Print commands but do not execute
  -h, --help        Show help
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { configPath: null, dryRun: false, help: false };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--config") {
      out.configPath = args[i + 1] || null;
      i += 1;
      continue;
    }
    if (a === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (a === "-h" || a === "--help") {
      out.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${a}`);
  }

  return out;
}

function isMongoUri(uri) {
  return (
    typeof uri === "string" &&
    (uri.startsWith("mongodb://") || uri.startsWith("mongodb+srv://"))
  );
}

function maskMongoUri(uri) {
  if (typeof uri !== "string") return uri;
  // Mask credentials in authority: mongodb(+srv)://user:pass@host/...
  return uri.replace(/\/\/([^/:@]+):([^@]+)@/g, "//$1:***@");
}

function maskArgsForPrint(cmd, args) {
  if (cmd !== "mongodump" && cmd !== "mongorestore")
    return [cmd, ...args].join(" ");
  const copy = [...args];
  for (let i = 0; i < copy.length; i += 1) {
    if (copy[i] === "--uri" && typeof copy[i + 1] === "string") {
      copy[i + 1] = maskMongoUri(copy[i + 1]);
      i += 1;
    }
  }
  return [cmd, ...copy].join(" ");
}

function getDbNameFromUri(uri) {
  // Node's WHATWG URL parser accepts custom protocols (e.g. mongodb+srv:)
  const u = new URL(uri);
  const pathname = u.pathname || "";
  const db = pathname.replace(/^\//, "").trim();
  return db.length > 0 ? db : null;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function detectDumpDbPath(dumpDir, expectedDbName) {
  if (expectedDbName) {
    const candidate = path.resolve(dumpDir, expectedDbName);
    if (await exists(candidate)) return candidate;
  }

  // Fallback: if dumpDir has exactly one subdirectory, use it.
  const entries = await fs.readdir(dumpDir, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.resolve(dumpDir, e.name));
  if (dirs.length === 1) return dirs[0];

  return null;
}

function ensureMongoToolsAvailable() {
  const tools = ["mongodump", "mongorestore"];
  for (const t of tools) {
    const res = spawnSync(t, ["--version"], { stdio: "ignore" });
    if (res.error) {
      throw new Error(
        `Cannot run '${t}'. Make sure MongoDB Database Tools are installed and '${t}' is in PATH.`
      );
    }
  }
}

function runCommand(cmd, args, { dryRun } = {}) {
  console.log(`\n$ ${maskArgsForPrint(cmd, args)}`);
  if (dryRun) return Promise.resolve(0);

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", (err) => reject(err));
    child.on("exit", (code) => {
      if (code === 0) return resolve(0);
      return reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function main() {
  const { configPath, dryRun, help } = parseArgs(process.argv);
  if (help || !configPath) {
    printUsage();
    process.exit(help ? 0 : 2);
  }

  ensureMongoToolsAvailable();

  const absConfigPath = path.resolve(process.cwd(), configPath);
  const raw = await fs.readFile(absConfigPath, "utf8");
  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Config is not valid JSON: ${absConfigPath}`);
  }

  const sourceUri = config?.sourceUri;
  const destUri = config?.destUri;
  const options = config?.options || {};
  const dumpDir = options.dumpDir || "./.dump_tmp";
  const drop = Boolean(options.drop);
  const gzip = Boolean(options.gzip);
  const cleanup =
    options.cleanup !== undefined ? Boolean(options.cleanup) : true;

  if (!isMongoUri(sourceUri))
    throw new Error(`Invalid sourceUri: ${String(sourceUri)}`);
  if (!isMongoUri(destUri))
    throw new Error(`Invalid destUri: ${String(destUri)}`);

  const sourceDbName = getDbNameFromUri(sourceUri);
  if (!sourceDbName) {
    throw new Error(
      `sourceUri must include db name in path, e.g. mongodb+srv://.../dbA (got: ${maskMongoUri(
        sourceUri
      )})`
    );
  }

  const resolvedDumpDir = path.resolve(process.cwd(), dumpDir);
  await fs.mkdir(resolvedDumpDir, { recursive: true });

  const dumpArgs = ["--uri", sourceUri, "--out", resolvedDumpDir];
  if (gzip) dumpArgs.push("--gzip");

  // Print masked URIs for safety (mongodump still receives the real one).
  console.log(`Source: ${maskMongoUri(sourceUri)}`);
  console.log(`Dest:   ${maskMongoUri(destUri)}`);
  console.log(`DumpDir: ${resolvedDumpDir}`);

  await runCommand("mongodump", dumpArgs, { dryRun });

  const expectedDumpDbPath = path.resolve(resolvedDumpDir, sourceDbName);
  const dumpDbPath = dryRun
    ? expectedDumpDbPath
    : await detectDumpDbPath(resolvedDumpDir, sourceDbName);
  if (!dumpDbPath) {
    throw new Error(
      `Cannot detect dump db folder in ${resolvedDumpDir}. Expected '${sourceDbName}' or a single subfolder.`
    );
  }

  const restoreArgs = ["--uri", destUri];
  if (drop) restoreArgs.push("--drop");
  restoreArgs.push(dumpDbPath);

  await runCommand("mongorestore", restoreArgs, { dryRun });

  if (cleanup && !dryRun) {
    await fs.rm(resolvedDumpDir, { recursive: true, force: true });
    console.log(`\nCleaned up: ${resolvedDumpDir}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(`\nError: ${err && err.message ? err.message : String(err)}`);
  process.exit(1);
});
