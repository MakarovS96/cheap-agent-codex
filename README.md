# Cheap Agent for Codex

A standalone Codex integration for [Cheap Agent](https://github.com/muaaz9329/cheap-ag). Codex plans and handles recovery; cheaper worker models perform research and implementation in isolated git worktrees. Successful changes land uncommitted for review.

## What is included

- MCP tools for delegation, research, job progress, blocked-job replies, and landing.
- Six Codex skills: `$cheapag`, `$cheapag-plan`, `$cheapag-status`, `$cheapag-clean`, `$cheapag-hook`, and `$cheapag-allow`.
- Codex lifecycle and tool hooks, including native `apply_patch` support and per-turn recovery budgets.
- Install, diagnostics, and uninstall commands that preserve existing MCP servers, hooks, and user-edited skills.
- The upstream worker, verification, model routing, cost limits, and cleanup engine.

## Quick start

Requires Git and Node.js 20.11 or newer; Node 22+ is recommended with current Codex releases.

```sh
npm ci
npm run build
node dist/index.js codex install
```

Restart Codex and review the Cheap Agent hooks in its Hooks settings. The installer never grants itself trust. It respects `CODEX_HOME` and defaults to `~/.codex`.

Set up your worker provider from your own terminal:

```sh
node dist/index.js codex login
```

The login flow accepts the API key through hidden terminal input and makes a tiny paid connectivity check. Do not paste keys into a chat. OpenCode Go, OpenRouter and DeepSeek are supported by the upstream engine.

Before sending a repository's code to the worker, review its provider and model route and personally grant consent from that repository:

```sh
node /absolute/path/to/cheap-agent-codex/dist/index.js allow
# Optional restrictions:
node /absolute/path/to/cheap-agent-codex/dist/index.js allow --zdr-only
node /absolute/path/to/cheap-agent-codex/dist/index.js allow --models provider/model
```

Then ask Codex to use `$cheapag` for a task. Installed skills contain the exact CLI path, so a global install is unnecessary. Keep this checkout in place after installation.

## Commands

```sh
node dist/index.js codex doctor
node dist/index.js codex status
node dist/index.js codex hook on
node dist/index.js codex hook off
node dist/index.js codex clean
node dist/index.js codex uninstall
```

The edit guard is optional and off by default. It encourages delegation; it is not a security sandbox. External workers have their own permissions, and local command hooks require a compatible local Codex environment. See [CODEX.md](CODEX.md) for behavior, consent, backups, removal, and limitations.

## Development

```sh
npm run typecheck
npm test -- --maxWorkers=4
npm pack
```

The suite includes isolated worker simulations and a full delegated worktree/verification/landing cycle. The Codex port was validated with 395 passing tests and 5 skipped, plus the real Codex configuration parser. Live paid model inference requires separate credentials and repository consent.

This repository is marked private in `package.json` to prevent accidental npm publication. Local packaging with `npm pack` remains available. The inherited `cheapag` executable is retained for compatibility; this port is not the public `cheap-agent` npm release.

## Attribution

Based on Cheap Agent 1.2.5 by muaaz9329, upstream commit `abe39a81f7e73a55f17493695d1138a98c7bce4c`. The original MIT [LICENSE](LICENSE) and an [upstream README snapshot](docs/UPSTREAM-README.md) are retained. Codex integration details are documented in [CODEX.md](CODEX.md).
