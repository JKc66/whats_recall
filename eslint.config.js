import { defineConfig } from "eslint/config";
import globals from "globals";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
      "**/web/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/tests/**",
      "**/public/**",
      "**/scripts/**",
      "**/archive/**",
      "*.test.ts",
      "*.bench.ts",
      "**/.*",
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.bun,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "no-useless-assignment": "warn",
    },
  },
  {
    files: ["**/*.{cjs,js}"],
    languageOptions: {
      globals: {
        ...globals.commonjs,
        ...globals.node,
      },
    },
  },
]);


