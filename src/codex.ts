import { copyFileSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stableNode } from "./install.js";

export const CODEX_MARKER = "cheapag-codex-managed";
const START = `# BEGIN ${CODEX_MARKER}`;
const END = `# END ${CODEX_MARKER}`;
const skills = ["cheapag", "cheapag-plan", "cheapag-status", "cheapag-clean", "cheapag-hook", "cheapag-allow"];
const root = () => resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));
const bundle = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(bundle, "dist", "index.js");
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const read = (file: string) => existsSync(file) ? readFileSync(file, "utf8") : "";
const quote = (s: string) => process.platform === "win32" ? `"${s.replace(/"/g, '\\"')}"` : `'${s.replace(/'/g, `'\\''`)}'`;
const atomic = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, file);
};
const backup = (file: string) => {
  if (existsSync(file) && !existsSync(`${file}.cheapag-codex.bak`)) copyFileSync(file, `${file}.cheapag-codex.bak`, constants.COPYFILE_EXCL);
};

type Handler = { command?: string; [key: string]: unknown };
type Rule = { hooks?: Handler[]; [key: string]: unknown };
type HookConfig = { hooks?: Record<string, Rule[]>; [key: string]: unknown };
type Manifest = { entry: string; files: Record<string, string> };
function parseHooks(text: string): HookConfig {
  const value: unknown = text ? JSON.parse(text) : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("hooks.json must contain an object");
  const obj = value as HookConfig;
  if (obj.hooks !== undefined) {
    if (!obj.hooks || typeof obj.hooks !== "object" || Array.isArray(obj.hooks)) throw new Error("hooks must contain an event map");
    for (const rules of Object.values(obj.hooks)) {
      if (!Array.isArray(rules) || rules.some(r => !r || typeof r !== "object" || !Array.isArray(r.hooks))) throw new Error("Invalid hook rule; nothing changed");
    }
  }
  return obj;
}
function removeOwnedHooks(config: HookConfig) {
  if (!config.hooks) return config;
  for (const [event, rules] of Object.entries(config.hooks)) {
    config.hooks[event] = rules.map(rule => ({ ...rule, hooks: rule.hooks?.filter(h => !h.command?.endsWith(`# ${CODEX_MARKER}`)) })).filter(rule => rule.hooks?.length);
    if (!config.hooks[event].length) delete config.hooks[event];
  }
  return config;
}
function removeBlock(config: string) {
  const begin = config.indexOf(START), end = config.indexOf(END);
  if (begin === -1 && end === -1) return config;
  if (begin === -1 || end < begin || config.indexOf(START, begin + START.length) !== -1) throw new Error("Damaged Cheap Agent config markers; refusing to rewrite config.toml");
  return config.slice(0, begin) + config.slice(end + END.length).replace(/^\r?\n/, "");
}
const manifestPath = (home: string) => join(home, "cheapag-codex", "install.json");
const skillFile = (home: string, name: string) => join(home, "skills", name, "SKILL.md");

export function installCodex(out: (s: string) => void = console.log) {
  const home = root(), configFile = join(home, "config.toml"), hooksFile = join(home, "hooks.json");
  const previous: Manifest | undefined = existsSync(manifestPath(home)) ? JSON.parse(read(manifestPath(home))) : undefined;
  const config = read(configFile), base = removeBlock(config);
  // Quoted table names are also conflicts. Never replace an unrelated registration.
  if (/^\s*\[[^\]\n]*mcp_servers[.\s"'][^\]\n]*cheapag[\s"'.\]]/m.test(base)) throw new Error("An unmanaged cheapag MCP entry already exists; remove or rename it before installation");
  const hookConfig = removeOwnedHooks(parseHooks(read(hooksFile)));
  const cliRef = `${quote(stableNode())} ${quote(realpathSync(entry))}`;
  const skillSource = (name: string) => read(join(bundle, "codex", "skills", name, "SKILL.md")) + `\n## Installed CLI\n\nUse this exact command in place of the \`cheapag\` executable shown above: \`${cliRef}\`. Append the subcommand and run in the requested repository. This pinned runtime includes the Codex port; the public npm package does not.\n`;
  const files: Record<string, string> = {};
  for (const name of skills) {
    const file = skillFile(home, name), source = skillSource(name);
    if (!existsSync(join(bundle, "codex", "skills", name, "SKILL.md"))) throw new Error(`Missing bundled skill: ${name}`);
    if (existsSync(file) && digest(read(file)) !== previous?.files[file]) throw new Error(`Skill ${file} already exists or was edited; refusing to overwrite it`);
    files[file] = digest(source);
  }
  const node = stableNode(), pinnedEntry = realpathSync(entry);
  const command = (action: string) => `${quote(node)} ${quote(pinnedEntry)} codex hook ${action} # ${CODEX_MARKER}`;
  const events: Record<string, { action: string; matcher?: string }> = {
    SessionStart: { action: "context" },
    UserPromptSubmit: { action: "context" },
    PreToolUse: { action: "guard", matcher: "*" },
    PostToolUse: { action: "result", matcher: "mcp__.*cheapag__(delegate|jobs|reply|land)" },
  };
  hookConfig.hooks ??= {};
  for (const [event, spec] of Object.entries(events)) {
    (hookConfig.hooks[event] ??= []).push({ ...(spec.matcher && { matcher: spec.matcher }), hooks: [{ type: "command", command: command(spec.action), timeout: 10 }] });
  }
  const block = `${START}\n[mcp_servers.cheapag]\ncommand = ${JSON.stringify(node)}\nargs = ${JSON.stringify([pinnedEntry, "codex", "serve"])}\nstartup_timeout_sec = 60\ntool_timeout_sec = 1800\n${END}\n`;
  // Validate and stage every input before changing any existing user files.
  mkdirSync(home, { recursive: true });
  backup(configFile); backup(hooksFile);
  for (const name of skills) atomic(skillFile(home, name), skillSource(name));
  atomic(configFile, base + (base && !base.endsWith("\n") ? "\n" : "") + block);
  atomic(hooksFile, JSON.stringify(hookConfig, null, 2) + "\n");
  atomic(manifestPath(home), JSON.stringify({ entry: pinnedEntry, files } satisfies Manifest, null, 2) + "\n");
  out(`Installed Cheap Agent for Codex in ${home}. Existing registrations and hooks preserved.`);
  out("Restart Codex, review and trust the Cheap Agent hooks in Hooks settings, then use $cheapag.");
  out(`Provider setup: ${quote(node)} ${quote(pinnedEntry)} codex login`);
  out("Repository consent remains user-only: run cheapag allow yourself in each repository after reviewing its provider and models.");
}

export function uninstallCodex(out: (s: string) => void = console.log) {
  const home = root(), manifest = manifestPath(home);
  if (!existsSync(manifest)) { out("Cheap Agent Codex integration is not installed."); return; }
  const saved: Manifest = JSON.parse(read(manifest));
  const config = join(home, "config.toml"), hooks = join(home, "hooks.json");
  const updatedConfig = removeBlock(read(config));
  const updatedHooks = removeOwnedHooks(parseHooks(read(hooks)));
  if (existsSync(config)) atomic(config, updatedConfig);
  if (existsSync(hooks)) atomic(hooks, JSON.stringify(updatedHooks, null, 2) + "\n");
  let modified = false;
  for (const name of skills) {
    const file = skillFile(home, name);
    if (!existsSync(file)) continue;
    if (digest(read(file)) === saved.files[file]) rmSync(file);
    else { out(`Preserved modified skill: ${file}`); modified = true; }
  }
  if (!modified) rmSync(manifest);
  out("Removed owned Codex registrations and hooks. Credentials, repository consent, jobs and unrelated settings preserved.");
}

export function doctorCodex(out: (s: string) => void = console.log): number {
  const home = root();
  const config = read(join(home, "config.toml"));
  const hooks = parseHooks(read(join(home, "hooks.json")));
  const missing = skills.filter(name => !existsSync(skillFile(home, name)));
  const installed = config.includes(START) && missing.length === 0 && existsSync(manifestPath(home));
  const commands = Object.values(hooks.hooks ?? {}).flatMap(rules => rules.flatMap(rule => rule.hooks ?? [])).filter(h => h.command?.endsWith(`# ${CODEX_MARKER}`));
  out(`Codex home: ${home}`);
  out(`Integration: ${installed ? "installed" : "incomplete or absent"}; owned hooks: ${commands.length}; missing skills: ${missing.join(", ") || "none"}`);
  const saved: Manifest | undefined = existsSync(manifestPath(home)) ? JSON.parse(read(manifestPath(home))) : undefined;
  out(`Runtime: ${saved && existsSync(saved.entry) ? saved.entry : "missing"}`);
  out("Hook trust must be confirmed in Codex Hooks settings; this installer never grants itself trust.");
  return installed && commands.length === 4 && saved && existsSync(saved.entry) ? 0 : 1;
}

export async function codex(args: string[]): Promise<number> {
  process.env.CHEAPAG_HOST = "codex";
  try {
    const [action, ...rest] = args;
    if (["install", "uninstall", "doctor", "serve"].includes(action) && rest.length) throw new Error(`codex ${action} takes no extra arguments`);
    if (action === "install") installCodex();
    else if (action === "uninstall") uninstallCodex();
    else if (action === "doctor") return doctorCodex();
    else if (action === "login") return await (await import("./login.js")).login(rest);
    else if (action === "status") return (await import("./status.js")).status(rest);
    else if (action === "clean") return (await import("./cleanup.js")).clean(rest);
    else if (action === "hook") return (await import("./hook.js")).hook(rest);
    else if (action === "serve") await (await import("./server.js")).serve();
    else throw new Error("usage: cheapag codex install|uninstall|doctor|login|serve|status|clean|hook <action>");
    return 0;
  } catch (err) {
    console.error(`Cheap Agent Codex: ${(err as Error).message}`);
    return 1;
  }
}
