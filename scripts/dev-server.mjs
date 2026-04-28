#!/usr/bin/env node

import { spawn } from "node:child_process";
import { watchFile, unwatchFile } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const watchRoots = ["src/server", "src/services", "src/domain", "src/shared"];
const extraWatchFiles = [join(projectRoot, ".env")];
const watchedExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json"]);
const ignoredDirectories = new Set(["node_modules", "dist", "coverage"]);
const initialEnv = { ...(await loadEnvFile()), ...process.env };
const pollIntervalMs = Number(initialEnv.SERVER_DEV_POLL_INTERVAL_MS ?? 250);
const rescanIntervalMs = Number(initialEnv.SERVER_DEV_RESCAN_INTERVAL_MS ?? 1_000);
const restartDebounceMs = Number(initialEnv.SERVER_DEV_RESTART_DEBOUNCE_MS ?? 120);
const shutdownTimeoutMs = Number(initialEnv.SERVER_DEV_SHUTDOWN_TIMEOUT_MS ?? 3_000);

const watchedFiles = new Set();
let serverProcess;
let restartTimer;
let rescanTimer;
let restartQueue = Promise.resolve();
let isShuttingDown = false;

function log(message) {
  console.log(`[server-dev] ${message}`);
}

function parseEnvValue(value) {
  const trimmedValue = value.trim();
  const isQuoted =
    (trimmedValue.startsWith("\"") && trimmedValue.endsWith("\"")) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"));

  if (!isQuoted) {
    return trimmedValue;
  }

  return trimmedValue.slice(1, -1);
}

function parseEnvFile(content) {
  return content.split(/\r?\n/).reduce((env, rawLine) => {
    const trimmedLine = rawLine.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return env;
    }

    const line = trimmedLine.startsWith("export ") ? trimmedLine.slice("export ".length).trim() : trimmedLine;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);

    if (!match) {
      return env;
    }

    const [, key, value] = match;

    return {
      ...env,
      [key]: parseEnvValue(value)
    };
  }, {});
}

async function loadEnvFile() {
  try {
    const content = await readFile(join(projectRoot, ".env"), "utf8");

    return parseEnvFile(content);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

function isWatchedFile(filePath) {
  const relativePath = relative(projectRoot, filePath);
  const pathParts = relativePath.split(sep);

  if (pathParts.some((part) => ignoredDirectories.has(part))) {
    return false;
  }

  if (relativePath.includes(`${sep}test${sep}`) || /\.test\.[cm]?[tj]sx?$/.test(relativePath)) {
    return false;
  }

  return watchedExtensions.has(extname(filePath));
}

async function collectFiles(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name)) {
          return [];
        }

        return collectFiles(entryPath);
      }

      if (!entry.isFile() || !isWatchedFile(entryPath)) {
        return [];
      }

      return [entryPath];
    })
  );

  return nestedFiles.flat();
}

async function listWatchFiles() {
  const [filesByRoot, existingExtraFiles] = await Promise.all([
    Promise.all(watchRoots.map((root) => collectFiles(join(projectRoot, root)))),
    collectExistingFiles(extraWatchFiles)
  ]);

  return new Set([...filesByRoot.flat(), ...existingExtraFiles]);
}

async function collectExistingFiles(filePaths) {
  const existingFiles = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const fileStat = await stat(filePath);

        return fileStat.isFile() ? [filePath] : [];
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          return [];
        }

        throw error;
      }
    })
  );

  return existingFiles.flat();
}

function watchServerFile(filePath) {
  if (watchedFiles.has(filePath)) {
    return;
  }

  watchedFiles.add(filePath);
  watchFile(filePath, { interval: pollIntervalMs }, (current, previous) => {
    if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) {
      return;
    }

    scheduleRestart(filePath);
  });
}

async function syncWatchedFiles() {
  const nextWatchedFiles = await listWatchFiles();

  for (const filePath of watchedFiles) {
    if (!nextWatchedFiles.has(filePath)) {
      unwatchFile(filePath);
      watchedFiles.delete(filePath);
    }
  }

  for (const filePath of nextWatchedFiles) {
    watchServerFile(filePath);
  }
}

async function startServer() {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const serverEnv = { ...(await loadEnvFile()), ...process.env };
  serverProcess = spawn(command, ["exec", "tsx", "src/server/index.ts"], {
    cwd: projectRoot,
    env: serverEnv,
    stdio: "inherit"
  });

  const spawnedProcess = serverProcess;
  spawnedProcess.once("exit", (code, signal) => {
    if (serverProcess === spawnedProcess) {
      serverProcess = undefined;
    }

    if (!isShuttingDown && signal !== "SIGTERM" && code !== 0) {
      log(`server exited with code ${code ?? "null"}${signal ? ` and signal ${signal}` : ""}`);
    }
  });
}

function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) {
    serverProcess = undefined;
    return Promise.resolve();
  }

  const processToStop = serverProcess;
  serverProcess = undefined;

  return new Promise((resolve) => {
    let didResolve = false;
    const timeout = setTimeout(() => {
      if (!didResolve) {
        processToStop.kill("SIGKILL");
      }
    }, shutdownTimeoutMs);

    const finish = () => {
      if (didResolve) {
        return;
      }

      didResolve = true;
      clearTimeout(timeout);
      resolve();
    };

    processToStop.once("exit", finish);
    processToStop.kill("SIGTERM");
  });
}

function scheduleRestart(filePath) {
  if (isShuttingDown) {
    return;
  }

  const changedFile = relative(projectRoot, filePath);
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartQueue = restartQueue
      .then(async () => {
        log(`${changedFile} changed, restarting API server`);
        await stopServer();
        await startServer();
        await syncWatchedFiles();
      })
      .catch((error) => {
        console.error(error);
      });
  }, restartDebounceMs);
}

async function shutdown(signal) {
  isShuttingDown = true;
  clearTimeout(restartTimer);
  clearInterval(rescanTimer);

  for (const filePath of watchedFiles) {
    unwatchFile(filePath);
  }

  watchedFiles.clear();
  log(`received ${signal}, stopping API server`);
  await stopServer();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => {
      process.exit(0);
    });
  });
}

await syncWatchedFiles();
await startServer();
rescanTimer = setInterval(() => {
  void syncWatchedFiles().catch((error) => {
    console.error(error);
  });
}, rescanIntervalMs);
