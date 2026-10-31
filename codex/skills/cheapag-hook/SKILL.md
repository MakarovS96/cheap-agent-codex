---
name: cheapag-hook
description: Enable, disable or inspect Cheap Agent's optional per-repository delegation guard at the user's request.
---

Use the installed Cheap Agent CLI: `cheapag codex hook` reports status, `cheapag codex hook on` enables it, and `cheapag codex hook off` disables it. Run in the requested repository. These commands change `.cheapag/hook.json`, not Codex security settings. Only change the guard when requested; a request to edit directly permits disabling this delegation-only guard. Hook trust is reviewed by the user in Codex, never by editing `trusted_hash` entries.
