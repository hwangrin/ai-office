# AI Office Online source

This is the standalone source for the approved AI Office Work Status V1 served at `/office/`. It reuses the existing Javis Native Partners session and Brain-scoped Jobs APIs. The root project remains the original local AI Office application.

## Build from source

Requirements: Node.js 24 and the owner-provided local release inputs described below.

```powershell
npm ci
node tools/install-private-runtime-inputs.mjs --models <authorized-public-models-folder> --catalog <private-agent-display-catalog.json> --layout <private-javis-layout.json>
npm run verify:release
npm test
npm run build
```

The Dockerfile performs the same asset/catalog checks and esbuild step before creating the runtime image:

```powershell
docker build -t ai-office-v1:local .
```

For the existing same-origin deployment, runtime configuration uses `OFFICE_START=1`, `OFFICE_PUBLIC_ORIGIN=https://hwangrin.cloud`, `OFFICE_JAVIS_ORIGIN=https://hwangrin.cloud`, and `OFFICE_MOUNT_PATH=/office`. The established Caddy route stays outside this repository. The reviewed container limits are 384 MiB RAM and 0.5 CPU; no Javis service is part of this image.

## Owner-provided assets and private runtime inputs

The exact 19 GLB filenames, byte sizes, SHA-256 checksums, roles and provenance are in [`asset-manifest.json`](asset-manifest.json). The 18 original employee/animation GLBs match the retained local baseline. The additional GLB is the approved Hazel hair mesh attached to Louise for the exclusive Kyan appearance.

Raw Mixamo files are not redistributed in this public repository, consistent with the existing [`public/models/CREDITS.md`](public/models/CREDITS.md). The Hazel mesh is also kept private because this consolidation does not attest public redistribution rights. Keep these files in the ignored local paths under `public/models/` and run the installer before building.

The exact agent display catalog and Brain-specific layout are owner-specific runtime inputs. They are ignored by Git and copied only from an authorized local source. The public repository includes a catalog template and a generic layout template; neither contains real agent identities. The build fails if the verified bilingual catalog or any of the 19 exact GLBs is missing.

To refresh prepared VI/EN labels for newly discovered source metadata, use [`tools/refresh-agent-localization.mjs`](tools/refresh-agent-localization.mjs) and follow [`AGENT-LOCALIZATION-WORKFLOW.md`](AGENT-LOCALIZATION-WORKFLOW.md). Discovery is read-only; catalog updates are local, hash-checked and do not touch canonical Javis metadata or chat content.

## Runtime behavior

- LIVE is the default and uses the authenticated same-origin Javis session.
- DEMO is separate and scene-only; it does not write Javis Jobs or chat messages.
- Registered Jobs cover Team, Kanban and Auto goal records. Ordinary chat turns and all background execution are not claimed as covered.
- A running registered job takes precedence over ambient scene activity and sends the character to an assigned desk. Waiting, needs-attention and unknown remain distinct from running.
- The full Javis roster remains searchable. The scene renders at most 32 agents, prioritizing verified running and attention-needed states and keeping Kyan visible.
- Kyan is one exclusive Director identity using Louise + the separate Hazel hair mesh; she is not part of the employee pool.
- UAT-only simulation controls and UAT routing are not included in the production source package.

## Checks

`npm run verify:release` checks all model hashes and the private bilingual catalog. The five existing focused tests cover work policy, sofa/café/game-to-desk transitions, workstation allocation, the 32-agent scene selection and Brain-scoped cloud roster handling.
