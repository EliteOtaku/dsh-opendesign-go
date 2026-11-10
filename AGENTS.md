# dsh-opendesign-go

OpenDesign Go 套餐的 DeepSeek Harness 插件（纯 TypeScript）。`go` 指订阅套餐，不是 Go 语言。

## 常用命令

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest（会先跑 compile）
npm run compile     # 构建 lib/
npm run check:dist  # 校验 lib/ 与源码一致
npm run verify:load # 校验产物能在 Cordis 上挂载
```

发布前必须全绿：`typecheck` → `npm test` → `compile` → `check:dist` → `verify:load`。

## 发版要点

- 改版本号必须**同时**改两处：`package.json` 的 `version` 与 `src/config-contract.ts` 的 `PLUGIN_VERSION`。只改一处时 `npm run compile` 会报错并中止（有意校验，防版本漂移）。
- `lib/` 是提交进仓库的构建产物，改源码后要 `npm run compile` 再提交。
- `CHANGELOG.md` 按版本分节，顶部为最新版。

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, each label string equal to its role name. See `docs/agents/triage-labels.md`.

### Domain docs

single-context. See `docs/agents/domain.md`.
