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
var DISPLAY_NAME = "DSH OpenDesign Go";
var PROFILE_ENTRY_ID = "opendesign-go";
var DEFAULT_API_KEY_ENV = "OPENDESIGN_API_KEY";

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

// src/client/Section.tsx
var import_react3 = require("react");

// src/usage-contract.ts
function windowLabel(durationSeconds) {
  const days = durationSeconds / 86400;
  if (Number.isInteger(days) && days >= 1) return `${days} \u5929`;
  const hours = durationSeconds / 3600;
  if (Number.isInteger(hours) && hours >= 1) return `${hours} \u5C0F\u65F6`;
  return `${Math.round(durationSeconds / 60)} \u5206\u949F`;
}
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
    asOf: typeof row.asOf === "string" ? row.asOf : ""
  };
}

// src/client/QuotaCard.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var WARN_AT = 75;
var STOP_AT = 95;
function barColor(percent) {
  if (percent >= STOP_AT) return "#e5484d";
  if (percent >= WARN_AT) return "#e5a00d";
  return "#3b82f6";
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
function WindowRow({ window: window2, creditsPerUsd }) {
  const percent = window2.percentUsed;
  const label = windowLabel(window2.durationSeconds);
  const dollars = (credits) => {
    if (creditsPerUsd === void 0 || creditsPerUsd <= 0) return void 0;
    const used = creditsToNumber(credits);
    if (used === null) return void 0;
    return `$${(used / creditsPerUsd).toFixed(2)}`;
  };
  const usedUsd = dollars(window2.usedCredits);
  const limitUsd = dollars(window2.limitCredits);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: "13px", fontWeight: 500 }, children: [
        label,
        "\u989D\u5EA6"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "12px", opacity: 0.6 }, children: resetCountdown(window2.resetsAt) })
    ] }),
    percent === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "12px", opacity: 0.6 }, children: [
      "\u6B64\u7A97\u53E3\u672A\u8FD4\u56DE\u53EF\u7528\u9650\u989D\uFF08\u5DF2\u7528 ",
      window2.usedCredits,
      " / \u9650\u989D ",
      window2.limitCredits,
      "\uFF09"
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "10px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          role: "progressbar",
          "aria-valuenow": percent,
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-label": `${label}\u989D\u5EA6\u5DF2\u7528\u767E\u5206\u6BD4`,
          style: {
            flex: 1,
            height: "8px",
            borderRadius: "999px",
            background: "rgba(128, 128, 128, 0.22)",
            overflow: "hidden"
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { width: `${percent}%`, height: "100%", borderRadius: "999px", background: barColor(percent) } })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: "12px", fontVariantNumeric: "tabular-nums", minWidth: "36px", textAlign: "right" }, children: [
        percent,
        "%"
      ] })
    ] }),
    usedUsd !== void 0 && limitUsd !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "11px", opacity: 0.55, fontVariantNumeric: "tabular-nums" }, children: [
      "\u5DF2\u7528 ",
      usedUsd,
      " / ",
      limitUsd
    ] })
  ] });
}
function QuotaCard({ snapshot, loading }) {
  const card4 = {
    border: "1px solid rgba(128, 128, 128, 0.25)",
    borderRadius: "10px",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "14px"
  };
  const hint4 = { fontSize: "13px", opacity: 0.65, margin: 0 };
  if (loading && snapshot === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: card4, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: hint4, children: "\u6B63\u5728\u8BFB\u53D6\u989D\u5EA6\u2026" }) });
  }
  if (snapshot === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card4, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u8BA2\u9605\u989D\u5EA6" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: hint4, children: "\u5C1A\u672A\u8BFB\u53D6\u3002\u52FE\u9009\u4E0B\u65B9\u300C\u4F7F\u7528\u672C\u673A OpenDesign \u7684\u767B\u5F55\u51ED\u8BC1\u300D\u540E\u5373\u53EF\u663E\u793A\u771F\u5B9E\u7684 5 \u5C0F\u65F6 / 7 \u5929\u989D\u5EA6\u3002" })
    ] });
  }
  if (snapshot.error !== void 0 && snapshot.windows.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card4, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u8BA2\u9605\u989D\u5EA6" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: hint4, children: [
        "\u8BFB\u53D6\u5931\u8D25\uFF1A",
        snapshot.error
      ] })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card4, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u8BA2\u9605\u989D\u5EA6" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: "11px", opacity: 0.5 }, children: [
        "\u8BFB\u53D6\u4E8E ",
        new Date(snapshot.asOf).toLocaleTimeString()
      ] })
    ] }),
    snapshot.windows.map((window2) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WindowRow, { window: window2, creditsPerUsd: snapshot.creditsPerUsd }, window2.durationSeconds)),
    snapshot.wallet !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "12px", opacity: 0.65, borderTop: "1px solid rgba(128,128,128,0.18)", paddingTop: "10px" }, children: [
      "\u94B1\u5305\u4F59\u989D $",
      snapshot.wallet.balanceUsd,
      snapshot.wallet.subscriptionPeriodEnd === void 0 ? " \xB7 \u989D\u5EA6\u7528\u5C3D\u540E\u6309\u91CF\u4ED8\u8D39" : ` \xB7 \u5468\u671F\u81F3 ${new Date(snapshot.wallet.subscriptionPeriodEnd).toLocaleDateString()}`,
      " \xB7 \u5E76\u53D1 10\uFF08\u6309 2026-10-19 \u5B98\u65B9\u53E3\u5F84\uFF09"
    ] }),
    snapshot.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: { ...hint4, fontSize: "12px" }, children: [
      "\u90E8\u5206\u6570\u636E\u7F3A\u5931\uFF1A",
      snapshot.error
    ] })
  ] });
}

// src/client/UsageCard.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var card = {
  border: "1px solid rgba(128, 128, 128, 0.25)",
  borderRadius: "10px",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: "12px"
};
var hint = { fontSize: "13px", opacity: 0.65, margin: 0 };
var rowStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto auto auto",
  gap: "10px",
  alignItems: "baseline",
  fontSize: "12px",
  padding: "6px 0",
  borderTop: "1px solid rgba(128, 128, 128, 0.14)"
};
function tokens(tokens3) {
  if (tokens3 >= 1e6) return `${(tokens3 / 1e6).toFixed(1)}M`;
  if (tokens3 >= 1e3) return `${(tokens3 / 1e3).toFixed(1)}k`;
  return String(tokens3);
}
function money(usd) {
  return usd >= 0.01 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(4)}`;
}
function UsageCard({ report }) {
  if (report === void 0 || report.calls === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u672C\u5730\u7528\u91CF" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: hint, children: "\u8FD8\u6CA1\u6709\u901A\u8FC7\u672C\u63D2\u4EF6\u53D1\u51FA\u7684\u8BF7\u6C42\u3002\u8FD9\u91CC\u53EA\u7EDF\u8BA1\u7ECF\u672C\u63D2\u4EF6\u8DEF\u7531\u7684\u8C03\u7528\uFF0C\u5176\u4ED6 provider \u4E0E OpenDesign \u5B98\u65B9\u5BA2\u6237\u7AEF\u7684\u7528\u91CF\u4E0D\u8BA1\u5165\u3002" })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: card, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u672C\u5730\u7528\u91CF \xB7 \u8FD1 30 \u5929" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { fontSize: "12px", opacity: 0.6 }, children: [
        report.calls,
        " \u6B21\u8BF7\u6C42 \xB7 \u4F30\u7B97 ",
        money(report.costUsd)
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...rowStyle, borderTop: "none", opacity: 0.55, paddingBottom: 0 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u6A21\u578B" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u8F93\u5165 / \u8F93\u51FA" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u8BF7\u6C42" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { textAlign: "right" }, children: "\u4F30\u7B97" })
    ] }),
    report.models.map((row) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: rowStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: row.model }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { fontVariantNumeric: "tabular-nums", opacity: 0.75 }, children: [
        tokens(row.inputTokens),
        " / ",
        tokens(row.outputTokens)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontVariantNumeric: "tabular-nums", opacity: 0.75 }, children: row.calls }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { textAlign: "right", fontVariantNumeric: "tabular-nums" }, children: row.unpricedCalls === row.calls ? "\u672A\u5B9A\u4EF7" : money(row.costUsd) })
    ] }, row.model)),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: { ...hint, fontSize: "11px", lineHeight: 1.5 }, children: [
      "\u91D1\u989D\u6309\u5B98\u65B9\u516C\u5F00\u4EF7\u76EE\u8868\u7684**\u57FA\u7840\u6863**\u4F30\u7B97\uFF1A\u8D85\u51FA\u9636\u68AF\u9608\u503C\u7684\u8BF7\u6C42\u4F1A\u88AB\u4F4E\u4F30\uFF1B\u6807\u300C\u672A\u5B9A\u4EF7\u300D\u7684\u6A21\u578B\u53EA\u8BA1 token\uFF0C\u4E0D\u8BA1\u91D1\u989D\u3002",
      report.unpricedCalls > 0 && ` \u672C\u6B21\u6709 ${report.unpricedCalls} \u6B21\u8BF7\u6C42\u672A\u8BA1\u5165\u91D1\u989D\u3002`,
      "\u8FD9\u4E0D\u662F\u8D26\u5355\uFF0C\u5B9E\u9645\u6263\u8D39\u4EE5 OpenDesign \u63A7\u5236\u53F0\u4E3A\u51C6\u3002"
    ] })
  ] });
}

// src/client/AccountsCard.tsx
var import_react = require("react");

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

// src/client/AccountsCard.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var card2 = {
  border: "1px solid rgba(128, 128, 128, 0.25)",
  borderRadius: "10px",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: "12px"
};
var hint2 = { fontSize: "13px", opacity: 0.65, margin: 0 };
var smallButton = {
  fontSize: "12px",
  padding: "3px 10px",
  borderRadius: "6px",
  border: "1px solid rgba(128, 128, 128, 0.35)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer"
};
var input = {
  display: "block",
  width: "100%",
  marginTop: "4px",
  padding: "6px 8px",
  fontSize: "12px",
  borderRadius: "6px",
  border: "1px solid rgba(128, 128, 128, 0.3)",
  background: "transparent",
  color: "inherit",
  boxSizing: "border-box"
};
function outcomeMessage(result) {
  if (result === "applied") return void 0;
  if (result === "rejected") return "\u5BBF\u4E3B\u62D2\u7EDD\u4E86\u8FD9\u6B21\u4FEE\u6539\uFF0C\u8BF7\u68C0\u67E5\u586B\u5199\u5185\u5BB9";
  return "\u672A\u80FD\u786E\u8BA4\u5199\u5165\u7ED3\u679C\uFF1A\u901A\u9053\u53EF\u80FD\u672A\u5C31\u7EEA\uFF0C\u8BF7\u5237\u65B0\u540E\u6838\u5BF9\u8D26\u53F7\u5217\u8868";
}
function AccountsCard({ form, config, editable, execute, channelState }) {
  const [adding, setAdding] = (0, import_react.useState)(false);
  const [replacing, setReplacing] = (0, import_react.useState)(void 0);
  const [draftName, setDraftName] = (0, import_react.useState)("");
  const [draftKey, setDraftKey] = (0, import_react.useState)("");
  const [draftWorkspace, setDraftWorkspace] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(void 0);
  const [notice, setNotice] = (0, import_react.useState)(void 0);
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: card2, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u8D26\u53F7" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { fontSize: "12px", opacity: 0.6 }, children: [
        accounts.length,
        " \u4E2A \xB7 \u5F53\u524D ",
        accounts[0]?.name || accounts[0]?.apiKeyEnv || "\u672A\u914D\u7F6E"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: hint2, children: "\u6BCF\u4E2A\u8D26\u53F7\u662F\u4E00\u4EFD\u72EC\u7ACB\u7684 OpenDesign \u8BA2\u9605\u3002\u540C\u4E00\u5DE5\u4F5C\u7A7A\u95F4\u5185\u7684\u591A\u4E2A Key \u5171\u4EAB\u540C\u4E00\u4EFD\u989D\u5EA6\uFF0C \u56E0\u6B64\u591A\u8D26\u53F7\u7684\u610F\u4E49\u662F\u300C\u591A\u4E70\u51E0\u4EFD Go\u300D\uFF0C\u800C\u4E0D\u662F\u300C\u4E00\u4E2A\u8BA2\u9605\u62C6\u6210\u51E0\u628A\u94A5\u5319\u300D\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: accounts.map((account, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "8px 10px",
          borderRadius: "8px",
          border: "1px solid rgba(128, 128, 128, 0.2)",
          background: index === 0 ? "rgba(59, 130, 246, 0.08)" : "transparent"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { minWidth: 0 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { fontSize: "13px" }, children: [
                account.name || account.apiKeyEnv,
                index === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { marginLeft: "8px", fontSize: "11px", opacity: 0.6 }, children: "\u5F53\u524D" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: "11px", opacity: 0.55 }, children: account.apiKeyEnv })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: "6px", flexShrink: 0 }, children: [
              index !== 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", disabled: !editable || busy, style: smallButton, onClick: () => {
                select(account.apiKeyEnv);
              }, children: "\u8BBE\u4E3A\u5F53\u524D" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "button",
                {
                  type: "button",
                  disabled: !editable || busy,
                  style: smallButton,
                  onClick: () => {
                    setReplacing(replacing === account.apiKeyEnv ? void 0 : account.apiKeyEnv);
                    setDraftKey("");
                    setError(void 0);
                  },
                  children: replacing === account.apiKeyEnv ? "\u53D6\u6D88" : "\u66F4\u6362 Key"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", disabled: !editable || busy, style: smallButton, onClick: () => {
                remove(account.apiKeyEnv);
              }, children: "\u79FB\u9664" })
            ] })
          ] }),
          replacing === account.apiKeyEnv && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { style: { fontSize: "12px", opacity: 0.7 }, children: [
              "\u65B0\u7684 API Key",
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  type: "password",
                  value: draftKey,
                  autoComplete: "off",
                  onChange: (event) => {
                    setDraftKey(event.target.value);
                  },
                  placeholder: "sk-...",
                  style: input
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", disabled: busy, style: smallButton, onClick: () => {
              replaceKey(account.apiKeyEnv);
            }, children: "\u4FDD\u5B58 Key" }) })
          ] })
        ]
      },
      account.id
    )) }),
    adding ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { style: { fontSize: "12px", opacity: 0.7 }, children: [
        "\u8D26\u53F7\u540D\u79F0",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "text",
            value: draftName,
            onChange: (event) => {
              setDraftName(event.target.value);
            },
            placeholder: "\u4F8B\u5982\uFF1A\u4E3B\u8D26\u53F7",
            style: input
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { style: { fontSize: "12px", opacity: 0.7 }, children: [
        "API Key",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "password",
            value: draftKey,
            autoComplete: "off",
            onChange: (event) => {
              setDraftKey(event.target.value);
            },
            placeholder: "sk-...",
            style: input
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { style: { fontSize: "12px", opacity: 0.7 }, children: [
        "\u5DE5\u4F5C\u7A7A\u95F4 ID\uFF08\u53EF\u9009\uFF0C\u4EC5\u7528\u4E8E\u4EE5\u540E\u8BFB\u53D6\u989D\u5EA6\uFF09",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "text",
            value: draftWorkspace,
            onChange: (event) => {
              setDraftWorkspace(event.target.value);
            },
            placeholder: "workspaceId",
            style: input
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: hint2, children: "Key \u7531\u5BBF\u4E3B\u51ED\u636E\u670D\u52A1\u4FDD\u5B58\uFF0C\u9875\u9762\u4E0D\u4F1A\u56DE\u663E\u5DF2\u4FDD\u5B58\u7684\u5BC6\u94A5\uFF1B\u5F15\u7528\u540D\u7531\u63D2\u4EF6\u81EA\u52A8\u5206\u914D\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: "8px" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", disabled: busy, style: smallButton, onClick: add, children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u786E\u8BA4" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            style: smallButton,
            onClick: () => {
              setAdding(false);
              setDraftKey("");
              setError(void 0);
            },
            children: "\u53D6\u6D88"
          }
        )
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          disabled: !editable || atCap,
          style: smallButton,
          onClick: () => {
            setAdding(true);
            setNotice(void 0);
          },
          children: "\u6DFB\u52A0\u8D26\u53F7"
        }
      ),
      atCap && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: { ...hint2, marginTop: "6px" }, children: [
        "\u5DF2\u8FBE ",
        MAX_ACCOUNTS,
        " \u4E2A\u8D26\u53F7\u4E0A\u9650"
      ] })
    ] }),
    error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: { ...hint2, color: "#e5484d" }, children: error }),
    notice !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: hint2, children: notice })
  ] });
}

// src/client/ModelsCard.tsx
var import_react2 = require("react");

// src/catalog.ts
var GO_DESIGN_PLAN_MODELS = [
  { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
  { id: "deepseek-v4-flash-vision-exp", name: "DeepSeek V4 Flash Vision Exp", inputModalities: ["text", "image"] },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
  { id: "claude-haiku-5.5", name: "Claude Haiku 5.5" },
  { id: "gpt-6-luna", name: "GPT-6 Luna" },
  { id: "glm-5.3-flash", name: "GLM-5.3 Flash" },
  { id: "glm-5.3-flashx", name: "GLM-5.3 Flash-X" },
  { id: "kimi-k2.7-code", name: "Kimi K2.7 Code" },
  { id: "mimo-v2.6-flash", name: "MiMo V2.6 Flash" },
  { id: "mimo-v2.6-pro", name: "MiMo V2.6 Pro" },
  { id: "hy4-preview", name: "Hunyuan H4 Preview" }
];

// src/model-params.ts
var MODEL_DEFAULTS = {
  "claude-haiku-5.5": { contextWindow: 1e6, maxTokens: 128e3, inputModalities: ["text", "image"] },
  "deepseek-v4-flash": { contextWindow: 1048e3, maxTokens: 32e3, inputModalities: ["text"] },
  "deepseek-v4-flash-vision-exp": { contextWindow: 1048e3, maxTokens: 32e3, inputModalities: ["text", "image"] },
  "deepseek-v4-pro": { contextWindow: 1048e3, maxTokens: 128e3, inputModalities: ["text"] },
  "deepseek-v4.1-flash": { contextWindow: 1048e3, maxTokens: 128e3, inputModalities: ["text", "image"] },
  "glm-5.3-flash": { contextWindow: 1048e3, maxTokens: 32e3, inputModalities: ["text", "image"] },
  "glm-5.3-flashx": { contextWindow: 1e6, maxTokens: 32e3, inputModalities: ["text", "image"] },
  "gpt-6-luna": { contextWindow: 105e4, maxTokens: 128e3, inputModalities: ["text", "image"] },
  "hy4-preview": { contextWindow: 1048e3, maxTokens: 32e3, inputModalities: ["text"] },
  "kimi-k2.7-code": { contextWindow: 262e3, maxTokens: 32e3, inputModalities: ["text", "image"] },
  "mimo-v2.6-flash": { contextWindow: 1048e3, maxTokens: 32e3, inputModalities: ["text", "image"] },
  "mimo-v2.6-pro": { contextWindow: 1048e3, maxTokens: 32e3, inputModalities: ["text", "image"] }
};
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
  return parsed.filter((id) => typeof id === "string" && id.length > 0);
}
function isModelEnabled(model, enabled) {
  return enabled.length === 0 || enabled.includes(model);
}

// src/client/ModelsCard.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var card3 = {
  border: "1px solid rgba(128, 128, 128, 0.25)",
  borderRadius: "10px",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: "12px"
};
var hint3 = { fontSize: "13px", opacity: 0.65, margin: 0 };
var input2 = {
  width: "100%",
  padding: "3px 6px",
  fontSize: "12px",
  fontVariantNumeric: "tabular-nums",
  borderRadius: "5px",
  border: "1px solid rgba(128, 128, 128, 0.3)",
  background: "transparent",
  color: "inherit",
  boxSizing: "border-box"
};
function tokens2(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${Math.round(value / 1e3)}k`;
  return String(value);
}
function ModelsCard({ form, config, editable }) {
  const overrides = (0, import_react2.useMemo)(
    () => parseModelParams(config?.modelParamsJson),
    [config?.modelParamsJson]
  );
  const enabled = (0, import_react2.useMemo)(() => parseEnabledModels(config?.enabledModelsJson), [config?.enabledModelsJson]);
  const [editing, setEditing] = (0, import_react2.useState)(void 0);
  const [draftContext, setDraftContext] = (0, import_react2.useState)("");
  const [draftMax, setDraftMax] = (0, import_react2.useState)("");
  const [error, setError] = (0, import_react2.useState)(void 0);
  const [notice, setNotice] = (0, import_react2.useState)(void 0);
  const toggle = (model) => {
    setError(void 0);
    setNotice(void 0);
    const current = enabled.length === 0 ? GO_DESIGN_PLAN_MODELS.map((row) => row.id) : [...enabled];
    const next = current.includes(model) ? current.filter((id) => id !== model) : [...current, model];
    const allOn = next.length === GO_DESIGN_PLAN_MODELS.length;
    void form.mutate([{ op: "set", path: ["enabledModelsJson"], value: allOn ? "" : JSON.stringify(next) }]).then((accepted) => {
      if (accepted === false) {
        setError("\u5BBF\u4E3B\u62D2\u7EDD\u4E86\u8FD9\u6B21\u4FEE\u6539");
        return;
      }
      setNotice(next.includes(model) ? `\u5DF2\u542F\u7528 ${model}` : `\u5DF2\u505C\u7528 ${model}`);
    }).catch((reason) => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: card3, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u53EF\u7528\u6A21\u578B" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: { fontSize: "12px", opacity: 0.6 }, children: [
        GO_DESIGN_PLAN_MODELS.length,
        " \u4E2A"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { style: hint3, children: [
      "\u53D6\u6D88\u52FE\u9009\u540E\u8BE5\u6A21\u578B\u4E0D\u518D\u51FA\u73B0\u5728\u4F1A\u8BDD\u7684\u6A21\u578B\u9009\u62E9\u5668\u91CC\uFF0C\u4F46\u4ECD\u53EF\u7528 API \u76F4\u63A5\u8C03\u7528\u3002 \u53C2\u6570\u9ED8\u8BA4\u503C\u53D6\u81EA OpenDesign \u7684 ",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("code", { style: { margin: "0 3px" }, children: "/v1/models" }),
      "\uFF0C \u4E0E\u5382\u5546\u516C\u5E03\u7684\u6A21\u578B\u89C4\u683C\u53EF\u80FD\u4E0D\u540C\uFF08\u7F51\u5173\u4F1A\u518D\u9650\u4E00\u5C42\uFF09\uFF0C\u7559\u7A7A\u5373\u6CBF\u7528\u7F51\u5173\u503C\u3002"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: "2px" }, children: GO_DESIGN_PLAN_MODELS.map((model) => {
      const base = MODEL_DEFAULTS[model.id];
      const override = overrides[model.id];
      const context = override?.contextWindow ?? base?.contextWindow;
      const max = override?.maxTokens ?? base?.maxTokens;
      const isEditing = editing === model.id;
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            padding: "7px 0",
            borderTop: "1px solid rgba(128, 128, 128, 0.14)"
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "flex-start", gap: "8px", minWidth: 0 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "input",
                  {
                    type: "checkbox",
                    checked: isModelEnabled(model.id, enabled),
                    disabled: !editable,
                    onChange: () => {
                      toggle(model.id);
                    },
                    "aria-label": `\u5728\u6A21\u578B\u5217\u8868\u4E2D${isModelEnabled(model.id, enabled) ? "\u505C\u7528" : "\u542F\u7528"} ${model.name}`,
                    style: { marginTop: "3px", cursor: editable ? "pointer" : "default" }
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { minWidth: 0 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { fontSize: "13px", opacity: isModelEnabled(model.id, enabled) ? 1 : 0.5 }, children: model.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { fontSize: "11px", opacity: 0.55 }, children: model.id })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: { fontSize: "11px", opacity: 0.7, fontVariantNumeric: "tabular-nums" }, children: [
                  "\u4E0A\u4E0B\u6587 ",
                  context === void 0 ? "\u672A\u77E5" : tokens2(context),
                  " \xB7 ",
                  "\u8F93\u51FA ",
                  max === void 0 ? "\u672A\u77E5" : tokens2(max),
                  override !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { marginLeft: "4px", opacity: 0.8 }, children: "\uFF08\u5DF2\u6539\uFF09" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    type: "button",
                    disabled: !editable,
                    style: { fontSize: "11px", padding: "2px 8px", borderRadius: "5px", border: "1px solid rgba(128,128,128,0.35)", background: "transparent", color: "inherit", cursor: "pointer" },
                    onClick: () => {
                      if (isEditing) {
                        setEditing(void 0);
                        return;
                      }
                      setDraftContext(String(override?.contextWindow ?? base?.contextWindow ?? ""));
                      setDraftMax(String(override?.maxTokens ?? base?.maxTokens ?? ""));
                      setError(void 0);
                      setNotice(void 0);
                      setEditing(model.id);
                    },
                    children: isEditing ? "\u53D6\u6D88" : "\u6539\u53C2\u6570"
                  }
                )
              ] })
            ] }),
            isEditing && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "6px", paddingTop: "4px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: { fontSize: "11px", opacity: 0.75, flex: "1 1 150px" }, children: [
                  "\u4E0A\u4E0B\u6587\u7A97\u53E3",
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                    "input",
                    {
                      type: "number",
                      value: draftContext,
                      placeholder: base?.contextWindow === void 0 ? "" : String(base.contextWindow),
                      onChange: (event) => {
                        setDraftContext(event.target.value);
                      },
                      style: input2
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: { fontSize: "11px", opacity: 0.75, flex: "1 1 150px" }, children: [
                  "\u8F93\u51FA\u4E0A\u9650 max_tokens",
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                    "input",
                    {
                      type: "number",
                      value: draftMax,
                      placeholder: base?.maxTokens === void 0 ? "" : String(base.maxTokens),
                      onChange: (event) => {
                        setDraftMax(event.target.value);
                      },
                      style: input2
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: "6px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    type: "button",
                    style: { fontSize: "11px", padding: "3px 10px", borderRadius: "5px", border: "1px solid rgba(128,128,128,0.35)", background: "transparent", color: "inherit", cursor: "pointer" },
                    onClick: () => {
                      save(model.id);
                    },
                    children: "\u4FDD\u5B58"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: "11px", opacity: 0.55, alignSelf: "center" }, children: "\u4E24\u9879\u90FD\u7559\u7A7A = \u6062\u590D\u5B98\u65B9\u503C" })
              ] })
            ] })
          ]
        },
        model.id
      );
    }) }),
    error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: { ...hint3, color: "#e5484d" }, children: error }),
    notice !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: hint3, children: notice })
  ] });
}

// src/client/Section.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var pageStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "20px",
  padding: "4px 0 24px"
};
var titleStyle = { fontSize: "20px", fontWeight: 600, margin: 0 };
var hintStyle = { fontSize: "13px", opacity: 0.65, margin: 0 };
var cardStyle = {
  border: "1px solid rgba(128, 128, 128, 0.25)",
  borderRadius: "10px",
  padding: "14px 16px"
};
var rowStyle2 = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px"
};
var buttonStyle = {
  fontSize: "12px",
  padding: "3px 10px",
  borderRadius: "6px",
  border: "1px solid rgba(128, 128, 128, 0.35)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer"
};
function OpenDesignSection({ form, execute, channelState }) {
  const snapshot = (0, import_react3.useSyncExternalStore)(
    (listener) => form.subscribe(listener),
    () => form.getSnapshot()
  );
  const value = snapshot.value;
  const enabled = value?.enabled ?? true;
  const editable = snapshot.status === "ready" && snapshot.writable;
  const useVela = value?.useVelaCredential ?? false;
  const usage = (0, import_react3.useMemo)(() => parseUsage(value?.usageJson), [value?.usageJson]);
  const report = (0, import_react3.useMemo)(() => parseReport(value?.reportJson), [value?.reportJson]);
  const routeState = (0, import_react3.useMemo)(() => parseRouteDiagnostics(value?.diagnosticsJson), [value?.diagnosticsJson]);
  const toggle = (next) => {
    void form.set("enabled", next).catch((error) => {
      console.error("llm-opendesign-go: could not save the enable switch", error);
    });
  };
  const retry = () => {
    form.getSnapshot();
    window.location.reload();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: pageStyle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h1", { style: titleStyle, children: "OpenDesign Go" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { ...hintStyle, marginTop: "6px" }, children: "\u9009\u62E9\u4F1A\u8BDD\u4E2D\u663E\u793A\u7684 OpenDesign Go \u6A21\u578B\uFF0C\u5E76\u8C03\u6574\u5176\u8BBE\u7F6E\u3002" })
    ] }),
    snapshot.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...hintStyle, display: "flex", alignItems: "center", gap: "10px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u2026" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", onClick: retry, style: buttonStyle, children: "\u91CD\u65B0\u52A0\u8F7D" })
    ] }),
    snapshot.status === "unavailable" && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...hintStyle, display: "flex", flexDirection: "column", gap: "6px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
        "\u5BBF\u4E3B\u672A\u66B4\u9732\u672C\u63D2\u4EF6\u7684\u914D\u7F6E\u9879\uFF08namespace: ",
        PROFILE_ENTRY_ID,
        "\uFF09\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { fontSize: "11px", opacity: 0.7 }, children: [
        "\u8BCA\u65AD\uFF1A",
        snapshot.status,
        " / revision=",
        String(snapshot.revision),
        " / writable=",
        String(snapshot.writable)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", onClick: retry, style: buttonStyle, children: "\u91CD\u65B0\u52A0\u8F7D" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: cardStyle, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: rowStyle2, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u542F\u7528 OpenDesign Go" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { ...hintStyle, marginTop: "4px" }, children: "\u5173\u95ED\u540E\uFF0C\u672C\u63D2\u4EF6\u63D0\u4F9B\u7684\u6A21\u578B\u4F1A\u4ECE\u4F1A\u8BDD\u9009\u62E9\u5668\u4E2D\u79FB\u9664\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "input",
        {
          type: "checkbox",
          checked: enabled,
          disabled: !editable,
          onChange: (event) => {
            toggle(event.target.checked);
          },
          "aria-label": "\u542F\u7528 OpenDesign Go"
        }
      )
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(AccountsCard, { form, config: value, editable, execute, channelState }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(UsageCard, { report }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(QuotaCard, { snapshot: usage, loading: false }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: cardStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u989D\u5EA6\u6765\u6E90" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: { display: "flex", alignItems: "flex-start", gap: "8px", marginTop: "8px", cursor: editable ? "pointer" : "default" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "input",
          {
            type: "checkbox",
            checked: useVela,
            disabled: !editable,
            onChange: (event) => {
              void form.set("useVelaCredential", event.target.checked);
            },
            style: { marginTop: "2px" }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { fontSize: "13px" }, children: [
          "\u4F7F\u7528\u672C\u673A OpenDesign \u7684\u767B\u5F55\u51ED\u8BC1\u8BFB\u53D6\u989D\u5EA6",
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { display: "block", fontSize: "12px", opacity: 0.62, marginTop: "2px", lineHeight: 1.5 }, children: "\u5982\u679C\u4F60\u5B89\u88C5\u5E76\u767B\u5F55\u8FC7 OpenDesign \u684C\u9762\u7AEF\uFF0C\u52FE\u9009\u540E\u5373\u53EF\u76F4\u63A5\u8BFB\u53D6\u771F\u5B9E\u7684 5 \u5C0F\u65F6 / 7 \u5929\u989D\u5EA6\uFF0C \u65E0\u9700\u518D\u586B\u4EFB\u4F55\u51ED\u636E\u3002\u53EA\u60F3\u7528 API Key \u7684\u8BDD\u4FDD\u6301\u5173\u95ED\u5373\u53EF\u3002" })
        ] })
      ] }),
      useVela && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { ...hintStyle, marginTop: "8px", fontSize: "12px" }, children: "\u8BFB\u53D6\u65B9\u5F0F\uFF1A\u8C03\u7528 OpenDesign \u684C\u9762\u7AEF\u81EA\u5E26\u7684 vela \u547D\u4EE4\u884C\u3002\u8BE5\u547D\u4EE4\u5C5E\u5B98\u65B9\u79C1\u6709\u63A5\u53E3\uFF0C \u82E5 OpenDesign \u5347\u7EA7\u540E\u683C\u5F0F\u53D8\u5316\uFF0C\u8FD9\u91CC\u4F1A\u663E\u793A\u5931\u8D25\u539F\u56E0\u800C\u4E0D\u662F\u7ED9\u51FA\u9519\u8BEF\u6570\u5B57\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: cardStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u8DEF\u7531\u72B6\u6001" }),
      routeState === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { ...hintStyle, marginTop: "4px" }, children: "\u5BBF\u4E3B\u5C1A\u672A\u4E0A\u62A5\u8DEF\u7531\u72B6\u6001\u3002\u91CD\u542F\u540E\u82E5\u4ECD\u4E3A\u7A7A\uFF0C\u8BF4\u660E\u63D2\u4EF6\u672A\u5B8C\u6210\u6FC0\u6D3B\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { style: { ...hintStyle, marginTop: "4px", fontSize: "12px" }, children: [
        routeState.registered ? "\u5DF2\u6CE8\u518C" : "\u672A\u6CE8\u518C",
        " \xB7 ",
        "\u542F\u7528=",
        String(routeState.enabled),
        " \xB7 ",
        "\u51ED\u636E=",
        routeState.credentialResolved ? "\u5DF2\u89E3\u6790" : "\u672A\u89E3\u6790",
        "\uFF08",
        routeState.triedRef || "\u65E0",
        "\uFF09",
        " \xB7 ",
        "\u58F0\u660E\u6A21\u578B ",
        routeState.modelCount,
        " \u4E2A",
        routeState.lastError !== void 0 && ` \xB7 \u5931\u8D25\uFF1A${routeState.lastError}`
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ModelsCard, { form, config: value, editable })
  ] });
}

// src/client/index.ts
var inject = ["slots", "remote"];
function apply(ctx) {
  const commands = accountCommands(ctx);
  ctx.inject(["configForms"], (ready) => {
    const form = ready.configForms.get(PROFILE_ENTRY_ID);
    const injected = () => ({
      form,
      execute: commands.execute,
      channelState: commands.state
    });
    ready.effect(() => ready.slots.inject("settings.section", () => ready.slots.register({
      name: "settings.section",
      id: PROFILE_ENTRY_ID,
      order: 20,
      label: () => DISPLAY_NAME,
      inject: injected
    }, OpenDesignSection)));
  });
}

return module.exports; } });
