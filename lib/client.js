window.__ModuleLoader__.load({ id: "dsh-opendesign-go", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/config-contract.ts
var PROVIDER_ID = "dsh-opendesign-go";
var DISPLAY_NAME = "OpenDesign Go";
var PLUGIN_VERSION = "0.1.23";
var PROFILE_ENTRY_ID = "opendesign-go";
var DEFAULT_API_KEY_ENV = "OPENDESIGN_API_KEY";
var PROTOCOL_IDS = ["chat", "responses", "anthropic"];
var PROTOCOL_LABELS = {
  chat: "Chat Completions",
  responses: "Responses",
  anthropic: "Anthropic"
};

// src/client/accounts-controller.ts
var REQUIRED_REMOTES = ["remote.credentials", "remote.settings"];
function unwrap(result) {
  if (result.ok) return result.value;
  const detail = result.error instanceof Error ? result.error.message : String(result.error);
  throw new Error(detail);
}
function accountCommands(ctx) {
  let stage = "mounting";
  let credentials;
  let settings;
  const ready = ctx.inject(REQUIRED_REMOTES, (remoteCtx) => {
    const remote = remoteCtx.remote;
    credentials = remote.credentials;
    settings = remote.settings;
    stage = credentials === void 0 || settings === void 0 ? "namespaces present but methods missing" : "ready";
  });
  const readEntry = async () => {
    if (settings === void 0) return void 0;
    const described = unwrap(await settings.describe());
    return described.namespaces.find((row) => row.ns === PROFILE_ENTRY_ID);
  };
  const writeEntry = async (patch) => {
    if (settings === void 0) return "unknown";
    try {
      const current = await readEntry();
      if (current === void 0) return "rejected";
      unwrap(await settings.update(PROFILE_ENTRY_ID, patch, current.revision));
      return "applied";
    } catch (error) {
      ctx.logger.warn?.(`llm-opendesign-go: settings write failed (${String(error)})`);
      return "unknown";
    }
  };
  const execute = async (command) => {
    if (credentials === void 0 || settings === void 0) return "unknown";
    let accounts = [];
    let selected = "";
    try {
      const row = await readEntry();
      accounts = row?.value?.accounts ?? [];
      selected = row?.value?.apiKeyEnv ?? "";
      if (row === void 0) {
        stage = `entry "${PROFILE_ENTRY_ID}" absent from describe()`;
        return "unknown";
      }
    } catch (error) {
      stage = `describe failed: ${String(error)}`;
      ctx.logger.warn?.(`llm-opendesign-go: could not read settings (${String(error)})`);
      return "unknown";
    }
    try {
      if (command.kind === "add") {
        if (accounts.some((account2) => account2.id === command.id)) return "applied";
        const used = new Set(accounts.map((account2) => account2.apiKeyEnv));
        let index = 0;
        while (used.has(`OPENDESIGN_ACCOUNT_${index + 1}`)) index += 1;
        const ref = `OPENDESIGN_ACCOUNT_${index + 1}`;
        unwrap(await credentials.set(ref, command.key));
        const account = {
          id: command.id,
          name: command.name,
          apiKeyEnv: ref,
          ...command.workspaceId === void 0 ? {} : { workspaceId: command.workspaceId }
        };
        return await writeEntry({
          accounts: [...accounts, account],
          apiKeyEnv: selected.length === 0 ? ref : selected
        });
      }
      if (command.kind === "remove") {
        const next = accounts.filter((account) => account.apiKeyEnv !== command.ref);
        if (next.length === 0) return "rejected";
        const first = next[0];
        if (first === void 0) return "rejected";
        const result = await writeEntry({ accounts: next, apiKeyEnv: first.apiKeyEnv });
        if (result === "applied") {
          try {
            unwrap(await credentials.unset(command.ref));
          } catch {
          }
        }
        return result;
      }
      if (command.kind === "select") {
        if (!accounts.some((account) => account.apiKeyEnv === command.ref)) return "rejected";
        return await writeEntry({ apiKeyEnv: command.ref });
      }
      if (command.kind === "rename") {
        if (!accounts.some((account) => account.apiKeyEnv === command.ref)) return "rejected";
        return await writeEntry({
          accounts: accounts.map((account) => account.apiKeyEnv === command.ref ? { ...account, name: command.name } : account)
        });
      }
      if (command.kind === "replace-key") {
        unwrap(await credentials.set(command.ref, command.key));
        return "applied";
      }
      return await writeEntry({ autoSwitch: command.value });
    } catch (error) {
      ctx.logger.warn?.(`llm-opendesign-go: account command failed (${String(error)})`);
      return "unknown";
    }
  };
  return { execute, state: () => stage, ready };
}

// src/update-check.ts
var PACKAGE_NAME = "dsh-opendesign-go";
var REGISTRY_LATEST_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
var GITHUB_TAGS_URL = `https://api.github.com/repos/EliteOtaku/${PACKAGE_NAME}/tags?per_page=30`;
function compareVersions(left, right) {
  const parse = (value) => (value.split("-")[0] ?? "").split(".").map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
function textOf(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function parseVersionLine(raw, current = PLUGIN_VERSION) {
  const empty = {
    current,
    npm: void 0,
    github: void 0,
    checkedAt: void 0,
    aheadOf: [],
    stale: false,
    writtenBy: void 0
  };
  if (raw === void 0 || raw.length === 0) return empty;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
  const row = parsed;
  const written = textOf(row.current);
  if (written === void 0) return empty;
  const npm = textOf(row.npm) ?? textOf(row.latest);
  const github = textOf(row.github) ?? textOf(row.githubLatest);
  const checkedAt = textOf(row.checkedAt);
  if (written !== current) {
    return { ...empty, stale: true, writtenBy: written };
  }
  const aheadOf = [];
  if (npm !== void 0 && compareVersions(npm, current) > 0) aheadOf.push("npm");
  if (github !== void 0 && compareVersions(github, current) > 0) aheadOf.push("github");
  return { current, npm, github, checkedAt, aheadOf, stale: false, writtenBy: void 0 };
}
function versionStateOf(line) {
  if (line.aheadOf.length > 0) return "outdated";
  if (line.npm !== void 0 && line.github !== void 0) return "current";
  return "unknown";
}

// src/client/update-controller.ts
function unwrap2(result) {
  if (result.ok) return result.value;
  throw new Error(result.error instanceof Error ? result.error.message : String(result.error));
}
function refusalText(change) {
  const detail = change.error?.diagnostic;
  if (detail !== void 0 && detail.length > 0) return detail;
  const code = change.error?.code;
  if (code === "incompatible-version") return "\u8BE5\u7248\u672C\u8981\u6C42\u7684 DSH \u7248\u672C\u9AD8\u4E8E\u5F53\u524D\u8FD0\u884C\u7248\u672C";
  if (code === "management-required") return "\u5BBF\u4E3B\u4E0D\u5141\u8BB8\u672C\u9875\u9762\u7BA1\u7406\u8FD9\u4E2A\u5305";
  if (code === "not-removable") return "\u5BBF\u4E3B\u8BA4\u4E3A\u8FD9\u4E2A\u5305\u4E0D\u80FD\u79FB\u9664";
  const output = change.packageResult?.output;
  const gate = output?.includes("ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION") === true;
  if (gate) return "\u8FD9\u4E2A\u7248\u672C\u521A\u53D1\u5E03\uFF0C\u5C1A\u672A\u901A\u8FC7 pnpm \u7684\u6700\u77ED\u53D1\u5E03\u65F6\u957F\u68C0\u67E5\uFF1B\u7B49\u51E0\u5C0F\u65F6\u540E\u518D\u8BD5";
  if (code !== void 0) return `\u5BBF\u4E3B\u62D2\u7EDD\uFF1A${code}`;
  return "\u5BBF\u4E3B\u672A\u8BF4\u660E\u539F\u56E0";
}
function appliedText(change, version) {
  const landed = version ?? change.version;
  if (change.application === "restart-required") {
    return { ok: true, message: `\u5DF2\u88C5\u597D ${landed ?? ""}\uFF0C\u91CD\u542F DSH \u540E\u751F\u6548`.replace("  ", " ") };
  }
  return { ok: true, message: `\u5DF2\u66F4\u65B0\u5230 ${landed ?? ""}`.replace("  ", " ") };
}
function updateBundleOutcome(update) {
  const change = update.result;
  if (change.application !== "failed" && change.application !== "cancelled") {
    return appliedText(change, update.to);
  }
  const reason = refusalText(change);
  if (update.step === "check") return { ok: false, message: `\u88C5\u4E0D\u4E0A ${update.to}\uFF1A${reason}` };
  if (update.step === "remove") return { ok: false, message: `\u5378\u8F7D ${update.from} \u5931\u8D25\uFF0C\u672A\u505A\u6539\u52A8\uFF1A${reason}` };
  return { ok: false, message: `\u66F4\u65B0\u5230 ${update.to} \u5931\u8D25\uFF0C\u5DF2\u6062\u590D ${update.from}\uFF1A${reason}` };
}
function updateCommands(ctx) {
  let stage = "mounting";
  let manager;
  const ready = ctx.inject(["remote.pluginManager"], (remoteCtx) => {
    const remote = remoteCtx.remote;
    manager = remote.pluginManager;
    stage = manager === void 0 ? "namespace present but methods missing" : "ready";
  });
  const require2 = () => {
    if (manager === void 0) throw new Error("\u5BBF\u4E3B\u672A\u63D0\u4F9B\u63D2\u4EF6\u7BA1\u7406\u5668\uFF08remote.pluginManager\uFF09");
    return manager;
  };
  const updateFromNpm = async (version) => {
    try {
      const pluginManager = require2();
      const listing = unwrap2(await pluginManager.listVersions(PACKAGE_NAME, void 0));
      if (listing.status === "refused") {
        return { ok: false, message: `\u8BFB\u4E0D\u5230\u53EF\u7528\u7248\u672C\uFF08${listing.problem}\uFF09\uFF1A${listing.reason}` };
      }
      const row = listing.versions.find((item) => item.version === version);
      if (row === void 0) {
        return { ok: false, message: `registry \u4E0A\u6CA1\u6709\u6BD4 ${listing.installed} \u66F4\u65B0\u7684 ${version}` };
      }
      if (row.incompatible !== void 0) {
        return { ok: false, message: `${version} \u8981\u6C42\u7684 DSH \u7248\u672C\u9AD8\u4E8E\u5F53\u524D\u8FD0\u884C\u7248\u672C` };
      }
      const answer = unwrap2(await pluginManager.updateBundle(PACKAGE_NAME, version, {
        registry: listing.registry,
        requestId: crypto.randomUUID()
      }));
      return updateBundleOutcome(answer);
    } catch (error) {
      return { ok: false, message: `\u66F4\u65B0\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}` };
    }
  };
  const installFromGithub = async (version) => {
    let removed;
    try {
      const pluginManager = require2();
      const removal = unwrap2(await pluginManager.removeBundle(PACKAGE_NAME));
      if (removal.application === "failed" || removal.application === "cancelled") {
        return { ok: false, message: `\u5378\u8F7D\u5F53\u524D\u7248\u672C\u5931\u8D25\uFF0C\u672A\u505A\u6539\u52A8\uFF1A${refusalText(removal)}` };
      }
      removed = removal.version;
      const spec = `github:EliteOtaku/${PACKAGE_NAME}#v${version}`;
      const install = unwrap2(await pluginManager.installBundle(spec, {
        enabled: true,
        requestId: crypto.randomUUID()
      }));
      if (install.application === "failed" || install.application === "cancelled") {
        throw new Error(refusalText(install));
      }
      return appliedText(install, version);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (removed === void 0) return { ok: false, message: `\u4ECE GitHub \u5B89\u88C5\u5931\u8D25\uFF1A${reason}` };
      try {
        const restore = unwrap2(await require2().installBundle(`${PACKAGE_NAME}@${removed}`, {
          enabled: true,
          requestId: crypto.randomUUID()
        }));
        const restored = restore.application !== "failed" && restore.application !== "cancelled";
        return {
          ok: false,
          message: restored ? `\u4ECE GitHub \u5B89\u88C5\u5931\u8D25\uFF0C\u5DF2\u6062\u590D ${removed}\uFF1A${reason}` : `\u4ECE GitHub \u5B89\u88C5\u5931\u8D25\uFF0C\u4E14\u6062\u590D ${removed} \u4E5F\u5931\u8D25\uFF08${refusalText(restore)}\uFF09\u2014\u2014\u8BF7\u5728\u63D2\u4EF6\u7BA1\u7406\u91CC\u91CD\u88C5`
        };
      } catch (restoreError) {
        const detail = restoreError instanceof Error ? restoreError.message : String(restoreError);
        return {
          ok: false,
          message: `\u4ECE GitHub \u5B89\u88C5\u5931\u8D25\uFF08${reason}\uFF09\uFF0C\u4E14\u65E0\u6CD5\u6062\u590D ${removed}\uFF08${detail}\uFF09\u2014\u2014\u8BF7\u5728\u63D2\u4EF6\u7BA1\u7406\u91CC\u91CD\u88C5`
        };
      }
    }
  };
  return {
    updateFromNpm,
    installFromGithub,
    state: () => stage,
    ready
  };
}

// src/client/Section.tsx
var import_react4 = require("react");

// src/client/usage-format.ts
var WARN_AT = 25;
var STOP_AT = 5;
function windowLabel(durationSeconds) {
  const days = durationSeconds / 86400;
  if (Number.isInteger(days) && days >= 1) return `${days} \u5929`;
  const hours = durationSeconds / 3600;
  if (Number.isInteger(hours) && hours >= 1) return `${hours} \u5C0F\u65F6`;
  return `${Math.round(durationSeconds / 60)} \u5206\u949F`;
}
function compactWindowLabel(durationSeconds) {
  const days = durationSeconds / 86400;
  if (Number.isInteger(days) && days >= 1) return `${days}d`;
  const hours = durationSeconds / 3600;
  if (Number.isInteger(hours) && hours >= 1) return `${hours}h`;
  return `${Math.round(durationSeconds / 60)}m`;
}
function resetCountdown(resetsAt, now = Date.now()) {
  const target = Date.parse(resetsAt);
  if (!Number.isFinite(target)) return "\u91CD\u7F6E\u65F6\u95F4\u672A\u77E5";
  const delta = target - now;
  if (delta <= 0) return "\u5373\u5C06\u91CD\u7F6E";
  const minutes = Math.floor(delta / 6e4);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days}\u5929 ${hours}\u5C0F\u65F6\u540E\u91CD\u7F6E`;
  if (hours > 0) return `${hours}\u5C0F\u65F6 ${rest}\u5206\u540E\u91CD\u7F6E`;
  return `${rest}\u5206\u949F\u540E\u91CD\u7F6E`;
}
function barColor(remaining) {
  if (remaining <= STOP_AT) return "#e5484d";
  if (remaining <= WARN_AT) return "#e5a00d";
  return "#3b82f6";
}
function daysToExhaust(window2, now = Date.now()) {
  const used = Number(window2.usedCredits);
  const limit = Number(window2.limitCredits);
  const reset = Date.parse(window2.resetsAt);
  if (!Number.isFinite(used) || !Number.isFinite(limit) || !Number.isFinite(reset)) return void 0;
  if (used <= 0 || limit <= 0) return void 0;
  const start = reset - window2.durationSeconds * 1e3;
  const elapsed = now - start;
  if (elapsed <= 0) return void 0;
  const perMs = used / elapsed;
  if (perMs <= 0) return void 0;
  return (limit - used) / perMs / 864e5;
}
function relativeTime(iso, now = Date.now()) {
  if (iso === void 0 || iso.length === 0) return void 0;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return void 0;
  const minutes = Math.floor((now - at) / 6e4);
  if (minutes < 1) return "\u521A\u521A";
  if (minutes < 60) return `${minutes} \u5206\u949F\u524D`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} \u5C0F\u65F6\u524D`;
  return `${Math.floor(hours / 24)} \u5929\u524D`;
}

// src/usage-contract.ts
function creditsToNumber(value) {
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function parseReport(raw) {
  if (raw === void 0 || raw.length === 0) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (parsed === null || typeof parsed !== "object") return void 0;
  const row = parsed;
  if (typeof row.since !== "number" || typeof row.until !== "number" || typeof row.calls !== "number") return void 0;
  if (!Array.isArray(row.models)) return void 0;
  const models = [];
  for (const entry of row.models) {
    if (entry === null || typeof entry !== "object") continue;
    const model = entry;
    if (typeof model.model !== "string" || typeof model.calls !== "number" || typeof model.inputTokens !== "number" || typeof model.outputTokens !== "number" || typeof model.costUsd !== "number") continue;
    models.push({
      model: model.model,
      calls: model.calls,
      inputTokens: model.inputTokens,
      outputTokens: model.outputTokens,
      cacheReadTokens: typeof model.cacheReadTokens === "number" ? model.cacheReadTokens : 0,
      cacheWriteTokens: typeof model.cacheWriteTokens === "number" ? model.cacheWriteTokens : 0,
      costUsd: model.costUsd,
      unpricedCalls: typeof model.unpricedCalls === "number" ? model.unpricedCalls : 0
    });
  }
  return {
    since: row.since,
    until: row.until,
    calls: row.calls,
    inputTokens: typeof row.inputTokens === "number" ? row.inputTokens : 0,
    outputTokens: typeof row.outputTokens === "number" ? row.outputTokens : 0,
    cacheReadTokens: typeof row.cacheReadTokens === "number" ? row.cacheReadTokens : 0,
    cacheWriteTokens: typeof row.cacheWriteTokens === "number" ? row.cacheWriteTokens : 0,
    costUsd: typeof row.costUsd === "number" ? row.costUsd : 0,
    unpricedCalls: typeof row.unpricedCalls === "number" ? row.unpricedCalls : 0,
    models,
    pricedAs: "base-tier"
  };
}
function parseUsage(raw) {
  if (raw === void 0 || raw.length === 0) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (parsed === null || typeof parsed !== "object") return void 0;
  const row = parsed;
  if (typeof row.asOf !== "string" || typeof row.tier !== "string" || typeof row.eligible !== "boolean") return void 0;
  if (!Array.isArray(row.windows)) return void 0;
  const windows = [];
  for (const entry of row.windows) {
    if (entry === null || typeof entry !== "object") continue;
    const window2 = entry;
    if (typeof window2.durationSeconds !== "number" || typeof window2.usedCredits !== "string" || typeof window2.limitCredits !== "string" || typeof window2.remainingCredits !== "string" || typeof window2.resetsAt !== "string") continue;
    windows.push({
      status: window2.status === "unknown" ? "unknown" : "ok",
      durationSeconds: window2.durationSeconds,
      usedCredits: window2.usedCredits,
      limitCredits: window2.limitCredits,
      remainingCredits: window2.remainingCredits,
      percentUsed: typeof window2.percentUsed === "number" ? window2.percentUsed : null,
      resetsAt: window2.resetsAt
    });
  }
  let result = {
    asOf: row.asOf,
    tier: row.tier,
    eligible: row.eligible,
    windows,
    ...typeof row.error === "string" ? { error: row.error } : {}
  };
  if (typeof row.creditsPerUsd === "number" && row.creditsPerUsd > 0) {
    result = { ...result, creditsPerUsd: row.creditsPerUsd };
  }
  const wallet = row.wallet;
  if (wallet !== null && typeof wallet === "object") {
    const walletRow = wallet;
    if (typeof walletRow.balanceUsd === "string") {
      return {
        ...result,
        wallet: typeof walletRow.subscriptionPeriodEnd === "string" ? { balanceUsd: walletRow.balanceUsd, subscriptionPeriodEnd: walletRow.subscriptionPeriodEnd } : { balanceUsd: walletRow.balanceUsd }
      };
    }
  }
  return result;
}

// src/diagnostics.ts
function parseRouteDiagnostics(raw) {
  if (raw === void 0 || raw.length === 0) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (parsed === null || typeof parsed !== "object") return void 0;
  const row = parsed;
  if (typeof row.registered !== "boolean" || typeof row.enabled !== "boolean" || typeof row.credentialResolved !== "boolean" || typeof row.triedRef !== "string") return void 0;
  return {
    registered: row.registered,
    enabled: row.enabled,
    credentialResolved: row.credentialResolved,
    triedRef: row.triedRef,
    ...typeof row.lastError === "string" ? { lastError: row.lastError } : {},
    modelCount: typeof row.modelCount === "number" ? row.modelCount : 0,
    ...typeof row.attachmentsMounted === "boolean" ? { attachmentsMounted: row.attachmentsMounted } : {},
    asOf: typeof row.asOf === "string" ? row.asOf : ""
  };
}

// src/model-params.ts
var MODEL_DEFAULTS = {
  // Anthropic: 1M context (widened from the earlier 200K) and 128K max output.
  // The context figure is independently confirmed: overflowing the endpoint
  // reports "maximum context length is 1000000 tokens".
  "claude-haiku-5.5": { contextWindow: 1e6, maxTokens: 128e3, inputModalities: ["text", "image"], reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"] },
  // api-docs.deepseek.com/zh-cn/quick_start/pricing: 1M context, 384K output.
  // Its footnote 1 says both retired ids (`deepseek-v4-flash` and
  // `deepseek-v4-flash-vision-exp`) are still callable but now served by
  // DeepSeek-V4.1-Flash-1017 — so both inherit V4.1-Flash's limits *and* its
  // image support. Declaring only one of them image-capable described the same
  // backend two different ways and hid the capability behind the other id.
  "deepseek-v4-flash": { contextWindow: 1e6, maxTokens: 384e3, inputModalities: ["text", "image"], reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "ultra", "max"] },
  "deepseek-v4-flash-vision-exp": { contextWindow: 1e6, maxTokens: 384e3, inputModalities: ["text", "image"], reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "ultra", "max"] },
  // The same pricing table's 功能 row marks 图像理解 as 不支持 for V4-Pro.
  "deepseek-v4-pro": { contextWindow: 1e6, maxTokens: 384e3, inputModalities: ["text"], reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "ultra", "max"] },
  "deepseek-v4.1-flash": { contextWindow: 1e6, maxTokens: 384e3, inputModalities: ["text", "image"], reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "ultra", "max"] },
  // The slow tier of the model above, so everything it inherits comes from the
  // same vendor table. DeepSeek documents neither the id nor its limits: the
  // name and the tier itself are OpenDesign's (https://open-design.ai/pricing/
  // lists "DeepSeek V4.1 Flash Eco" and https://open-design.ai/model-credits/
  // warns it "may respond more slowly at times", recommending it for batch
  // work). Everything else here was probed against the same gateway: every
  // effort base takes is accepted except `ultra`, which fails deterministically
  // with `[code=upstream_error]` in under a second across five rounds, so the
  // list stops at `max` without `ultra`; `max_tokens: 384000` is accepted; and
  // images are read correctly (a purple/yellow split answers "purple and
  // yellow"), making the gateway's `input_modalities: ["text"]` for this id
  // wrong in the same way its output_budget was.
  "deepseek-v4.1-flash-eco": { contextWindow: 1e6, maxTokens: 384e3, inputModalities: ["text", "image"], reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"] },
  // docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash and its English mirror
  // docs.z.ai/guides/vlm/glm-5.3-flash both state 1M context, 128K max output.
  "glm-5.3-flash": { contextWindow: 1e6, maxTokens: 128e3, inputModalities: ["text", "image"], reasoningEfforts: ["low", "high", "max"] },
  "glm-5.3-flashx": { contextWindow: 1e6, maxTokens: 128e3, inputModalities: ["text", "image"], reasoningEfforts: ["low", "high", "max"] },
  // OpenAI: 1,050,000 total context, 922,000 max input, 128,000 max output.
  // The three figures are consistent — 922000 + 128000 = 1050000 — which is the
  // same shape as Hy4 Preview's 960000 + 64000. Note that a 1.5M-token prompt
  // was accepted without an error, so the endpoint does not enforce this bound
  // itself; the documented limit is the one used here.
  "gpt-6-luna": { contextWindow: 105e4, maxTokens: 128e3, inputModalities: ["text", "image"], reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "ultra", "max"] },
  // tencentcloud.com/techpedia/148044: 1M context, 960K max input, 64K output.
  "hy4-preview": { contextWindow: 1e6, maxTokens: 64e3, inputModalities: ["text"], reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"] },
  // platform.kimi.com/docs/guide/kimi-k2-7-code-quickstart: 256K context, and
  // the endpoint reports "Range of max_tokens should be [1, 262144]".
  "kimi-k2.7-code": { contextWindow: 262144, maxTokens: 262144, inputModalities: ["text", "image"], reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"] },
  // mimo.mi.com/docs/zh-CN/quick-start/summary/model: 1M context, 128K output.
  "mimo-v2.6-flash": { contextWindow: 1e6, maxTokens: 128e3, inputModalities: ["text", "image"], reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"] },
  "mimo-v2.6-pro": { contextWindow: 1e6, maxTokens: 128e3, inputModalities: ["text", "image"], reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"] },
  // platform.minimax.io/docs/guides/text-generation: 1M context. The model always
  // thinks, so `none` is not an option — the gateway answers 400 every time it is
  // sent, which matches the vendor note that this id "requires adaptive thinking".
  // Its effort list is the only one in this table that starts at `minimal` while
  // still reaching `max`; `ultra` is rejected the same way. The 524,288 output
  // ceiling is measured, not documented: 524,288 is accepted and 524,289 is not.
  "minimax-m3.1-flash": { contextWindow: 1e6, maxTokens: 524288, inputModalities: ["text", "image"], reasoningEfforts: ["minimal", "low", "medium", "high", "xhigh", "max"] }
};
var GENERIC_DEFAULTS = Object.freeze({
  contextWindow: 1e6,
  maxTokens: 128e3,
  inputModalities: Object.freeze(["text", "image"]),
  reasoningEfforts: Object.freeze([
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "ultra",
    "max"
  ])
});
var MIN_CONTEXT_WINDOW = 1e3;
var MAX_CONTEXT_WINDOW = 1e7;
var MIN_MAX_TOKENS = 1;
var MAX_MAX_TOKENS = 1e6;
function parseModelParams(raw) {
  if (raw === void 0 || raw.length === 0) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out = {};
  for (const [model, value] of Object.entries(parsed)) {
    if (value === null || typeof value !== "object") continue;
    const row = value;
    const entry = {
      ...typeof row.contextWindow === "number" ? { contextWindow: row.contextWindow } : {},
      ...typeof row.maxTokens === "number" ? { maxTokens: row.maxTokens } : {}
    };
    if (entry.contextWindow !== void 0 || entry.maxTokens !== void 0) out[model] = entry;
  }
  return out;
}
function parseEnabledModels(raw) {
  if (raw === void 0 || raw.length === 0) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((id10) => typeof id10 === "string" && id10.length > 0);
}
function isModelEnabled(model, enabled) {
  return enabled.length === 0 || enabled.includes(model);
}

// src/catalog.ts
var GO_DESIGN_PLAN_MODELS = [
  { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
  { id: "deepseek-v4.1-flash-eco", name: "DeepSeek V4.1 Flash Eco" },
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
  { id: "deepseek-v4-flash-vision-exp", name: "DeepSeek V4 Flash Vision Exp" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
  { id: "claude-haiku-5.5", name: "Claude Haiku 5.5" },
  { id: "gpt-6-luna", name: "GPT-6 Luna" },
  { id: "glm-5.3-flash", name: "GLM-5.3 Flash" },
  { id: "glm-5.3-flashx", name: "GLM-5.3 Flash-X" },
  { id: "kimi-k2.7-code", name: "Kimi K2.7 Code" },
  { id: "mimo-v2.6-flash", name: "MiMo V2.6 Flash" },
  { id: "mimo-v2.6-pro", name: "MiMo V2.6 Pro" },
  { id: "minimax-m3.1-flash", name: "MiniMax M3.1 Flash" },
  { id: "hy4-preview", name: "Hunyuan H4 Preview" }
];
var NAME_FIXES = Object.freeze({
  deepseek: "DeepSeek",
  gpt: "GPT",
  glm: "GLM",
  kimi: "Kimi",
  mimo: "MiMo",
  minimax: "MiniMax",
  openai: "OpenAI",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
  qwen: "Qwen",
  hy: "Hunyuan",
  seed: "Seedream",
  nano: "Nano",
  banana: "Banana",
  image: "Image",
  seedream: "Seedream"
});
function displayNameOf(id10) {
  const known = GO_DESIGN_PLAN_MODELS.find((model) => model.id === id10);
  if (known !== void 0) return known.name;
  if (id10.length === 0) return "";
  return id10.split("-").map((part) => {
    const fix = NAME_FIXES[part.toLowerCase()];
    if (fix !== void 0) return fix;
    if (/^\d/u.test(part)) return part;
    return part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1);
  }).join(" ");
}
function parseCatalog(raw) {
  if (raw === void 0 || raw.length === 0) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return void 0;
  const row = parsed;
  const ids = row.ids;
  if (!Array.isArray(ids)) return void 0;
  const clean = ids.filter((id10) => typeof id10 === "string" && id10.length > 0);
  const rawImages = row.imageIds;
  const images = Array.isArray(rawImages) ? rawImages.filter((id10) => typeof id10 === "string" && clean.includes(id10)) : [];
  const source = row.source === "fallback" ? "fallback" : "gateway";
  return {
    asOf: typeof row.asOf === "string" && row.asOf.length > 0 ? row.asOf : void 0,
    source,
    ids: clean,
    imageIds: images,
    error: typeof row.error === "string" && row.error.length > 0 ? row.error : void 0
  };
}
function catalogRowsOf(snapshot) {
  if (snapshot === void 0) return GO_DESIGN_PLAN_MODELS;
  const images = new Set(snapshot.imageIds);
  return snapshot.ids.map((id10) => {
    const row = { id: id10, name: displayNameOf(id10) };
    return images.has(id10) ? { ...row, imageGeneration: true } : row;
  });
}

// css-module:src/client/ui/primitives.module.css
var css = ".c4PW4q_card{background:var(--ods-surface);border:1px solid var(--ods-border);border-radius:var(--ods-radius);flex-direction:column;display:flex;overflow:hidden}.c4PW4q_cardHead{grid-template-columns:1fr auto;align-items:start;gap:2px 12px;padding:14px 16px 0;display:grid}.c4PW4q_cardHeading{align-items:center;gap:8px;min-width:0;display:flex}.c4PW4q_cardBadge{flex-shrink:0;display:inline-flex}.c4PW4q_cardTitle{letter-spacing:-.01em;color:var(--ods-text);margin:0;font-size:14px;font-weight:600}.c4PW4q_cardActions{justify-self:end;align-items:center;gap:8px;display:flex}.c4PW4q_cardDesc{color:var(--ods-text-2);grid-column:1/-1;margin:4px 0 0;font-size:12px;line-height:1.55}.c4PW4q_cardBody{padding:12px 16px 16px}.c4PW4q_cardBodyColumns{flex-direction:column;display:flex}.c4PW4q_row{grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px;padding:10px 0;display:grid}.c4PW4q_row+.c4PW4q_row,.c4PW4q_divider+.c4PW4q_row,.c4PW4q_row+.c4PW4q_divider{border-top:1px solid var(--ods-border)}.c4PW4q_rowTop{align-items:start}.c4PW4q_rowText{min-width:0}.c4PW4q_rowLabelWrap{min-width:0;cursor:inherit}.c4PW4q_rowLabel{color:var(--ods-text);font-size:13px;font-weight:500}.c4PW4q_rowHint{color:var(--ods-text-2);margin:3px 0 0;font-size:12px;line-height:1.55}.c4PW4q_rowControl{justify-self:end;align-items:center;gap:8px;min-width:0;display:flex}.c4PW4q_badge{white-space:nowrap;border-radius:999px;align-items:center;gap:4px;padding:1px 7px;font-size:11px;font-weight:500;line-height:1.7;display:inline-flex}.c4PW4q_badgeNeutral{color:var(--ods-text-2);background:var(--ods-surface-2)}.c4PW4q_badgeOk{color:var(--ods-ok);background:color-mix(in srgb, var(--ods-ok) 12%, transparent)}.c4PW4q_badgeWarn{color:var(--ods-warn);background:color-mix(in srgb, var(--ods-warn) 14%, transparent)}.c4PW4q_badgeStop{color:var(--ods-stop);background:color-mix(in srgb, var(--ods-stop) 12%, transparent)}.c4PW4q_hint{color:var(--ods-text-2);margin:0;font-size:12px;line-height:1.6}.c4PW4q_divider{background:var(--ods-border);height:1px;margin:6px 0}.c4PW4q_switch{background:var(--ods-surface-3);cursor:pointer;border:none;border-radius:999px;flex-shrink:0;width:38px;height:22px;padding:0;transition:background .12s;position:relative}.c4PW4q_switch:disabled{opacity:.45;cursor:not-allowed}.c4PW4q_switchOn{background:var(--ods-accent)}.c4PW4q_switchThumb{background:var(--dsw-alias-switch-thumb,#fff);border-radius:999px;width:18px;height:18px;transition:transform .12s;position:absolute;top:2px;left:2px;box-shadow:0 1px 2px #00000040}.c4PW4q_switchOn .c4PW4q_switchThumb{transform:translate(16px)}.c4PW4q_btn{border-radius:var(--ods-radius-sm);border:1px solid var(--ods-border);color:var(--ods-text);cursor:pointer;white-space:nowrap;background:0 0;align-items:center;gap:6px;padding:5px 12px;font-size:12px;font-weight:500;line-height:1.5;transition:background .12s,border-color .12s;display:inline-flex}.c4PW4q_btn:hover:not(:disabled){background:var(--ods-hover)}.c4PW4q_btn:disabled{opacity:.5;cursor:default}.c4PW4q_btnPrimary{background:var(--ods-accent);color:var(--ods-on-accent);border-color:#0000}.c4PW4q_btnPrimary:hover:not(:disabled){background:var(--ods-accent);opacity:.88}.c4PW4q_btnDanger{color:var(--ods-stop);border-color:color-mix(in srgb, var(--ods-stop) 35%, transparent)}.c4PW4q_btnDanger:hover:not(:disabled){background:color-mix(in srgb, var(--ods-stop) 10%, transparent)}.c4PW4q_bar{background:var(--ods-surface-3);border-radius:999px;flex:1;height:8px;overflow:hidden}.c4PW4q_barFill{border-radius:999px;height:100%;transition:width .2s}.c4PW4q_stat{flex-direction:column;gap:2px;min-width:0;display:flex}.c4PW4q_statLabel{color:var(--ods-text-2);font-size:11px}.c4PW4q_statValue{font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:var(--ods-text);font-size:18px;font-weight:600}.c4PW4q_statHint{color:var(--ods-text-3);font-size:11px}.c4PW4q_field{flex-direction:column;gap:4px;display:flex}.c4PW4q_fieldLabel{color:var(--ods-text-3);font-size:11px}.c4PW4q_fieldHint{color:var(--ods-text-3);font-size:11px;line-height:1.5}.c4PW4q_input{box-sizing:border-box;width:100%;font:inherit;color:var(--ods-text);background:var(--ods-sunken);border:1px solid var(--ods-border);border-radius:var(--ods-radius-sm);padding:6px 9px;font-size:12px}.c4PW4q_input::placeholder{color:var(--ods-text-3)}.c4PW4q_input:focus-visible{outline:2px solid var(--ods-accent);outline-offset:-1px;border-color:#0000}.c4PW4q_cardDesc>span{display:block}.c4PW4q_cardDesc>span+span{margin-top:5px}";
var id = "src/client/ui/primitives.module.css";
var attr = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr + '="' + id + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr, id);
  tag.textContent = css;
  (document.head || document.documentElement).appendChild(tag);
}
var primitives_default = { "badge": "c4PW4q_badge", "badgeNeutral": "c4PW4q_badgeNeutral", "badgeOk": "c4PW4q_badgeOk", "badgeStop": "c4PW4q_badgeStop", "badgeWarn": "c4PW4q_badgeWarn", "bar": "c4PW4q_bar", "barFill": "c4PW4q_barFill", "btn": "c4PW4q_btn", "btnDanger": "c4PW4q_btnDanger", "btnPrimary": "c4PW4q_btnPrimary", "card": "c4PW4q_card", "cardActions": "c4PW4q_cardActions", "cardBadge": "c4PW4q_cardBadge", "cardBody": "c4PW4q_cardBody", "cardBodyColumns": "c4PW4q_cardBodyColumns", "cardDesc": "c4PW4q_cardDesc", "cardHead": "c4PW4q_cardHead", "cardHeading": "c4PW4q_cardHeading", "cardTitle": "c4PW4q_cardTitle", "divider": "c4PW4q_divider", "field": "c4PW4q_field", "fieldHint": "c4PW4q_fieldHint", "fieldLabel": "c4PW4q_fieldLabel", "hint": "c4PW4q_hint", "input": "c4PW4q_input", "row": "c4PW4q_row", "rowControl": "c4PW4q_rowControl", "rowHint": "c4PW4q_rowHint", "rowLabel": "c4PW4q_rowLabel", "rowLabelWrap": "c4PW4q_rowLabelWrap", "rowText": "c4PW4q_rowText", "rowTop": "c4PW4q_rowTop", "stat": "c4PW4q_stat", "statHint": "c4PW4q_statHint", "statLabel": "c4PW4q_statLabel", "statValue": "c4PW4q_statValue", "switch": "c4PW4q_switch", "switchOn": "c4PW4q_switchOn", "switchThumb": "c4PW4q_switchThumb" };

// src/client/ui/primitives.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function cx(...names) {
  return names.filter((name) => typeof name === "string" && name.length > 0).join(" ");
}
var badgeTone = {
  neutral: primitives_default.badgeNeutral ?? "",
  ok: primitives_default.badgeOk ?? "",
  warn: primitives_default.badgeWarn ?? "",
  stop: primitives_default.badgeStop ?? ""
};
function Card({ title, description, badge, actions, children, columns }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: primitives_default.card, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: primitives_default.cardHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: primitives_default.cardHeading, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: primitives_default.cardTitle, children: title }),
        badge !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: primitives_default.cardBadge, children: badge })
      ] }),
      actions !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: primitives_default.cardActions, children: actions }),
      description !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: primitives_default.cardDesc, children: description })
    ] }),
    children !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cx(primitives_default.cardBody, columns === true && primitives_default.cardBodyColumns), children })
  ] });
}
function Row({ label, hint, children, htmlFor, align }) {
  const heading = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: primitives_default.rowText, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: primitives_default.rowLabel, children: label }),
    hint !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: primitives_default.rowHint, children: hint })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cx(primitives_default.row, align === "top" && primitives_default.rowTop), children: [
    htmlFor === void 0 ? heading : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { htmlFor, className: primitives_default.rowLabelWrap, children: heading }),
    children !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: primitives_default.rowControl, children })
  ] });
}
function Badge({ tone = "neutral", children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cx(primitives_default.badge, badgeTone[tone]), children });
}
function Switch({ checked, onChange, label, disabled }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      role: "switch",
      "aria-checked": checked,
      "aria-label": label,
      title: label,
      disabled: disabled === true,
      className: cx(primitives_default.switch, checked && primitives_default.switchOn),
      onClick: () => {
        onChange(!checked);
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: primitives_default.switchThumb })
    }
  );
}
function Button({ children, onClick, variant = "ghost", disabled, title, type = "button" }) {
  const weight = variant === "primary" ? primitives_default.btnPrimary : variant === "danger" ? primitives_default.btnDanger : primitives_default.btnGhost;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type,
      onClick,
      disabled: disabled === true,
      title,
      className: cx(primitives_default.btn, weight),
      children
    }
  );
}
function Bar({ percent, color, label }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      className: primitives_default.bar,
      role: "progressbar",
      "aria-valuenow": clamped,
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-label": label,
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: primitives_default.barFill, style: { width: `${clamped}%`, background: color } })
    }
  );
}
function Field({ label, hint, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: primitives_default.field, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: primitives_default.fieldLabel, children: label }),
    children,
    hint !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: primitives_default.fieldHint, children: hint })
  ] });
}
function Input({ value, onChange, placeholder, type = "text" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "input",
    {
      className: primitives_default.input,
      type,
      value,
      placeholder,
      autoComplete: "off",
      spellCheck: false,
      onChange: (event) => {
        onChange(event.target.value);
      }
    }
  );
}

// css-module:src/client/QuotaCard.module.css
var css2 = ".qIVOMG_body{flex-direction:column;gap:14px;display:flex}.qIVOMG_window{flex-direction:column;gap:6px;display:flex}.qIVOMG_windowHead{justify-content:space-between;align-items:baseline;gap:12px;display:flex}.qIVOMG_windowName{color:var(--ods-text);font-size:13px;font-weight:500}.qIVOMG_windowMeta{color:var(--ods-text-3);font-variant-numeric:tabular-nums;font-size:11px}.qIVOMG_barLine{align-items:center;gap:10px;display:flex}.qIVOMG_barLine>:first-child{flex:1}.qIVOMG_windowPercent{text-align:right;font-variant-numeric:tabular-nums;min-width:62px;color:var(--ods-text);font-size:12px;font-weight:600}.qIVOMG_windowFoot{color:var(--ods-text-3);font-variant-numeric:tabular-nums;flex-wrap:wrap;gap:6px;font-size:11px;line-height:1.6;display:flex}.qIVOMG_missing{color:var(--ods-text-2);margin:0;font-size:12px;line-height:1.6}.qIVOMG_wallet{border-top:1px solid var(--ods-border);color:var(--ods-text-2);flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px;padding-top:10px;font-size:12px;display:flex}.qIVOMG_walletValue{font-variant-numeric:tabular-nums;color:var(--ods-text);font-weight:600}.qIVOMG_spend{border-top:1px solid var(--ods-border);color:var(--ods-text-3);font-variant-numeric:tabular-nums;flex-direction:column;gap:3px;padding-top:10px;font-size:11px;line-height:1.6;display:flex}.qIVOMG_stamp{color:var(--ods-text-3);font-variant-numeric:tabular-nums;font-size:11px}.qIVOMG_actions{align-items:center;gap:8px;display:flex}";
var id2 = "src/client/QuotaCard.module.css";
var attr2 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr2 + '="' + id2 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr2, id2);
  tag.textContent = css2;
  (document.head || document.documentElement).appendChild(tag);
}
var QuotaCard_default = { "actions": "qIVOMG_actions", "barLine": "qIVOMG_barLine", "body": "qIVOMG_body", "missing": "qIVOMG_missing", "spend": "qIVOMG_spend", "stamp": "qIVOMG_stamp", "wallet": "qIVOMG_wallet", "walletValue": "qIVOMG_walletValue", "window": "qIVOMG_window", "windowFoot": "qIVOMG_windowFoot", "windowHead": "qIVOMG_windowHead", "windowMeta": "qIVOMG_windowMeta", "windowName": "qIVOMG_windowName", "windowPercent": "qIVOMG_windowPercent" };

// src/client/QuotaCard.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function WindowRow({ window: window2, creditsPerUsd }) {
  const used = window2.percentUsed;
  const remaining = used === null ? null : Math.max(0, 100 - used);
  const label = windowLabel(window2.durationSeconds);
  const dollars = (credits) => {
    if (creditsPerUsd === void 0 || creditsPerUsd <= 0) return void 0;
    const used2 = creditsToNumber(credits);
    if (used2 === null) return void 0;
    return `$${(used2 / creditsPerUsd).toFixed(2)}`;
  };
  const exhaust = daysToExhaust(window2);
  const usedUsd = dollars(window2.usedCredits);
  const limitUsd = dollars(window2.limitCredits);
  const remainingUsd = (() => {
    if (creditsPerUsd === void 0 || creditsPerUsd <= 0) return void 0;
    const left = creditsToNumber(window2.remainingCredits);
    if (left === null) return void 0;
    return `$${(left / creditsPerUsd).toFixed(2)}`;
  })();
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: QuotaCard_default.window, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: QuotaCard_default.windowHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: QuotaCard_default.windowName, children: [
        label,
        "\u989D\u5EA6"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: QuotaCard_default.windowMeta, children: resetCountdown(window2.resetsAt) })
    ] }),
    remaining === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: QuotaCard_default.missing, children: [
      "\u6B64\u7A97\u53E3\u672A\u8FD4\u56DE\u53EF\u7528\u9650\u989D\uFF08\u5DF2\u7528 ",
      window2.usedCredits,
      " / \u9650\u989D ",
      window2.limitCredits,
      "\uFF09"
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: QuotaCard_default.barLine, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Bar, { percent: remaining, color: barColor(remaining), label: `${label}\u989D\u5EA6\u5269\u4F59\u767E\u5206\u6BD4` }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: QuotaCard_default.windowPercent, children: [
          "\u5269\u4F59 ",
          remaining,
          "%"
        ] })
      ] }),
      remainingUsd !== void 0 && limitUsd !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: QuotaCard_default.windowFoot, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          "\u5269\u4F59 ",
          remainingUsd,
          " / ",
          limitUsd
        ] }),
        usedUsd !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          "\uFF08\u5DF2\u7528 ",
          usedUsd,
          "\uFF09"
        ] }),
        exhaust !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
          "\xB7 \u7167\u6B64\u901F\u7387\u7EA6 ",
          exhaust < 1 ? "\u4E0D\u8DB3 1" : exhaust.toFixed(1),
          " \u5929\u7528\u5B8C"
        ] })
      ] })
    ] })
  ] });
}
function QuotaCard({ snapshot, loading, ledgerCostUsd, onRefresh, refreshing }) {
  if (loading && snapshot === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { title: "\u8BA2\u9605\u989D\u5EA6", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: QuotaCard_default.missing, children: "\u6B63\u5728\u8BFB\u53D6\u989D\u5EA6\u2026" }) });
  }
  if (snapshot === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { title: "\u8BA2\u9605\u989D\u5EA6", description: "\u52FE\u9009\u4E0B\u65B9\u300C\u4F7F\u7528\u672C\u673A OpenDesign \u7684\u767B\u5F55\u51ED\u8BC1\u300D\u540E\u5373\u53EF\u663E\u793A\u771F\u5B9E\u7684 5 \u5C0F\u65F6 / 7 \u5929\u989D\u5EA6\u3002", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: QuotaCard_default.missing, children: "\u5C1A\u672A\u8BFB\u53D6\u3002" }) });
  }
  if (snapshot.error !== void 0 && snapshot.windows.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Card, { title: "\u8BA2\u9605\u989D\u5EA6", badge: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "stop", children: "\u8BFB\u53D6\u5931\u8D25" }), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: QuotaCard_default.missing, children: snapshot.error }) });
  }
  const period = snapshot.wallet === void 0 ? "" : snapshot.wallet.subscriptionPeriodEnd === void 0 ? " \xB7 \u989D\u5EA6\u7528\u5C3D\u540E\u6309\u91CF\u4ED8\u8D39" : ` \xB7 \u5468\u671F\u81F3 ${new Date(snapshot.wallet.subscriptionPeriodEnd).toLocaleDateString()}`;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    Card,
    {
      title: "\u8BA2\u9605\u989D\u5EA6",
      description: snapshot.error === void 0 ? void 0 : `\u90E8\u5206\u6570\u636E\u7F3A\u5931\uFF1A${snapshot.error}`,
      actions: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: QuotaCard_default.actions, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: QuotaCard_default.stamp, children: [
          "\u8BFB\u53D6\u4E8E ",
          new Date(snapshot.asOf).toLocaleTimeString()
        ] }),
        onRefresh !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Button,
          {
            onClick: onRefresh,
            disabled: refreshing === true,
            title: "\u7ACB\u5373\u8BFB\u53D6\u4E00\u6B21\u989D\u5EA6\uFF08\u7EA6\u9700 2 \u79D2\uFF09",
            children: refreshing === true ? "\u8BFB\u53D6\u4E2D\u2026" : "\u5237\u65B0"
          }
        )
      ] }),
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: QuotaCard_default.body, children: [
        snapshot.windows.map((window2) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(WindowRow, { window: window2, creditsPerUsd: snapshot.creditsPerUsd }, window2.durationSeconds)),
        snapshot.wallet !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: QuotaCard_default.wallet, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
            "\u94B1\u5305\u4F59\u989D ",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: QuotaCard_default.walletValue, children: [
              "$",
              snapshot.wallet.balanceUsd
            ] }),
            period
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: QuotaCard_default.windowMeta, children: "\u5E76\u53D1 10\uFF08\u6309 2026-10-19 \u5B98\u65B9\u53E3\u5F84\uFF09" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(PlanSpendComparison, { snapshot, ledgerCostUsd })
      ] })
    }
  );
}
function PlanSpendComparison({ snapshot, ledgerCostUsd }) {
  const rate = snapshot.creditsPerUsd;
  if (rate === void 0 || rate <= 0) return void 0;
  const weekly = snapshot.windows.reduce(
    (widest, window2) => widest === void 0 || window2.durationSeconds > widest.durationSeconds ? window2 : widest,
    void 0
  );
  if (weekly === void 0) return void 0;
  const planUsd = creditsToNumber(weekly.usedCredits);
  if (planUsd === null) return void 0;
  const planSpent = planUsd / rate;
  const measured = ledgerCostUsd;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: QuotaCard_default.spend, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
      "\u672C\u5468\u671F\u5DF2\u6263 ",
      planSpent.toFixed(2),
      " \u7F8E\u5143\uFF08\u6309 ",
      rate,
      " credits = $1 \u6298\u7B97\uFF09"
    ] }),
    measured !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
      "\u7ECF\u672C\u63D2\u4EF6 ",
      measured.toFixed(4),
      " \u7F8E\u5143\uFF08\u6309\u5382\u5546\u5355\u4EF7\u4F30\u7B97\uFF0C\u4E0D\u542B\u5B98\u65B9\u5BA2\u6237\u7AEF\u4E0E\u5176\u4ED6\u5DE5\u5177\uFF09"
    ] })
  ] });
}

// src/client/BillingCard.tsx
var import_react = require("react");

// css-module:src/client/BillingCard.module.css
var css3 = ".vuUgDG_block{flex-direction:column;gap:4px;display:flex}.vuUgDG_divider{border-top:1px solid var(--ods-border);padding-top:12px}.vuUgDG_allowance{font-variant-numeric:tabular-nums;color:var(--ods-text);font-size:13px;font-weight:500}.vuUgDG_note{color:var(--ods-text-3);font-variant-numeric:tabular-nums;font-size:11px;line-height:1.6}.vuUgDG_aligned{font-variant-numeric:tabular-nums;color:var(--ods-text-2);flex-direction:column;gap:2px;font-size:12px;display:flex}.vuUgDG_alignedAt{color:var(--ods-text-3);font-size:11px}.vuUgDG_disclosure{width:100%;color:var(--ods-text-2);font:inherit;text-align:left;cursor:pointer;background:0 0;border:none;align-items:center;gap:6px;padding:0;font-size:12px;display:flex}.vuUgDG_disclosure:hover{color:var(--ods-text)}.vuUgDG_chevron{width:12px;color:var(--ods-text-3);font-size:10px}.vuUgDG_cost{font-variant-numeric:tabular-nums;color:var(--ods-text-2);flex-direction:column;gap:4px;margin-top:8px;font-size:12px;display:flex}";
var id3 = "src/client/BillingCard.module.css";
var attr3 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr3 + '="' + id3 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr3, id3);
  tag.textContent = css3;
  (document.head || document.documentElement).appendChild(tag);
}
var BillingCard_default = { "aligned": "vuUgDG_aligned", "alignedAt": "vuUgDG_alignedAt", "allowance": "vuUgDG_allowance", "block": "vuUgDG_block", "chevron": "vuUgDG_chevron", "cost": "vuUgDG_cost", "disclosure": "vuUgDG_disclosure", "divider": "vuUgDG_divider", "note": "vuUgDG_note" };

// src/client/BillingCard.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var MONTHLY_WINDOW_SECONDS = 7 * 86400;
function spentFromCredits(credits, creditsPerUsd) {
  if (creditsPerUsd === void 0 || !Number.isFinite(creditsPerUsd) || creditsPerUsd <= 0) return void 0;
  const value = creditsToNumber(credits);
  if (value === null) return void 0;
  return value / creditsPerUsd;
}
function usd(value) {
  return value === void 0 ? "\u2014" : `$${value.toFixed(2)}`;
}
function widestWindow(windows) {
  return windows.reduce(
    (best, window2) => best === void 0 || window2.durationSeconds > best.durationSeconds ? window2 : best,
    void 0
  );
}
function alignedAtText(at) {
  const date = new Date(at);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}\u6708${day}\u65E5 ${hour}:${minute}`;
}
function BillingCard({ snapshot, plan, measuredUsd, baseline, onAlign, editable }) {
  const [costOpen, setCostOpen] = (0, import_react.useState)(false);
  if (snapshot === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Card, { title: "\u5957\u9910\u5BF9\u8D26", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: BillingCard_default.note, children: "\u5C1A\u672A\u8BFB\u53D6\u989D\u5EA6\uFF0C\u65E0\u6CD5\u5BF9\u8D26\u3002" }) });
  }
  const widest = widestWindow(snapshot.windows);
  const monthly = widest !== void 0 && widest.durationSeconds >= MONTHLY_WINDOW_SECONDS ? widest : void 0;
  const monthlySpent = monthly === void 0 ? void 0 : spentFromCredits(monthly.usedCredits, snapshot.creditsPerUsd);
  const projected = (() => {
    if (monthlySpent === void 0 || monthly === void 0) return void 0;
    const start = Date.parse(monthly.resetsAt) - monthly.durationSeconds * 1e3;
    if (!Number.isFinite(start)) return void 0;
    const elapsed = Date.now() - start;
    if (elapsed <= 0) return void 0;
    return monthlySpent / elapsed * 30 * 864e5;
  })();
  const percent = monthlySpent === void 0 || plan === void 0 || plan.monthlyCapUsd <= 0 ? void 0 : Math.round(monthlySpent / plan.monthlyCapUsd * 100);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    Card,
    {
      title: "\u5957\u9910\u5BF9\u8D26",
      description: "\u5B98\u65B9\u5BA3\u4F20\u989D\u5EA6\u4E0E\u63D2\u4EF6\u5B9E\u6D4B\u6210\u672C\u5206\u5F00\u5217\uFF0C\u4E8C\u8005\u53E3\u5F84\u4E0D\u540C\u3002",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: BillingCard_default.block, children: plan !== void 0 && monthly !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: BillingCard_default.allowance, children: [
            "\u6708\u603B\u989D\u5EA6 ",
            usd(monthlySpent),
            " / ",
            usd(plan.monthlyCapUsd),
            percent !== void 0 && `\uFF08${percent}%\uFF09`
          ] }),
          projected !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: BillingCard_default.note, children: [
            "\u6309\u5F53\u524D\u901F\u7387\u5916\u63A8\uFF0C\u6574\u6708\u7EA6 ",
            usd(projected),
            plan.monthlyCapUsd > 0 && `\uFF08\u76F8\u5F53\u4E8E\u6708\u989D\u5EA6\u7684 ${Math.round(projected / plan.monthlyCapUsd * 100)}%\uFF09`,
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { opacity: 0.85 }, children: [
              " ",
              "\u2014 \u5916\u63A8\u503C\uFF0C\u4EC5\u4F5C\u53C2\u8003"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: BillingCard_default.note, children: "\u6708\u603B\u989D\u5EA6\u53D6\u5B98\u65B9\u9875\u7684\u5BA3\u4F20\u503C\uFF1B\u7A97\u53E3\u8BFB\u6570\u6309 10,000 credits/\u7F8E\u5143\u6298\u7B97\uFF0C \u4E24\u8005\u76F8\u5DEE\u7EA6 3.7 \u500D\uFF0C\u53E3\u5F84\u4EE5\u7A97\u53E3\u4E3A\u51C6\uFF08\u89C1 docs/quota.md\uFF09" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: BillingCard_default.divider, children: baseline === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          Button,
          {
            disabled: onAlign === void 0 || !editable,
            onClick: onAlign === void 0 ? void 0 : () => onAlign(),
            children: "\u5BF9\u9F50\u5F53\u524D\u5468\u671F"
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(AlignmentSummary, { baseline, monthly, snapshot, measuredUsd }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: BillingCard_default.divider, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { type: "button", className: BillingCard_default.disclosure, onClick: () => setCostOpen((open) => !open), "aria-expanded": costOpen, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: BillingCard_default.chevron, children: costOpen ? "\u25BE" : "\u25B8" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "\u7B49\u4EF7 API \u6210\u672C\uFF08\u4EC5\u4F9B\u53C2\u8003\uFF09" })
          ] }),
          costOpen && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: BillingCard_default.cost, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
              "\u5B9E\u6D4B ",
              measuredUsd === void 0 ? "\u6682\u65E0\u6570\u636E" : `$${measuredUsd.toFixed(4)}`
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: BillingCard_default.note, children: "\u6309\u5404\u5382\u5546\u516C\u5F00\u5355\u4EF7\u4F30\u7B97\uFF1B\u5957\u9910\u6309 credits \u8BA1\u8D39\u4E14\u7F13\u5B58\u8F93\u5165\u5360\u6BD4\u4E0D\u540C\uFF0C\u6B64\u503C\u4EC5\u4F9B\u53C2\u8003\uFF0C\u4E0D\u4EE3\u8868\u8D26\u5355\u3002" })
          ] })
        ] })
      ]
    }
  );
}
function AlignmentSummary({ baseline, monthly, snapshot, measuredUsd }) {
  const usedNow = monthly === void 0 ? null : creditsToNumber(monthly.usedCredits);
  const rate = snapshot.creditsPerUsd;
  const planUsd = usedNow === null || rate === void 0 || rate <= 0 ? void 0 : Math.max(0, (usedNow - baseline.credits) / rate);
  const measuredDelta = measuredUsd === void 0 ? void 0 : Math.max(0, measuredUsd - baseline.measuredUsd);
  const ratio = planUsd !== void 0 && planUsd > 0 && measuredDelta !== void 0 && measuredDelta > 0 ? planUsd / measuredDelta : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: BillingCard_default.aligned, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: BillingCard_default.alignedAt, children: [
      "\u81EA ",
      alignedAtText(baseline.at),
      " \u8D77\u7684\u589E\u91CF"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
      "\u5957\u9910 ",
      usd(planUsd),
      " \xB7 \u5B9E\u6D4B ",
      usd(measuredDelta),
      ratio !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: BillingCard_default.alignedAt, children: ` \xB7 \u6BD4\u503C ${ratio.toFixed(1)}` })
    ] })
  ] });
}

// src/plans.ts
var PLAN_SPECS = Object.freeze({
  go: Object.freeze({ monthlyUsd: 10, monthlyCapUsd: 220 }),
  plus: Object.freeze({ monthlyUsd: 20, monthlyCapUsd: 290 }),
  pro: Object.freeze({ monthlyUsd: 100, monthlyCapUsd: 360 }),
  max: Object.freeze({ monthlyUsd: 200, monthlyCapUsd: 600 })
});
var TIER_NAMES = ["go", "plus", "pro", "max"];
var CAP_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
function isPlanTier(value) {
  return TIER_NAMES.includes(value);
}
function parsePlanOverrides(raw) {
  const overrides = {};
  if (raw === void 0) return overrides;
  for (const part of raw.split(",")) {
    const entry = part.trim();
    if (entry === "") continue;
    const separator = entry.indexOf(":");
    if (separator <= 0 || separator === entry.length - 1) continue;
    if (entry.indexOf(":", separator + 1) !== -1) continue;
    const tier = entry.slice(0, separator).trim();
    const capText = entry.slice(separator + 1).trim();
    if (!isPlanTier(tier)) continue;
    if (!CAP_PATTERN.test(capText)) continue;
    const cap = Number(capText);
    if (!Number.isFinite(cap) || cap <= 0) continue;
    overrides[tier] = cap;
  }
  return overrides;
}
function planOf(tier, overrides) {
  if (!isPlanTier(tier)) return void 0;
  const base = PLAN_SPECS[tier];
  const override = overrides[tier];
  if (override === void 0 || !Number.isFinite(override) || override <= 0) return base;
  return { monthlyUsd: base.monthlyUsd, monthlyCapUsd: override };
}
function parseBaseline(raw) {
  if (raw === void 0 || raw.length === 0) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (parsed === null || typeof parsed !== "object") return void 0;
  const row = parsed;
  const at = row.at;
  const credits = row.credits;
  const measuredUsd = row.measuredUsd;
  if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) return void 0;
  if (typeof credits !== "number" || !Number.isFinite(credits) || credits < 0) return void 0;
  const measured = typeof measuredUsd === "number" && Number.isFinite(measuredUsd) && measuredUsd >= 0 ? measuredUsd : 0;
  return { at, credits, measuredUsd: measured };
}

// src/client/route-explanation.ts
function explainRouteProblem(diagnostics) {
  if (diagnostics === void 0) return void 0;
  if (diagnostics.registered) return void 0;
  const causes = [];
  if (!diagnostics.enabled) {
    causes.push({ text: "\u300C\u542F\u7528 OpenDesign Go\u300D\u5F00\u5173\u662F\u5173\u7684\uFF0C\u6253\u5F00\u5B83\u5373\u53EF" });
  }
  if (!diagnostics.credentialResolved) {
    causes.push({
      text: `\u51ED\u636E ${diagnostics.triedRef || "\uFF08\u672A\u914D\u7F6E\uFF09"} \u6CA1\u6709\u89E3\u6790\u5230\uFF0C\u68C0\u67E5 API Key \u662F\u5426\u5DF2\u4FDD\u5B58`
    });
  }
  if (diagnostics.enabled && diagnostics.credentialResolved) {
    causes.push({
      text: "\u63D2\u4EF6\u6761\u76EE\u53EF\u80FD\u6CA1\u6709\u5B8C\u6574\u6CE8\u518C\uFF1Aprofile \u7684 dsh.profile.bundles \u7F3A\u5C11 dsh-opendesign-go\uFF0C\u5378\u8F7D\u540E\u91CD\u88C5\u4E00\u6B21"
    });
    if (diagnostics.lastError !== void 0) {
      causes.push({ text: `\u5BBF\u4E3B\u62A5\u544A\uFF1A${diagnostics.lastError}` });
    }
  }
  return {
    title: "\u6A21\u578B\u6CA1\u6709\u6CE8\u518C\uFF0C\u4F1A\u8BDD\u7684\u6A21\u578B\u9009\u62E9\u5668\u91CC\u770B\u4E0D\u5230\u5B83\u4EEC",
    causes
  };
}
function modelCountOf(diagnostics, advertised) {
  if (diagnostics === void 0) return { count: advertised, stale: false };
  return { count: advertised, stale: diagnostics.modelCount !== advertised };
}

// css-module:src/client/UsageCard.module.css
var css4 = ".YQEAZq_table{font-variant-numeric:tabular-nums;grid-template-columns:minmax(0,1fr) auto auto auto;gap:0;font-size:12px;display:grid}.YQEAZq_headCell{color:var(--ods-text-3);border-bottom:1px solid var(--ods-border);padding:0 0 6px;font-size:11px}.YQEAZq_cell{border-bottom:1px solid var(--ods-border);color:var(--ods-text-2);padding:7px 0}.YQEAZq_headCell:not(:last-child),.YQEAZq_cell:not(:last-child){padding-right:14px}.YQEAZq_model{text-overflow:ellipsis;white-space:nowrap;color:var(--ods-text);overflow:hidden}.YQEAZq_num{text-align:right}.YQEAZq_recovered{color:var(--ods-text-3);flex-direction:column;gap:2px;font-size:11px;line-height:1.6;display:flex}.YQEAZq_foot{color:var(--ods-text-3);margin:0;font-size:11px;line-height:1.6}";
var id4 = "src/client/UsageCard.module.css";
var attr4 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr4 + '="' + id4 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr4, id4);
  tag.textContent = css4;
  (document.head || document.documentElement).appendChild(tag);
}
var UsageCard_default = { "cell": "YQEAZq_cell", "foot": "YQEAZq_foot", "headCell": "YQEAZq_headCell", "model": "YQEAZq_model", "num": "YQEAZq_num", "recovered": "YQEAZq_recovered", "table": "YQEAZq_table" };

// src/client/UsageCard.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function tokens(tokens3) {
  if (tokens3 >= 1e6) return `${(tokens3 / 1e6).toFixed(1)}M`;
  if (tokens3 >= 1e3) return `${(tokens3 / 1e3).toFixed(1)}k`;
  return String(tokens3);
}
function money(usd2) {
  return usd2 >= 0.01 ? `$${usd2.toFixed(2)}` : `$${usd2.toFixed(4)}`;
}
function UsageCard({ report }) {
  if (report === void 0 || report.calls === 0 && report.recovered === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      Card,
      {
        title: "\u672C\u5730\u7528\u91CF",
        description: "\u8FD8\u6CA1\u6709\u901A\u8FC7\u672C\u63D2\u4EF6\u53D1\u51FA\u7684\u8BF7\u6C42\u3002\u8FD9\u91CC\u53EA\u7EDF\u8BA1\u7ECF\u672C\u63D2\u4EF6\u8DEF\u7531\u7684\u8C03\u7528\uFF0C\u5176\u4ED6 provider \u4E0E OpenDesign \u5B98\u65B9\u5BA2\u6237\u7AEF\u7684\u7528\u91CF\u4E0D\u8BA1\u5165\u3002"
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    Card,
    {
      title: "\u672C\u5730\u7528\u91CF \xB7 \u8FD1 30 \u5929",
      description: report.unpricedCalls > 0 ? `\u672C\u6B21\u6709 ${report.unpricedCalls} \u6B21\u8BF7\u6C42\u672A\u8BA1\u5165\u91D1\u989D\u3002` : void 0,
      actions: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: UsageCard_default.headCell, children: [
        report.calls,
        " \u6B21\u8BF7\u6C42 \xB7 \u4F30\u7B97 ",
        money(report.costUsd)
      ] }),
      children: [
        report.recovered !== void 0 && report.recovered.calls > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: UsageCard_default.recovered, children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
            "\u53E6\u6709 ",
            report.recovered.calls,
            " \u6B21\u5386\u53F2\u8C03\u7528\uFF08",
            money(report.recovered.costUsd),
            "\uFF09\u672A\u7ECF\u8FC7\u672C\u63D2\u4EF6\uFF0C\u4ECE\u4F1A\u8BDD\u65E5\u5FD7\u8865\u7B97\u3002"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
            "\u8FD9\u4E9B\u662F\u63D2\u4EF6\u505A\u51FA\u6765\u4E4B\u524D\uFF0C\u7528 DSH \u81EA\u5B9A\u4E49\u6A21\u578B\u76F4\u8FDE OpenDesign \u7684\u6D88\u8017\uFF1B \u7F13\u5B58\u8BFB ",
            Math.round(report.recovered.cacheReadTokens / 1e3),
            "k token \u5DF2\u8BA1\u5165\u3002"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: UsageCard_default.table, children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: UsageCard_default.headCell, children: "\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: cx(UsageCard_default.headCell, UsageCard_default.num), children: "\u8F93\u5165 / \u8F93\u51FA" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: cx(UsageCard_default.headCell, UsageCard_default.num), children: "\u8BF7\u6C42" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: cx(UsageCard_default.headCell, UsageCard_default.num), children: "\u4F30\u7B97" }),
          report.models.map((row) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: { display: "contents" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: cx(UsageCard_default.cell, UsageCard_default.model), title: row.model, children: row.model }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: cx(UsageCard_default.cell, UsageCard_default.num), children: [
              tokens(row.inputTokens),
              " / ",
              tokens(row.outputTokens)
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: cx(UsageCard_default.cell, UsageCard_default.num), children: row.calls }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: cx(UsageCard_default.cell, UsageCard_default.num), children: row.unpricedCalls === row.calls ? "\u672A\u5B9A\u4EF7" : money(row.costUsd) })
          ] }, row.model))
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { className: UsageCard_default.foot, children: [
          "\u91D1\u989D\u6309\u5B98\u65B9\u516C\u5F00\u4EF7\u76EE\u8868\u7684",
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: "\u57FA\u7840\u6863" }),
          "\u4F30\u7B97\uFF1A\u8D85\u51FA\u9636\u68AF\u9608\u503C\u7684\u8BF7\u6C42\u4F1A\u88AB\u4F4E\u4F30\uFF1B\u6807\u300C\u672A\u5B9A\u4EF7\u300D\u7684\u6A21\u578B\u53EA\u8BA1 token\uFF0C\u4E0D\u8BA1\u91D1\u989D\u3002 \u8FD9\u4E0D\u662F\u8D26\u5355\uFF0C\u5B9E\u9645\u6263\u8D39\u4EE5 OpenDesign \u63A7\u5236\u53F0\u4E3A\u51C6\u3002"
        ] })
      ]
    }
  );
}

// src/client/AccountsCard.tsx
var import_react2 = require("react");

// src/accounts.ts
var MAX_ACCOUNTS = 20;
function accountRefOf(config) {
  const ref = config.apiKeyEnv.trim();
  return ref.length === 0 ? DEFAULT_API_KEY_ENV : ref;
}
function moveAccountFirst(accounts, ref) {
  const index = accounts.findIndex((account) => account.apiKeyEnv === ref);
  if (index <= 0) return accounts;
  const head = accounts[index];
  if (head === void 0) return accounts;
  return [head, ...accounts.slice(0, index), ...accounts.slice(index + 1)];
}
function accountsOf(config) {
  const ref = accountRefOf(config);
  const accounts = config.accounts ?? [];
  if (accounts.some((account) => account.apiKeyEnv === ref)) return moveAccountFirst(accounts, ref);
  return [{ id: `legacy:${ref}`, name: "", apiKeyEnv: ref }, ...accounts];
}

// css-module:src/client/AccountsCard.module.css
var css5 = "._5vAKdq_accounts{flex-direction:column;gap:8px;display:flex}._5vAKdq_account{border:1px solid var(--ods-border);border-radius:var(--ods-radius-sm);flex-direction:column;gap:8px;padding:9px 11px;display:flex}._5vAKdq_accountActive{border-color:color-mix(in srgb, var(--ods-accent) 55%, var(--ods-border));background:color-mix(in srgb, var(--ods-accent) 7%, transparent)}._5vAKdq_accountTop{justify-content:space-between;align-items:center;gap:12px;display:flex}._5vAKdq_accountMain{align-items:center;gap:8px;min-width:0;display:flex}._5vAKdq_accountText{flex-direction:column;gap:1px;min-width:0;display:flex}._5vAKdq_accountName{color:var(--ods-text);text-overflow:ellipsis;white-space:nowrap;font-size:13px;overflow:hidden}._5vAKdq_accountEnv{color:var(--ods-text-3);text-overflow:ellipsis;white-space:nowrap;font-size:11px;overflow:hidden}._5vAKdq_accountActions{flex-shrink:0;gap:6px;display:flex}._5vAKdq_form{flex-direction:column;gap:10px;display:flex}._5vAKdq_formActions{gap:8px;display:flex}._5vAKdq_error{color:var(--ods-stop);margin:0;font-size:12px}._5vAKdq_notice{color:var(--ods-text-2);margin:0;font-size:12px}._5vAKdq_cap{color:var(--ods-text-3);margin:0;font-size:11px}";
var id5 = "src/client/AccountsCard.module.css";
var attr5 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr5 + '="' + id5 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr5, id5);
  tag.textContent = css5;
  (document.head || document.documentElement).appendChild(tag);
}
var AccountsCard_default = { "account": "_5vAKdq_account", "accountActions": "_5vAKdq_accountActions", "accountActive": "_5vAKdq_accountActive", "accountEnv": "_5vAKdq_accountEnv", "accountMain": "_5vAKdq_accountMain", "accountName": "_5vAKdq_accountName", "accountText": "_5vAKdq_accountText", "accountTop": "_5vAKdq_accountTop", "accounts": "_5vAKdq_accounts", "cap": "_5vAKdq_cap", "error": "_5vAKdq_error", "form": "_5vAKdq_form", "formActions": "_5vAKdq_formActions", "notice": "_5vAKdq_notice" };

// src/client/AccountsCard.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function outcomeMessage(result) {
  if (result === "applied") return void 0;
  if (result === "rejected") return "\u5BBF\u4E3B\u62D2\u7EDD\u4E86\u8FD9\u6B21\u4FEE\u6539\uFF0C\u8BF7\u68C0\u67E5\u586B\u5199\u5185\u5BB9";
  return "\u672A\u80FD\u786E\u8BA4\u5199\u5165\u7ED3\u679C\uFF1A\u901A\u9053\u53EF\u80FD\u672A\u5C31\u7EEA\uFF0C\u8BF7\u5237\u65B0\u540E\u6838\u5BF9\u8D26\u53F7\u5217\u8868";
}
function AccountsCard({ form, config, editable, execute, channelState }) {
  const [adding, setAdding] = (0, import_react2.useState)(false);
  const [replacing, setReplacing] = (0, import_react2.useState)(void 0);
  const [draftName, setDraftName] = (0, import_react2.useState)("");
  const [draftKey, setDraftKey] = (0, import_react2.useState)("");
  const [draftWorkspace, setDraftWorkspace] = (0, import_react2.useState)("");
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [error, setError] = (0, import_react2.useState)(void 0);
  const [notice, setNotice] = (0, import_react2.useState)(void 0);
  const accounts = accountsOf({
    apiKeyEnv: config?.apiKeyEnv ?? "",
    accounts: config?.accounts ?? null
  });
  const atCap = accounts.length >= MAX_ACCOUNTS;
  const run = (command, onApplied) => {
    setError(void 0);
    setNotice(void 0);
    setBusy(true);
    void execute(command).then((result) => {
      const message = outcomeMessage(result);
      if (message === void 0) {
        onApplied?.();
        return;
      }
      setError(result === "unknown" ? `${message}\uFF08\u901A\u9053\u72B6\u6001\uFF1A${channelState()}\uFF09` : message);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      setBusy(false);
    });
  };
  const add = () => {
    const name = draftName.trim();
    const key = draftKey.trim();
    if (name.length === 0) {
      setError("\u8BF7\u8F93\u5165\u8D26\u53F7\u540D\u79F0");
      return;
    }
    if (key.length === 0) {
      setError("\u8BF7\u8F93\u5165 API Key");
      return;
    }
    const workspace = draftWorkspace.trim();
    run({
      kind: "add",
      // A stable id makes a retried submission idempotent on the host.
      id: crypto.randomUUID(),
      name,
      key,
      ...workspace.length === 0 ? {} : { workspaceId: workspace }
    }, () => {
      setDraftName("");
      setDraftKey("");
      setDraftWorkspace("");
      setAdding(false);
      setNotice("\u5DF2\u6DFB\u52A0\u8D26\u53F7\uFF0C\u8BF7\u786E\u8BA4\u5DF2\u4FDD\u5B58");
    });
  };
  const replaceKey = (ref) => {
    const key = draftKey.trim();
    if (key.length === 0) {
      setError("\u8BF7\u8F93\u5165\u65B0\u7684 API Key");
      return;
    }
    run({ kind: "replace-key", ref, key }, () => {
      setDraftKey("");
      setReplacing(void 0);
      setNotice("\u5DF2\u66F4\u65B0 Key");
    });
  };
  const remove = (ref) => {
    run({ kind: "remove", ref });
  };
  const select = (ref) => {
    run({ kind: "select", ref });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    Card,
    {
      title: "\u8D26\u53F7",
      description: "\u6BCF\u4E2A\u8D26\u53F7\u662F\u4E00\u4EFD\u72EC\u7ACB\u7684 OpenDesign \u8BA2\u9605\u3002\u540C\u4E00\u5DE5\u4F5C\u7A7A\u95F4\u5185\u7684\u591A\u4E2A Key \u5171\u4EAB\u540C\u4E00\u4EFD\u989D\u5EA6\uFF0C\u56E0\u6B64\u591A\u8D26\u53F7\u7684\u610F\u4E49\u662F\u300C\u591A\u4E70\u51E0\u4EFD Go\u300D\uFF0C\u800C\u4E0D\u662F\u300C\u4E00\u4E2A\u8BA2\u9605\u62C6\u6210\u51E0\u628A\u94A5\u5319\u300D\u3002",
      actions: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: AccountsCard_default.accountEnv, children: [
        accounts.length,
        " \u4E2A \xB7 \u5F53\u524D ",
        accounts[0]?.name || accounts[0]?.apiKeyEnv || "\u672A\u914D\u7F6E"
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: AccountsCard_default.accounts, children: accounts.map((account, index) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: cx(AccountsCard_default.account, index === 0 && AccountsCard_default.accountActive), children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: AccountsCard_default.accountTop, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: AccountsCard_default.accountMain, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: AccountsCard_default.accountText, children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: AccountsCard_default.accountName, children: account.name || account.apiKeyEnv }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: AccountsCard_default.accountEnv, children: account.apiKeyEnv })
              ] }),
              index === 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Badge, { tone: "ok", children: "\u5F53\u524D" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: AccountsCard_default.accountActions, children: [
              index !== 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { disabled: !editable || busy, onClick: () => {
                select(account.apiKeyEnv);
              }, children: "\u8BBE\u4E3A\u5F53\u524D" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                Button,
                {
                  disabled: !editable || busy,
                  onClick: () => {
                    setReplacing(replacing === account.apiKeyEnv ? void 0 : account.apiKeyEnv);
                    setDraftKey("");
                    setError(void 0);
                  },
                  children: replacing === account.apiKeyEnv ? "\u53D6\u6D88" : "\u66F4\u6362 Key"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { variant: "danger", disabled: !editable || busy, onClick: () => {
                remove(account.apiKeyEnv);
              }, children: "\u79FB\u9664" })
            ] })
          ] }),
          replacing === account.apiKeyEnv && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: AccountsCard_default.form, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u65B0\u7684 API Key", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Input, { type: "password", value: draftKey, onChange: setDraftKey, placeholder: "sk-..." }) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: AccountsCard_default.formActions, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { variant: "primary", disabled: busy, onClick: () => {
              replaceKey(account.apiKeyEnv);
            }, children: "\u4FDD\u5B58 Key" }) })
          ] })
        ] }, account.id)) }),
        adding ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: AccountsCard_default.form, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u8D26\u53F7\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Input, { value: draftName, onChange: setDraftName, placeholder: "\u4F8B\u5982\uFF1A\u4E3B\u8D26\u53F7" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "API Key", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Input, { type: "password", value: draftKey, onChange: setDraftKey, placeholder: "sk-..." }) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Field, { label: "\u5DE5\u4F5C\u7A7A\u95F4 ID\uFF08\u53EF\u9009\uFF0C\u4EC5\u7528\u4E8E\u4EE5\u540E\u8BFB\u53D6\u989D\u5EA6\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Input, { value: draftWorkspace, onChange: setDraftWorkspace, placeholder: "workspaceId" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: AccountsCard_default.cap, children: "Key \u7531\u5BBF\u4E3B\u51ED\u636E\u670D\u52A1\u4FDD\u5B58\uFF0C\u9875\u9762\u4E0D\u4F1A\u56DE\u663E\u5DF2\u4FDD\u5B58\u7684\u5BC6\u94A5\uFF1B\u5F15\u7528\u540D\u7531\u63D2\u4EF6\u81EA\u52A8\u5206\u914D\u3002" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: AccountsCard_default.formActions, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { variant: "primary", disabled: busy, onClick: add, children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u786E\u8BA4" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { onClick: () => {
              setAdding(false);
              setDraftKey("");
              setError(void 0);
            }, children: "\u53D6\u6D88" })
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { disabled: !editable || atCap, onClick: () => {
            setAdding(true);
            setNotice(void 0);
          }, children: "\u6DFB\u52A0\u8D26\u53F7" }),
          atCap && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { className: AccountsCard_default.cap, children: [
            "\u5DF2\u8FBE ",
            MAX_ACCOUNTS,
            " \u4E2A\u8D26\u53F7\u4E0A\u9650"
          ] })
        ] }),
        error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: AccountsCard_default.error, children: error }),
        notice !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: AccountsCard_default.notice, children: notice })
      ]
    }
  );
}

// src/client/ModelsCard.tsx
var import_react3 = require("react");

// src/output-budget.ts
var OUTPUT_RESERVE_FRACTION = 0.25;
function reservedOutputTokens(contextWindow, maxOutputTokens) {
  const share = Math.floor(contextWindow * OUTPUT_RESERVE_FRACTION);
  return Math.max(0, Math.min(maxOutputTokens, share, contextWindow));
}
function usableInputTokens(contextWindow, maxOutputTokens) {
  const usable = contextWindow - reservedOutputTokens(contextWindow, maxOutputTokens);
  return usable > 0 ? usable : contextWindow;
}

// css-module:src/client/ModelsCard.module.css
var css6 = ".rrji_W_list{flex-direction:column;display:flex}.rrji_W_model{border-top:1px solid var(--ods-border);flex-direction:column;gap:6px;padding:9px 0;display:flex}.rrji_W_modelTop{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.rrji_W_modelMain{align-items:flex-start;gap:10px;min-width:0;display:flex}.rrji_W_modelText{flex-direction:column;gap:1px;min-width:0;display:flex}.rrji_W_modelName{color:var(--ods-text);font-size:13px}.rrji_W_modelOff .rrji_W_modelName{color:var(--ods-text-3)}.rrji_W_modelId{color:var(--ods-text-3);font-variant-numeric:tabular-nums;font-size:11px}.rrji_W_modelSide{flex-shrink:0;align-items:center;gap:10px;display:flex}.rrji_W_modelMeta{color:var(--ods-text-3);font-variant-numeric:tabular-nums;white-space:nowrap;font-size:11px}.rrji_W_edited{color:var(--ods-warn)}.rrji_W_editor{flex-direction:column;gap:8px;padding:8px 0 2px 34px;display:flex}.rrji_W_editorRow{grid-template-columns:1fr 1fr;gap:10px;display:grid}.rrji_W_editorFoot{align-items:center;gap:10px;display:flex}.rrji_W_cap{color:var(--ods-text-3);font-size:11px}.rrji_W_error{color:var(--ods-stop);margin:0;font-size:12px}.rrji_W_notice{color:var(--ods-text-2);margin:0;font-size:12px}.rrji_W_generic{border:1px solid color-mix(in srgb, var(--ods-warn) 50%, transparent);background:color-mix(in srgb, var(--ods-warn) 12%, transparent);color:var(--ods-warn);white-space:nowrap;border-radius:4px;padding:1px 6px;font-size:11px}.rrji_W_hint{color:var(--ods-text-3);margin:6px 0 0;font-size:11px;line-height:1.6}";
var id6 = "src/client/ModelsCard.module.css";
var attr6 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr6 + '="' + id6 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr6, id6);
  tag.textContent = css6;
  (document.head || document.documentElement).appendChild(tag);
}
var ModelsCard_default = { "cap": "rrji_W_cap", "edited": "rrji_W_edited", "editor": "rrji_W_editor", "editorFoot": "rrji_W_editorFoot", "editorRow": "rrji_W_editorRow", "error": "rrji_W_error", "generic": "rrji_W_generic", "hint": "rrji_W_hint", "list": "rrji_W_list", "model": "rrji_W_model", "modelId": "rrji_W_modelId", "modelMain": "rrji_W_modelMain", "modelMeta": "rrji_W_modelMeta", "modelName": "rrji_W_modelName", "modelOff": "rrji_W_modelOff", "modelSide": "rrji_W_modelSide", "modelText": "rrji_W_modelText", "modelTop": "rrji_W_modelTop", "notice": "rrji_W_notice" };

// src/client/ModelsCard.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function tokens2(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${Math.round(value / 1e3)}k`;
  return String(value);
}
function ModelsCard({ form, config, editable }) {
  const overrides = (0, import_react3.useMemo)(
    () => parseModelParams(config?.modelParamsJson),
    [config?.modelParamsJson]
  );
  const catalog = (0, import_react3.useMemo)(() => parseCatalog(config?.catalogJson), [config?.catalogJson]);
  const rows = (0, import_react3.useMemo)(() => catalogRowsOf(catalog), [catalog]);
  const stored = (0, import_react3.useMemo)(() => parseEnabledModels(config?.enabledModelsJson), [config?.enabledModelsJson]);
  const [pending, setPending] = (0, import_react3.useState)(void 0);
  const enabled = pending ?? stored;
  const [editing, setEditing] = (0, import_react3.useState)(void 0);
  const [draftContext, setDraftContext] = (0, import_react3.useState)("");
  const [draftMax, setDraftMax] = (0, import_react3.useState)("");
  const [error, setError] = (0, import_react3.useState)(void 0);
  const [notice, setNotice] = (0, import_react3.useState)(void 0);
  const toggle = (model) => {
    setError(void 0);
    setNotice(void 0);
    const current = enabled.length === 0 ? rows.map((row) => row.id) : [...enabled];
    const next = current.includes(model) ? current.filter((id10) => id10 !== model) : [...current, model];
    const allOn = next.length === rows.length;
    setPending(next);
    void form.mutate([{ op: "set", path: ["enabledModelsJson"], value: allOn ? "" : JSON.stringify(next) }]).then((accepted) => {
      setPending(void 0);
      if (accepted === false) {
        setError("\u5BBF\u4E3B\u62D2\u7EDD\u4E86\u8FD9\u6B21\u4FEE\u6539");
        return;
      }
      setNotice(next.includes(model) ? `\u5DF2\u542F\u7528 ${model}` : `\u5DF2\u505C\u7528 ${model}`);
    }).catch((reason) => {
      setPending(void 0);
      setError(String(reason));
    });
  };
  const save = (model) => {
    setError(void 0);
    setNotice(void 0);
    const context = draftContext.trim();
    const max = draftMax.trim();
    const entry = {};
    if (context.length > 0) {
      const parsed = Number(context);
      if (!Number.isInteger(parsed) || parsed < MIN_CONTEXT_WINDOW || parsed > MAX_CONTEXT_WINDOW) {
        setError(`\u4E0A\u4E0B\u6587\u7A97\u53E3\u9700\u4E3A ${MIN_CONTEXT_WINDOW}\u2013${MAX_CONTEXT_WINDOW} \u4E4B\u95F4\u7684\u6574\u6570`);
        return;
      }
      entry.contextWindow = parsed;
    }
    if (max.length > 0) {
      const parsed = Number(max);
      if (!Number.isInteger(parsed) || parsed < MIN_MAX_TOKENS || parsed > MAX_MAX_TOKENS) {
        setError(`\u8F93\u51FA\u4E0A\u9650\u9700\u4E3A ${MIN_MAX_TOKENS}\u2013${MAX_MAX_TOKENS} \u4E4B\u95F4\u7684\u6574\u6570`);
        return;
      }
      entry.maxTokens = parsed;
    }
    const next = { ...overrides };
    if (entry.contextWindow === void 0 && entry.maxTokens === void 0) delete next[model];
    else next[model] = entry;
    void form.mutate([{ op: "set", path: ["modelParamsJson"], value: JSON.stringify(next) }]).then((accepted) => {
      if (accepted === false) {
        setError("\u5BBF\u4E3B\u62D2\u7EDD\u4E86\u8FD9\u6B21\u4FEE\u6539");
        return;
      }
      setEditing(void 0);
      setNotice(entry.contextWindow === void 0 && entry.maxTokens === void 0 ? `\u5DF2\u6062\u590D ${model} \u7684\u5B98\u65B9\u53C2\u6570` : `\u5DF2\u4FDD\u5B58 ${model} \u7684\u53C2\u6570`);
    }).catch((reason) => {
      setError(String(reason));
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
    Card,
    {
      title: "\u53EF\u7528\u6A21\u578B",
      actions: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: ModelsCard_default.cap, children: [
        rows.length,
        " \u4E2A"
      ] }),
      description: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u5173\u95ED\u540E\u8BE5\u6A21\u578B\u4E0D\u518D\u51FA\u73B0\u5728\u4F1A\u8BDD\u7684\u6A21\u578B\u9009\u62E9\u5668\u91CC\uFF0C\u4F46\u4ECD\u53EF\u7528 API \u76F4\u63A5\u8C03\u7528\u3002\u53C2\u6570\u9ED8\u8BA4\u503C\u53D6\u81EA\u5404\u5382\u5546\u516C\u5E03\u7684\u6A21\u578B\u89C4\u683C\uFF0C\u7559\u7A7A\u5373\u6CBF\u7528\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u53EF\u7528\u8F93\u5165 = \u4E0A\u4E0B\u6587 \u2212 max(\u8F93\u51FA\u4E0A\u9650, \u4E0A\u4E0B\u6587/4)\u3002\u7F51\u5173\u6309\u300C\u8F93\u5165 + max_tokens \u2264 \u4E0A\u4E0B\u6587\u300D\u5224\u8D85\u9650\uFF0C \u800C\u4F1A\u8BDD\u754C\u9762\u53EA\u91CF\u8F93\u5165\uFF0C\u628A\u8FD9\u4E2A\u5DEE\u989D\u7B97\u8FDB\u53BB\u624D\u4E0D\u4F1A\u5728\u957F\u5BF9\u8BDD\u91CC\u7A81\u7136\u88AB\u62D2\u3002" })
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: ModelsCard_default.list, children: rows.map((model) => {
          const base = MODEL_DEFAULTS[model.id];
          const undocumented = base === void 0;
          const effective = base ?? GENERIC_DEFAULTS;
          const override = overrides[model.id];
          const context = override?.contextWindow ?? effective.contextWindow;
          const max = override?.maxTokens ?? effective.maxTokens;
          const isEditing = editing === model.id;
          const on = isModelEnabled(model.id, enabled);
          return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: cx(ModelsCard_default.model, !on && ModelsCard_default.modelOff), children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: ModelsCard_default.modelTop, children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: ModelsCard_default.modelMain, children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Switch, { checked: on, disabled: !editable, onChange: () => {
                  toggle(model.id);
                }, label: `\u5728\u6A21\u578B\u5217\u8868\u4E2D${on ? "\u505C\u7528" : "\u542F\u7528"} ${model.name}` }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: ModelsCard_default.modelText, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: ModelsCard_default.modelName, children: model.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: ModelsCard_default.modelId, children: model.id })
                ] })
              ] }),
              model.imageGeneration !== true && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: ModelsCard_default.modelSide, children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: ModelsCard_default.modelMeta, children: [
                  "\u4E0A\u4E0B\u6587 ",
                  context === void 0 ? "\u672A\u77E5" : tokens2(context),
                  context !== void 0 && max !== void 0 ? `\uFF08\u53EF\u7528\u8F93\u5165 ${tokens2(usableInputTokens(context, max))}\uFF09` : "",
                  " \xB7 ",
                  "\u8F93\u51FA ",
                  max === void 0 ? "\u672A\u77E5" : tokens2(max),
                  override !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: ModelsCard_default.edited, children: "\uFF08\u5DF2\u6539\uFF09" }),
                  undocumented && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: ModelsCard_default.generic, children: "\u53C2\u6570\u672A\u6536\u5F55" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  Button,
                  {
                    disabled: !editable,
                    onClick: () => {
                      if (isEditing) {
                        setEditing(void 0);
                        return;
                      }
                      setDraftContext(String(override?.contextWindow ?? effective.contextWindow));
                      setDraftMax(String(override?.maxTokens ?? effective.maxTokens));
                      setError(void 0);
                      setNotice(void 0);
                      setEditing(model.id);
                    },
                    children: isEditing ? "\u53D6\u6D88" : "\u6539\u53C2\u6570"
                  }
                )
              ] })
            ] }),
            model.imageGeneration !== true && undocumented && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: ModelsCard_default.hint, children: "\u63D2\u4EF6\u672A\u6536\u5F55\u8BE5\u6A21\u578B\u7684\u5B98\u65B9\u89C4\u683C\uFF0C\u4E0A\u9762\u662F\u901A\u7528\u9ED8\u8BA4\u503C\uFF08\u4E0A\u4E0B\u6587 1M\u3001\u8F93\u51FA 128K\u3001\u5168\u90E8\u601D\u8003\u6863\u4F4D\uFF09\u3002 \u8BF7\u6309\u5382\u5546\u6587\u6863\u6838\u5BF9\u540E\u70B9\u300C\u6539\u53C2\u6570\u300D\u4FEE\u6539\uFF1B\u6539\u8FC7\u7684\u503C\u4E0D\u518D\u663E\u793A\u6B64\u63D0\u793A\u3002" }),
            model.imageGeneration !== true && isEditing && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: ModelsCard_default.editor, children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: ModelsCard_default.editorRow, children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: "\u4E0A\u4E0B\u6587\u7A97\u53E3", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  Input,
                  {
                    type: "number",
                    value: draftContext,
                    placeholder: String(effective.contextWindow),
                    onChange: setDraftContext
                  }
                ) }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: "\u8F93\u51FA\u4E0A\u9650 max_tokens", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  Input,
                  {
                    type: "number",
                    value: draftMax,
                    placeholder: String(effective.maxTokens),
                    onChange: setDraftMax
                  }
                ) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: ModelsCard_default.editorFoot, children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { variant: "primary", onClick: () => {
                  save(model.id);
                }, children: "\u4FDD\u5B58" }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: ModelsCard_default.cap, children: "\u4E24\u9879\u90FD\u7559\u7A7A = \u6062\u590D\u5B98\u65B9\u503C" })
              ] })
            ] })
          ] }, model.id);
        }) }),
        error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: ModelsCard_default.error, children: error }),
        notice !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: ModelsCard_default.notice, children: notice })
      ]
    }
  );
}

// css-module:src/client/ui/tokens.module.css
var css7 = "._7VQj_a_scope{--ods-surface:var(--dsw-alias-bg-layer-2,#fff);--ods-surface-2:var(--dsw-alias-bg-layer-3,#f1f3f6);--ods-surface-3:var(--dsw-alias-bg-layer-4,#e8ebef);--ods-sunken:var(--dsw-alias-bg-layer-1,#f6f7f9);--ods-border:var(--dsw-alias-border-l2,#0000001a);--ods-border-strong:var(--dsw-alias-border-l4,#0003);--ods-text:var(--dsw-alias-label-primary,#1f2328);--ods-text-2:var(--dsw-alias-label-secondary,#6e7781);--ods-text-3:var(--dsw-alias-label-tertiary,#98a1ab);--ods-accent:var(--dsw-alias-brand-primary,#4f6bed);--ods-on-accent:var(--dsw-alias-label-primary-inverted,#fff);--ods-hover:var(--dsw-alias-interactive-bg-hover,#8080801a);--ods-ok:var(--dsw-alias-state-success-primary,#1a7f37);--ods-warn:var(--dsw-alias-state-warn-primary,#9a6700);--ods-stop:var(--dsw-alias-state-error-primary,#cf222e);--ods-link:var(--dsw-alias-link,#0969da);--ods-radius:12px;--ods-radius-sm:8px;color:var(--ods-text)}";
var id7 = "src/client/ui/tokens.module.css";
var attr7 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr7 + '="' + id7 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr7, id7);
  tag.textContent = css7;
  (document.head || document.documentElement).appendChild(tag);
}
var tokens_default = { "scope": "_7VQj_a_scope" };

// css-module:src/client/Section.module.css
var css8 = ".c5Alpq_page{flex-direction:column;gap:16px;padding:4px 0 28px;display:flex}.c5Alpq_header{flex-direction:column;gap:6px;display:flex}.c5Alpq_title{letter-spacing:-.01em;color:var(--ods-text);margin:0;font-size:20px;font-weight:600}.c5Alpq_subtitle{color:var(--ods-text-2);margin:0;font-size:13px;line-height:1.6}.c5Alpq_notice{border-radius:var(--ods-radius-sm);flex-direction:column;gap:6px;padding:12px 14px;font-size:12px;line-height:1.6;display:flex}.c5Alpq_noticeWarn{border:1px solid color-mix(in srgb, var(--ods-warn) 45%, transparent);background:color-mix(in srgb, var(--ods-warn) 9%, transparent)}.c5Alpq_noticeInfo{border:1px solid color-mix(in srgb, var(--ods-accent) 40%, transparent);background:color-mix(in srgb, var(--ods-accent) 8%, transparent)}.c5Alpq_noticeTitle{font-size:13px;font-weight:500}.c5Alpq_noticeList{color:var(--ods-text-2);margin:0;padding-left:18px;line-height:1.7}.c5Alpq_noticeFoot{color:var(--ods-text-3);font-size:11px}.c5Alpq_inlineActions{flex-wrap:wrap;align-items:center;gap:10px;display:flex}.c5Alpq_protocolPicker{flex-wrap:wrap;gap:6px;display:flex}.c5Alpq_routeLine{color:var(--ods-text-2);flex-wrap:wrap;align-items:center;gap:6px;margin:0;font-size:12px;line-height:1.6;display:flex}.c5Alpq_versionBar{border-radius:var(--ods-radius-sm);border:1px solid var(--ods-border);color:var(--ods-text-2);flex-wrap:wrap;align-items:center;gap:6px;padding:8px 12px;font-size:12px;line-height:1.6;display:flex}.c5Alpq_versionBarAlert{border-color:color-mix(in srgb, var(--ods-warn) 45%, transparent);background:color-mix(in srgb, var(--ods-warn) 9%, transparent)}.c5Alpq_versionBarQuiet{opacity:.8}.c5Alpq_versionNumber{font-variant-numeric:tabular-nums;color:var(--ods-text)}.c5Alpq_versionState{color:var(--ods-text);font-weight:600}.c5Alpq_versionActions{align-items:center;gap:8px;margin-left:4px;display:inline-flex}.c5Alpq_versionFoot{width:100%;color:var(--ods-text-3);font-size:11px}.c5Alpq_versionFootWarn{width:100%;color:var(--ods-warn);font-size:11px}.c5Alpq_footer{border-top:1px solid var(--ods-border);color:var(--ods-text-3);flex-wrap:wrap;align-items:center;gap:10px;margin-top:4px;padding-top:14px;font-size:12px;display:flex}.c5Alpq_link{color:var(--ods-link);text-decoration:none}.c5Alpq_link:hover{text-decoration:underline}.c5Alpq_footerSep{opacity:.35}";
var id8 = "src/client/Section.module.css";
var attr8 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr8 + '="' + id8 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr8, id8);
  tag.textContent = css8;
  (document.head || document.documentElement).appendChild(tag);
}
var Section_default = { "footer": "c5Alpq_footer", "footerSep": "c5Alpq_footerSep", "header": "c5Alpq_header", "inlineActions": "c5Alpq_inlineActions", "link": "c5Alpq_link", "notice": "c5Alpq_notice", "noticeFoot": "c5Alpq_noticeFoot", "noticeInfo": "c5Alpq_noticeInfo", "noticeList": "c5Alpq_noticeList", "noticeTitle": "c5Alpq_noticeTitle", "noticeWarn": "c5Alpq_noticeWarn", "page": "c5Alpq_page", "protocolPicker": "c5Alpq_protocolPicker", "routeLine": "c5Alpq_routeLine", "subtitle": "c5Alpq_subtitle", "title": "c5Alpq_title", "versionActions": "c5Alpq_versionActions", "versionBar": "c5Alpq_versionBar", "versionBarAlert": "c5Alpq_versionBarAlert", "versionBarQuiet": "c5Alpq_versionBarQuiet", "versionFoot": "c5Alpq_versionFoot", "versionFootWarn": "c5Alpq_versionFootWarn", "versionNumber": "c5Alpq_versionNumber", "versionState": "c5Alpq_versionState" };

// src/client/Section.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
function OpenDesignSection({
  form,
  execute,
  channelState,
  updateFromNpm,
  installFromGithub,
  updateState
}) {
  const snapshot = (0, import_react4.useSyncExternalStore)(
    (listener) => form.subscribe(listener),
    () => form.getSnapshot(),
    // The same reading for a render that has no client store, so the page can
    // still be rendered to markup outside the app (tests, snapshots).
    () => form.getSnapshot()
  );
  const value = snapshot.value;
  const enabled = value?.enabled ?? true;
  const editable = snapshot.status === "ready" && snapshot.writable;
  const useVela = value?.useVelaCredential ?? false;
  const usage = (0, import_react4.useMemo)(() => parseUsage(value?.usageJson), [value?.usageJson]);
  const report = (0, import_react4.useMemo)(() => parseReport(value?.reportJson), [value?.reportJson]);
  const routeState = (0, import_react4.useMemo)(() => parseRouteDiagnostics(value?.diagnosticsJson), [value?.diagnosticsJson]);
  const plan = (0, import_react4.useMemo)(
    () => usage === void 0 ? void 0 : planOf(usage.tier, parsePlanOverrides(value?.planOverrides)),
    [usage?.tier, value?.planOverrides]
  );
  const baseline = (0, import_react4.useMemo)(() => parseBaseline(value?.alignBaselineJson), [value?.alignBaselineJson]);
  const versionLine = (0, import_react4.useMemo)(() => parseVersionLine(value?.updateJson), [value?.updateJson]);
  const versionState = versionStateOf(versionLine);
  const checkedAt = versionLine.checkedAt === void 0 ? void 0 : Date.parse(versionLine.checkedAt);
  const checkedAgo = relativeTime(versionLine.checkedAt);
  const checkedStale = checkedAt !== void 0 && Number.isFinite(checkedAt) && Date.now() - checkedAt > 864e5;
  const routeProblem = (0, import_react4.useMemo)(() => explainRouteProblem(routeState), [routeState]);
  const modelCount = (0, import_react4.useMemo)(
    () => modelCountOf(routeState, GO_DESIGN_PLAN_MODELS.length),
    [routeState]
  );
  const [refreshingSince, setRefreshingSince] = (0, import_react4.useState)(void 0);
  const refreshQuota = () => {
    const at = Date.now();
    setRefreshingSince(at);
    void form.mutate([{ op: "set", path: ["refreshNonce"], value: String(at) }]).catch((error) => {
      setRefreshingSince(void 0);
      console.error("llm-opendesign-go: could not request a quota refresh", error);
    });
  };
  const usageAt = usage === void 0 ? void 0 : Date.parse(usage.asOf);
  const refreshing = refreshingSince !== void 0 && (usageAt === void 0 || usageAt < refreshingSince);
  (0, import_react4.useEffect)(() => {
    if (!refreshing) return void 0;
    const timer = setTimeout(() => {
      setRefreshingSince(void 0);
    }, 15e3);
    return () => {
      clearTimeout(timer);
    };
  }, [refreshing]);
  const align = () => {
    if (usage === void 0) return;
    const widest = usage.windows.reduce(
      (best, window2) => best === void 0 || window2.durationSeconds > best.durationSeconds ? window2 : best,
      void 0
    );
    if (widest === void 0) return;
    const credits = Number(widest.usedCredits);
    if (!Number.isFinite(credits)) return;
    const payload = {
      at: Date.now(),
      credits,
      measuredUsd: report?.costUsd ?? 0
    };
    void form.mutate([{ op: "set", path: ["alignBaselineJson"], value: JSON.stringify(payload) }]).catch((error) => {
      console.error("llm-opendesign-go: could not save the baseline", error);
    });
  };
  const toggle = (next) => {
    void form.set("enabled", next).catch((error) => {
      console.error("llm-opendesign-go: could not save the enable switch", error);
    });
  };
  const pickProtocol = (next) => {
    void form.set("protocol", next).catch((error) => {
      console.error("llm-opendesign-go: could not save the protocol choice", error);
    });
  };
  const retry = () => {
    form.getSnapshot();
    window.location.reload();
  };
  const [updating, setUpdating] = (0, import_react4.useState)(void 0);
  const [outcome, setOutcome] = (0, import_react4.useState)(void 0);
  const runUpdate = (kind, run, version) => {
    setUpdating(kind);
    setOutcome(void 0);
    void run(version).then((answer) => {
      setUpdating(void 0);
      setOutcome(answer);
    }).catch((error) => {
      setUpdating(void 0);
      setOutcome({ ok: false, message: String(error) });
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: cx(tokens_default.scope, Section_default.page), children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("header", { className: Section_default.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h1", { className: Section_default.title, children: "OpenDesign Go" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: Section_default.subtitle, children: "\u9009\u62E9\u4F1A\u8BDD\u4E2D\u663E\u793A\u7684 OpenDesign Go \u6A21\u578B\uFF0C\u5E76\u8C03\u6574\u5176\u8BBE\u7F6E\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: cx(
      Section_default.versionBar,
      versionState === "outdated" && Section_default.versionBarAlert,
      versionState === "unknown" && Section_default.versionBarQuiet
    ), children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: Section_default.versionNumber, children: [
        "\u672C\u673A ",
        versionLine.current
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: Section_default.footerSep, children: "\xB7" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
        "GitHub ",
        versionLine.github === void 0 ? "\u672A\u77E5" : `v${versionLine.github}`
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: Section_default.footerSep, children: "\xB7" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
        "npm ",
        versionLine.npm ?? "\u672A\u77E5"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: Section_default.footerSep, children: "\xB7" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: Section_default.versionState, children: versionState === "outdated" ? "\u6709\u65B0\u7248\u672C" : versionState === "current" ? "\u5DF2\u662F\u6700\u65B0" : "\u65E0\u6CD5\u68C0\u67E5\u66F4\u65B0" }),
      versionState === "outdated" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: Section_default.versionActions, children: [
        versionLine.aheadOf.includes("npm") && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          Button,
          {
            variant: "primary",
            disabled: updating !== void 0,
            onClick: () => {
              runUpdate("npm", updateFromNpm, versionLine.npm ?? versionLine.current);
            },
            children: updating === "npm" ? "\u66F4\u65B0\u4E2D\u2026" : "\u4E00\u952E\u66F4\u65B0"
          }
        ),
        versionLine.aheadOf.includes("github") && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          Button,
          {
            variant: versionLine.aheadOf.includes("npm") ? "ghost" : "primary",
            disabled: updating !== void 0,
            onClick: () => {
              runUpdate("github", installFromGithub, versionLine.github ?? versionLine.current);
            },
            children: updating === "github" ? "\u5B89\u88C5\u4E2D\u2026" : "\u4ECE GitHub \u88C5"
          }
        )
      ] }),
      outcome !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: Section_default.versionFoot, children: outcome.message }),
      versionLine.stale && versionLine.writtenBy !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: Section_default.versionFoot, children: [
        "\u5FEB\u7167\u7531 ",
        versionLine.writtenBy,
        " \u5199\u5165\uFF0C\u8FDC\u7AEF\u6570\u5B57\u6682\u4E0D\u53EF\u7528"
      ] }),
      checkedAgo !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: checkedStale ? Section_default.versionFootWarn : Section_default.versionFoot, children: [
        "\u4E0A\u6B21\u68C0\u67E5\uFF1A",
        checkedAgo
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: Section_default.versionFoot, children: [
        "\u66F4\u65B0\u901A\u9053\uFF1A",
        updateState()
      ] })
    ] }),
    snapshot.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: Section_default.inlineActions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: Section_default.subtitle, children: "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u2026" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { onClick: retry, children: "\u91CD\u65B0\u52A0\u8F7D" })
    ] }),
    snapshot.status === "unavailable" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: cx(Section_default.notice, Section_default.noticeWarn), children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: Section_default.noticeTitle, children: "\u26A0 \u5BBF\u4E3B\u6CA1\u6709\u6CE8\u518C\u672C\u63D2\u4EF6\u7684\u914D\u7F6E\u9879" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("ul", { className: Section_default.noticeList, children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { children: [
          "\u6700\u53EF\u80FD\u662F",
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("b", { children: "\u63D2\u4EF6\u6CA1\u6709\u6FC0\u6D3B" }),
          "\uFF1A\u914D\u7F6E\u503C\u4E0E\u5DF2\u88C5\u7248\u672C\u4E0D\u5339\u914D\u65F6\uFF0C\u5BBF\u4E3B\u4F1A\u62D2\u7EDD\u52A0\u8F7D\u6574\u6761\u914D\u7F6E\uFF0C \u5E76\u5728\u65E5\u5FD7\u7559\u4E0B ",
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("code", { children: "ValidationError: invalid config" }),
          "\u3002 \u672C\u7248\u672C\u652F\u6301\u7684\u534F\u8BAE\u503C\u662F ",
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("code", { children: PROTOCOL_IDS.join(" / ") }),
          "\uFF0C\u53EF\u4E0E profile \u91CC\u7684",
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("code", { children: "protocol" }),
          " \u6BD4\u5BF9\u3002"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("li", { children: "\u63D2\u4EF6\u521A\u88C5\u5B8C\u8FD8\u6CA1\u91CD\u542F\u684C\u9762\u7AEF\u2014\u2014\u5237\u65B0\u754C\u9762\u4E0D\u751F\u6548\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("li", { children: [
          "profile \u7684 ",
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("code", { children: "dsh.profile.bundles" }),
          " \u7F3A\u5C11 ",
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("code", { children: "dsh-opendesign-go" }),
          "\uFF0C\u6216\u8BE5\u6761\u76EE\u88AB\u7981\u7528\u3002"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: Section_default.noticeFoot, children: [
        "\u786E\u8BA4\u65B9\u6CD5\uFF1A\u5728\u5BBF\u4E3B\u65E5\u5FD7\uFF08",
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("code", { children: "~/.dsh/logs/desktop-next.log" }),
        "\uFF09\u91CC\u641C",
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("code", { children: "opendesign-go" }),
        " \u4E0E ",
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("code", { children: "invalid config" }),
        "\u3002 \u8BCA\u65AD\uFF1A",
        snapshot.status,
        " / namespace=",
        PROFILE_ENTRY_ID,
        " / revision=",
        String(snapshot.revision),
        " / writable=",
        String(snapshot.writable)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: Section_default.inlineActions, children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { onClick: retry, children: "\u91CD\u65B0\u52A0\u8F7D" }) })
    ] }),
    routeProblem !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: cx(Section_default.notice, Section_default.noticeWarn), children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: Section_default.noticeTitle, children: [
        "\u26A0 ",
        routeProblem.title
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("ul", { className: Section_default.noticeList, children: routeProblem.causes.map((cause) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("li", { children: cause.text }, cause.text)) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: Section_default.noticeFoot, children: "\u6700\u65B0\u72B6\u6001\u89C1\u9875\u9762\u4E0B\u65B9\u7684\u300C\u8DEF\u7531\u72B6\u6001\u300D\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
      Card,
      {
        title: "\u542F\u7528 OpenDesign Go",
        description: "\u5173\u95ED\u540E\uFF0C\u672C\u63D2\u4EF6\u63D0\u4F9B\u7684\u6A21\u578B\u4F1A\u4ECE\u4F1A\u8BDD\u9009\u62E9\u5668\u4E2D\u79FB\u9664\u3002",
        actions: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          Switch,
          {
            checked: enabled,
            disabled: !editable,
            label: "\u542F\u7528 OpenDesign Go",
            onChange: toggle
          }
        ),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            Row,
            {
              label: "\u5728\u8F93\u5165\u6846\u65C1\u663E\u793A\u989D\u5EA6",
              hint: "\u59CB\u7EC8\u663E\u793A 5 \u5C0F\u65F6\u4E0E 7 \u5929\u7684\u5269\u4F59\u989D\u5EA6\uFF0C\u70B9\u5F00\u53EF\u770B\u6BCF\u6761\u7A97\u53E3\u7684\u660E\u7EC6\u4E0E\u94B1\u5305\u4F59\u989D\u3002",
              children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                Switch,
                {
                  checked: value?.composerUsage ?? true,
                  disabled: !editable,
                  label: "\u5728\u8F93\u5165\u6846\u65C1\u663E\u793A\u989D\u5EA6",
                  onChange: (next) => {
                    void form.set("composerUsage", next);
                  }
                }
              )
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            Row,
            {
              label: "\u63A5\u53E3\u534F\u8BAE",
              hint: "\u4E09\u6761\u534F\u8BAE\u7531\u540C\u4E00\u7F51\u5173\u63D0\u4F9B\u3001\u8BA1\u8D39\u76F8\u540C\u3002Chat Completions \u4E0E Anthropic \u90FD\u8FD4\u56DE\u6A21\u578B\u81EA\u5DF1\u7684\u5B8C\u6574\u601D\u7EF4\u94FE\uFF1BResponses \u53EA\u8FD4\u56DE\u88AB\u6539\u5199\u7684\u6458\u8981\uFF0C\u4E14\u9884\u7B97\u7D27\u5F20\u65F6\u7A7A\u56DE\u7B54\u7565\u591A\u3002",
              children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: Section_default.protocolPicker, children: PROTOCOL_IDS.map((id10) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                Button,
                {
                  variant: (value?.protocol ?? "chat") === id10 ? "primary" : "ghost",
                  disabled: !editable,
                  onClick: () => {
                    pickProtocol(id10);
                  },
                  children: PROTOCOL_LABELS[id10]
                },
                id10
              )) })
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(AccountsCard, { form, config: value, editable, execute, channelState }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ModelsCard, { form, config: value, editable }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      QuotaCard,
      {
        snapshot: usage,
        loading: false,
        ledgerCostUsd: report?.costUsd,
        onRefresh: editable ? refreshQuota : void 0,
        refreshing
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      BillingCard,
      {
        snapshot: usage,
        plan,
        measuredUsd: report?.costUsd,
        baseline,
        onAlign: usage === void 0 ? void 0 : align,
        editable
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(UsageCard, { report }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
      Card,
      {
        title: "\u989D\u5EA6\u6765\u6E90",
        description: "\u51B3\u5B9A 5 \u5C0F\u65F6 / 7 \u5929\u989D\u5EA6\u4ECE\u54EA\u91CC\u8BFB\u53D6\u3002",
        badge: useVela ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Badge, { tone: "ok", children: "\u672C\u673A\u767B\u5F55" }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Badge, { children: "\u4F1A\u8BDD\u51ED\u636E" }),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            Row,
            {
              label: "\u4F7F\u7528\u672C\u673A OpenDesign \u7684\u767B\u5F55\u51ED\u8BC1",
              hint: "\u88C5\u8FC7\u5E76\u767B\u5F55\u8FC7 OpenDesign \u684C\u9762\u7AEF\u65F6\uFF0C\u52FE\u9009\u5373\u53EF\u8BFB\u5230\u771F\u5B9E\u989D\u5EA6\uFF0C\u65E0\u9700\u518D\u586B\u51ED\u636E\u3002\u53EA\u7528 API Key \u5C31\u4FDD\u6301\u5173\u95ED\u3002",
              children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                Switch,
                {
                  checked: useVela,
                  disabled: !editable,
                  label: "\u4F7F\u7528\u672C\u673A OpenDesign \u7684\u767B\u5F55\u51ED\u8BC1",
                  onChange: (next) => {
                    void form.set("useVelaCredential", next);
                  }
                }
              )
            }
          ),
          useVela && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: Section_default.routeLine, children: "\u8BFB\u53D6\u65B9\u5F0F\uFF1A\u8C03\u7528 OpenDesign \u684C\u9762\u7AEF\u81EA\u5E26\u7684 vela \u547D\u4EE4\u884C\u3002\u8BE5\u547D\u4EE4\u662F\u5B98\u65B9\u79C1\u6709\u63A5\u53E3\uFF0C \u82E5 OpenDesign \u5347\u7EA7\u540E\u683C\u5F0F\u53D8\u5316\uFF0C\u8FD9\u91CC\u4F1A\u663E\u793A\u5931\u8D25\u539F\u56E0\u800C\u4E0D\u662F\u7ED9\u51FA\u9519\u8BEF\u6570\u5B57\u3002" })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      Card,
      {
        title: "\u8DEF\u7531\u72B6\u6001",
        description: "\u672C\u63D2\u4EF6\u5728\u5BBF\u4E3B\u91CC\u7684\u6CE8\u518C\u7ED3\u679C\uFF0C\u4E0E\u989D\u5EA6\u65E0\u5173\u3002",
        badge: routeState === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Badge, { children: "\u672A\u77E5" }) : routeState.registered ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Badge, { tone: "ok", children: "\u5DF2\u6CE8\u518C" }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Badge, { tone: "warn", children: "\u672A\u6CE8\u518C" }),
        children: routeState === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: Section_default.routeLine, children: "\u5BBF\u4E3B\u5C1A\u672A\u4E0A\u62A5\u8DEF\u7531\u72B6\u6001\u3002\u91CD\u542F\u540E\u82E5\u4ECD\u4E3A\u7A7A\uFF0C\u8BF4\u660E\u63D2\u4EF6\u672A\u5B8C\u6210\u6FC0\u6D3B\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: Section_default.routeLine, children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
              "\u542F\u7528=",
              String(routeState.enabled)
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: Section_default.footerSep, children: "\xB7" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
              "\u51ED\u636E=",
              routeState.credentialResolved ? "\u5DF2\u89E3\u6790" : "\u672A\u89E3\u6790",
              "\uFF08",
              routeState.triedRef || "\u65E0",
              "\uFF09"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: Section_default.footerSep, children: "\xB7" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
              "\u58F0\u660E\u6A21\u578B ",
              modelCount.count,
              " \u4E2A"
            ] }),
            routeState.lastError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: Section_default.footerSep, children: "\xB7" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
                "\u5931\u8D25\uFF1A",
                routeState.lastError
              ] })
            ] })
          ] }),
          modelCount.stale && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: Section_default.routeLine, children: [
            "\u5BBF\u4E3B\u7F13\u5B58\u7684\u662F ",
            routeState.modelCount,
            " \u4E2A\uFF0C\u4E0E\u672C\u7248\u672C\u7684 ",
            modelCount.count,
            " \u4E2A\u4E0D\u4E00\u81F4\u3002 \u7F13\u5B58\u53EA\u5728\u5199\u56DE\u6210\u529F\u65F6\u5237\u65B0\uFF0C\u800C\u5199\u56DE\u8981\u62A2 profile \u7684\u5199\u9501\uFF1B\u4E0A\u9762\u7684\u6570\u5B57\u4EE5\u672C\u7248\u672C\u76EE\u5F55\u4E3A\u51C6\u3002"
          ] })
        ] })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: Section_default.footer, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("a", { className: Section_default.link, href: "https://github.com/EliteOtaku/dsh-opendesign-go", target: "_blank", rel: "noreferrer noopener", children: "GitHub \u4ED3\u5E93 \xB7 \u6B22\u8FCE Star \u2605" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: Section_default.footerSep, children: "|" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("a", { className: Section_default.link, href: "https://github.com/EliteOtaku/dsh-opendesign-go#readme", target: "_blank", rel: "noreferrer noopener", children: "\u6587\u6863" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: Section_default.footerSep, children: "|" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("a", { className: Section_default.link, href: "https://github.com/EliteOtaku/dsh-opendesign-go/issues", target: "_blank", rel: "noreferrer noopener", children: "\u53CD\u9988\u95EE\u9898" })
    ] })
  ] });
}

// src/client/UsagePill.tsx
var import_react5 = require("react");

// css-module:src/client/UsagePill.module.css
var css9 = "._21NoVq_root{display:inline-flex;position:relative}._21NoVq_pill{border:1px solid var(--ods-border);height:28px;color:var(--ods-text-2);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border-radius:999px;align-items:center;gap:6px;padding:0 10px;font-size:12px;line-height:1;transition:background-color .12s,border-color .12s,color .12s;display:inline-flex}._21NoVq_pill:hover,._21NoVq_pill[aria-expanded=true]{background:var(--ods-hover);border-color:var(--ods-border-strong);color:var(--ods-text)}._21NoVq_pill:focus-visible{outline:2px solid var(--ods-accent);outline-offset:1px}._21NoVq_dot{border-radius:50%;flex:none;width:6px;height:6px}._21NoVq_text{font-variant-numeric:tabular-nums}._21NoVq_unit{opacity:.72}._21NoVq_percent{font-weight:600}._21NoVq_sep{opacity:.4}._21NoVq_panel{z-index:30;border:1px solid var(--ods-border);border-radius:var(--ods-radius);background:var(--ods-surface);width:320px;color:var(--ods-text);text-align:left;flex-direction:column;gap:10px;padding:12px 14px 10px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;box-shadow:0 12px 32px #0000002e}._21NoVq_panelHead{justify-content:space-between;align-items:baseline;gap:8px;display:flex}._21NoVq_panelTitle{font-size:13px;font-weight:600}._21NoVq_panelStamp{color:var(--ods-text-3);font-variant-numeric:tabular-nums;font-size:11px}._21NoVq_rows{flex-direction:column;gap:10px;display:flex}._21NoVq_rowHead{justify-content:space-between;align-items:baseline;gap:8px;font-size:12px;display:flex}._21NoVq_rowName{font-weight:500}._21NoVq_rowValue{font-variant-numeric:tabular-nums}._21NoVq_rowMeta{color:var(--ods-text-3);font-variant-numeric:tabular-nums;justify-content:space-between;gap:8px;font-size:11px;display:flex}._21NoVq_notice{color:var(--ods-warn);font-size:11px}._21NoVq_panelFoot{border-top:1px solid var(--ods-border);justify-content:space-between;align-items:center;gap:8px;padding-top:8px;display:flex}._21NoVq_rowBar{margin:6px 0 5px}";
var id9 = "src/client/UsagePill.module.css";
var attr9 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr9 + '="' + id9 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr9, id9);
  tag.textContent = css9;
  (document.head || document.documentElement).appendChild(tag);
}
var UsagePill_default = { "dot": "_21NoVq_dot", "notice": "_21NoVq_notice", "panel": "_21NoVq_panel", "panelFoot": "_21NoVq_panelFoot", "panelHead": "_21NoVq_panelHead", "panelStamp": "_21NoVq_panelStamp", "panelTitle": "_21NoVq_panelTitle", "percent": "_21NoVq_percent", "pill": "_21NoVq_pill", "root": "_21NoVq_root", "rowBar": "_21NoVq_rowBar", "rowHead": "_21NoVq_rowHead", "rowMeta": "_21NoVq_rowMeta", "rowName": "_21NoVq_rowName", "rowValue": "_21NoVq_rowValue", "rows": "_21NoVq_rows", "sep": "_21NoVq_sep", "text": "_21NoVq_text", "unit": "_21NoVq_unit" };

// src/client/UsagePill.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
function ownedByThisProvider(directory) {
  return directory.current?.provider === PROVIDER_ID;
}
function pillWindows(usage) {
  if (usage === void 0) return [];
  const windows = [];
  for (const window2 of usage.windows) {
    if (window2.status !== "ok" || window2.percentUsed === null) continue;
    const remaining = Math.max(0, Math.min(100, Math.round(100 - window2.percentUsed)));
    windows.push({ durationSeconds: window2.durationSeconds, remaining, window: window2 });
  }
  return windows;
}
function pillLabel(windows) {
  return windows.map((row) => `${compactWindowLabel(row.durationSeconds)} ${row.remaining}%`).join(" \xB7 ");
}
function worstRemaining(windows) {
  if (windows.length === 0) return 100;
  return windows.reduce((worst, row) => row.remaining < worst ? row.remaining : worst, 100);
}
function money2(credits, creditsPerUsd) {
  if (creditsPerUsd === void 0 || creditsPerUsd <= 0) return void 0;
  const count = creditsToNumber(credits);
  if (count === null) return void 0;
  return `$${(count / creditsPerUsd).toFixed(2)}`;
}
function ComposerUsagePill({ form, directory }) {
  const selection = (0, import_react5.useSyncExternalStore)(
    (listener) => directory.subscribe(listener),
    () => directory.getSnapshot(),
    () => directory.getSnapshot()
  );
  const snapshot = (0, import_react5.useSyncExternalStore)(
    (listener) => form.subscribe(listener),
    () => form.getSnapshot(),
    // Same reader for the server snapshot: the pill only needs the current
    // value, and supplying it keeps the component renderable outside a browser
    // (tests, and any future server-side shell).
    () => form.getSnapshot()
  );
  const value = snapshot.value;
  const usage = (0, import_react5.useMemo)(() => parseUsage(value?.usageJson), [value?.usageJson]);
  const windows = (0, import_react5.useMemo)(() => pillWindows(usage), [usage]);
  const visible = ownedByThisProvider(selection) && (value?.enabled ?? true) && (value?.composerUsage ?? true) && windows.length > 0;
  const [open, setOpen] = (0, import_react5.useState)(false);
  const [refreshingSince, setRefreshingSince] = (0, import_react5.useState)(void 0);
  const root = (0, import_react5.useRef)(null);
  const pill = (0, import_react5.useRef)(null);
  const refresh = () => {
    const at = Date.now();
    setRefreshingSince(at);
    void form.mutate([{ op: "set", path: ["refreshNonce"], value: String(at) }]).catch((error) => {
      setRefreshingSince(void 0);
      console.error("llm-opendesign-go: could not request a quota refresh", error);
    });
  };
  const usageAt = usage === void 0 ? void 0 : Date.parse(usage.asOf);
  const refreshing = refreshingSince !== void 0 && (usageAt === void 0 || usageAt < refreshingSince);
  (0, import_react5.useEffect)(() => {
    if (!refreshing) return void 0;
    const timer = setTimeout(() => {
      setRefreshingSince(void 0);
    }, 15e3);
    return () => {
      clearTimeout(timer);
    };
  }, [refreshing]);
  (0, import_react5.useEffect)(() => {
    if (!open) return void 0;
    const onPointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (root.current?.contains(target) === true) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      pill.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  if (!visible) return null;
  const worst = worstRemaining(windows);
  const stale = usage?.error !== void 0;
  const balance = usage?.wallet?.balanceUsd;
  const walletBalance = balance !== void 0 && Number.isFinite(Number(balance)) ? Number(balance).toFixed(2) : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: cx(tokens_default.scope, UsagePill_default.root), ref: root, children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
      "button",
      {
        type: "button",
        ref: pill,
        className: UsagePill_default.pill,
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        title: `${DISPLAY_NAME} \u989D\u5EA6`,
        onClick: () => {
          setOpen((was) => !was);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: UsagePill_default.dot, style: { background: barColor(worst) }, "aria-hidden": "true" }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: UsagePill_default.text, children: pillLabel(windows) })
        ]
      }
    ),
    open && usage !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: UsagePill_default.panel, role: "dialog", "aria-label": `${DISPLAY_NAME} \u989D\u5EA6`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: UsagePill_default.panelHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: UsagePill_default.panelTitle, children: [
          DISPLAY_NAME,
          " \u989D\u5EA6"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: UsagePill_default.panelStamp, children: [
          "\u66F4\u65B0\u4E8E ",
          new Date(usage.asOf).toLocaleTimeString()
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: UsagePill_default.rows, children: windows.map((row) => {
        const left = money2(row.window.remainingCredits, usage.creditsPerUsd);
        const limit = money2(row.window.limitCredits, usage.creditsPerUsd);
        const name = windowLabel(row.durationSeconds);
        return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: UsagePill_default.rowHead, children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: UsagePill_default.rowName, children: name }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: UsagePill_default.rowValue, children: [
              "\u5269\u4F59 ",
              row.remaining,
              "%"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: UsagePill_default.rowBar, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Bar, { percent: row.remaining, color: barColor(row.remaining), label: `${name}\u989D\u5EA6\u5269\u4F59\u767E\u5206\u6BD4` }) }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: UsagePill_default.rowMeta, children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: left !== void 0 && limit !== void 0 ? `\u5269\u4F59 ${left} / ${limit}` : "" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: resetCountdown(row.window.resetsAt) })
          ] })
        ] }, row.durationSeconds);
      }) }),
      walletBalance !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: UsagePill_default.rowMeta, children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u94B1\u5305\u4F59\u989D" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
          "$",
          walletBalance
        ] })
      ] }),
      stale && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: UsagePill_default.notice, children: "\u4E0A\u6B21\u8BFB\u53D6\u5931\u8D25\uFF0C\u663E\u793A\u7684\u662F\u66F4\u65E9\u7684\u8BFB\u6570" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: UsagePill_default.panelFoot, children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: UsagePill_default.panelStamp, children: "\u6BCF 5 \u5206\u949F\u81EA\u52A8\u8BFB\u53D6" }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Button, { onClick: refresh, disabled: refreshing, children: refreshing ? "\u8BFB\u53D6\u4E2D\u2026" : "\u5237\u65B0\u989D\u5EA6" })
      ] })
    ] })
  ] });
}

// src/client/index.ts
var inject = ["slots", "remote"];
function apply(ctx) {
  const commands = accountCommands(ctx);
  const updates = updateCommands(ctx);
  ctx.inject(["configForms"], (ready) => {
    const form = ready.configForms.get(PROFILE_ENTRY_ID);
    const injected = () => ({
      form,
      execute: commands.execute,
      channelState: commands.state,
      updateFromNpm: updates.updateFromNpm,
      installFromGithub: updates.installFromGithub,
      updateState: updates.state
    });
    ready.effect(() => ready.slots.inject("settings.section", () => ready.slots.register({
      name: "settings.section",
      id: PROFILE_ENTRY_ID,
      order: 20,
      label: () => DISPLAY_NAME,
      inject: injected
    }, OpenDesignSection)));
    ready.inject(["modelDirectories"], (models) => {
      const pillInjected = (sessionId) => ({
        form,
        directory: models.modelDirectories.directoryFor(sessionId).store
      });
      models.effect(() => {
        try {
          return models.slots.inject("conversation.input.right", () => models.slots.register({
            name: "conversation.input.right",
            id: `${PROFILE_ENTRY_ID}-usage`,
            order: 100,
            label: () => DISPLAY_NAME,
            inject: pillInjected
          }, ComposerUsagePill));
        } catch (error) {
          console.error("llm-opendesign-go: could not register the composer usage pill", error);
          return () => {
          };
        }
      });
    });
  });
}

return module.exports; } });
