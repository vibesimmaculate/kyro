import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/**
 * eslint-config-next 16 ships flat configs directly, so they are spread in
 * rather than pushed through FlatCompat — the compat shim cannot serialise the
 * plugin graph and fails with a circular-structure error.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "supabase/.temp/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
      "src/server/supabase/database.types.ts",
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      /**
       * The two bans that protect the money.
       *
       * Math.random would make a "provably fair" outcome predictable, and a
       * float parse would silently round a wei value. Both are the kind of
       * mistake that looks fine in review and costs real money in production,
       * so they are refused mechanically rather than by vigilance.
       */
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            "Math.random() is banned. Game outcomes use the seeded generators in src/lib/fair; anything else needing randomness uses node:crypto.",
        },
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message:
            "parseFloat is banned. Money is fixed-point — use the helpers in src/lib/money.",
        },
      ],
    },
  },

  {
    // Tests exercise edge cases deliberately and read better without the
    // ceremony the application code needs.
    files: ["tests/**/*.ts", "tests/**/*.tsx", "scripts/**/*.ts"],
    rules: {
      "no-restricted-syntax": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
