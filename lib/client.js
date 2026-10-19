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

// src/client/Section.tsx
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

// src/usage-contract.ts
function windowLabel(durationSeconds) {
  const days = durationSeconds / 86400;
  if (Number.isInteger(days) && days >= 1) return `${days} \u5929`;
  const hours = durationSeconds / 3600;
  if (Number.isInteger(hours) && hours >= 1) return `${hours} \u5C0F\u65F6`;
  return `${Math.round(durationSeconds / 60)} \u5206\u949F`;
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
  const result = {
    asOf: row.asOf,
    tier: row.tier,
    eligible: row.eligible,
    windows,
    ...typeof row.error === "string" ? { error: row.error } : {}
  };
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
function WindowRow({ window: window2 }) {
  const percent = window2.percentUsed;
  const label = windowLabel(window2.durationSeconds);
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
    ] })
  ] });
}
function QuotaCard({ snapshot, loading }) {
  const card3 = {
    border: "1px solid rgba(128, 128, 128, 0.25)",
    borderRadius: "10px",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "14px"
  };
  const hint3 = { fontSize: "13px", opacity: 0.65, margin: 0 };
  if (loading && snapshot === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: card3, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: hint3, children: "\u6B63\u5728\u8BFB\u53D6\u989D\u5EA6\u2026" }) });
  }
  if (snapshot === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card3, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u8BA2\u9605\u989D\u5EA6" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: hint3, children: "\u672A\u914D\u7F6E\u63A7\u5236\u53F0\u4F1A\u8BDD\u51ED\u636E\uFF0C\u56E0\u6B64\u65E0\u6CD5\u663E\u793A\u771F\u5B9E\u989D\u5EA6\u3002\u989D\u5EA6\u63A5\u53E3\u4E0D\u4EE5 API Key \u9274\u6743\uFF0C\u9700\u8981\u4E00\u4EFD\u63A7\u5236\u53F0\u4F1A\u8BDD\u51ED\u636E\u624D\u80FD\u8BFB\u53D6\u3002" })
    ] });
  }
  if (snapshot.error !== void 0 && snapshot.windows.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card3, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u8BA2\u9605\u989D\u5EA6" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: hint3, children: [
        "\u8BFB\u53D6\u5931\u8D25\uFF1A",
        snapshot.error
      ] })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card3, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u8BA2\u9605\u989D\u5EA6" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: "11px", opacity: 0.5 }, children: [
        "\u8BFB\u53D6\u4E8E ",
        new Date(snapshot.asOf).toLocaleTimeString()
      ] })
    ] }),
    snapshot.windows.map((window2) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WindowRow, { window: window2 }, window2.durationSeconds)),
    snapshot.wallet !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "12px", opacity: 0.65, borderTop: "1px solid rgba(128,128,128,0.18)", paddingTop: "10px" }, children: [
      "\u94B1\u5305\u4F59\u989D $",
      snapshot.wallet.balanceUsd,
      snapshot.wallet.subscriptionPeriodEnd === void 0 ? " \xB7 \u989D\u5EA6\u7528\u5C3D\u540E\u6309\u91CF\u4ED8\u8D39" : ` \xB7 \u5468\u671F\u81F3 ${new Date(snapshot.wallet.subscriptionPeriodEnd).toLocaleDateString()}`,
      " \xB7 \u5E76\u53D1 10\uFF08\u6309 2026-10-19 \u5B98\u65B9\u53E3\u5F84\uFF09"
    ] }),
    snapshot.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: { ...hint3, fontSize: "12px" }, children: [
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
function tokens(tokens2) {
  if (tokens2 >= 1e6) return `${(tokens2 / 1e6).toFixed(1)}M`;
  if (tokens2 >= 1e3) return `${(tokens2 / 1e3).toFixed(1)}k`;
  return String(tokens2);
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
function deriveAccountRef(index) {
  return `OPENDESIGN_ACCOUNT_${index + 1}`;
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
function AccountsCard({ form, config, editable }) {
  const [adding, setAdding] = (0, import_react.useState)(false);
  const [draftName, setDraftName] = (0, import_react.useState)("");
  const [error, setError] = (0, import_react.useState)(void 0);
  const accounts = accountsOf({
    apiKeyEnv: config?.apiKeyEnv ?? "",
    accounts: config?.accounts ?? null
  });
  const atCap = accounts.length >= MAX_ACCOUNTS;
  const commit = (next, selectedRef) => {
    setError(void 0);
    void form.mutate([
      { op: "set", path: ["accounts"], value: next.map((account) => ({ ...account })) },
      { op: "set", path: ["apiKeyEnv"], value: selectedRef }
    ]).then((accepted) => {
      if (accepted === false) setError("\u5BBF\u4E3B\u62D2\u7EDD\u4E86\u8FD9\u6B21\u4FEE\u6539\uFF0C\u8BF7\u68C0\u67E5\u8D26\u53F7\u4FE1\u606F");
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  };
  const add = () => {
    const name = draftName.trim();
    if (name.length === 0) {
      setError("\u8BF7\u8F93\u5165\u8D26\u53F7\u540D\u79F0");
      return;
    }
    const used = new Set(accounts.map((account2) => account2.apiKeyEnv));
    let index = 0;
    while (used.has(deriveAccountRef(index))) index += 1;
    const account = {
      id: crypto.randomUUID(),
      name,
      apiKeyEnv: deriveAccountRef(index)
    };
    commit([...accounts, account], accounts[0]?.apiKeyEnv ?? account.apiKeyEnv);
    setDraftName("");
    setAdding(false);
  };
  const remove = (ref) => {
    const next = accounts.filter((account) => account.apiKeyEnv !== ref);
    if (next.length === 0) {
      setError("\u81F3\u5C11\u4FDD\u7559\u4E00\u4E2A\u8D26\u53F7");
      return;
    }
    const selected = next[0];
    if (selected === void 0) return;
    commit(next, selected.apiKeyEnv);
  };
  const select = (ref) => {
    commit(accounts, ref);
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
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "8px 10px",
          borderRadius: "8px",
          border: "1px solid rgba(128, 128, 128, 0.2)",
          background: index === 0 ? "rgba(59, 130, 246, 0.08)" : "transparent"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { minWidth: 0 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { fontSize: "13px" }, children: [
              account.name || account.apiKeyEnv,
              index === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { marginLeft: "8px", fontSize: "11px", opacity: 0.6 }, children: "\u5F53\u524D" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: "11px", opacity: 0.55 }, children: account.apiKeyEnv })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: "6px", flexShrink: 0 }, children: [
            index !== 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", disabled: !editable, style: smallButton, onClick: () => {
              select(account.apiKeyEnv);
            }, children: "\u8BBE\u4E3A\u5F53\u524D" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", disabled: !editable, style: smallButton, onClick: () => {
              remove(account.apiKeyEnv);
            }, children: "\u79FB\u9664" })
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
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: hint2, children: "Key \u8BF7\u901A\u8FC7\u5BBF\u4E3B\u51ED\u636E\u670D\u52A1\u5199\u5165\uFF08\u5F15\u7528\u540D\u4FDD\u5B58\u540E\u663E\u793A\uFF09\uFF0C\u9875\u9762\u4E0D\u4F1A\u8BFB\u53D6\u6216\u56DE\u663E\u5BC6\u94A5\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: "8px" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: smallButton, onClick: add, children: "\u786E\u8BA4" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: smallButton, onClick: () => {
          setAdding(false);
          setError(void 0);
        }, children: "\u53D6\u6D88" })
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
    error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: { ...hint2, color: "#e5484d" }, children: error })
  ] });
}

// src/client/Section.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
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
var listStyle = {
  listStyle: "none",
  margin: "10px 0 0",
  padding: 0,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: "6px 18px",
  fontSize: "13px"
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
var inputStyle = {
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
function OpenDesignSection({ form }) {
  const snapshot = (0, import_react2.useSyncExternalStore)(
    (listener) => form.subscribe(listener),
    () => form.getSnapshot()
  );
  const value = snapshot.value;
  const enabled = value?.enabled ?? true;
  const editable = snapshot.status === "ready" && snapshot.writable;
  const sessionRef = value?.sessionRef ?? "";
  const usage = (0, import_react2.useMemo)(() => parseUsage(value?.usageJson), [value?.usageJson]);
  const report = (0, import_react2.useMemo)(() => parseReport(value?.reportJson), [value?.reportJson]);
  const usageLoading = false;
  const loadUsage = () => {
    if (!editable) return;
    void form.set("sessionRef", sessionRef);
  };
  const toggle = (next) => {
    void form.set("enabled", next).catch((error) => {
      console.error("llm-opendesign-go: could not save the enable switch", error);
    });
  };
  const retry = () => {
    form.getSnapshot();
    window.location.reload();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: pageStyle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h1", { style: titleStyle, children: "OpenDesign Go" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: { ...hintStyle, marginTop: "6px" }, children: "\u9009\u62E9\u4F1A\u8BDD\u4E2D\u663E\u793A\u7684 OpenDesign Go \u6A21\u578B\uFF0C\u5E76\u8C03\u6574\u5176\u8BBE\u7F6E\u3002" })
    ] }),
    snapshot.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { ...hintStyle, display: "flex", alignItems: "center", gap: "10px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u2026" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: retry, style: buttonStyle, children: "\u91CD\u65B0\u52A0\u8F7D" })
    ] }),
    snapshot.status === "unavailable" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { ...hintStyle, display: "flex", flexDirection: "column", gap: "6px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
        "\u5BBF\u4E3B\u672A\u66B4\u9732\u672C\u63D2\u4EF6\u7684\u914D\u7F6E\u9879\uFF08namespace: ",
        PROFILE_ENTRY_ID,
        "\uFF09\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: { fontSize: "11px", opacity: 0.7 }, children: [
        "\u8BCA\u65AD\uFF1A",
        snapshot.status,
        " / revision=",
        String(snapshot.revision),
        " / writable=",
        String(snapshot.writable)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: retry, style: buttonStyle, children: "\u91CD\u65B0\u52A0\u8F7D" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: cardStyle, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: rowStyle2, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u542F\u7528 OpenDesign Go" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: { ...hintStyle, marginTop: "4px" }, children: "\u5173\u95ED\u540E\uFF0C\u672C\u63D2\u4EF6\u63D0\u4F9B\u7684\u6A21\u578B\u4F1A\u4ECE\u4F1A\u8BDD\u9009\u62E9\u5668\u4E2D\u79FB\u9664\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(AccountsCard, { form, config: value, editable }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(UsageCard, { report }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(QuotaCard, { snapshot: usage, loading: usageLoading }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: cardStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u989D\u5EA6\u901A\u9053" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: { ...hintStyle, marginTop: "4px" }, children: "\u989D\u5EA6\u63A5\u53E3\u4E0D\u7528 API Key \u9274\u6743\uFF0C\u9700\u8981\u4E00\u4EFD\u63A7\u5236\u53F0\u4F1A\u8BDD\u51ED\u636E\u3002\u7559\u7A7A\u8868\u793A\u5173\u95ED\u8BE5\u901A\u9053\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: { fontSize: "12px", opacity: 0.7 }, children: [
          "\u4F1A\u8BDD\u51ED\u636E\u5F15\u7528\u540D",
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              type: "text",
              defaultValue: sessionRef,
              disabled: !editable,
              placeholder: "OPENDESIGN_SESSION",
              onBlur: (event) => {
                void form.set("sessionRef", event.target.value.trim());
              },
              style: inputStyle
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: { fontSize: "12px", opacity: 0.7 }, children: [
          "\u5DE5\u4F5C\u7A7A\u95F4 ID",
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              type: "text",
              defaultValue: value?.workspaceId ?? "",
              disabled: !editable,
              placeholder: "workspaceId\uFF08\u63A7\u5236\u53F0 URL \u91CC\u7684 t\u2026\uFF09",
              onBlur: (event) => {
                void form.set("workspaceId", event.target.value.trim());
              },
              style: inputStyle
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: loadUsage, disabled: !editable || usageLoading, style: buttonStyle, children: usageLoading ? "\u8BFB\u53D6\u4E2D\u2026" : "\u5237\u65B0\u989D\u5EA6" }) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: cardStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u53EF\u7528\u6A21\u578B" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { style: { ...hintStyle, marginTop: "4px" }, children: [
        "Go \u5957\u9910\u6388\u4E88\u7684 ",
        GO_DESIGN_PLAN_MODELS.length,
        " \u4E2A Design Plan \u6A21\u578B\uFF08Go \u4E0D\u542B\u5957\u9910\u6A21\u578B\u989D\u5EA6\uFF09\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { style: listStyle, children: GO_DESIGN_PLAN_MODELS.map((model) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { children: model.name }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { ...hintStyle, fontSize: "12px" }, children: model.id })
      ] }, model.id)) })
    ] })
  ] });
}

// src/client/index.ts
var inject = ["slots"];
function apply(ctx) {
  ctx.inject(["configForms"], (ready) => {
    const form = ready.configForms.get(PROFILE_ENTRY_ID);
    const injected = () => ({ form });
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
