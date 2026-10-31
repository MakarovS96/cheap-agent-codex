import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, onTestFinished, test } from "vitest";
import { CODEX_MARKER } from "../src/codex.js";
import { allowRepo, callText, hermeticHome, serverEntry, tempRepo } from "./harness.js";
import { startFakeOpencode } from "./fake-opencode.js";

function setup(logins: Record<string, string> = {}) {
  const repo = tempRepo(); onTestFinished(repo.cleanup);
  const { home, env: base } = hermeticHome(logins);
  onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  const codexHome = join(home, "Codex home with spaces");
  const env = { ...base, CODEX_HOME: codexHome };
  const cli = (...args: string[]) => spawnSync(process.execPath, [serverEntry, "codex", ...args], { cwd: repo.dir, env, encoding: "utf8" });
  const run = (action: string, input: Record<string, unknown>) => {
    const r = spawnSync(process.execPath, [serverEntry, "codex", "hook", action], { cwd: repo.dir, env, input: JSON.stringify({ session_id: "s1", turn_id: "t1", cwd: repo.dir, ...input }), encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout.trim() ? JSON.parse(r.stdout) : null;
  };
  return { repo, home, env, codexHome, cli, run };
}

test("install/reinstall/uninstall preserve existing MCP settings, Bartender hooks, skill edits, and secrets", () => {
  const { codexHome, cli } = setup();
  mkdirSync(codexHome, { recursive: true });
  const original = '[features]\nhooks = true\n[mcp_servers.existing]\ncommand = "some-server"\n';
  const bartender = { type: "command", command: "bartender-hook" };
  writeFileSync(join(codexHome, "config.toml"), original);
  writeFileSync(join(codexHome, "hooks.json"), JSON.stringify({ description: "keep", hooks: { PreToolUse: [{ matcher: "Bash", hooks: [bartender] }], Stop: [{ hooks: [bartender] }] } }));
  expect(cli("install").status).toBe(0);
  const installed = readFileSync(join(codexHome, "config.toml"), "utf8");
  expect(installed.startsWith(original)).toBe(true);
  expect(cli("install").status).toBe(0);
  expect(readFileSync(join(codexHome, "config.toml"), "utf8")).toBe(installed);
  const hooks = JSON.parse(readFileSync(join(codexHome, "hooks.json"), "utf8"));
  expect(hooks.description).toBe("keep");
  expect(hooks.hooks.PreToolUse).toHaveLength(2);
  expect(hooks.hooks.Stop).toEqual([{ hooks: [bartender] }]);
  expect(readFileSync(join(codexHome, "config.toml.cheapag-codex.bak"), "utf8")).toBe(original);
  expect(cli("doctor").status).toBe(0);
  // Persist a skill edit: neither reinstall nor uninstall may destroy it.
  const skill = join(codexHome, "skills", "cheapag", "SKILL.md");
  writeFileSync(skill, "user-edited skill");
  expect(cli("install").status).toBe(1);
  expect(readFileSync(join(codexHome, "config.toml"), "utf8")).toBe(installed);
  expect(cli("uninstall").status).toBe(0);
  expect(readFileSync(join(codexHome, "config.toml"), "utf8")).toBe(original);
  expect(readFileSync(skill, "utf8")).toBe("user-edited skill");
  const after = JSON.parse(readFileSync(join(codexHome, "hooks.json"), "utf8"));
  expect(after.hooks).toEqual({ PreToolUse: [{ matcher: "Bash", hooks: [bartender] }], Stop: [{ hooks: [bartender] }] });
  expect(readFileSync(join(codexHome, "config.toml"), "utf8")).not.toContain("trusted_hash");
});

test("installer rejects unmanaged registrations and invalid hook files before writing anything", () => {
  const { cli, codexHome } = setup(); mkdirSync(codexHome, { recursive: true });
  for (const header of ['[mcp_servers.cheapag]', '[mcp_servers."cheapag"]', '["mcp_servers"."cheapag"]']) {
    const config = `${header}\ncommand = "mine"\n`;
    writeFileSync(join(codexHome, "config.toml"), config);
    expect(cli("install").status).toBe(1);
    expect(readFileSync(join(codexHome, "config.toml"), "utf8")).toBe(config);
    expect(existsSync(join(codexHome, "skills"))).toBe(false);
  }
  writeFileSync(join(codexHome, "config.toml"), "# keep\n");
  writeFileSync(join(codexHome, "hooks.json"), "broken JSON");
  expect(cli("install").status).toBe(1);
  expect(readFileSync(join(codexHome, "config.toml"), "utf8")).toBe("# keep\n");
});

test("generated hook command runs with spaces in the installation and project paths", () => {
  const { cli, codexHome, repo, env } = setup();
  expect(cli("install").status).toBe(0);
  const hooks = JSON.parse(readFileSync(join(codexHome, "hooks.json"), "utf8"));
  const command = hooks.hooks.UserPromptSubmit[0].hooks[0].command;
  expect(command).toContain(CODEX_MARKER);
  const r = spawnSync("sh", ["-c", command], { env, cwd: repo.dir, input: JSON.stringify({ hook_event_name: "UserPromptSubmit", cwd: repo.dir }), encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  expect(JSON.parse(r.stdout).hookSpecificOutput).toMatchObject({ hookEventName: "UserPromptSubmit" });
});

test("Codex native patches, shell writes and per-turn edit counts obey the opt-in guard", () => {
  const { run, repo, env } = setup();
  execFileSync(process.execPath, [serverEntry, "hook", "on"], { env, cwd: repo.dir });
  const patch = (path: string, n = 1) => `*** Begin Patch\n*** Add File: ${path}\n${Array(n).fill("+new").join("\n")}\n*** End Patch`;
  const invoke = (p: string, turn = "t1") => run("guard", { hook_event_name: "PreToolUse", turn_id: turn, tool_name: "apply_patch", tool_input: { command: p } });
  expect(invoke(patch("src/large.ts", 25)).hookSpecificOutput.permissionDecision).toBe("deny");
  expect(invoke(patch(".plan/large.md", 50))).toBeNull();
  expect(invoke(patch("src/a.ts"))).toBeNull();
  expect(invoke(patch("src/a.ts"))).toBeNull();
  expect(invoke(patch("src/a.ts"))).not.toBeNull();
  expect(invoke(patch("src/a.ts"), "t2")).toBeNull();
  const shell = run("guard", { tool_name: "functions.exec_command", tool_input: { cmd: "echo x > src/a.ts", workdir: repo.dir } });
  expect(shell.hookSpecificOutput.permissionDecision).toBe("deny");
  expect(run("guard", { tool_name: "exec_command", tool_input: { cmd: "rg token src" } })).toBeNull();
});

test("Codex tool results start bounded self recovery, reset on new turns, and never request Sonnet", () => {
  const { run, repo } = setup();
  writeFileSync(join(repo.dir, "cheapag.json"), JSON.stringify({ takeover: "sonnet", limits: { takeover_calls: 1 } }));
  expect(run("result", { tool_name: "mcp__cheapag__delegate", tool_response: { content: [{ type: "text", text: "FAIL jabcd step=1 check=test error: failed" }] } })).toBeNull();
  expect(run("guard", { tool_name: "exec_command", tool_input: { cmd: "cat src/a.ts" } })).toBeNull();
  expect(run("guard", { tool_name: "exec_command", tool_input: { cmd: "cat src/a.ts" } }).hookSpecificOutput.permissionDecisionReason).toContain("Take-over budget spent");
  expect(run("guard", { turn_id: "t2", tool_name: "exec_command", tool_input: { cmd: "cat src/a.ts" } })).toBeNull();
  const context = run("context", { hook_event_name: "SessionStart" }).hookSpecificOutput.additionalContext;
  expect(context).not.toContain("model: sonnet");
});

test("Codex serve survives initialization, advertises tools, and refuses delegation without repository consent", async () => {
  const { env, repo } = setup({ "opencode-go": "test-key" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverEntry, "codex", "serve"], cwd: repo.dir, env, stderr: "inherit" });
  const client = new Client({ name: "codex-integration-test", version: "1" });
  await client.connect(transport); onTestFinished(() => client.close());
  expect((await client.listTools()).tools.map(t => t.name)).toEqual(expect.arrayContaining(["delegate", "research", "jobs", "reply", "land"]));
  expect(client.getInstructions()).toContain("Cheap Agent for Codex");
  const result = await callText(client, "delegate", { task: "Create src/a.ts", files: "src/a.ts" });
  expect(result).toMatch(/^CONSENT/);
  expect(existsSync(join(repo.dir, ".cheapag", "consent.json"))).toBe(false);
});

test("Codex delegation uses the same worktree, verification and uncommitted landing engine", async () => {
  const { env, repo } = setup({ "opencode-go": "test-key" });
  const fake = await startFakeOpencode(); onTestFinished(fake.close);
  fake.script({ edit: "src/codex.ts", content: "export const codex = 1;\n" }, { finish: { summary: "added codex", risks: [], review: [], missing: [] } });
  // Hermetic simulated developer consent, never the user's repository or a live provider.
  allowRepo(repo.dir, env);
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverEntry, "codex", "serve"], cwd: repo.dir, env: { ...env, CHEAPAG_OPENCODE_URL: fake.url }, stderr: "inherit" });
  const client = new Client({ name: "codex-worker-test", version: "1" });
  await client.connect(transport); onTestFinished(() => client.close());
  const before = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo.dir, encoding: "utf8" });
  const result = await callText(client, "delegate", { task: "Add src/codex.ts exporting codex=1", files: "src/codex.ts", done_when: '`test -f src/codex.ts` succeeds' });
  expect(result).toMatch(/^OK j\w+ step=1/);
  expect(readFileSync(join(repo.dir, "src/codex.ts"), "utf8")).toBe("export const codex = 1;\n");
  expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo.dir, encoding: "utf8" })).toBe(before);
});
