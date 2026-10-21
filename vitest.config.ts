import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      /**
       * node:sqlite 是 Node 22+ 内置模块，vite 5 的 builtin 列表里没有
       * —— 它把 `node:sqlite` 剥掉前缀当 npm 包 `sqlite` 解析，报
       * "Failed to load url sqlite"。alias 到 shim，由 shim 用
       * createRequire 走 Node 原生 require。
       * 只影响 vitest；生产构建由 Next.js 自己的 loader 处理。
       */
      "node:sqlite": path.resolve(
        __dirname,
        "./lib/signer/_node-sqlite.ts",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    exclude: ["**/node_modules/**", ".next/**"],
  },
});
