# Private agent display catalog

`public/js/agent-display-catalog.json` is owner-provided local runtime data and is intentionally excluded from Git. It contains prepared Vietnamese and English display names, roles and descriptions keyed by stable Brain ID + agent ID and tied to source metadata hashes.

To refresh it, use an authorized metadata snapshot or the selected Brain's existing read-only authenticated discovery. The refresh script never writes canonical Javis metadata and never reads or translates user messages or chat content. It produces pending source entries for the AI Office implementer to translate, then validates the prepared copy against the source hash before atomically applying it.

```powershell
node tools/refresh-agent-localization.mjs discover --brain <stable-brain-id> --input <authorized-metadata-snapshot.json>
node tools/refresh-agent-localization.mjs check --brain <stable-brain-id>
node tools/refresh-agent-localization.mjs apply --brain <stable-brain-id> --input <prepared-bilingual-copy.json>
```

Only use `--registry` when the existing authorized local Brain registry is available. Never print, commit or share its credentials. Missing translations remain a catalog-maintenance issue; the interface does not show raw localization keys or technical fallback messages.
