---
name: cheapag-allow
description: Explain Cheap Agent's per-repository provider consent and guide the user through granting it themselves.
---

Cheap Agent requires developer consent before sending repository code to its worker provider. Read a `CONSENT` result to show the actual provider, models and known retention. Explain the available terminal commands:

- `cheapag allow`: permit the configured route in the current repository.
- `cheapag allow --zdr-only`: restrict to the supported zero-retention route.
- `cheapag allow --models provider/model,...`: restrict to named models.

The user must run their chosen command personally in that repository after reviewing these details. Never invoke it, write `.cheapag/consent.json`, or silently widen consent. A provider/model route change may require renewed consent.
