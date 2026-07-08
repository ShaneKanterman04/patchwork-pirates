import js from "@eslint/js";
import tseslint from "typescript-eslint";

const nodeBuiltins = [
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "querystring",
  "readline",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "vm",
  "worker_threads",
  "zlib"
];

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.tsbuildinfo", ".claude/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: "module"
      }
    }
  },
  {
    files: ["packages/sim/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          "name": "window",
          "message": "packages/sim must not reference DOM globals."
        },
        {
          "name": "document",
          "message": "packages/sim must not reference DOM globals."
        },
        {
          "name": "navigator",
          "message": "packages/sim must not reference DOM globals."
        },
        {
          "name": "process",
          "message": "packages/sim must not reference Node globals."
        }
      ],
      "no-restricted-imports": [
        "error",
        {
          "paths": [
            "pixi.js",
            "ws",
            "@patchwork/protocol",
            "@patchwork/content",
            "@patchwork/server",
            "@patchwork/client",
            ...nodeBuiltins,
            ...nodeBuiltins.map((name) => `node:${name}`)
          ],
          "patterns": [
            {
              "group": [
                "node:*",
                "fs/*",
                "path/*",
                "@patchwork/protocol/*",
                "@patchwork/content/*",
                "@patchwork/server/*",
                "@patchwork/client/*"
              ],
              "message": "packages/sim is the deterministic innermost layer and must not import platform, renderer, wire, content, server, or client modules."
            }
          ]
        }
      ],
      "no-restricted-properties": [
        "error",
        {
          "object": "Math",
          "property": "random",
          "message": "packages/sim must use seeded PRNG state instead of Math.random()."
        },
        {
          "object": "Date",
          "property": "now",
          "message": "packages/sim must use ticks instead of wall-clock time."
        }
      ]
    }
  }
];
