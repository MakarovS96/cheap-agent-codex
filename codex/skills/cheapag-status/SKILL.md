---
name: cheapag-status
description: Report Cheap Agent jobs, usage and Codex integration health when the user asks for status or diagnostics.
---

For jobs and spend, call the cheapag MCP `jobs` tool (follow its current schema). For setup diagnostics run `cheapag codex doctor`. The user can also run `cheapag codex status` from the repository. Distinguish installed configuration, user-reviewed hook trust, provider connectivity, and an actual successful worker job. Do not imply that configuration-only checks prove live inference works. Never print credentials.
