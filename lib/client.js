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

// src/client/Section.tsx
var import_react = require("react");

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
  const card = {
    border: "1px solid rgba(128, 128, 128, 0.25)",
    borderRadius: "10px",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "14px"
  };
  const hint = { fontSize: "13px", opacity: 0.65, margin: 0 };
  if (loading && snapshot === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: card, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: hint, children: "\u6B63\u5728\u8BFB\u53D6\u989D\u5EA6\u2026" }) });
  }
  if (snapshot === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u8BA2\u9605\u989D\u5EA6" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: hint, children: "\u672A\u914D\u7F6E\u63A7\u5236\u53F0\u4F1A\u8BDD\u51ED\u636E\uFF0C\u56E0\u6B64\u65E0\u6CD5\u663E\u793A\u771F\u5B9E\u989D\u5EA6\u3002\u989D\u5EA6\u63A5\u53E3\u4E0D\u4EE5 API Key \u9274\u6743\uFF0C\u9700\u8981\u4E00\u4EFD\u63A7\u5236\u53F0\u4F1A\u8BDD\u51ED\u636E\u624D\u80FD\u8BFB\u53D6\u3002" })
    ] });
  }
  if (snapshot.error !== void 0 && snapshot.windows.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u8BA2\u9605\u989D\u5EA6" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: hint, children: [
        "\u8BFB\u53D6\u5931\u8D25\uFF1A",
        snapshot.error
      ] })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: card, children: [
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
    snapshot.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: { ...hint, fontSize: "12px" }, children: [
      "\u90E8\u5206\u6570\u636E\u7F3A\u5931\uFF1A",
      snapshot.error
    ] })
  ] });
}

// src/client/Section.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
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
var rowStyle = {
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
function OpenDesignSection({ form, readUsage }) {
  const snapshot = (0, import_react.useSyncExternalStore)(
    (listener) => form.subscribe(listener),
    () => form.getSnapshot()
  );
  const value = snapshot.value;
  const enabled = value?.enabled ?? true;
  const editable = snapshot.status === "ready" && snapshot.writable;
  const [usage, setUsage] = (0, import_react.useState)(void 0);
  const [usageLoading, setUsageLoading] = (0, import_react.useState)(false);
  const sessionRef = value?.sessionRef ?? "";
  const loadUsage = () => {
    if (readUsage === void 0) return;
    setUsageLoading(true);
    void readUsage().then((next) => {
      setUsage(next);
    }).catch((error) => {
      setUsage({
        asOf: (/* @__PURE__ */ new Date()).toISOString(),
        tier: "",
        eligible: false,
        windows: [],
        error: error instanceof Error ? error.message : String(error)
      });
    }).finally(() => {
      setUsageLoading(false);
    });
  };
  (0, import_react.useEffect)(() => {
    if (sessionRef.length > 0 && readUsage !== void 0) loadUsage();
  }, [sessionRef]);
  const toggle = (next) => {
    void form.set("enabled", next).catch((error) => {
      console.error("llm-opendesign-go: could not save the enable switch", error);
    });
  };
  const retry = () => {
    form.getSnapshot();
    window.location.reload();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: pageStyle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h1", { style: titleStyle, children: "OpenDesign Go" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { ...hintStyle, marginTop: "6px" }, children: "\u9009\u62E9\u4F1A\u8BDD\u4E2D\u663E\u793A\u7684 OpenDesign Go \u6A21\u578B\uFF0C\u5E76\u8C03\u6574\u5176\u8BBE\u7F6E\u3002" })
    ] }),
    snapshot.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...hintStyle, display: "flex", alignItems: "center", gap: "10px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u2026" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: retry, style: buttonStyle, children: "\u91CD\u65B0\u52A0\u8F7D" })
    ] }),
    snapshot.status === "unavailable" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...hintStyle, display: "flex", alignItems: "center", gap: "10px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        "\u5BBF\u4E3B\u672A\u66B4\u9732\u672C\u63D2\u4EF6\u7684\u914D\u7F6E\u9879\uFF08namespace: ",
        PROFILE_ENTRY_ID,
        "\uFF09\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: retry, style: buttonStyle, children: "\u91CD\u65B0\u52A0\u8F7D" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: cardStyle, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: rowStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u542F\u7528 OpenDesign Go" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { ...hintStyle, marginTop: "4px" }, children: "\u5173\u95ED\u540E\uFF0C\u672C\u63D2\u4EF6\u63D0\u4F9B\u7684\u6A21\u578B\u4F1A\u4ECE\u4F1A\u8BDD\u9009\u62E9\u5668\u4E2D\u79FB\u9664\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(QuotaCard, { snapshot: usage, loading: usageLoading }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: cardStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u989D\u5EA6\u901A\u9053" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { ...hintStyle, marginTop: "4px" }, children: "\u989D\u5EA6\u63A5\u53E3\u4E0D\u7528 API Key \u9274\u6743\uFF0C\u9700\u8981\u4E00\u4EFD\u63A7\u5236\u53F0\u4F1A\u8BDD\u51ED\u636E\u3002\u7559\u7A7A\u8868\u793A\u5173\u95ED\u8BE5\u901A\u9053\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: { fontSize: "12px", opacity: 0.7 }, children: [
          "\u4F1A\u8BDD\u51ED\u636E\u5F15\u7528\u540D",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: { fontSize: "12px", opacity: 0.7 }, children: [
          "\u5DE5\u4F5C\u7A7A\u95F4 ID",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", onClick: loadUsage, disabled: !editable || usageLoading, style: buttonStyle, children: usageLoading ? "\u8BFB\u53D6\u4E2D\u2026" : "\u5237\u65B0\u989D\u5EA6" }) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: cardStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u53EF\u7528\u6A21\u578B" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: { ...hintStyle, marginTop: "4px" }, children: [
        "Go \u5957\u9910\u6388\u4E88\u7684 ",
        GO_DESIGN_PLAN_MODELS.length,
        " \u4E2A Design Plan \u6A21\u578B\uFF08Go \u4E0D\u542B\u5957\u9910\u6A21\u578B\u989D\u5EA6\uFF09\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { style: listStyle, children: GO_DESIGN_PLAN_MODELS.map((model) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: model.name }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { ...hintStyle, fontSize: "12px" }, children: model.id })
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
