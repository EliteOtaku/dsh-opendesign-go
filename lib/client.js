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

// css-module:D:\AI\dsh-opendesign-go\src\client\ui\primitives.module.css
var css = "._2dm5da_card{background:var(--ods-surface);border:1px solid var(--ods-border);border-radius:var(--ods-radius);flex-direction:column;display:flex;overflow:hidden}._2dm5da_cardHead{grid-template-columns:1fr auto;align-items:start;gap:2px 12px;padding:14px 16px 0;display:grid}._2dm5da_cardHeading{align-items:center;gap:8px;min-width:0;display:flex}._2dm5da_cardBadge{flex-shrink:0;display:inline-flex}._2dm5da_cardTitle{letter-spacing:-.01em;color:var(--ods-text);margin:0;font-size:14px;font-weight:600}._2dm5da_cardActions{justify-self:end;align-items:center;gap:8px;display:flex}._2dm5da_cardDesc{color:var(--ods-text-2);grid-column:1/-1;margin:4px 0 0;font-size:12px;line-height:1.55}._2dm5da_cardBody{padding:12px 16px 16px}._2dm5da_cardBodyColumns{flex-direction:column;display:flex}._2dm5da_row{grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px;padding:10px 0;display:grid}._2dm5da_row+._2dm5da_row,._2dm5da_divider+._2dm5da_row,._2dm5da_row+._2dm5da_divider{border-top:1px solid var(--ods-border)}._2dm5da_rowTop{align-items:start}._2dm5da_rowText{min-width:0}._2dm5da_rowLabelWrap{min-width:0;cursor:inherit}._2dm5da_rowLabel{color:var(--ods-text);font-size:13px;font-weight:500}._2dm5da_rowHint{color:var(--ods-text-2);margin:3px 0 0;font-size:12px;line-height:1.55}._2dm5da_rowControl{justify-self:end;align-items:center;gap:8px;min-width:0;display:flex}._2dm5da_badge{white-space:nowrap;border-radius:999px;align-items:center;gap:4px;padding:1px 7px;font-size:11px;font-weight:500;line-height:1.7;display:inline-flex}._2dm5da_badgeNeutral{color:var(--ods-text-2);background:var(--ods-surface-2)}._2dm5da_badgeOk{color:var(--ods-ok);background:color-mix(in srgb, var(--ods-ok) 12%, transparent)}._2dm5da_badgeWarn{color:var(--ods-warn);background:color-mix(in srgb, var(--ods-warn) 14%, transparent)}._2dm5da_badgeStop{color:var(--ods-stop);background:color-mix(in srgb, var(--ods-stop) 12%, transparent)}._2dm5da_hint{color:var(--ods-text-2);margin:0;font-size:12px;line-height:1.6}._2dm5da_divider{background:var(--ods-border);height:1px;margin:6px 0}._2dm5da_switch{background:var(--ods-surface-3);cursor:pointer;border:none;border-radius:999px;flex-shrink:0;width:38px;height:22px;padding:0;transition:background .12s;position:relative}._2dm5da_switch:disabled{opacity:.45;cursor:not-allowed}._2dm5da_switchOn{background:var(--ods-accent)}._2dm5da_switchThumb{background:var(--dsw-alias-switch-thumb,#fff);border-radius:999px;width:18px;height:18px;transition:transform .12s;position:absolute;top:2px;left:2px;box-shadow:0 1px 2px #00000040}._2dm5da_switchOn ._2dm5da_switchThumb{transform:translate(16px)}._2dm5da_btn{border-radius:var(--ods-radius-sm);border:1px solid var(--ods-border);color:var(--ods-text);cursor:pointer;white-space:nowrap;background:0 0;align-items:center;gap:6px;padding:5px 12px;font-size:12px;font-weight:500;line-height:1.5;transition:background .12s,border-color .12s;display:inline-flex}._2dm5da_btn:hover:not(:disabled){background:var(--ods-hover)}._2dm5da_btn:disabled{opacity:.5;cursor:default}._2dm5da_btnPrimary{background:var(--ods-accent);color:var(--ods-on-accent);border-color:#0000}._2dm5da_btnPrimary:hover:not(:disabled){background:var(--ods-accent);opacity:.88}._2dm5da_btnDanger{color:var(--ods-stop);border-color:color-mix(in srgb, var(--ods-stop) 35%, transparent)}._2dm5da_btnDanger:hover:not(:disabled){background:color-mix(in srgb, var(--ods-stop) 10%, transparent)}._2dm5da_bar{background:var(--ods-surface-3);border-radius:999px;flex:1;height:8px;overflow:hidden}._2dm5da_barFill{border-radius:999px;height:100%;transition:width .2s}._2dm5da_stat{flex-direction:column;gap:2px;min-width:0;display:flex}._2dm5da_statLabel{color:var(--ods-text-2);font-size:11px}._2dm5da_statValue{font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:var(--ods-text);font-size:18px;font-weight:600}._2dm5da_statHint{color:var(--ods-text-3);font-size:11px}._2dm5da_field{flex-direction:column;gap:4px;display:flex}._2dm5da_fieldLabel{color:var(--ods-text-3);font-size:11px}._2dm5da_fieldHint{color:var(--ods-text-3);font-size:11px;line-height:1.5}._2dm5da_input{box-sizing:border-box;width:100%;font:inherit;color:var(--ods-text);background:var(--ods-sunken);border:1px solid var(--ods-border);border-radius:var(--ods-radius-sm);padding:6px 9px;font-size:12px}._2dm5da_input::placeholder{color:var(--ods-text-3)}._2dm5da_input:focus-visible{outline:2px solid var(--ods-accent);outline-offset:-1px;border-color:#0000}._2dm5da_cardDesc>span{display:block}._2dm5da_cardDesc>span+span{margin-top:5px}";
var id = "src/client/ui/primitives.module.css";
var attr = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr + '="' + id + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr, id);
  tag.textContent = css;
  (document.head || document.documentElement).appendChild(tag);
}
var primitives_default = { "badge": "_2dm5da_badge", "badgeNeutral": "_2dm5da_badgeNeutral", "badgeOk": "_2dm5da_badgeOk", "badgeStop": "_2dm5da_badgeStop", "badgeWarn": "_2dm5da_badgeWarn", "bar": "_2dm5da_bar", "barFill": "_2dm5da_barFill", "btn": "_2dm5da_btn", "btnDanger": "_2dm5da_btnDanger", "btnPrimary": "_2dm5da_btnPrimary", "card": "_2dm5da_card", "cardActions": "_2dm5da_cardActions", "cardBadge": "_2dm5da_cardBadge", "cardBody": "_2dm5da_cardBody", "cardBodyColumns": "_2dm5da_cardBodyColumns", "cardDesc": "_2dm5da_cardDesc", "cardHead": "_2dm5da_cardHead", "cardHeading": "_2dm5da_cardHeading", "cardTitle": "_2dm5da_cardTitle", "divider": "_2dm5da_divider", "field": "_2dm5da_field", "fieldHint": "_2dm5da_fieldHint", "fieldLabel": "_2dm5da_fieldLabel", "hint": "_2dm5da_hint", "input": "_2dm5da_input", "row": "_2dm5da_row", "rowControl": "_2dm5da_rowControl", "rowHint": "_2dm5da_rowHint", "rowLabel": "_2dm5da_rowLabel", "rowLabelWrap": "_2dm5da_rowLabelWrap", "rowText": "_2dm5da_rowText", "rowTop": "_2dm5da_rowTop", "stat": "_2dm5da_stat", "statHint": "_2dm5da_statHint", "statLabel": "_2dm5da_statLabel", "statValue": "_2dm5da_statValue", "switch": "_2dm5da_switch", "switchOn": "_2dm5da_switchOn", "switchThumb": "_2dm5da_switchThumb" };

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

// css-module:D:\AI\dsh-opendesign-go\src\client\QuotaCard.module.css
var css2 = ".r1B5YG_body{flex-direction:column;gap:14px;display:flex}.r1B5YG_window{flex-direction:column;gap:6px;display:flex}.r1B5YG_windowHead{justify-content:space-between;align-items:baseline;gap:12px;display:flex}.r1B5YG_windowName{color:var(--ods-text);font-size:13px;font-weight:500}.r1B5YG_windowMeta{color:var(--ods-text-3);font-variant-numeric:tabular-nums;font-size:11px}.r1B5YG_barLine{align-items:center;gap:10px;display:flex}.r1B5YG_barLine>:first-child{flex:1}.r1B5YG_windowPercent{text-align:right;font-variant-numeric:tabular-nums;min-width:62px;color:var(--ods-text);font-size:12px;font-weight:600}.r1B5YG_windowFoot{color:var(--ods-text-3);font-variant-numeric:tabular-nums;flex-wrap:wrap;gap:6px;font-size:11px;line-height:1.6;display:flex}.r1B5YG_missing{color:var(--ods-text-2);margin:0;font-size:12px;line-height:1.6}.r1B5YG_wallet{border-top:1px solid var(--ods-border);color:var(--ods-text-2);flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:8px;padding-top:10px;font-size:12px;display:flex}.r1B5YG_walletValue{font-variant-numeric:tabular-nums;color:var(--ods-text);font-weight:600}.r1B5YG_spend{border-top:1px solid var(--ods-border);color:var(--ods-text-3);font-variant-numeric:tabular-nums;flex-direction:column;gap:3px;padding-top:10px;font-size:11px;line-height:1.6;display:flex}.r1B5YG_stamp{color:var(--ods-text-3);font-variant-numeric:tabular-nums;font-size:11px}.r1B5YG_actions{align-items:center;gap:8px;display:flex}";
var id2 = "src/client/QuotaCard.module.css";
var attr2 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr2 + '="' + id2 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr2, id2);
  tag.textContent = css2;
  (document.head || document.documentElement).appendChild(tag);
}
var QuotaCard_default = { "actions": "r1B5YG_actions", "barLine": "r1B5YG_barLine", "body": "r1B5YG_body", "missing": "r1B5YG_missing", "spend": "r1B5YG_spend", "stamp": "r1B5YG_stamp", "wallet": "r1B5YG_wallet", "walletValue": "r1B5YG_walletValue", "window": "r1B5YG_window", "windowFoot": "r1B5YG_windowFoot", "windowHead": "r1B5YG_windowHead", "windowMeta": "r1B5YG_windowMeta", "windowName": "r1B5YG_windowName", "windowPercent": "r1B5YG_windowPercent" };

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

// css-module:D:\AI\dsh-opendesign-go\src\client\BillingCard.module.css
var css3 = ".gurVza_block{flex-direction:column;gap:4px;display:flex}.gurVza_divider{border-top:1px solid var(--ods-border);padding-top:12px}.gurVza_allowance{font-variant-numeric:tabular-nums;color:var(--ods-text);font-size:13px;font-weight:500}.gurVza_note{color:var(--ods-text-3);font-variant-numeric:tabular-nums;font-size:11px;line-height:1.6}.gurVza_aligned{font-variant-numeric:tabular-nums;color:var(--ods-text-2);flex-direction:column;gap:2px;font-size:12px;display:flex}.gurVza_alignedAt{color:var(--ods-text-3);font-size:11px}.gurVza_disclosure{width:100%;color:var(--ods-text-2);font:inherit;text-align:left;cursor:pointer;background:0 0;border:none;align-items:center;gap:6px;padding:0;font-size:12px;display:flex}.gurVza_disclosure:hover{color:var(--ods-text)}.gurVza_chevron{width:12px;color:var(--ods-text-3);font-size:10px}.gurVza_cost{font-variant-numeric:tabular-nums;color:var(--ods-text-2);flex-direction:column;gap:4px;margin-top:8px;font-size:12px;display:flex}";
var id3 = "src/client/BillingCard.module.css";
var attr3 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr3 + '="' + id3 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr3, id3);
  tag.textContent = css3;
  (document.head || document.documentElement).appendChild(tag);
}
var BillingCard_default = { "aligned": "gurVza_aligned", "alignedAt": "gurVza_alignedAt", "allowance": "gurVza_allowance", "block": "gurVza_block", "chevron": "gurVza_chevron", "cost": "gurVza_cost", "disclosure": "gurVza_disclosure", "divider": "gurVza_divider", "note": "gurVza_note" };

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
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: BillingCard_default.note, children: "\u6708\u603B\u989D\u5EA6\u662F\u5B98\u65B9\u5BA3\u4F20\u503C\uFF0C\u5B9E\u9645\u7EA6\u675F\u662F\u4E0A\u65B9\u7A97\u53E3\uFF1AGo \u6BCF\u5468 $15\uFF0C\u56DB\u5468\u5408\u8BA1\u7EA6 $60\uFF0C \u56E0\u6B64 $120 \u7684\u6708\u989D\u5EA6\u6309\u5468\u53E3\u5F84\u7528\u4E0D\u6EE1" })
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
  go: Object.freeze({ monthlyUsd: 10, monthlyCapUsd: 120 }),
  plus: Object.freeze({ monthlyUsd: 20, monthlyCapUsd: 180 }),
  pro: Object.freeze({ monthlyUsd: 100, monthlyCapUsd: 480 }),
  max: Object.freeze({ monthlyUsd: 200, monthlyCapUsd: 900 })
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

// src/update-check.ts
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
function parseUpdate(raw) {
  if (raw === void 0 || raw.length === 0) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (parsed === null || typeof parsed !== "object") return void 0;
  const row = parsed;
  const current = row.current;
  const latest = row.latest;
  if (typeof current !== "string" || current.length === 0) return void 0;
  if (typeof latest !== "string" || latest.length === 0) return void 0;
  if (compareVersions(latest, current) <= 0) return void 0;
  const homepage = typeof row.homepage === "string" ? row.homepage : void 0;
  return { current, latest, homepage };
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

// css-module:D:\AI\dsh-opendesign-go\src\client\UsageCard.module.css
var css4 = ".Raueqq_table{font-variant-numeric:tabular-nums;grid-template-columns:minmax(0,1fr) auto auto auto;gap:0;font-size:12px;display:grid}.Raueqq_headCell{color:var(--ods-text-3);border-bottom:1px solid var(--ods-border);padding:0 0 6px;font-size:11px}.Raueqq_cell{border-bottom:1px solid var(--ods-border);color:var(--ods-text-2);padding:7px 0}.Raueqq_headCell:not(:last-child),.Raueqq_cell:not(:last-child){padding-right:14px}.Raueqq_model{text-overflow:ellipsis;white-space:nowrap;color:var(--ods-text);overflow:hidden}.Raueqq_num{text-align:right}.Raueqq_recovered{color:var(--ods-text-3);flex-direction:column;gap:2px;font-size:11px;line-height:1.6;display:flex}.Raueqq_foot{color:var(--ods-text-3);margin:0;font-size:11px;line-height:1.6}";
var id4 = "src/client/UsageCard.module.css";
var attr4 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr4 + '="' + id4 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr4, id4);
  tag.textContent = css4;
  (document.head || document.documentElement).appendChild(tag);
}
var UsageCard_default = { "cell": "Raueqq_cell", "foot": "Raueqq_foot", "headCell": "Raueqq_headCell", "model": "Raueqq_model", "num": "Raueqq_num", "recovered": "Raueqq_recovered", "table": "Raueqq_table" };

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

// css-module:D:\AI\dsh-opendesign-go\src\client\AccountsCard.module.css
var css5 = ".ehCEhW_accounts{flex-direction:column;gap:8px;display:flex}.ehCEhW_account{border:1px solid var(--ods-border);border-radius:var(--ods-radius-sm);flex-direction:column;gap:8px;padding:9px 11px;display:flex}.ehCEhW_accountActive{border-color:color-mix(in srgb, var(--ods-accent) 55%, var(--ods-border));background:color-mix(in srgb, var(--ods-accent) 7%, transparent)}.ehCEhW_accountTop{justify-content:space-between;align-items:center;gap:12px;display:flex}.ehCEhW_accountMain{align-items:center;gap:8px;min-width:0;display:flex}.ehCEhW_accountText{flex-direction:column;gap:1px;min-width:0;display:flex}.ehCEhW_accountName{color:var(--ods-text);text-overflow:ellipsis;white-space:nowrap;font-size:13px;overflow:hidden}.ehCEhW_accountEnv{color:var(--ods-text-3);text-overflow:ellipsis;white-space:nowrap;font-size:11px;overflow:hidden}.ehCEhW_accountActions{flex-shrink:0;gap:6px;display:flex}.ehCEhW_form{flex-direction:column;gap:10px;display:flex}.ehCEhW_formActions{gap:8px;display:flex}.ehCEhW_error{color:var(--ods-stop);margin:0;font-size:12px}.ehCEhW_notice{color:var(--ods-text-2);margin:0;font-size:12px}.ehCEhW_cap{color:var(--ods-text-3);margin:0;font-size:11px}";
var id5 = "src/client/AccountsCard.module.css";
var attr5 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr5 + '="' + id5 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr5, id5);
  tag.textContent = css5;
  (document.head || document.documentElement).appendChild(tag);
}
var AccountsCard_default = { "account": "ehCEhW_account", "accountActions": "ehCEhW_accountActions", "accountActive": "ehCEhW_accountActive", "accountEnv": "ehCEhW_accountEnv", "accountMain": "ehCEhW_accountMain", "accountName": "ehCEhW_accountName", "accountText": "ehCEhW_accountText", "accountTop": "ehCEhW_accountTop", "accounts": "ehCEhW_accounts", "cap": "ehCEhW_cap", "error": "ehCEhW_error", "form": "ehCEhW_form", "formActions": "ehCEhW_formActions", "notice": "ehCEhW_notice" };

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
  "mimo-v2.6-pro": { contextWindow: 1e6, maxTokens: 128e3, inputModalities: ["text", "image"], reasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh", "max"] }
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
  return parsed.filter((id10) => typeof id10 === "string" && id10.length > 0);
}
function isModelEnabled(model, enabled) {
  return enabled.length === 0 || enabled.includes(model);
}

// src/catalog.ts
var GO_DESIGN_PLAN_MODELS = [
  { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
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
  { id: "hy4-preview", name: "Hunyuan H4 Preview" }
];

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

// css-module:D:\AI\dsh-opendesign-go\src\client\ModelsCard.module.css
var css6 = ".A3RkNq_list{flex-direction:column;display:flex}.A3RkNq_model{border-top:1px solid var(--ods-border);flex-direction:column;gap:6px;padding:9px 0;display:flex}.A3RkNq_modelTop{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.A3RkNq_modelMain{align-items:flex-start;gap:10px;min-width:0;display:flex}.A3RkNq_modelText{flex-direction:column;gap:1px;min-width:0;display:flex}.A3RkNq_modelName{color:var(--ods-text);font-size:13px}.A3RkNq_modelOff .A3RkNq_modelName{color:var(--ods-text-3)}.A3RkNq_modelId{color:var(--ods-text-3);font-variant-numeric:tabular-nums;font-size:11px}.A3RkNq_modelSide{flex-shrink:0;align-items:center;gap:10px;display:flex}.A3RkNq_modelMeta{color:var(--ods-text-3);font-variant-numeric:tabular-nums;white-space:nowrap;font-size:11px}.A3RkNq_edited{color:var(--ods-warn)}.A3RkNq_editor{flex-direction:column;gap:8px;padding:8px 0 2px 34px;display:flex}.A3RkNq_editorRow{grid-template-columns:1fr 1fr;gap:10px;display:grid}.A3RkNq_editorFoot{align-items:center;gap:10px;display:flex}.A3RkNq_cap{color:var(--ods-text-3);font-size:11px}.A3RkNq_error{color:var(--ods-stop);margin:0;font-size:12px}.A3RkNq_notice{color:var(--ods-text-2);margin:0;font-size:12px}";
var id6 = "src/client/ModelsCard.module.css";
var attr6 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr6 + '="' + id6 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr6, id6);
  tag.textContent = css6;
  (document.head || document.documentElement).appendChild(tag);
}
var ModelsCard_default = { "cap": "A3RkNq_cap", "edited": "A3RkNq_edited", "editor": "A3RkNq_editor", "editorFoot": "A3RkNq_editorFoot", "editorRow": "A3RkNq_editorRow", "error": "A3RkNq_error", "list": "A3RkNq_list", "model": "A3RkNq_model", "modelId": "A3RkNq_modelId", "modelMain": "A3RkNq_modelMain", "modelMeta": "A3RkNq_modelMeta", "modelName": "A3RkNq_modelName", "modelOff": "A3RkNq_modelOff", "modelSide": "A3RkNq_modelSide", "modelText": "A3RkNq_modelText", "modelTop": "A3RkNq_modelTop", "notice": "A3RkNq_notice" };

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
    const current = enabled.length === 0 ? GO_DESIGN_PLAN_MODELS.map((row) => row.id) : [...enabled];
    const next = current.includes(model) ? current.filter((id10) => id10 !== model) : [...current, model];
    const allOn = next.length === GO_DESIGN_PLAN_MODELS.length;
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
        GO_DESIGN_PLAN_MODELS.length,
        " \u4E2A"
      ] }),
      description: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u5173\u95ED\u540E\u8BE5\u6A21\u578B\u4E0D\u518D\u51FA\u73B0\u5728\u4F1A\u8BDD\u7684\u6A21\u578B\u9009\u62E9\u5668\u91CC\uFF0C\u4F46\u4ECD\u53EF\u7528 API \u76F4\u63A5\u8C03\u7528\u3002\u53C2\u6570\u9ED8\u8BA4\u503C\u53D6\u81EA\u5404\u5382\u5546\u516C\u5E03\u7684\u6A21\u578B\u89C4\u683C\uFF0C\u7559\u7A7A\u5373\u6CBF\u7528\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u53EF\u7528\u8F93\u5165 = \u4E0A\u4E0B\u6587 \u2212 max(\u8F93\u51FA\u4E0A\u9650, \u4E0A\u4E0B\u6587/4)\u3002\u7F51\u5173\u6309\u300C\u8F93\u5165 + max_tokens \u2264 \u4E0A\u4E0B\u6587\u300D\u5224\u8D85\u9650\uFF0C \u800C\u4F1A\u8BDD\u754C\u9762\u53EA\u91CF\u8F93\u5165\uFF0C\u628A\u8FD9\u4E2A\u5DEE\u989D\u7B97\u8FDB\u53BB\u624D\u4E0D\u4F1A\u5728\u957F\u5BF9\u8BDD\u91CC\u7A81\u7136\u88AB\u62D2\u3002" })
      ] }),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: ModelsCard_default.list, children: GO_DESIGN_PLAN_MODELS.map((model) => {
          const base = MODEL_DEFAULTS[model.id];
          const override = overrides[model.id];
          const context = override?.contextWindow ?? base?.contextWindow;
          const max = override?.maxTokens ?? base?.maxTokens;
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
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: ModelsCard_default.modelSide, children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: ModelsCard_default.modelMeta, children: [
                  "\u4E0A\u4E0B\u6587 ",
                  context === void 0 ? "\u672A\u77E5" : tokens2(context),
                  context !== void 0 && max !== void 0 ? `\uFF08\u53EF\u7528\u8F93\u5165 ${tokens2(usableInputTokens(context, max))}\uFF09` : "",
                  " \xB7 ",
                  "\u8F93\u51FA ",
                  max === void 0 ? "\u672A\u77E5" : tokens2(max),
                  override !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: ModelsCard_default.edited, children: "\uFF08\u5DF2\u6539\uFF09" })
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
            isEditing && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: ModelsCard_default.editor, children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: ModelsCard_default.editorRow, children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: "\u4E0A\u4E0B\u6587\u7A97\u53E3", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  Input,
                  {
                    type: "number",
                    value: draftContext,
                    placeholder: base?.contextWindow === void 0 ? "" : String(base.contextWindow),
                    onChange: setDraftContext
                  }
                ) }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Field, { label: "\u8F93\u51FA\u4E0A\u9650 max_tokens", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  Input,
                  {
                    type: "number",
                    value: draftMax,
                    placeholder: base?.maxTokens === void 0 ? "" : String(base.maxTokens),
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

// css-module:D:\AI\dsh-opendesign-go\src\client\ui\tokens.module.css
var css7 = ".nd2oSq_scope{--ods-surface:var(--dsw-alias-bg-layer-2,#fff);--ods-surface-2:var(--dsw-alias-bg-layer-3,#f1f3f6);--ods-surface-3:var(--dsw-alias-bg-layer-4,#e8ebef);--ods-sunken:var(--dsw-alias-bg-layer-1,#f6f7f9);--ods-border:var(--dsw-alias-border-l2,#0000001a);--ods-border-strong:var(--dsw-alias-border-l4,#0003);--ods-text:var(--dsw-alias-label-primary,#1f2328);--ods-text-2:var(--dsw-alias-label-secondary,#6e7781);--ods-text-3:var(--dsw-alias-label-tertiary,#98a1ab);--ods-accent:var(--dsw-alias-brand-primary,#4f6bed);--ods-on-accent:var(--dsw-alias-label-primary-inverted,#fff);--ods-hover:var(--dsw-alias-interactive-bg-hover,#8080801a);--ods-ok:var(--dsw-alias-state-success-primary,#1a7f37);--ods-warn:var(--dsw-alias-state-warn-primary,#9a6700);--ods-stop:var(--dsw-alias-state-error-primary,#cf222e);--ods-link:var(--dsw-alias-link,#0969da);--ods-radius:12px;--ods-radius-sm:8px;color:var(--ods-text)}";
var id7 = "src/client/ui/tokens.module.css";
var attr7 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr7 + '="' + id7 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr7, id7);
  tag.textContent = css7;
  (document.head || document.documentElement).appendChild(tag);
}
var tokens_default = { "scope": "nd2oSq_scope" };

// css-module:D:\AI\dsh-opendesign-go\src\client\Section.module.css
var css8 = ".gKZDKq_page{flex-direction:column;gap:16px;padding:4px 0 28px;display:flex}.gKZDKq_header{flex-direction:column;gap:6px;display:flex}.gKZDKq_title{letter-spacing:-.01em;color:var(--ods-text);margin:0;font-size:20px;font-weight:600}.gKZDKq_subtitle{color:var(--ods-text-2);margin:0;font-size:13px;line-height:1.6}.gKZDKq_notice{border-radius:var(--ods-radius-sm);flex-direction:column;gap:6px;padding:12px 14px;font-size:12px;line-height:1.6;display:flex}.gKZDKq_noticeWarn{border:1px solid color-mix(in srgb, var(--ods-warn) 45%, transparent);background:color-mix(in srgb, var(--ods-warn) 9%, transparent)}.gKZDKq_noticeInfo{border:1px solid color-mix(in srgb, var(--ods-accent) 40%, transparent);background:color-mix(in srgb, var(--ods-accent) 8%, transparent)}.gKZDKq_noticeTitle{font-size:13px;font-weight:500}.gKZDKq_noticeList{color:var(--ods-text-2);margin:0;padding-left:18px;line-height:1.7}.gKZDKq_noticeFoot{color:var(--ods-text-3);font-size:11px}.gKZDKq_inlineActions{flex-wrap:wrap;align-items:center;gap:10px;display:flex}.gKZDKq_routeLine{color:var(--ods-text-2);flex-wrap:wrap;align-items:center;gap:6px;margin:0;font-size:12px;line-height:1.6;display:flex}.gKZDKq_footer{border-top:1px solid var(--ods-border);color:var(--ods-text-3);flex-wrap:wrap;align-items:center;gap:10px;margin-top:4px;padding-top:14px;font-size:12px;display:flex}.gKZDKq_link{color:var(--ods-link);text-decoration:none}.gKZDKq_link:hover{text-decoration:underline}.gKZDKq_footerSep{opacity:.35}";
var id8 = "src/client/Section.module.css";
var attr8 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr8 + '="' + id8 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr8, id8);
  tag.textContent = css8;
  (document.head || document.documentElement).appendChild(tag);
}
var Section_default = { "footer": "gKZDKq_footer", "footerSep": "gKZDKq_footerSep", "header": "gKZDKq_header", "inlineActions": "gKZDKq_inlineActions", "link": "gKZDKq_link", "notice": "gKZDKq_notice", "noticeFoot": "gKZDKq_noticeFoot", "noticeInfo": "gKZDKq_noticeInfo", "noticeList": "gKZDKq_noticeList", "noticeTitle": "gKZDKq_noticeTitle", "noticeWarn": "gKZDKq_noticeWarn", "page": "gKZDKq_page", "routeLine": "gKZDKq_routeLine", "subtitle": "gKZDKq_subtitle", "title": "gKZDKq_title" };

// src/client/Section.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
function OpenDesignSection({ form, execute, channelState }) {
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
  const update = (0, import_react4.useMemo)(() => parseUpdate(value?.updateJson), [value?.updateJson]);
  const routeProblem = (0, import_react4.useMemo)(() => explainRouteProblem(routeState), [routeState]);
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
  const retry = () => {
    form.getSnapshot();
    window.location.reload();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: cx(tokens_default.scope, Section_default.page), children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("header", { className: Section_default.header, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h1", { className: Section_default.title, children: "OpenDesign Go" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: Section_default.subtitle, children: "\u9009\u62E9\u4F1A\u8BDD\u4E2D\u663E\u793A\u7684 OpenDesign Go \u6A21\u578B\uFF0C\u5E76\u8C03\u6574\u5176\u8BBE\u7F6E\u3002" })
    ] }),
    snapshot.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: Section_default.inlineActions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: Section_default.subtitle, children: "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u2026" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Button, { onClick: retry, children: "\u91CD\u65B0\u52A0\u8F7D" })
    ] }),
    snapshot.status === "unavailable" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: cx(Section_default.notice, Section_default.noticeWarn), children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
        "\u5BBF\u4E3B\u672A\u66B4\u9732\u672C\u63D2\u4EF6\u7684\u914D\u7F6E\u9879\uFF08namespace: ",
        PROFILE_ENTRY_ID,
        "\uFF09\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: Section_default.noticeFoot, children: [
        "\u8BCA\u65AD\uFF1A",
        snapshot.status,
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
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
        children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
        )
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
        children: routeState === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: Section_default.routeLine, children: "\u5BBF\u4E3B\u5C1A\u672A\u4E0A\u62A5\u8DEF\u7531\u72B6\u6001\u3002\u91CD\u542F\u540E\u82E5\u4ECD\u4E3A\u7A7A\uFF0C\u8BF4\u660E\u63D2\u4EF6\u672A\u5B8C\u6210\u6FC0\u6D3B\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: Section_default.routeLine, children: [
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
            routeState.modelCount,
            " \u4E2A"
          ] }),
          routeState.lastError !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: Section_default.footerSep, children: "\xB7" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
              "\u5931\u8D25\uFF1A",
              routeState.lastError
            ] })
          ] })
        ] })
      }
    ),
    update !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: cx(Section_default.notice, Section_default.noticeInfo), children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: Section_default.noticeTitle, children: [
        "\u6709\u65B0\u7248\u672C ",
        update.latest,
        "\uFF08\u5F53\u524D ",
        update.current,
        "\uFF09"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: Section_default.noticeFoot, children: "\u684C\u9762\u7AEF\u63D2\u4EF6\u7BA1\u7406\u91CC\u5378\u8F7D\u91CD\u88C5\uFF0C\u6216\u6267\u884C dsh plugin --profile web add dsh-opendesign-go@latest" })
    ] }),
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

// css-module:D:\AI\dsh-opendesign-go\src\client\UsagePill.module.css
var css9 = ".RZzvtq_root{display:inline-flex;position:relative}.RZzvtq_pill{border:1px solid var(--ods-border);height:28px;color:var(--ods-text-2);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border-radius:999px;align-items:center;gap:6px;padding:0 10px;font-size:12px;line-height:1;transition:background-color .12s,border-color .12s,color .12s;display:inline-flex}.RZzvtq_pill:hover,.RZzvtq_pill[aria-expanded=true]{background:var(--ods-hover);border-color:var(--ods-border-strong);color:var(--ods-text)}.RZzvtq_pill:focus-visible{outline:2px solid var(--ods-accent);outline-offset:1px}.RZzvtq_dot{border-radius:50%;flex:none;width:6px;height:6px}.RZzvtq_text{font-variant-numeric:tabular-nums}.RZzvtq_unit{opacity:.72}.RZzvtq_percent{font-weight:600}.RZzvtq_sep{opacity:.4}.RZzvtq_panel{z-index:30;border:1px solid var(--ods-border);border-radius:var(--ods-radius);background:var(--ods-surface);width:320px;color:var(--ods-text);text-align:left;flex-direction:column;gap:10px;padding:12px 14px 10px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;box-shadow:0 12px 32px #0000002e}.RZzvtq_panelHead{justify-content:space-between;align-items:baseline;gap:8px;display:flex}.RZzvtq_panelTitle{font-size:13px;font-weight:600}.RZzvtq_panelStamp{color:var(--ods-text-3);font-variant-numeric:tabular-nums;font-size:11px}.RZzvtq_rows{flex-direction:column;gap:10px;display:flex}.RZzvtq_rowHead{justify-content:space-between;align-items:baseline;gap:8px;font-size:12px;display:flex}.RZzvtq_rowName{font-weight:500}.RZzvtq_rowValue{font-variant-numeric:tabular-nums}.RZzvtq_rowMeta{color:var(--ods-text-3);font-variant-numeric:tabular-nums;justify-content:space-between;gap:8px;font-size:11px;display:flex}.RZzvtq_notice{color:var(--ods-warn);font-size:11px}.RZzvtq_panelFoot{border-top:1px solid var(--ods-border);justify-content:space-between;align-items:center;gap:8px;padding-top:8px;display:flex}.RZzvtq_rowBar{margin:6px 0 5px}";
var id9 = "src/client/UsagePill.module.css";
var attr9 = "data-plugin-css";
if (typeof document !== "undefined" && document.querySelector("style[" + attr9 + '="' + id9 + '"]') === null) {
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-opendesign-go");
  tag.setAttribute(attr9, id9);
  tag.textContent = css9;
  (document.head || document.documentElement).appendChild(tag);
}
var UsagePill_default = { "dot": "RZzvtq_dot", "notice": "RZzvtq_notice", "panel": "RZzvtq_panel", "panelFoot": "RZzvtq_panelFoot", "panelHead": "RZzvtq_panelHead", "panelStamp": "RZzvtq_panelStamp", "panelTitle": "RZzvtq_panelTitle", "percent": "RZzvtq_percent", "pill": "RZzvtq_pill", "root": "RZzvtq_root", "rowBar": "RZzvtq_rowBar", "rowHead": "RZzvtq_rowHead", "rowMeta": "RZzvtq_rowMeta", "rowName": "RZzvtq_rowName", "rowValue": "RZzvtq_rowValue", "rows": "RZzvtq_rows", "sep": "RZzvtq_sep", "text": "RZzvtq_text", "unit": "RZzvtq_unit" };

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
