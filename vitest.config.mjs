import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import typescript from "typescript";
import { defineConfig } from "vitest/config";

function loadCompilerOptions() {
  const tsconfigPath = resolve(import.meta.dirname, "tsconfig.json");
  const tsconfigContent = readFileSync(tsconfigPath, "utf8");
  const parsed = typescript.parseConfigFileTextToJson(tsconfigPath, tsconfigContent);

  if (parsed.error) {
    throw new Error(typescript.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
  }

  const config = typescript.parseJsonConfigFileContent(
    parsed.config,
    typescript.sys,
    import.meta.dirname
  );

  return {
    ...config.options,
    module: typescript.ModuleKind.ESNext,
    sourceMap: true,
    inlineSourceMap: true,
    inlineSources: true,
  };
}

const compilerOptions = loadCompilerOptions();

function typescriptTranspilePlugin() {
  return {
    name: "vitest-typescript-transpile",
    enforce: "pre",
    transform(code, id) {
      if (id.includes("/node_modules/")) {
        return null;
      }
      if (!/\.(ts|tsx|mts|cts)$/.test(id)) {
        return null;
      }

      const result = typescript.transpileModule(code, {
        fileName: id,
        compilerOptions,
        reportDiagnostics: false,
      });

      return {
        code: result.outputText,
        map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null,
      };
    },
  };
}

export default defineConfig({
  esbuild: false,
  plugins: [typescriptTranspilePlugin()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      siyuan: resolve(import.meta.dirname, "tests/mocks/siyuan.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    pool: "threads",
  },
});
