# AI Office source handoff

## Source of truth

The root of this repository remains the original local AI Office application. The accepted standalone online Work Status V1 source lives in [`online-office/`](../online-office/README.md); it is not a replacement for the local application. This package is the reproducible source reference for the accepted `/office/` production release. Reverse-proxy routing, VPS containers and production secrets remain outside Git.

The consolidation branch was built from local `main` / `origin/main` baseline `30561e4d79e6627307377b0b230282b7821dae7d` and includes the changes represented by feature commits `0280531563ef185880518b73d259a2b3fd9e5a5c` and `82cbf637eeae9a2a2fee9865c11b5b8df614bdf`. The two original working trees and all local modifications were left untouched.

See the [source inventory](SOURCE-CONSOLIDATION-INVENTORY.md) for the classification of every reported feature-worktree and main-worktree dirty path, the exclusions and their reasons.

## Consolidation exclusions and preservation

- The reported 63 feature-worktree changes and 3 main-worktree local changes remain in their original worktrees. The feature worktree also has untracked directories whose leaf-file count is higher than the collapsed status count; no cleanup or reset was performed.
- The unfinished `partnersChatCandidate.ts`, interactive fixture, local gateway/chat-ledger experiments, development browser helpers and private QA snapshots were not copied into this release branch. Their original files remain preserved in the feature worktree; the production Native Partners implementation is included from the accepted standalone package.
- The retired UAT Dockerfile, simulation controls, route-rewrite helper and UAT-only tests are excluded. Production Office source and its accepted tests are included.
- Raw employee/animation/Kyan binary assets, the exact agent-display catalog, and Brain-specific layout mappings are not committed. The 19 asset records and hashes are public build provenance only; actual assets and identity data remain owner-provided local build inputs.
- Generated `dist/`, installed `node_modules/`, Docker images, deployment backups, logs, environment files and real workforce snapshots are excluded. The build recipe and sanitized configuration examples are committed.

## Approved Work Status V1

- Same-origin, authenticated Native Partners chat and the Brain-scoped roster are retained.
- Registered Jobs reads are read-only and distinguish running, waiting, needs-attention and unknown. Team, Kanban and Auto-goal Jobs are covered; ordinary chat turns and all background execution are not claimed as covered.
- Verified running work takes precedence over ambient scene behavior and moves an agent to a uniquely assigned workstation before the working pose. A missing station uses a neutral fallback.
- Scene rendering is capped at 32 while the full roster remains searchable. Kyan remains one exclusive Director identity, outside the employee pool.
- The approved character appearance is Louise with the original Hazel hair mesh. VI/EN prepared agent display copy and Brain-specific layout are local owner inputs.
- The UI includes profile, full chat, Quick Chat, localized labels and HUD. UAT-only simulation controls are excluded from the production package.

## Reproducible local release build

Use Node.js 24. Install the owner-authorized 19 GLBs, private bilingual agent catalog and exact private layout into the ignored package paths using [`online-office/tools/install-private-runtime-inputs.mjs`](../online-office/tools/install-private-runtime-inputs.mjs). The installer verifies the asset manifest and catalog schema before copying; it makes no uploads.

```powershell
cd online-office
npm ci
node tools/install-private-runtime-inputs.mjs --models <authorized-public-models-folder> --catalog <private-agent-display-catalog.json> --layout <private-javis-layout.json>
npm run verify:release
npm test
npm run build
```

The exact 19 binary paths and SHA-256 values are recorded in [`online-office/asset-manifest.json`](../online-office/asset-manifest.json). Raw GLBs are not committed: the 18 existing employee/animation GLBs are restricted to owner-authorized build inputs and the Hazel hair redistribution terms were not attested during this consolidation. The private agent catalog and exact layout are also excluded from Git history. Generic catalog/layout templates are included.

## Focused checks recorded during consolidation

- Release integrity: all 19 expected GLBs and the public people catalog matched their SHA-256 manifest; the private bilingual catalog schema passed for 31 entries across 2 Brains.
- The production bundle rebuilt with the pinned accepted esbuild version and matched the accepted staging bundle SHA-256: `9e2f496c5415fa22fe2d52335d4f6daaa25dc63d1fed0728a93833e7b232208d`.
- Focused direct Node checks cover work policy, real-position work transitions, unique desk assignment, the 32-agent scene roster and Brain-scoped roster handling. They must be rerun after any source changes.
- No production, Javis, Caddy, container, authentication or UAT state was changed by source consolidation.

## Consolidation state

The source package and handoff are committed on the clean local branch `codex/ai-office-v1-final`, based on the supplied local `main` / `origin/main` snapshot. The authorized push attempt failed because this session could not connect to `github.com:443` through its configured local proxy; the GitHub CLI also reports its stored credential as invalid. The remote `main` head could not be refreshed, so confirm it is still at the supplied baseline before opening the PR. After network access and the owner’s GitHub CLI connection are restored, push this branch, open the focused PR, run the repository checks, and merge only if the diff remains complete and conflict-free. No PR or remote merge has been created, and `main` is not yet updated.
