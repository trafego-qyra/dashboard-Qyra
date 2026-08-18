/**
 * Conventional Commits. O tipo do commit alimenta a classificação das Issues
 * (fix → Correção, feat → Nova função, refactor/perf/style → Melhoria) e o
 * changelog do release.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "refactor",
        "perf",
        "style",
        "docs",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    "subject-case": [0],
    "header-max-length": [2, "always", 100],
  },
};
