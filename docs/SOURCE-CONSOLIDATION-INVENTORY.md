# Source consolidation inventory

Inventory captured from the original worktrees before consolidation. Nothing listed below was reset, cleaned, overwritten or committed from those worktrees.

## Clean feature history brought forward

The two committed feature changes were carried into the clean integration branch as two commits (the second omits the original Brain-specific layout data):

- `0280531563ef185880518b73d259a2b3fd9e5a5c`: local read-only Javis viewer, department/language/lighting controls and launcher changes.
- `82cbf637eeae9a2a2fee9865c11b5b8df614bdf`: Viewer parity and localization, Brain/live feed, character assignment, and related verification.

Their 26 distinct paths are in the integration branch. The exact private `javis-layout.json` mappings were replaced with an empty public template; the original mapping remains in the source worktree and in the authorized owner package.

## Feature worktree: 63 status entries

The feature worktree remains at `82cbf637eeae9a2a2fee9865c11b5b8df614bdf` with 63 collapsed status entries (13 modified tracked files and 50 untracked path entries). Its expanded untracked leaf count is 69 because the `public/fonts/` directory contains multiple files.

### 13 modified tracked files

```text
public/index.html
public/js/agent-card.js
public/js/main.js
public/js/messages.json
public/js/scene/office3d.js
public/js/scene/textures.js
public/js/viewer-controls.js
src/javisLive.ts
src/javisViewer.ts
src/server.ts
src/types.ts
tools/cdp-run.cjs
tools/launcher-bg.cjs
```

Classification: uncommitted continuations of the original local Viewer. Their accepted online V1 behavior is represented in the new `online-office/` package. These deltas were not layered over the root app because they are an alternate, unreviewed continuation of that app; the original files remain intact for later review.

### 50 untracked path entries

**UI/assets represented in `online-office/` from the accepted package (not copied into the root app):**

```text
public/fonts/
public/js/agent-identity.js
public/js/agent-panel.js
public/js/brain-selector.js
public/js/chat-panel.js
public/js/compact-chat.js
public/js/composer.js
public/js/conversation.js
public/js/demo-director.js
public/js/interactive-composer.js
public/js/interactive-telemetry.js
public/js/mentions.js
public/js/mobile-dock.js
public/js/mobile-ux.js
public/js/office-commentary.js
public/js/telemetry-adapters.js
public/js/telemetry-model.js
public/mobile-ux.css
```

**Unintegrated server/gateway experiments, including the explicitly named candidate, kept only in the original feature worktree:**

```text
src/assignGateway.ts
src/brainHub.ts
src/bridgeCompatibility.ts
src/chatGateway.ts
src/chatLedger.ts
src/gateway.ts
src/interactiveOffice.ts
src/javisAssign.ts
src/javisChat.ts
src/javisHistory.ts
src/partnersChatCandidate.ts
```

These form a parallel gateway/chat-ledger/interactive-office path and candidate Native Partners route, not the accepted production adapter. They were excluded to avoid committing an unfinished competing backend. Accepted Native Partners and existing same-origin sessions are included from `online-office/src/`.

**Local fixture, browser/launcher helpers and development verification scripts, kept only in the original feature worktree:**

```text
tools/check-bridge.ts
tools/interactive-fixture.ts
tools/launcher-safety.cjs
tools/verify-agent-identities.mjs
tools/verify-assign.mjs
tools/verify-brainhub.mjs
tools/verify-chat-ui.cjs
tools/verify-chat.mjs
tools/verify-commentary.mjs
tools/verify-gateway.mjs
tools/verify-identity-live.mjs
tools/verify-interactive.mjs
tools/verify-mentions.mjs
tools/verify-multibrain.mjs
tools/verify-partners-candidate.mjs
tools/verify-slice-c.mjs
tools/verify-startup-compat.mjs
tools/verify-telemetry-adapters.mjs
tools/verify-telemetry.mjs
tools/verify-v05-slice1.cjs
tools/verify-v05-slice2.cjs
```

These scripts/fixtures target the unintegrated experiments and local UI rather than the released standalone application. The consolidated package carries the five focused Work Status, roster, route and transition checks used for this release.

## Main worktree: 3 local paths

The original main checkout remains at `30561e4d79e6627307377b0b230282b7821dae7d` and still has exactly three status entries:

```text
M  Mo van phong ao.bat
?? tools/mixamo/package-lock.json
?? tools/open-browser-local.cjs
```

They were left untouched and were not copied into the integration branch. The batch file is an owner-local launcher modification; the two untracked files are local Mixamo/browser tooling and are not required by the standalone online package.

## Excluded private/generated inputs

- All 19 GLBs remain ignored owner-provided local build inputs. `online-office/asset-manifest.json` records exact relative paths, byte sizes and SHA-256 hashes; `online-office/tools/install-private-runtime-inputs.mjs` validates and installs them locally.
- The real agent display catalog and Brain-specific layout are excluded from commit history. The empty catalog and layout templates are committed. The release installer takes the private inputs from an authorized local path.
- UAT-only Dockerfile, controls, route rewriting and UAT tests are excluded because UAT was retired. Production `/office/` remains the target.
- Generated `dist/`, `node_modules`, local snapshots, QA traces, deployment images/backups, logs and environment data are excluded.

## Selected release tree

The release source is the separate `online-office/` package copied from the accepted Work Status V1 package, with a reproducible Node 24/esbuild build, sanitized runtime configuration, asset/catalog checks, and the five focused tests. Runtime code matches the accepted package; four static JavaScript files only had trailing-whitespace cleanup. The mount-path test is narrowed to production behavior to remove its retired UAT imports. No production or remote Git state was changed by this inventory.
