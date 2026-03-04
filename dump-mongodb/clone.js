/* eslint-disable no-console */

const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

function printUsage() {
  console.log(`
Usage:
  node clone.js --config ./config.json [--output ./clones] [--dry-run]

Options:
  --config <path>   Path to config JSON file
  --output <path>    Output directory for clones (default: ./clones)
  --dry-run          Print commands but do not execute
  -h, --help         Show help
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { configPath: null, outputPath: null, dryRun: false, help: false };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--config") {
      out.configPath = args[i + 1] || null;
      i += 1;
      continue;
    }
    if (a === "--output") {
      out.outputPath = args[i + 1] || null;
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
  return uri.replace(/\/\/([^/:@]+):([^@]+)@/g, "//$1:***@");
}

function maskArgsForPrint(cmd, args) {
  if (cmd !== "mongodump") return [cmd, ...args].join(" ");
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
  const u = new URL(uri);
  const pathname = u.pathname || "";
  const db = pathname.replace(/^\//, "").trim();
  return db.length > 0 ? db : null;
}

function formatTimestamp(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}_${h}${min}${s}`;
}

function ensureMongoToolsAvailable() {
  const tools = ["mongodump"];
  for (const t of tools) {
    const res = spawnSync(t, ["--version"], { stdio: "ignore" });
    if (res.error) {
      const errorCode = res.error.code;
      let errorMsg = `Cannot run '${t}'. `;

      if (errorCode === "ENOENT") {
        errorMsg += `Command '${t}' not found. `;
      } else {
        errorMsg += `Error: ${res.error.message}. `;
      }

      errorMsg += `Make sure MongoDB Database Tools are installed and '${t}' is in PATH.`;

      if (process.platform === "win32") {
        errorMsg += `\n\nOn Windows, you can:\n`;
        errorMsg += `1. Download MongoDB Database Tools from: https://www.mongodb.com/try/download/database-tools\n`;
        errorMsg += `2. Extract and add the 'bin' folder to your system PATH`;
      } else {
        errorMsg += `\n\nYou can install MongoDB Database Tools or ensure they are in your PATH.`;
      }

      throw new Error(errorMsg);
    }
    if (res.status !== 0 && res.status !== null) {
      throw new Error(
        `'${t}' command failed with exit code ${res.status}. Make sure MongoDB Database Tools are properly installed.`
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
  const { configPath, outputPath, dryRun, help } = parseArgs(process.argv);
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
  const options = config?.options || {};
  const gzip = Boolean(options.gzip);

  if (!isMongoUri(sourceUri)) {
    throw new Error(`Invalid sourceUri: ${String(sourceUri)}`);
  }

  const sourceDbName = getDbNameFromUri(sourceUri);
  if (!sourceDbName) {
    throw new Error(
      `sourceUri must include db name in path, e.g. mongodb+srv://.../dbA (got: ${maskMongoUri(
        sourceUri
      )})`
    );
  }

  // Generate timestamp-based folder name
  const timestamp = formatTimestamp(new Date());
  const baseOutputDir = outputPath
    ? path.resolve(process.cwd(), outputPath)
    : path.resolve(process.cwd(), "clones");
  const cloneDir = path.join(baseOutputDir, `${sourceDbName}_${timestamp}`);

  await fs.mkdir(cloneDir, { recursive: true });

  const dumpArgs = ["--uri", sourceUri, "--out", cloneDir];
  if (gzip) dumpArgs.push("--gzip");

  console.log(`Source: ${maskMongoUri(sourceUri)}`);
  console.log(`Clone directory: ${cloneDir}`);

  await runCommand("mongodump", dumpArgs, { dryRun });

  console.log("\nClone completed successfully!");
  console.log(`Output: ${cloneDir}`);

  // List contents
  if (!dryRun) {
    const entries = await fs.readdir(cloneDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    if (dirs.length > 0) {
      console.log(`Database cloned: ${dirs.map((d) => d.name).join(", ")}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(`\nError: ${err && err.message ? err.message : String(err)}`);
  process.exit(1);
});
