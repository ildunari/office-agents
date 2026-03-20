# Project: Office Agents

<!-- Generated: 2026-03-19 by init-advanced -->

## What This Repo Does

Office Agents is a `pnpm` monorepo for Microsoft Office add-ins with integrated AI chat. Shared runtime logic lives in `packages/sdk`, shared Svelte UI lives in `packages/core`, the local debug bridge lives in `packages/bridge`, and the app packages are `packages/excel`, `packages/powerpoint`, and `packages/word`.

## Commands

Use the root scripts unless you are intentionally working inside one package:

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
```

For narrower validation, use package filters such as:

```bash
pnpm --filter @office-agents/sdk test
pnpm --filter @office-agents/bridge build
pnpm --filter @office-agents/word test
```

## Key Directories

- `packages/sdk/src`: runtime, provider config, storage, VFS, skills, OAuth, shared tools
- `packages/core/src/chat`: reusable chat UI and controller
- `packages/bridge/src`: local HTTPS and WebSocket bridge plus CLI
- `packages/excel/src/lib`, `packages/powerpoint/src/lib`, `packages/word/src/lib`: app adapters, Office tools, system prompts, and host-specific behavior

## Workflow

- Keep changes focused. If a fix belongs in `sdk` or `core`, prefer fixing it there once rather than carrying parallel patches in each Office app.
- Before changing runtime, storage, bridge behavior, or release paths, read the closest README or workflow file first. That usually prevents speculative changes in parts of the repo that have real compatibility constraints.
- When a task affects manifests or add-in packaging, run `pnpm validate`, because manifest mistakes break the actual install and launch path rather than just a local test.
- When a task crosses package boundaries or changes shared behavior, prefer `pnpm check`. It mirrors the important CI gates in one pass, so it is a good default when narrower validation feels risky.
- Use `pnpm format` after touching files that Biome formats, but avoid broad formatting-only churn when the task is small.

## Conventions

- Edit source files, not generated output such as `dist/`.
- Keep package boundaries intact unless the task clearly needs a cross-package change.
- Avoid inventing commands or Office.js behavior. If something is uncertain, inspect the code, the package README, or CI before relying on it.
- `office-bridge exec` runs direct taskpane code by default. Use it only when full runtime access is part of the task, and prefer `--sandbox` when you want to exercise the app's existing escape-hatch path instead.
- If you notice adjacent cleanup while working, mention it in the handoff instead of expanding scope automatically.

## Approval Gates

Pause and ask before:
- adding or removing dependencies
- changing GitHub workflows or release scripts
- deleting files or moving files across packages
- changing storage namespaces, manifest identifiers, or other compatibility-sensitive keys
- changing bridge security defaults or certificate handling

## What To Read Before Complex Tasks

- [README.md](/Users/kosta/LocalDev/office-agents-claude/README.md)
- [packages/sdk/README.md](/Users/kosta/LocalDev/office-agents-claude/packages/sdk/README.md)
- [packages/bridge/README.md](/Users/kosta/LocalDev/office-agents-claude/packages/bridge/README.md)
- the package README for the Office app you are changing
