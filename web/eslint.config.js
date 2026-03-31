import js from "@eslint/js";
import solid from "eslint-plugin-solid";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    // Global ignores must be in their own object with no other properties
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.bundle/**",
      "**/public/assets/**",
      "**/*.html"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      solid,
    },
    rules: {
      ...solid.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { 
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }],
      "@typescript-eslint/no-explicit-any": "off",
      "solid/no-innerhtml": "warn",
      "solid/self-closing-comp": "warn"
    },
  },
);
