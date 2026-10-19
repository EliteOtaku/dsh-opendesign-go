// src/config-contract.ts
var DISPLAY_NAME = "DSH OpenDesign Go";
var PROFILE_ENTRY_ID = "opendesign-go";

// src/client/Section.tsx
import { useSyncExternalStore } from "react";

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

// src/client/Section.tsx
import { jsx, jsxs } from "react/jsx-runtime";
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
function OpenDesignSection({ form }) {
  const snapshot = useSyncExternalStore(
    (listener) => form.subscribe(listener),
    () => form.getSnapshot()
  );
  const value = snapshot.value;
  const enabled = value?.enabled ?? true;
  const editable = snapshot.status === "ready" && snapshot.writable;
  const toggle = (next) => {
    void form.set("enabled", next).catch((error) => {
      console.error("llm-opendesign-go: could not save the enable switch", error);
    });
  };
  return /* @__PURE__ */ jsxs("div", { style: pageStyle, children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("h1", { style: titleStyle, children: "OpenDesign Go" }),
      /* @__PURE__ */ jsx("p", { style: { ...hintStyle, marginTop: "6px" }, children: "\u9009\u62E9\u4F1A\u8BDD\u4E2D\u663E\u793A\u7684 OpenDesign Go \u6A21\u578B\uFF0C\u5E76\u8C03\u6574\u5176\u8BBE\u7F6E\u3002" })
    ] }),
    snapshot.status === "loading" && /* @__PURE__ */ jsx("p", { style: hintStyle, children: "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u2026" }),
    snapshot.status === "unavailable" && /* @__PURE__ */ jsx("p", { style: hintStyle, children: "\u6B64\u5BBF\u4E3B\u672A\u66B4\u9732\u672C\u63D2\u4EF6\u7684\u914D\u7F6E\u9879\uFF0C\u65E0\u6CD5\u5728\u6B64\u7F16\u8F91\u3002" }),
    /* @__PURE__ */ jsx("div", { style: cardStyle, children: /* @__PURE__ */ jsxs("div", { style: rowStyle, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u542F\u7528 OpenDesign Go" }),
        /* @__PURE__ */ jsx("p", { style: { ...hintStyle, marginTop: "4px" }, children: "\u5173\u95ED\u540E\uFF0C\u672C\u63D2\u4EF6\u63D0\u4F9B\u7684\u6A21\u578B\u4F1A\u4ECE\u4F1A\u8BDD\u9009\u62E9\u5668\u4E2D\u79FB\u9664\u3002" })
      ] }),
      /* @__PURE__ */ jsx(
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
    /* @__PURE__ */ jsxs("div", { style: cardStyle, children: [
      /* @__PURE__ */ jsx("div", { style: { fontSize: "14px", fontWeight: 500 }, children: "\u53EF\u7528\u6A21\u578B" }),
      /* @__PURE__ */ jsxs("p", { style: { ...hintStyle, marginTop: "4px" }, children: [
        "Go \u5957\u9910\u6388\u4E88\u7684 ",
        GO_DESIGN_PLAN_MODELS.length,
        " \u4E2A Design Plan \u6A21\u578B\uFF08Go \u4E0D\u542B\u5957\u9910\u6A21\u578B\u989D\u5EA6\uFF09\u3002"
      ] }),
      /* @__PURE__ */ jsx("ul", { style: listStyle, children: GO_DESIGN_PLAN_MODELS.map((model) => /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx("div", { children: model.name }),
        /* @__PURE__ */ jsx("div", { style: { ...hintStyle, fontSize: "12px" }, children: model.id })
      ] }, model.id)) })
    ] })
  ] });
}

// src/client/index.ts
var inject = ["slots", "configForms"];
function apply(ctx) {
  const form = ctx.configForms.get(PROFILE_ENTRY_ID);
  const injected = () => ({ form });
  ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: PROFILE_ENTRY_ID,
    order: 20,
    label: () => DISPLAY_NAME,
    inject: injected
  }, OpenDesignSection)));
}
export {
  apply,
  inject
};
