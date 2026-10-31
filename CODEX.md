# Cheap Agent for Codex

This repository ports Cheap Agent 1.2.5's integration to Codex (upstream commit `abe39a81f7e73a55f17493695d1138a98c7bce4c`). Codex plans and supervises; the existing Cheap Agent engine performs research and implementation using your selected OpenCode Go, OpenRouter or DeepSeek route. Worktrees, reproduction checks, test execution, cost limits, progress, job recovery and uncommitted landing use the upstream engine.

## Install

Node.js 20.11+ and Git are required. Use Node 22+ with current Codex releases. From this checkout:

```sh
npm ci
npm run build
node dist/index.js codex install
```

Alternatively install a local npm tarball created with `npm pack` globally, then use `cheapag codex install`. Do not run `npx cheap-agent@latest` for this integration: the public package is upstream and does not include this Codex port. Keep the installed checkout/runtime in place; the configuration points at its absolute entrypoint rather than an expiring npx cache. The installer respects `CODEX_HOME`, defaulting to `~/.codex`.

Restart Codex and review the four Cheap Agent hooks in its Hooks settings. The installer does not grant itself trust or change hook feature flags. Existing MCP registrations, Bartender hooks, and unrelated configuration remain intact. Existing configuration is backed up once with `.cheapag-codex.bak`. No provider call or repository consent happens during install.

Set up a provider in your own terminal (hidden API-key entry and a tiny paid live connectivity check):

```sh
node dist/index.js codex login
```

This runs the existing provider/preset setup, then registers Codex rather than Claude. You can also use `cheapag codex login` after globally installing the local tarball. Credentials remain in OpenCode's local credential store. Do not paste them into chat.

For each project, review the route reported by Cheap Agent, then personally run the consent command from that repository:

```sh
cheapag allow
# Or restrict it:
cheapag allow --zdr-only
cheapag allow --models provider/model
```

When using a checkout without a global CLI, replace `cheapag` with `node /absolute/path/to/this/checkout/dist/index.js`. Consent is never granted by the installer, MCP server, skills, or hooks.

## Use in Codex

- `$cheapag`: delegate bounded implementation and research, handle worker results.
- `$cheapag-plan`: write an executable multi-step plan under `.plan/`.
- `$cheapag-status`: jobs, spend and integration diagnostics.
- `$cheapag-clean`: retention-aware cleanup.
- `$cheapag-hook`: inspect or change the optional repository edit guard.
- `$cheapag-allow`: explain provider consent; the user runs the authorization command.

The `cheapag` MCP server exposes the upstream `ping`, `delegate`, `research`, `reply`, `jobs`, and `land` tools. Native skills replace Claude's `/cheapag:*` commands. The actual pinned CLI command is recorded in `~/.codex/cheapag-codex/install.json` and in each installed skill.

The optional guard is off by default:

```sh
cheapag codex hook on
cheapag codex hook off
```

It maps Codex `turn_id` to per-turn accounting, recognizes native `apply_patch` edits and shell file writes, exempts `.plan/`, and bounds Codex's recovery calls after failed worker jobs. It never grants permission for an operation. A broken hook reports an error and makes no decision. Codex handles fallback itself; this mode never requires a Sonnet subagent and does not change Claude's defaults.

Guard matching is a workflow aid, not a security boundary or a shell parser. Opaque JavaScript wrappers and custom tools can perform edits that the guard cannot inspect. Codex sandboxing does not automatically confine the external worker. Repository/user instructions and explicit requests take precedence. Trust and approval behavior depend on the installed Codex version; cloud-orchestrated sessions do not support local command hooks.

## Diagnostics and removal

```sh
cheapag codex doctor
cheapag codex status
cheapag codex uninstall
```

Doctor checks installed files and owned hook registrations without making paid calls. It does not assert hook trust or provider connectivity. Uninstall removes only its marked MCP block, marked hook handlers and unchanged owned skills. User-edited skills, credentials, backups, repository consent and jobs are preserved. A conflicting unmanaged `cheapag` registration or skill is refused instead of overwritten. Installation validates all existing inputs before mutation; an OS I/O failure partway through installation may still require restoring the backups.

## Validation

`npm test -- test/codex.test.ts` covers configuration preservation, idempotence, uninstall, conflicts, generated shell commands, Codex tool/turn normalization, native patch guarding, recovery budgets, a real stdio MCP handshake, consent refusal, and a complete delegated worktree/verification/landing cycle against the isolated fake worker. No live provider credentials or code transfers are used by these tests. A separate smoke check against the installed Codex app-server confirmed that its real parser recognizes all four hook registrations (untrusted pending user review), all six skills, and the pinned MCP registration.

References: [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Codex MCP](https://developers.openai.com/codex/mcp), [Codex skills](https://learn.chatgpt.com/docs/build-skills), [upstream Cheap Agent](https://github.com/muaaz9329/cheap-ag).

Local validation results (macOS arm64): TypeScript typecheck passed; full suite `npm test -- --maxWorkers=4` passed 395 tests with 5 skipped; six skills passed the Skill Creator validator; real Codex configuration parsing passed; the npm archive installed and passed doctor in an isolated home. The resolved dependency audit reported zero vulnerabilities. Live paid inference was not exercised; that requires your provider login and per-repository consent.
