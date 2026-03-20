# Project: Office Agents

<!-- Generated: 2026-03-19 by init-advanced -->

## Context

Office Agents is a `pnpm` monorepo for Microsoft Office add-ins with built-in AI chat. The shared runtime lives in `packages/sdk`, the shared Svelte UI layer lives in `packages/core`, the local Office debug bridge lives in `packages/bridge`, and the Office app packages live in `packages/excel`, `packages/powerpoint`, and `packages/word`.

Treat this as a browser-first TypeScript codebase with Office.js integration. Most risky changes touch one of these areas:
- provider/model resolution, sessions, VFS, skills, or storage in `packages/sdk/src`
- shared chat behavior in `packages/core/src/chat`
- live Office runtime inspection or raw execution in `packages/bridge/src`
- Office host tools, prompts, and metadata adapters in `packages/excel/src/lib`, `packages/powerpoint/src/lib`, or `packages/word/src/lib`

## Commands

Use the root scripts unless you have a package-specific reason not to.

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm format
pnpm typecheck
pnpm check
pnpm validate
pnpm bridge:serve
pnpm bridge:stop
pnpm dev-server:excel
pnpm dev-server:ppt
pnpm dev-server:word
pnpm start:excel
pnpm start:ppt
pnpm start:word
```

Package-level validation is available through filters, for example:

```bash
pnpm --filter @office-agents/sdk test
pnpm --filter @office-agents/bridge build
pnpm --filter @office-agents/excel dev-server
```

## Architecture

- `packages/sdk/src/runtime.ts` is the main agent lifecycle entry point. Changes there can affect every Office app.
- `packages/core/src/chat` contains the reusable Svelte chat controller and UI shell used by all add-ins.
- Each Office package exposes an adapter that plugs app-specific tools and metadata into the shared runtime.
- `packages/bridge/src/server.ts`, `client.ts`, and `cli.ts` power the local HTTPS and WebSocket bridge used to inspect or drive a live Office add-in during development.
- Tests exist across the shared packages and some app packages. Prefer targeted tests when changing a single package, then widen scope if the change crosses package boundaries.

## Working Agreements

- Keep changes patch-sized and scoped to the request. Do not refactor adjacent packages unless the task requires it.
- Fix shared behavior in `sdk` or `core` once when possible. Do not patch the same behavior separately in Excel, PowerPoint, and Word unless the hosts truly differ.
- Prefer editing source files under `packages/*/src`. Do not hand-edit generated build output such as `dist/`.
- Preserve package boundaries. If a change belongs in `sdk` or `core`, avoid copying the same logic into the Excel, PowerPoint, or Word packages.
- Use real repo commands only. If a command has not been verified from `package.json`, README, or CI, label it as an assumption instead of presenting it as a rule.
- Run the smallest relevant verification before finishing:
  - package test for a package-local change
  - `pnpm typecheck` for TypeScript or Svelte changes
  - `pnpm validate` when manifests or add-in packaging behavior changed
  - `pnpm check` when the change crosses packages or affects release-critical behavior
- Run `pnpm format` before finishing if you changed files covered by Biome formatting.
- Keep unsafe bridge behavior explicit. `office-bridge exec` defaults to direct taskpane evaluation, so use it only when the task actually needs full runtime access. Prefer `--sandbox` when validating behavior through the app's existing escape-hatch tool.

## Constraints

Normal autonomous actions:
- edit tracked source, config, docs, and tests inside this repo
- run repo-local build, test, lint, manifest validation, and package-filtered commands
- inspect package READMEs, CI workflows, and release scripts to ground decisions

Ask before:
- adding or removing dependencies
- changing release scripts or GitHub workflows
- deleting files or moving files across package boundaries
- changing storage keys, IndexedDB namespaces, manifest IDs, or other compatibility-sensitive identifiers
- changing bridge security posture, certificate handling, or unsafe execution defaults

Never:
- commit secrets, API keys, tokens, or local cert material
- edit `dist/` output as the source of truth
- invent Office.js capabilities or bridge commands that are not present in the code or docs

## What To Read Before Complex Work

- Read the root [README.md](/Users/kosta/LocalDev/office-agents-codex/README.md) first for repo-wide workflow and package map.
- Read [packages/bridge/README.md](/Users/kosta/LocalDev/office-agents-codex/packages/bridge/README.md) before changing bridge transport, CLI behavior, screenshots, or VFS transfer flows.
- Read [packages/sdk/README.md](/Users/kosta/LocalDev/office-agents-codex/packages/sdk/README.md) before changing runtime, storage, VFS, skills, OAuth, or provider config behavior.
- Read the relevant package README before changing an app-specific adapter, Office tool, or dev-server workflow.

## Done Condition

Stop after implementing the requested change, running the relevant verification, and reporting:
- files changed
- commands run
- whether the result is fully verified or what still blocks it
- any follow-up risk that was noticed but intentionally left out of scope
