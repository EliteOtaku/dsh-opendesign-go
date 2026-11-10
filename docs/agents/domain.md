# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout: single-context

This repo is **single-context**: one shared `GLOSSARY.md` at the repo root, and architecture decisions in `docs/adr/` at the repo root. There is no per-package glossary and no `GLOSSARY-MAP.md`, because this repo is one package with one `src/` tree — not a monorepo.

Neither `GLOSSARY.md` nor `docs/adr/` exists yet. That is expected: `/domain-modeling` creates them lazily, the first time a term or a decision actually gets resolved. Do not pre-create them.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── GLOSSARY.md          ← one shared glossary (not yet created)
├── docs/
│   ├── adr/             ← architecture decisions (not yet created)
│   ├── agents/          ← this skill's config
│   ├── configuration.md
│   ├── development.md
│   ├── models.md
│   └── quota.md
├── src/
└── tests/
```

If this repo ever gains a second package with its own independent vocabulary, revisit this: the layout would move to multi-context, with a root `GLOSSARY-MAP.md` pointing at one `GLOSSARY.md` per context.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
