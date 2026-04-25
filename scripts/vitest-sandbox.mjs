import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const childProcess = require("node:child_process");
const originalExec = childProcess.exec;

childProcess.exec = (command, options, callback) => {
  const normalizedOptions = typeof options === "function" ? undefined : options;
  const normalizedCallback = typeof options === "function" ? options : callback;

  if (typeof command === "string" && command.trim().toLowerCase() === "net use") {
    queueMicrotask(() => {
      normalizedCallback?.(new Error("sandbox exec disabled"), "", "");
    });
    return {
      kill() {},
      ref() {},
      unref() {},
    };
  }

  return originalExec.call(childProcess, command, normalizedOptions, normalizedCallback);
};

const vitestCliPath = resolve(
  import.meta.dirname,
  "..",
  "node_modules/.pnpm/vitest@3.2.4_@types+debug@4_07935ee7891fe4b186d266427dde9c84/node_modules/vitest/dist/cli.js"
);
const vitestConfigPath = resolve(import.meta.dirname, "..", "vitest.config.mjs");

const forwardedArgs = process.argv.slice(2).filter((arg, index) => !(index === 1 && arg === "--"))
  .filter((arg, index) => !(index === 0 && arg === "--"));
const hasPoolArg = forwardedArgs.some((arg) => arg === "--pool" || arg.startsWith("--pool="));
const hasConfigArg = forwardedArgs.some((arg) => arg === "--config" || arg.startsWith("--config="));
const hasConfigLoaderArg = forwardedArgs.some(
  (arg) => arg === "--configLoader" || arg.startsWith("--configLoader=")
);

const argv = [process.execPath, "vitest"];

if (!hasPoolArg) {
  argv.push("--pool", "threads");
}
if (!hasConfigLoaderArg) {
  argv.push("--configLoader", "runner");
}
if (!hasConfigArg) {
  argv.push("--config", vitestConfigPath);
}

argv.push(...forwardedArgs);
process.argv = argv;

await import(pathToFileURL(vitestCliPath).href);
