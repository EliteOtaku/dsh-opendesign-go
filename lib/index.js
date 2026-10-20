// src/index.ts
import { launchEnvironmentOf as launchEnvironmentOf2 } from "@deepseek-ai/dsh-launch-environment";
import { credentialRef as credentialRef2 } from "@deepseek-ai/dsh-credentials";
import { LlmError as LlmError4, assertUsableApiKey as assertUsableApiKey2 } from "@deepseek-ai/dsh-llm";

// src/adapter.ts
import {
  ACCOUNT_QUOTA_EXCEEDED_CODE as ACCOUNT_QUOTA_EXCEEDED_CODE2,
  INVALID_CREDENTIAL_CODE as INVALID_CREDENTIAL,
  LlmAdapter,
  LlmError as LlmError3,
  QUOTA_EXCEEDED_CODE as QUOTA_EXCEEDED_CODE2,
  ToolCallId,
  assertUsableApiKey,
  attributionHeaders,
  errorChain
} from "@deepseek-ai/dsh-llm";
import { ReasoningEffortId } from "@deepseek-ai/dsh-llm";

// src/config-contract.ts
var PROVIDER_ID = "dsh-opendesign-go";
var DISPLAY_NAME = "OpenDesign Go";
var SETTINGS_NAMESPACE = "llm-opendesign-go";
var PROFILE_ENTRY_ID = "opendesign-go";
var DEFAULT_BASE_URL = "https://amr-link.open-design.ai/v1";
var DEFAULT_API_KEY_ENV = "OPENDESIGN_API_KEY";

// src/accounts.ts
var MAX_ACCOUNTS = 20;
var ACCOUNT_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
var MAX_ACCOUNT_NAME = 80;
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
function assertAccount(account) {
  if (typeof account.id !== "string" || account.id.length === 0 || account.id.length > 128) {
    throw new Error("\u8D26\u53F7 id \u65E0\u6548");
  }
  const isLegacy = account.id.startsWith("legacy:");
  if (isLegacy && account.id !== `legacy:${account.apiKeyEnv}`) {
    throw new Error("\u8D26\u53F7 id \u4E0E legacy \u6807\u8BB0\u4E0D\u4E00\u81F4");
  }
  if (typeof account.name !== "string" || account.name.length > MAX_ACCOUNT_NAME) {
    throw new Error("\u8D26\u53F7\u540D\u79F0\u8FC7\u957F");
  }
  if (!isLegacy && account.name.trim().length === 0) {
    throw new Error("\u8D26\u53F7\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
  }
  if (!ACCOUNT_REF_PATTERN.test(account.apiKeyEnv)) {
    throw new Error(`\u8D26\u53F7\u51ED\u636E\u5F15\u7528\u540D\u65E0\u6548\uFF1A${account.apiKeyEnv}`);
  }
  if (account.workspaceId !== void 0 && account.workspaceId.trim().length === 0) {
    throw new Error("\u5DE5\u4F5C\u7A7A\u95F4 ID \u4E0D\u80FD\u4E3A\u7A7A\u5B57\u7B26\u4E32");
  }
}
function assertAccounts(accounts, selectedRef) {
  if (accounts === null) return;
  if (!Array.isArray(accounts)) throw new Error("\u8D26\u53F7\u5217\u8868\u683C\u5F0F\u65E0\u6548");
  if (accounts.length > MAX_ACCOUNTS) throw new Error(`\u6700\u591A\u652F\u6301 ${MAX_ACCOUNTS} \u4E2A\u8D26\u53F7`);
  const ids = /* @__PURE__ */ new Set();
  const refs = /* @__PURE__ */ new Set();
  for (const account of accounts) {
    assertAccount(account);
    if (ids.has(account.id)) throw new Error(`\u8D26\u53F7 id \u91CD\u590D\uFF1A${account.id}`);
    if (refs.has(account.apiKeyEnv)) throw new Error(`\u51ED\u636E\u5F15\u7528\u540D\u91CD\u590D\uFF1A${account.apiKeyEnv}`);
    ids.add(account.id);
    refs.add(account.apiKeyEnv);
  }
  if (accounts.length === MAX_ACCOUNTS && !refs.has(selectedRef)) {
    throw new Error(`\u5DF2\u8FBE ${MAX_ACCOUNTS} \u4E2A\u8D26\u53F7\u4E0A\u9650\uFF0C\u5F53\u524D\u9009\u4E2D\u7684\u8D26\u53F7\u5FC5\u987B\u5728\u5217\u8868\u4E2D`);
  }
}

// src/model-params.ts
var MODEL_DEFAULTS = {
  // Anthropic: 1M context (widened from the earlier 200K) and 128K max output.
  // The context figure is independently confirmed: overflowing the endpoint
  // reports "maximum context length is 1000000 tokens".
  "claude-haiku-5.5": { contextWindow: 1e6, maxTokens: 128e3, inputModalities: ["text", "image"] },
  // api-docs.deepseek.com/zh-cn/quick_start/pricing: 1M context, 384K output.
  // The two retired ids route to V4.1-Flash per that page's footnote 1.
  "deepseek-v4-flash": { contextWindow: 1e6, maxTokens: 384e3, inputModalities: ["text"] },
  "deepseek-v4-flash-vision-exp": { contextWindow: 1e6, maxTokens: 384e3, inputModalities: ["text", "image"] },
  "deepseek-v4-pro": { contextWindow: 1e6, maxTokens: 384e3, inputModalities: ["text"] },
  "deepseek-v4.1-flash": { contextWindow: 1e6, maxTokens: 384e3, inputModalities: ["text", "image"] },
  // docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash and its English mirror
  // docs.z.ai/guides/vlm/glm-5.3-flash both state 1M context, 128K max output.
  "glm-5.3-flash": { contextWindow: 1e6, maxTokens: 128e3, inputModalities: ["text", "image"] },
  "glm-5.3-flashx": { contextWindow: 1e6, maxTokens: 128e3, inputModalities: ["text", "image"] },
  // OpenAI: 1,050,000 total context, 922,000 max input, 128,000 max output.
  // The three figures are consistent — 922000 + 128000 = 1050000 — which is the
  // same shape as Hy4 Preview's 960000 + 64000. Note that a 1.5M-token prompt
  // was accepted without an error, so the endpoint does not enforce this bound
  // itself; the documented limit is the one used here.
  "gpt-6-luna": { contextWindow: 105e4, maxTokens: 128e3, inputModalities: ["text", "image"] },
  // tencentcloud.com/techpedia/148044: 1M context, 960K max input, 64K output.
  "hy4-preview": { contextWindow: 1e6, maxTokens: 64e3, inputModalities: ["text"] },
  // platform.kimi.com/docs/guide/kimi-k2-7-code-quickstart: 256K context, and
  // the endpoint reports "Range of max_tokens should be [1, 262144]".
  "kimi-k2.7-code": { contextWindow: 262144, maxTokens: 262144, inputModalities: ["text", "image"] },
  // mimo.mi.com/docs/zh-CN/quick-start/summary/model: 1M context, 128K output.
  "mimo-v2.6-flash": { contextWindow: 1e6, maxTokens: 128e3, inputModalities: ["text", "image"] },
  "mimo-v2.6-pro": { contextWindow: 1e6, maxTokens: 128e3, inputModalities: ["text", "image"] }
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
function paramsOf(model, overrides) {
  const base = MODEL_DEFAULTS[model];
  if (base === void 0) return void 0;
  const override = overrides?.[model];
  if (override === void 0) return base;
  return {
    contextWindow: clamp(override.contextWindow, base.contextWindow, MIN_CONTEXT_WINDOW, MAX_CONTEXT_WINDOW),
    maxTokens: clamp(override.maxTokens, base.maxTokens, MIN_MAX_TOKENS, MAX_MAX_TOKENS),
    inputModalities: base.inputModalities
  };
}
function clamp(value, fallback, min, max) {
  if (value === void 0 || !Number.isFinite(value)) return fallback;
  if (value < min || value > max) return fallback;
  return Math.round(value);
}
var REASONING_EFFORTS = [
  { id: "minimal", name: "\u6700\u4F4E" },
  { id: "low", name: "\u4F4E" },
  { id: "medium", name: "\u4E2D" },
  { id: "high", name: "\u9AD8" }
];
var DEFAULT_REASONING_EFFORT = "medium";
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
function seedModel(id) {
  return GO_DESIGN_PLAN_MODELS.find((model) => model.id === id);
}
function listSeedModels(provider) {
  return GO_DESIGN_PLAN_MODELS.map((model) => {
    const modalities = MODEL_DEFAULTS[model.id]?.inputModalities;
    return {
      provider,
      id: model.id,
      name: model.name,
      ...modalities === void 0 ? {} : { inputModalities: modalities }
    };
  });
}

// src/conversion.ts
import { LlmError as LlmError2, textOnlyImageText } from "@deepseek-ai/dsh-llm";

// src/gateway-error.ts
import {
  ACCOUNT_QUOTA_EXCEEDED_CODE,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  EMPTY_RESPONSE_CODE,
  INVALID_CREDENTIAL_CODE,
  LlmError,
  QUOTA_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError
} from "@deepseek-ai/dsh-llm";
var GATEWAY_CODES = {
  auth: "AUTH",
  rateLimit: "RATE_LIMIT",
  server: "SERVER",
  timeout: "TIMEOUT",
  invalidRequest: "INVALID_REQUEST",
  unsupported: "UNSUPPORTED_OPTION"
};
function detailText(detail) {
  return [detail.code, detail.type, detail.message].filter((part) => part !== void 0).join(" ").toLowerCase();
}
function classifyGatewayFailure(detail) {
  const text = detailText(detail);
  const options = { cause: void 0 };
  if (isContextWindowExceededError(text)) {
    return new LlmError(`OpenDesign rejected the request: context window exceeded (${detail.message})`, CONTEXT_WINDOW_EXCEEDED_CODE);
  }
  if (isQuotaExceededError(text)) {
    const code = text.includes("subscription") || text.includes("plan") ? ACCOUNT_QUOTA_EXCEEDED_CODE : QUOTA_EXCEEDED_CODE;
    return new LlmError(`OpenDesign quota exhausted: ${detail.message}`, code);
  }
  if (detail.code === "missing_api_key" || detail.code === "invalid_api_key") {
    return new LlmError(`OpenDesign rejected the credential: ${detail.message}`, INVALID_CREDENTIAL_CODE);
  }
  if (detail.status === 429) {
    return new LlmError(`OpenDesign rate limit: ${detail.message}`, GATEWAY_CODES.rateLimit);
  }
  if (detail.status === 504) {
    return new LlmError(`OpenDesign gateway timeout: ${detail.message}`, GATEWAY_CODES.timeout);
  }
  if (detail.status !== void 0 && detail.status >= 500) {
    return new LlmError(`OpenDesign gateway error (${detail.status}): ${detail.message}`, GATEWAY_CODES.server);
  }
  if (detail.status === 401 || detail.status === 403) {
    return new LlmError(`OpenDesign authentication failed (${detail.status}): ${detail.message}`, GATEWAY_CODES.auth);
  }
  return new LlmError(`OpenDesign request failed${detail.status === void 0 ? "" : ` (${detail.status})`}: ${detail.message}`, GATEWAY_CODES.invalidRequest);
}
function emptyResponseFailure() {
  return new LlmError("OpenDesign returned no content blocks", EMPTY_RESPONSE_CODE);
}

// src/conversion.ts
function unsupportedBlock(message) {
  return new LlmError2(message, GATEWAY_CODES.unsupported);
}
function partsOf(blocks, resolveImage) {
  let text = "";
  const images = [];
  for (const block of blocks) {
    switch (block.type) {
      case "text":
        text += block.text;
        break;
      case "reasoning":
      case "tool-call":
      case "tool-addition":
      case "tool-removal":
        break;
      case "image": {
        const url = block.offloaded === true ? void 0 : resolveImage?.(block.attachment);
        if (url === void 0) {
          const placeholder = textOnlyImageText(block.attachment);
          text += text.length > 0 ? "\n" + placeholder : placeholder;
        } else {
          images.push(url);
        }
        break;
      }
      case "file":
        throw unsupportedBlock(
          "OpenDesign Chat Completions receives files as text handles; a raw file block reached projection"
        );
      default:
        break;
    }
  }
  return { text, images };
}
function contentOf(text, images) {
  if (images.length === 0) return text;
  const parts = [];
  if (text.length > 0) parts.push({ type: "text", text });
  for (const url of images) parts.push({ type: "image_url", image_url: { url } });
  return parts;
}
function assistantMessage(content, resolveImage) {
  const { text, images } = partsOf(content, resolveImage);
  const toolCalls = [];
  for (const block of content) {
    if (block.type !== "tool-call") continue;
    toolCalls.push({
      id: block.id,
      type: "function",
      function: { name: block.name, arguments: block.arguments }
    });
  }
  if (text === "" && toolCalls.length === 0) return void 0;
  const wireContent = contentOf(text, images);
  return toolCalls.length === 0 ? { role: "assistant", content: wireContent } : { role: "assistant", content: wireContent, tool_calls: toolCalls };
}
function toChatMessage(message, resolveImage) {
  switch (message.role) {
    case "system": {
      const text = partsOf(message.content, void 0).text;
      return text === "" ? void 0 : { role: "system", content: text };
    }
    case "developer": {
      const text = partsOf(message.content, void 0).text;
      return text === "" ? void 0 : { role: "system", content: text };
    }
    case "user": {
      const { text, images } = partsOf(message.content, resolveImage);
      if (text === "" && images.length === 0) return void 0;
      return { role: "user", content: contentOf(text, images) };
    }
    case "assistant":
      return assistantMessage(message.content, resolveImage);
    case "tool": {
      const text = partsOf(message.content, void 0).text;
      return { role: "tool", tool_call_id: message.toolCallId, content: text };
    }
  }
}
function mergeSystem(system, existing) {
  return existing === "" ? system : `${system}

${existing}`;
}
function toChatMessages(options, resolveImage) {
  const messages = [];
  for (const message of options.messages) {
    const converted = toChatMessage(message, resolveImage);
    if (converted !== void 0) messages.push(converted);
  }
  const system = options.system;
  if (system !== void 0 && system.trim() !== "") {
    const first = messages[0];
    if (first !== void 0 && first.role === "system") {
      messages[0] = {
        role: "system",
        content: mergeSystem(system, typeof first.content === "string" ? first.content : "")
      };
    } else {
      messages.unshift({ role: "system", content: system });
    }
  }
  return messages;
}
function toChatTools(options) {
  const tools = options.tools;
  if (tools === void 0 || tools.length === 0) return void 0;
  return tools.map(toChatTool);
}
function toChatTool(tool) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  };
}

// src/adapter.ts
var MISSING_CREDENTIAL = "MISSING_CREDENTIAL";
var PACKAGE_NAME = "dsh-opendesign-go";
var OpenDesignAdapter = class extends LlmAdapter {
  #options;
  /**
   * @param options - configuration and credential accessors supplied by the plugin.
   */
  constructor(options) {
    super();
    this.#options = options;
  }
  /**
   * Describe the single route this adapter serves.
   * @param provider - registered provider route.
   * @returns display metadata whose id equals the route.
   */
  providerInfo(provider) {
    return { id: provider, name: DISPLAY_NAME };
  }
  /**
   * Advertise the models the user left enabled.
   *
   * An empty enabled list means "all", so a fresh install shows the full
   * catalog; hiding a model is opt-in. Filtering here rather than in the picker
   * means a disabled model is absent from every consumer, including the
   * composer, not merely hidden from one list.
   * @param provider - registered provider route.
   * @returns the enabled rows, in display order.
   */
  async listModels(provider) {
    const enabled = this.#options.config().enabledModels ?? [];
    const rows = listSeedModels(provider);
    if (enabled.length === 0) return rows;
    return rows.filter((row) => enabled.includes(row.id));
  }
  /**
   * Resolve metadata for one exact model.
   *
   * Routing accepts ids outside the seed catalog, so an unknown id resolves to
   * itself instead of failing; the catalog stays advisory.
   *
   * The returned metadata is what the picker renders: `context` drives the
   * context-window display and truncation warnings, `defaultMaxTokens` caps
   * output, and `reasoning` is what makes a reasoning-effort selector appear at
   * all. Omitting any of them is why the selector was missing.
   * @param provider - registered provider route.
   * @param model - exact model id from the request.
   * @param _signal - cancellation for this lookup; the seed needs none.
   * @returns provider/model identity plus resolved parameters.
   */
  async resolveModel(provider, model, _signal) {
    const row = seedModel(model);
    const params = paramsOf(model, this.#options.config().modelParams);
    const reasoning = {
      efforts: REASONING_EFFORTS.map((effort) => ({ id: ReasoningEffortId(effort.id), name: effort.name })),
      defaultEffort: ReasoningEffortId(DEFAULT_REASONING_EFFORT)
    };
    if (row === void 0) {
      return { provider, id: model, name: model, reasoning };
    }
    return {
      provider,
      id: row.id,
      name: row.name,
      ...row.inputModalities === void 0 ? {} : { inputModalities: row.inputModalities },
      ...params === void 0 ? {} : {
        context: { contextWindow: params.contextWindow },
        defaultMaxTokens: params.maxTokens
      },
      reasoning
    };
  }
  /**
   * Stream one Chat Completions call.
   * @param options - fully assembled request.
   * @returns the translated chunk stream.
   * @throws LlmError - classified gateway failure, missing credential, or an
   * empty response.
   */
  /**
   * The image resolver to use for one model, if any.
   *
   * Gated on the declared modality: sending image parts to a text-only model is
   * an error at the provider, and the harness has a placeholder for exactly that
   * case, so gating here keeps the failure out of the request entirely.
   * @param model - exact model id.
   * @returns the resolver, or undefined when this model cannot take images.
   */
  #imageResolverFor(model) {
    const resolve = this.#options.imageDataUrl;
    if (resolve === void 0) return void 0;
    const params = paramsOf(model, this.#options.config().modelParams);
    if (params === void 0 || !params.inputModalities.includes("image")) return void 0;
    return resolve;
  }
  async *stream(options) {
    const config = this.#options.config();
    const candidates = config.autoSwitch ? accountsOf(config).map((account) => account.apiKeyEnv) : [config.apiKeyEnv];
    let lastFailure;
    for (const ref of candidates) {
      const apiKey = await this.#apiKey(ref);
      const response = await dispatch(options, config, apiKey, this.#imageResolverFor(options.model));
      if (!response.ok) {
        lastFailure = classifyGatewayFailure(await readFailure(response));
        if (config.autoSwitch && isRetryableAccountFailure(lastFailure) && candidates.indexOf(ref) < candidates.length - 1) continue;
        throw lastFailure;
      }
      const body = response.body;
      if (body === null) throw emptyResponseFailure();
      let usage;
      for await (const chunk of consumeSse(body)) {
        if (chunk.type === "block-end") this.#options.onAccountSettled?.(ref);
        if (chunk.type === "usage") usage = chunk.usage;
        yield chunk;
      }
      if (usage !== void 0) this.#options.onUsage?.({ model: options.model, accountRef: ref, usage });
      return;
    }
    throw lastFailure ?? new LlmError3("OpenDesign: no usable account", MISSING_CREDENTIAL);
  }
  /**
   * Resolve and validate one account's API key.
   * @param ref - credential reference of the account.
   * @returns the trimmed, usable key.
   * @throws LlmError - `MISSING_CREDENTIAL` when nothing resolved, or the
   * harness's `INVALID_CREDENTIAL` when the value cannot be a header value.
   */
  async #apiKey(ref) {
    const raw = await this.#options.resolveApiKey(ref);
    if (raw === void 0) {
      throw new LlmError3(
        `OpenDesign: no API key resolved for ${ref}; set it in the Models settings or the launching environment`,
        MISSING_CREDENTIAL
      );
    }
    return assertUsableApiKey(raw, PACKAGE_NAME, ref);
  }
};
function isRetryableAccountFailure(failure) {
  if (!(failure instanceof LlmError3)) return false;
  return failure.code === INVALID_CREDENTIAL || failure.code === QUOTA_EXCEEDED_CODE2 || failure.code === ACCOUNT_QUOTA_EXCEEDED_CODE2;
}
async function dispatch(options, config, apiKey, resolver) {
  const baseURL = config.baseURL.replace(/\/+$/u, "");
  if (baseURL === "") throw new LlmError3("OpenDesign: baseURL is not configured", GATEWAY_CODES.invalidRequest);
  const body = {
    model: options.model,
    messages: toChatMessages(options, resolver),
    stream: true,
    stream_options: { include_usage: true }
  };
  const tools = toChatTools(options);
  if (tools !== void 0) body.tools = tools;
  if (options.temperature !== void 0) body.temperature = options.temperature;
  const maxTokens = options.maxTokens ?? paramsOf(options.model, config.modelParams)?.maxTokens;
  if (maxTokens !== void 0) body.max_tokens = maxTokens;
  if (options.reasoningEffort !== void 0) body.reasoning_effort = options.reasoningEffort;
  if (options.stop !== void 0 && options.stop.length > 0) body.stop = options.stop;
  const headers = {
    ...attributionHeaders(),
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    accept: "text/event-stream"
  };
  const signal = deadlineSignal(options.signal, config.requestTimeoutMs);
  try {
    return await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...signal === void 0 ? {} : { signal }
    });
  } catch (cause) {
    if (options.signal?.aborted === true) throw cause;
    if (isAbortError(cause)) {
      throw new LlmError3(`OpenDesign request exceeded ${config.requestTimeoutMs}ms`, GATEWAY_CODES.timeout, { cause });
    }
    throw new LlmError3(`OpenDesign transport failure: ${errorChain(cause)}`, GATEWAY_CODES.server, { cause });
  }
}
function deadlineSignal(signal, timeoutMs) {
  const timeout = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : void 0;
  if (signal === void 0) return timeout;
  if (timeout === void 0) return signal;
  return AbortSignal.any([signal, timeout]);
}
async function readFailure(response) {
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    raw = "";
  }
  const fallback = raw.trim() === "" ? `HTTP ${response.status}` : raw.trim().slice(0, 500);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: response.status, message: fallback };
  }
  if (!isRecord(parsed)) return { status: response.status, message: fallback };
  const error = parsed.error;
  if (isRecord(error)) return { status: response.status, ...failureDetailFromError(error, fallback) };
  const message = typeof parsed.message === "string" ? parsed.message : fallback;
  return { status: response.status, message };
}
function failureDetailFromError(error, fallback) {
  const code = typeof error.code === "string" ? error.code : void 0;
  const type = typeof error.type === "string" ? error.type : void 0;
  const message = typeof error.message === "string" ? error.message : fallback;
  return {
    message,
    ...code === void 0 ? {} : { code },
    ...type === void 0 ? {} : { type }
  };
}
async function* consumeSse(body) {
  const state = {
    nextIndex: 0,
    text: void 0,
    reasoning: void 0,
    toolCalls: /* @__PURE__ */ new Map(),
    finishReason: void 0,
    usage: void 0,
    contentBlocks: 0
  };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines = [];
  let done = false;
  const flushEvent = () => {
    const payload = dataLines.join("\n");
    dataLines = [];
    if (payload === "") return [];
    if (payload === "[DONE]") {
      done = true;
      return [];
    }
    return translateEvent(state, payload);
  };
  const consumeLine = (line) => {
    if (line === "") return flushEvent();
    if (line.startsWith(":")) return [];
    if (!line.startsWith("data:")) return [];
    dataLines.push(line.slice(5).replace(/^ /u, ""));
    return [];
  };
  try {
    while (!done) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      let lineEnd = buffer.indexOf("\n");
      while (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd).replace(/\r$/u, "");
        buffer = buffer.slice(lineEnd + 1);
        for (const chunk of consumeLine(line)) yield chunk;
        if (done) break;
        lineEnd = buffer.indexOf("\n");
      }
    }
    if (!done) {
      buffer += decoder.decode();
      if (buffer !== "") {
        for (const chunk of consumeLine(buffer.replace(/\r$/u, ""))) yield chunk;
      }
      for (const chunk of flushEvent()) yield chunk;
    }
  } finally {
    await reader.cancel().catch(() => void 0);
  }
  if (state.contentBlocks === 0) throw emptyResponseFailure();
  for (const chunk of closeOpenBlocks(state)) yield chunk;
  if (state.usage !== void 0) yield { type: "usage", usage: state.usage };
  yield { type: "finish", reason: state.finishReason ?? { kind: "stop" } };
}
function translateEvent(state, payload) {
  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return [];
  }
  if (!isRecord(event)) return [];
  if (isRecord(event.error)) {
    throw classifyGatewayFailure(failureDetailFromError(event.error, "OpenDesign stream reported an error"));
  }
  if (isRecord(event.usage)) {
    const usage = toTokenUsage(event.usage);
    if (usage !== void 0) state.usage = usage;
  }
  const chunks = [];
  const choices = event.choices;
  if (!Array.isArray(choices)) return chunks;
  const choice = choices[0];
  if (!isRecord(choice)) return chunks;
  const delta = choice.delta;
  if (isRecord(delta)) collectDelta(state, delta, chunks);
  const finish = choice.finish_reason;
  if (typeof finish === "string" && finish !== "" && state.finishReason === void 0) {
    state.finishReason = mapFinishReason(finish);
    chunks.push(...closeOpenBlocks(state));
  }
  return chunks;
}
function collectDelta(state, delta, chunks) {
  const content = delta.content;
  if (typeof content === "string" && content !== "") {
    if (state.text === void 0) {
      state.text = { index: takeIndex(state), text: "" };
      state.contentBlocks += 1;
      chunks.push({ type: "block-start", index: state.text.index, blockType: "text" });
    }
    state.text.text += content;
    chunks.push({ type: "text-delta", index: state.text.index, text: content });
  }
  const reasoning = delta.reasoning_content;
  if (typeof reasoning === "string" && reasoning !== "") {
    if (state.reasoning === void 0) {
      state.reasoning = { index: takeIndex(state), text: "" };
      state.contentBlocks += 1;
      chunks.push({ type: "block-start", index: state.reasoning.index, blockType: "reasoning" });
    }
    state.reasoning.text += reasoning;
    chunks.push({ type: "reasoning-delta", index: state.reasoning.index, text: reasoning });
  }
  const toolDeltas = delta.tool_calls;
  if (!Array.isArray(toolDeltas)) return;
  for (const item of toolDeltas) {
    if (!isRecord(item)) continue;
    const toolIndex = typeof item.index === "number" ? item.index : 0;
    const id = typeof item.id === "string" && item.id !== "" ? item.id : void 0;
    const fn = isRecord(item.function) ? item.function : void 0;
    const name2 = fn !== void 0 && typeof fn.name === "string" && fn.name !== "" ? fn.name : void 0;
    const argumentsDelta = fn !== void 0 && typeof fn.arguments === "string" ? fn.arguments : void 0;
    let call = state.toolCalls.get(toolIndex);
    if (call === void 0) {
      if (id === void 0) continue;
      call = { index: takeIndex(state), id: ToolCallId(id), name: name2 ?? "", arguments: "" };
      state.toolCalls.set(toolIndex, call);
      state.contentBlocks += 1;
      chunks.push({ type: "block-start", index: call.index, blockType: "tool-call" });
    }
    if (name2 !== void 0) call.name = name2;
    const deltaArguments = argumentsDelta ?? "";
    call.arguments += deltaArguments;
    chunks.push({
      type: "tool-call-delta",
      index: call.index,
      id: call.id,
      ...name2 === void 0 ? {} : { name: name2 },
      argumentsDelta: deltaArguments
    });
  }
}
function closeOpenBlocks(state) {
  const open = [];
  if (state.reasoning !== void 0) {
    const index = state.reasoning.index;
    open.push({
      index,
      chunk: { type: "block-end", index, block: { type: "reasoning", text: state.reasoning.text } }
    });
    state.reasoning = void 0;
  }
  if (state.text !== void 0) {
    const index = state.text.index;
    open.push({ index, chunk: { type: "block-end", index, block: { type: "text", text: state.text.text } } });
    state.text = void 0;
  }
  for (const call of state.toolCalls.values()) {
    open.push({
      index: call.index,
      chunk: {
        type: "block-end",
        index: call.index,
        block: { type: "tool-call", id: call.id, name: call.name, arguments: call.arguments }
      }
    });
  }
  state.toolCalls.clear();
  open.sort((left, right) => left.index - right.index);
  return open.map((entry) => entry.chunk);
}
function takeIndex(state) {
  const index = state.nextIndex;
  state.nextIndex += 1;
  return index;
}
function mapFinishReason(reason) {
  switch (reason) {
    case "length":
      return { kind: "max-tokens" };
    case "tool_calls":
    case "function_call":
      return { kind: "tool-calls" };
    default:
      return { kind: "stop" };
  }
}
function toTokenUsage(usage) {
  const promptTokens = numberValue(usage.prompt_tokens);
  const completionTokens = numberValue(usage.completion_tokens);
  if (promptTokens === void 0 || completionTokens === void 0) return void 0;
  const promptDetails = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : void 0;
  const completionDetails = isRecord(usage.completion_tokens_details) ? usage.completion_tokens_details : void 0;
  const cacheRead = firstNumber(promptDetails === void 0 ? void 0 : promptDetails.cached_tokens, usage.prompt_cache_hit_tokens) ?? 0;
  const cacheWrite = firstNumber(
    promptDetails === void 0 ? void 0 : promptDetails.cache_write_tokens,
    usage.prompt_cache_write_tokens,
    usage.cache_creation_input_tokens
  ) ?? 0;
  const reasoningTokens = completionDetails === void 0 ? void 0 : numberValue(completionDetails.reasoning_tokens);
  return {
    inputTokens: Math.max(0, promptTokens - cacheRead - cacheWrite),
    outputTokens: completionTokens,
    // Both counters are aggregates, so their sum is the exact full-call total.
    totalTokens: promptTokens + completionTokens,
    ...cacheRead === 0 ? {} : { cacheReadTokens: cacheRead },
    ...cacheWrite === 0 ? {} : { cacheWriteTokens: cacheWrite },
    ...reasoningTokens === void 0 ? {} : { reasoningTokens }
  };
}
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function firstNumber(...values) {
  for (const value of values) {
    const number = numberValue(value);
    if (number !== void 0) return number;
  }
  return void 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isAbortError(value) {
  return value instanceof Error && value.name === "AbortError";
}

// src/config.ts
import z from "@deepseek-ai/schemastery";
var DEFAULT_REQUEST_TIMEOUT_MS = 18e5;
var DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
var API_KEY_ENV_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
var AccountSchema = z.object({
  /** Stable local id; never sent upstream. */
  id: z.string().required(),
  /** User-visible label. */
  name: z.string().required(),
  /** Credential reference resolving this account's API key. */
  apiKeyEnv: z.string().required().role("credential-ref"),
  /** Console workspace id; needed only to read this account's quota. */
  workspaceId: z.string()
});
var AccountsSchema = z.array(AccountSchema).default([]);
function accountsOfConfig(accounts) {
  return accounts === void 0 || accounts === null || accounts.length === 0 ? null : accounts;
}
var PlainConfig = z.object({
  enabled: z.boolean().default(true),
  apiKeyEnv: z.string().default(DEFAULT_API_KEY_ENV),
  accounts: AccountsSchema,
  autoSwitch: z.boolean().default(false),
  sessionRef: z.string().default(""),
  workspaceId: z.string().default(""),
  usageJson: z.string().default(""),
  reportJson: z.string().default(""),
  useVelaCredential: z.boolean().default(false),
  diagnosticsJson: z.string().default(""),
  modelParamsJson: z.string().default(""),
  enabledModelsJson: z.string().default(""),
  planOverrides: z.string().default(""),
  alignBaselineJson: z.string().default(""),
  recoveredEnabled: z.boolean().default(false),
  recoveredProviders: z.string().default(""),
  baseURL: z.string().default(DEFAULT_BASE_URL),
  requestTimeoutMs: z.number().default(DEFAULT_REQUEST_TIMEOUT_MS),
  streamIdleTimeoutMs: z.number().default(DEFAULT_STREAM_IDLE_TIMEOUT_MS)
});
var Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  apiKeyEnv: z.string().default(DEFAULT_API_KEY_ENV).volatile(),
  accounts: AccountsSchema.volatile(),
  autoSwitch: z.boolean().default(false).volatile(),
  sessionRef: z.string().default("").volatile(),
  workspaceId: z.string().default("").volatile(),
  usageJson: z.string().default("").volatile(),
  reportJson: z.string().default("").volatile(),
  useVelaCredential: z.boolean().default(false).volatile(),
  diagnosticsJson: z.string().default("").volatile(),
  modelParamsJson: z.string().default("").volatile(),
  enabledModelsJson: z.string().default("").volatile(),
  planOverrides: z.string().default("").volatile(),
  alignBaselineJson: z.string().default("").volatile(),
  recoveredEnabled: z.boolean().default(false).volatile(),
  recoveredProviders: z.string().default("").volatile(),
  baseURL: z.string().default(DEFAULT_BASE_URL).volatile(),
  requestTimeoutMs: z.number().default(DEFAULT_REQUEST_TIMEOUT_MS).volatile(),
  streamIdleTimeoutMs: z.number().default(DEFAULT_STREAM_IDLE_TIMEOUT_MS).volatile()
});
function readConfig(config) {
  return {
    enabled: config.enabled.get(),
    apiKeyEnv: config.apiKeyEnv.get(),
    accounts: accountsOfConfig(config.accounts.get()),
    autoSwitch: config.autoSwitch.get(),
    sessionRef: config.sessionRef.get(),
    workspaceId: config.workspaceId.get(),
    usageJson: config.usageJson.get(),
    reportJson: config.reportJson.get(),
    useVelaCredential: config.useVelaCredential.get(),
    diagnosticsJson: config.diagnosticsJson.get(),
    modelParamsJson: config.modelParamsJson.get(),
    enabledModelsJson: config.enabledModelsJson.get(),
    planOverrides: config.planOverrides.get(),
    alignBaselineJson: config.alignBaselineJson.get(),
    recoveredEnabled: config.recoveredEnabled.get(),
    recoveredProviders: config.recoveredProviders.get(),
    enabledModels: parseEnabledModels(config.enabledModelsJson.get()),
    modelParams: parseModelParams(config.modelParamsJson.get()),
    baseURL: migrateGatewayBaseURL(config.baseURL.get()),
    requestTimeoutMs: config.requestTimeoutMs.get(),
    streamIdleTimeoutMs: config.streamIdleTimeoutMs.get()
  };
}
function assertBaseURL(raw) {
  const candidate = raw.trim();
  if (candidate.length === 0) {
    throw new Error("baseURL must not be empty");
  }
  if (candidate.includes("?") || candidate.includes("#")) {
    throw new Error(`baseURL must not carry a query or fragment: ${raw}`);
  }
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`baseURL must be an absolute URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`baseURL must use http or https: ${raw}`);
  }
  return url.toString().replace(/\/+$/, "");
}
function assertApiKeyEnv(raw) {
  if (!API_KEY_ENV_PATTERN.test(raw)) {
    throw new Error(`apiKeyEnv must match ${API_KEY_ENV_PATTERN.source}: ${raw}`);
  }
}
function migrateGatewayBaseURL(baseURL) {
  return baseURL;
}

// src/ledger-store.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
var RETENTION_DAYS = 400;
var COMPACT_BYTES = 4 * 1024 * 1024;
var LedgerStore = class {
  #path;
  /** Parsed entries, loaded once and kept current. */
  #entries;
  /**
   * @param path - absolute path of the JSONL ledger.
   */
  constructor(path) {
    this.#path = path;
  }
  /**
   * Resolve the ledger path inside a DSH home.
   * @param dshHome - resolved DSH home directory.
   * @returns the ledger path for this plugin.
   */
  static pathIn(dshHome) {
    return join(dshHome, "dsh-opendesign-go", "usage.jsonl");
  }
  /**
   * Record one finished call and persist it.
   * @param entry - the call to append.
   */
  record(entry) {
    this.#load();
    this.#entries.push(entry);
    mkdirSync(dirname(this.#path), { recursive: true });
    appendFileSync(this.#path, `${JSON.stringify(entry)}
`, "utf8");
    if (this.#size() > COMPACT_BYTES) this.#compact();
  }
  /**
   * Every retained entry.
   * @returns the entries, oldest first.
   */
  all() {
    this.#load();
    return this.#entries;
  }
  /** Read and parse the file once. */
  #load() {
    if (this.#entries !== void 0) return;
    this.#entries = [];
    if (!existsSync(this.#path)) return;
    let raw = "";
    try {
      raw = readFileSync(this.#path, "utf8");
    } catch {
      return;
    }
    for (const line of raw.split("\n")) {
      if (line.length === 0) continue;
      try {
        const parsed = JSON.parse(line);
        if (typeof parsed.at === "number" && typeof parsed.model === "string" && typeof parsed.inputTokens === "number" && typeof parsed.outputTokens === "number") {
          this.#entries.push({
            at: parsed.at,
            model: parsed.model,
            accountRef: typeof parsed.accountRef === "string" ? parsed.accountRef : "",
            inputTokens: parsed.inputTokens,
            outputTokens: parsed.outputTokens,
            cacheReadTokens: typeof parsed.cacheReadTokens === "number" ? parsed.cacheReadTokens : 0,
            cacheWriteTokens: typeof parsed.cacheWriteTokens === "number" ? parsed.cacheWriteTokens : 0,
            costUsd: typeof parsed.costUsd === "number" ? parsed.costUsd : null
          });
        }
      } catch {
      }
    }
  }
  /**
   * Current file size in bytes.
   * @returns the size, or 0 when absent.
   */
  #size() {
    try {
      return statSync(this.#path).size;
    } catch {
      return 0;
    }
  }
  /** Drop entries past retention and rewrite the file atomically. */
  #compact() {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1e3;
    const kept = this.#entries.filter((entry) => entry.at >= cutoff);
    this.#entries = kept;
    const temp = `${this.#path}.tmp`;
    writeFileSync(temp, kept.map((entry) => `${JSON.stringify(entry)}
`).join(""), "utf8");
    renameSync(temp, this.#path);
  }
};

// src/usage-ledger.ts
function costOf(price, usage) {
  if (price === void 0) return null;
  const perMillion = (tokens, rate) => tokens > 0 && rate !== void 0 ? tokens / 1e6 * rate : 0;
  return perMillion(usage.inputTokens, price.input) + perMillion(usage.outputTokens, price.output) + perMillion(usage.cacheReadTokens ?? 0, price.cacheRead) + perMillion(usage.cacheWriteTokens ?? 0, price.cacheWrite);
}
function summarize(entries, since, until) {
  const byModel = /* @__PURE__ */ new Map();
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let cost = 0;
  let unpriced = 0;
  for (const entry of entries) {
    if (entry.at < since || entry.at > until) continue;
    const row = byModel.get(entry.model) ?? {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
      unpricedCalls: 0
    };
    row.calls += 1;
    row.inputTokens += entry.inputTokens;
    row.outputTokens += entry.outputTokens;
    row.cacheReadTokens += entry.cacheReadTokens;
    row.cacheWriteTokens += entry.cacheWriteTokens;
    if (entry.costUsd === null) {
      row.unpricedCalls += 1;
      unpriced += 1;
    } else {
      row.costUsd += entry.costUsd;
      cost += entry.costUsd;
    }
    byModel.set(entry.model, row);
    input += entry.inputTokens;
    output += entry.outputTokens;
    cacheRead += entry.cacheReadTokens;
    cacheWrite += entry.cacheWriteTokens;
  }
  const models = [...byModel.entries()].map(([model, row]) => ({ model, ...row })).sort((a, b) => b.costUsd - a.costUsd || b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));
  return {
    since,
    until,
    calls: entries.filter((entry) => entry.at >= since && entry.at <= until).length,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    costUsd: cost,
    unpricedCalls: unpriced,
    models,
    pricedAs: "base-tier"
  };
}

// src/pricing.ts
var BASE_PRICES = [
  { model: "claude-fable-5", input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  { model: "claude-fable-5.1", input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  { model: "claude-haiku-5.5", input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  { model: "claude-opus-4.8", input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  { model: "claude-opus-5", input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  { model: "claude-opus-5.5", input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  { model: "claude-sonnet-5", input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  { model: "claude-sonnet-5.5", input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  { model: "deepseek-v4.1-flash", input: 0.3, output: 1.2, cacheRead: 6e-3 },
  { model: "deepseek-v4-flash", input: 0.44, output: 1.32, cacheRead: 0.014 },
  { model: "deepseek-v4-flash-vision-exp", input: 0.44, output: 1.32, cacheRead: 0.014 },
  { model: "deepseek-v4-pro", input: 1.32, output: 3.96, cacheRead: 0.044 },
  { model: "gemini-3.7-flash", input: 0.75, output: 3.75, cacheRead: 0.075 },
  { model: "gemini-3.8-flash", input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0.08333 },
  { model: "glm-5.2", input: 1.4, output: 4.4, cacheRead: 0.26 },
  { model: "glm-5.3-flash", input: 0.075, output: 0.25, cacheRead: 0.015 },
  { model: "glm-5.3-flashx", input: 0.37, output: 1.25, cacheRead: 0.075 },
  { model: "gpt-5.6-luna", input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
  { model: "gpt-5.6-sol", input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 },
  { model: "gpt-5.6-terra", input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2.5 },
  { model: "gpt-6.1-sol", input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  { model: "gpt-6-astra", input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  { model: "gpt-6-luna", input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  { model: "gpt-6-sol", input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  { model: "grok-4.5", input: 2, output: 6, cacheRead: 0.5 },
  { model: "grok-4.6", input: 2, output: 6, cacheRead: 0.5 },
  { model: "grok-4.7", input: 2, output: 6, cacheRead: 0.5 },
  { model: "hy4-preview", input: 0.834, output: 2.501, cacheRead: 0.042 },
  { model: "kimi-k2.7-code", input: 0.95, output: 4, cacheRead: 0.19 },
  { model: "kimi-k3", input: 3, output: 15, cacheRead: 0.3 },
  { model: "mimo-v2.6-flash", input: 0.14, output: 0.28, cacheRead: 28e-4 },
  { model: "mimo-v2.6-pro", input: 0.435, output: 0.87, cacheRead: 36e-4 },
  { model: "muse-spark-1.3", input: 1.25, output: 4.25, cacheRead: 0.15 },
  { model: "muse-wonder", input: 4, output: 20, cacheRead: 0.2 },
  { model: "qwen3.7-max", input: 2.5, output: 7.5, cacheRead: 0.5, cacheWrite: 3.125 }
];
var BY_MODEL = new Map(BASE_PRICES.map((price) => [price.model, price]));
function priceOf(model) {
  return BY_MODEL.get(model);
}

// src/vela-locate.ts
import { existsSync as existsSync2 } from "node:fs";
import { homedir, platform } from "node:os";
import { join as join2 } from "node:path";
function installRoots() {
  const home = homedir();
  const roots = [];
  if (platform() === "win32") {
    const local = process.env.LOCALAPPDATA ?? join2(home, "AppData", "Local");
    roots.push(join2(local, "Programs", "Open Design", "resources", "open-design", "bin"));
  } else if (platform() === "darwin") {
    roots.push("/Applications/Open Design.app/Contents/Resources/open-design/bin");
  } else {
    roots.push(join2(home, ".local", "share", "open-design", "bin"));
  }
  return roots;
}
function binaryName() {
  return platform() === "win32" ? "vela.exe" : "vela";
}
function locateVela(env = process.env, exists = existsSync2, roots = installRoots()) {
  const override = (env.OPENDESIGN_VELA_PATH ?? "").trim();
  if (override.length > 0 && exists(override)) return { path: override, via: "env" };
  for (const root of roots) {
    const candidate = join2(root, binaryName());
    if (exists(candidate)) return { path: candidate, via: "open-design-install" };
  }
  const onPath = (env.PATH ?? "").split(platform() === "win32" ? ";" : ":").map((entry) => entry.trim()).filter((entry) => entry.length > 0).map((entry) => join2(entry, binaryName())).find((candidate) => exists(candidate));
  if (onPath !== void 0) return { path: onPath, via: "path" };
  return void 0;
}

// src/vela-billing.ts
import { execFile } from "node:child_process";

// src/client/usage-format.ts
function windowLabel(durationSeconds) {
  const days = durationSeconds / 86400;
  if (Number.isInteger(days) && days >= 1) return `${days} \u5929`;
  const hours = durationSeconds / 3600;
  if (Number.isInteger(hours) && hours >= 1) return `${hours} \u5C0F\u65F6`;
  return `${Math.round(durationSeconds / 60)} \u5206\u949F`;
}

// src/usage-contract.ts
function creditsToNumber(value) {
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function percentUsedOf(usedCredits, limitCredits) {
  const used = creditsToNumber(usedCredits);
  const limit = creditsToNumber(limitCredits);
  if (used === null || limit === null || limit <= 0) return null;
  return Math.min(100, Math.max(0, Math.round(used / limit * 100)));
}

// src/vela-billing.ts
var CALL_TIMEOUT_MS = 15e3;
function runJson(binary, args) {
  return new Promise((resolve, reject) => {
    execFile(binary, [...args], { timeout: CALL_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
      if (error !== null) {
        reject(new Error(`vela ${args.join(" ")} failed: ${error.message}`));
        return;
      }
      const text = String(stdout ?? "").trim();
      if (text.length === 0) {
        reject(new Error(`vela ${args.join(" ")} printed nothing`));
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error(`vela ${args.join(" ")} did not print JSON`));
      }
    });
  });
}
function looksLikeWorkspaceId(value) {
  return value !== void 0 && /^[a-z0-9]{16,32}$/.test(value.trim());
}
async function resolveWorkspaceId(binary, explicit) {
  if (looksLikeWorkspaceId(explicit)) return explicit.trim();
  try {
    const raw = await runJson(binary, ["team-projects", "list"]);
    const workspace = raw.workspaceId;
    if (typeof workspace === "string" && workspace.length > 0) return workspace;
  } catch {
  }
  return void 0;
}
function windowOf(raw) {
  const duration = raw.durationSeconds;
  const used = raw.usedCredits;
  const limit = raw.limitCredits;
  const remaining = raw.remainingCredits;
  const resetsAt = raw.resetsAt;
  if (typeof duration !== "number" || typeof used !== "string" || typeof limit !== "string" || typeof remaining !== "string" || typeof resetsAt !== "string") return void 0;
  return {
    status: "ok",
    durationSeconds: duration,
    usedCredits: used,
    limitCredits: limit,
    remainingCredits: remaining,
    percentUsed: percentUsedOf(used, limit),
    resetsAt
  };
}
var FALLBACK_CREDITS_PER_USD = 1e4;
async function readVelaUsage(binary, workspaceId) {
  const asOf = (/* @__PURE__ */ new Date()).toISOString();
  const empty = (error) => ({ asOf, tier: "", eligible: false, windows: [], error });
  const workspace = await resolveWorkspaceId(binary, workspaceId);
  if (workspace === void 0) {
    return empty(
      "\u672A\u80FD\u4ECE vela \u53D6\u5F97\u5DE5\u4F5C\u7A7A\u95F4 ID\u3002\u8BF7\u786E\u8BA4\u5DF2\u5728 OpenDesign \u684C\u9762\u7AEF\u767B\u5F55\uFF1B\u4E5F\u53EF\u5728\u4E0B\u65B9\u624B\u52A8\u586B\u5199\u5DE5\u4F5C\u7A7A\u95F4 ID \u8986\u76D6\u81EA\u52A8\u63A2\u6D4B\u3002"
    );
  }
  let funding;
  try {
    funding = await runJson(binary, [
      "billing",
      "funding-check",
      "--workspace-id",
      workspace,
      "--format",
      "json"
    ]);
  } catch (error) {
    return empty(error instanceof Error ? error.message : String(error));
  }
  const plan = funding.codingPlan;
  if (plan === void 0) return empty("vela \u672A\u8FD4\u56DE\u5957\u9910\u4FE1\u606F");
  const windows = (plan.windows ?? []).map(windowOf).filter((window) => window !== void 0);
  if (windows.length === 0) return empty("vela \u672A\u8FD4\u56DE\u4EFB\u4F55\u989D\u5EA6\u7A97\u53E3");
  let balanceUsd = funding.balanceUsd;
  let creditsPerUsd;
  try {
    const summary = await runJson(binary, ["billing", "summary", "--format", "json"]);
    if (typeof summary.creditsPerUsd === "number" && summary.creditsPerUsd > 0) {
      creditsPerUsd = summary.creditsPerUsd;
    }
    if (balanceUsd === void 0 && typeof summary.balanceUsd === "string") {
      balanceUsd = summary.balanceUsd;
    }
  } catch {
    creditsPerUsd = FALLBACK_CREDITS_PER_USD;
  }
  if (creditsPerUsd === void 0) creditsPerUsd = FALLBACK_CREDITS_PER_USD;
  if (balanceUsd === void 0) {
    try {
      const snapshot2 = await runJson(binary, [
        "billing",
        "workspace-snapshot",
        "--workspace-id",
        workspace,
        "--format",
        "json"
      ]);
      balanceUsd = snapshot2.wallet?.balanceUsd;
    } catch {
    }
  }
  const snapshot = {
    asOf: funding.generatedAt ?? asOf,
    tier: plan.tier ?? "",
    eligible: plan.eligible === true,
    windows,
    ...balanceUsd === void 0 ? {} : { wallet: { balanceUsd } },
    ...creditsPerUsd === void 0 ? {} : { creditsPerUsd }
  };
  return snapshot;
}

// src/index.ts
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { join as join4 } from "node:path";

// src/session-usage.ts
import { existsSync as existsSync3, readFileSync as readFileSync2, readdirSync, statSync as statSync2 } from "node:fs";
import { join as join3 } from "node:path";
import { zstdDecompressSync } from "node:zlib";
var DEFAULT_RECOVERED_PROVIDERS = ["opendesign", "dsh-opendesign-go"];
var ZSTD_MAGIC = Buffer.from([40, 181, 47, 253]);
function parseRecoveredProviders(raw) {
  if (raw === void 0) return DEFAULT_RECOVERED_PROVIDERS;
  const providers = raw.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return providers.length === 0 ? DEFAULT_RECOVERED_PROVIDERS : providers;
}
function readSessionLog(path) {
  let bytes;
  try {
    bytes = readFileSync2(path);
  } catch {
    return void 0;
  }
  let text = "";
  let offset = 0;
  while (offset < bytes.length) {
    try {
      text += zstdDecompressSync(bytes.subarray(offset)).toString("utf8");
    } catch {
      break;
    }
    const next = bytes.indexOf(ZSTD_MAGIC, offset + 4);
    if (next < 0) break;
    offset = next;
  }
  return text;
}
function callsFromSessionText(text, providers = DEFAULT_RECOVERED_PROVIDERS) {
  const wanted = providerSetOf(providers);
  const needles = providers.filter((provider) => provider.length > 0);
  const calls = [];
  for (const line of text.split("\n")) {
    if (line.length === 0) continue;
    if (!line.includes('"assistant/message"')) continue;
    if (!needles.some((needle) => line.includes(needle))) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row === null || typeof row !== "object") continue;
    const call = callOf(row, wanted);
    if (call !== void 0) calls.push(call);
  }
  return calls;
}
function providerSetOf(providers) {
  return new Set(providers.filter((provider) => provider.length > 0));
}
function callOf(row, providers) {
  const at = row.time;
  if (typeof at !== "number" || !Number.isFinite(at) || at < 0) return void 0;
  const data = row.data;
  if (data === null || typeof data !== "object") return void 0;
  const d = data;
  const message = d.message;
  if (message === null || typeof message !== "object") return void 0;
  const source = message.source;
  if (source === null || typeof source !== "object") return void 0;
  const src = source;
  const provider = src.provider;
  const model = src.model;
  if (typeof provider !== "string" || !providers.has(provider)) return void 0;
  if (typeof model !== "string" || model.length === 0) return void 0;
  const usage = d.usage;
  if (usage === null || typeof usage !== "object") return void 0;
  const u = usage;
  const num = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  return {
    provider,
    model,
    inputTokens: num(u.inputTokens),
    outputTokens: num(u.outputTokens),
    cacheReadTokens: num(u.cacheReadTokens),
    cacheWriteTokens: num(u.cacheWriteTokens),
    at
  };
}
function scanSessions(root, options) {
  if (!existsSync3(root)) return [];
  const providers = options?.providers ?? DEFAULT_RECOVERED_PROVIDERS;
  const since = options?.since;
  const calls = [];
  let workspaces;
  try {
    workspaces = readdirSync(root);
  } catch {
    return [];
  }
  for (const workspace of workspaces) {
    const workspacePath = join3(root, workspace);
    try {
      if (!statSync2(workspacePath).isDirectory()) continue;
    } catch {
      continue;
    }
    let sessions;
    try {
      sessions = readdirSync(workspacePath);
    } catch {
      continue;
    }
    for (const session of sessions) {
      const logPath = join3(workspacePath, session, "session.v4.jsonl.zstd");
      if (!existsSync3(logPath)) continue;
      const text = readSessionLog(logPath);
      if (text === void 0) continue;
      for (const call of callsFromSessionText(text, providers)) {
        if (since !== void 0 && call.at < since) continue;
        calls.push(call);
      }
    }
  }
  return calls;
}

// src/quota-cadence.ts
function readDue(input) {
  if (input.changed) return true;
  if (!input.wantsUsage) return false;
  return input.retries < input.maxRetries;
}

// src/index.ts
import { readFileSync as readFileSync3 } from "node:fs";
import { homedir as homedir2 } from "node:os";

// src/host-settings.ts
function installHostSettings(ctx) {
  ctx.inject(["settings"], (settingsCtx) => {
    const settings = settingsCtx.settings;
    if (settings === void 0 || typeof settings.configure !== "function") {
      ctx.logger.warn(
        `llm-opendesign-go: no profile settings service; the page will stay read-only (entry "${PROFILE_ENTRY_ID}")`
      );
      return;
    }
    settingsCtx.effect(() => {
      const dispose = settings.configure({ auto: false }, ctx.fiber);
      const writable = settings.writable;
      const rows = typeof settings.describe === "function" ? settings.describe.call(settings) : [];
      const own = rows.find((row) => row.ns === PROFILE_ENTRY_ID);
      ctx.logger.info(
        `llm-opendesign-go: settings attached (writable=${String(writable)}, forms=${rows.length}, own=${own === void 0 ? "ABSENT" : `present(auto=${String(own.autoGenerate)})`}, ns=[${rows.map((row) => row.ns).join(", ")}])`
      );
      return dispose;
    });
  });
}
function fieldWriterOf(ctx) {
  const settingsOf = () => {
    const settings = ctx.get("settings");
    if (settings === void 0 || typeof settings.update !== "function" || typeof settings.describe !== "function" || settings.writable !== true) return void 0;
    return settings;
  };
  if (ctx.get("settings") === void 0) {
    ctx.logger.info("llm-opendesign-go: settings service not mounted yet; writes will retry");
  }
  return async (field, json) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const settings = settingsOf();
      if (settings === void 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, 100 * (attempt + 1));
        });
        continue;
      }
      const row = settings.describe().find((candidate) => candidate.ns === PROFILE_ENTRY_ID);
      if (row === void 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, 100 * (attempt + 1));
        });
        continue;
      }
      try {
        await settings.update(PROFILE_ENTRY_ID, { [field]: json }, row.revision);
        return;
      } catch (error) {
        if (attempt === 11) {
          ctx.logger.warn(`llm-opendesign-go: could not cache ${field} (${String(error)})`);
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 100 * (attempt + 1));
        });
      }
    }
    ctx.logger.warn(`llm-opendesign-go: gave up caching ${field} after 12 attempts`);
  };
}

// src/usage.ts
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
var CONSOLE_BASE_URL = "https://amr-api.open-design.ai/api/v1";
var DEFAULT_SESSION_REF = "OPENDESIGN_SESSION";
function stringOf(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function windowOf2(raw, asOf) {
  const duration = typeof raw.durationSeconds === "number" && Number.isFinite(raw.durationSeconds) ? raw.durationSeconds : void 0;
  const used = stringOf(raw.usedCredits);
  const limit = stringOf(raw.limitCredits);
  const remaining = stringOf(raw.remainingCredits);
  if (duration === void 0 || used === void 0 || limit === void 0 || remaining === void 0) return void 0;
  return {
    status: "ok",
    durationSeconds: duration,
    usedCredits: used,
    limitCredits: limit,
    remainingCredits: remaining,
    percentUsed: percentUsedOf(used, limit),
    resetsAt: stringOf(raw.resetsAt) ?? asOf
  };
}
function consoleBase() {
  return CONSOLE_BASE_URL.replace(/\/+$/u, "");
}
var OpenDesignUsageService = class {
  options;
  /**
   * @param options - resolution hooks supplied by the plugin entry.
   */
  constructor(options) {
    this.options = options;
  }
  /**
   * Read quota for one account.
   *
   * A missing session or workspace yields `error` with no windows rather than
   * throwing: the page shows "not configured" and the user can fix it in the
   * settings page.
   * @param accountRef - credential reference of the account to read.
   * @returns the snapshot, always populated.
   */
  async read(accountRef) {
    const asOf = (/* @__PURE__ */ new Date()).toISOString();
    const ref = accountRef ?? this.options.activeRef();
    let session;
    try {
      session = await this.options.resolveSession();
    } catch {
      session = void 0;
    }
    if (session === void 0) {
      return { asOf, tier: "", eligible: false, windows: [], error: "console session not configured" };
    }
    const workspace = this.options.workspaceOf(ref);
    if (workspace === void 0) {
      return { asOf, tier: "", eligible: false, windows: [], error: "workspace id not configured for this account" };
    }
    const headers = { authorization: `Bearer ${session}`, accept: "application/json" };
    const [usage, wallet] = await Promise.all([
      this.#getJson(`${consoleBase()}/workspaces/${encodeURIComponent(workspace)}/billing/coding-plan-usage`, headers),
      this.#getJson(`${consoleBase()}/billing/summary?timeZone=${encodeURIComponent("Asia/Shanghai")}`, headers).catch(() => void 0)
    ]);
    if (!usage.ok) {
      return { asOf, tier: "", eligible: false, windows: [], error: usage.error };
    }
    const payload = usage.value;
    const windows = Array.isArray(payload.windows) ? payload.windows.map((row) => windowOf2(row, asOf)).filter((row) => row !== void 0) : [];
    if (windows.length === 0) {
      return { asOf, tier: stringOf(payload.tier) ?? "", eligible: payload.eligible === true, windows: [], error: "console returned no usable quota window" };
    }
    windows.sort((a, b) => a.durationSeconds - b.durationSeconds);
    const result = {
      asOf,
      tier: stringOf(payload.tier) ?? "",
      eligible: payload.eligible === true,
      windows
    };
    const walletSnapshot = wallet === void 0 || !wallet.ok ? void 0 : walletOf(wallet.value);
    return walletSnapshot === void 0 ? result : { ...result, wallet: walletSnapshot };
  }
  /**
   * Describe the windows for logging without leaking quota values.
   * @param snapshot - one reading.
   * @returns a one-line summary.
   */
  describe(snapshot) {
    if (snapshot.error !== void 0) return `usage unavailable: ${snapshot.error}`;
    return snapshot.windows.map((window) => `${windowLabel(window.durationSeconds)}=${window.percentUsed ?? "?"}%`).join(" ");
  }
  /**
   * Issue one GET and decode JSON without throwing.
   * @param url - absolute URL.
   * @param headers - request headers including the session.
   * @returns the decoded body, or an error string.
   */
  async #getJson(url, headers) {
    try {
      const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(15e3) });
      if (!response.ok) {
        const detail = response.status === 401 ? "console session expired or invalid" : `console HTTP ${response.status}`;
        return { ok: false, error: detail };
      }
      return { ok: true, value: await response.json() };
    } catch (error) {
      return { ok: false, error: `console request failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
};
function walletOf(raw) {
  if (raw === null || typeof raw !== "object") return void 0;
  const row = raw;
  const balance = stringOf(row.balanceUsd) ?? stringOf(row.totalAvailableCreditsUsd);
  if (balance === void 0) return void 0;
  const periodEnd = stringOf(row.subscriptionCurrentPeriodEnd);
  return periodEnd === void 0 ? { balanceUsd: balance } : { balanceUsd: balance, subscriptionPeriodEnd: periodEnd };
}
function sessionResolverOf(ctx) {
  return async () => {
    const credentials = ctx.get("credentials");
    const hit = credentials !== void 0 ? (await credentials.resolve(credentialRef(DEFAULT_SESSION_REF)))?.value : launchEnvironmentOf(ctx).get(DEFAULT_SESSION_REF)?.value;
    return hit === void 0 || hit.length === 0 ? void 0 : hit.trim();
  };
}

// src/index.ts
var MAX_USAGE_RETRIES = 6;
var FAST_WATCH_MS = 300;
var SLOW_POLL_MS = 5e3;
var REPORT_WINDOW_MS = 30 * 24 * 60 * 60 * 1e3;
var name = "llm-opendesign-go";
var inject = ["llm"];
var NS = SETTINGS_NAMESPACE;
function apply(ctx, raw) {
  const config = raw !== void 0 && typeof raw.enabled === "object" ? raw : Config(raw);
  const current = () => readConfig(config);
  const initial = current();
  assertBaseURL(initial.baseURL);
  assertApiKeyEnv(initial.apiKeyEnv);
  assertAccounts(initial.accounts, initial.apiKeyEnv);
  ctx.logger.info("llm-opendesign-go: mounted");
  installHostSettings(ctx);
  const usage = new OpenDesignUsageService({
    resolveSession: async () => {
      const ref = current().sessionRef;
      if (ref.length === 0) return void 0;
      const resolve = sessionResolverOf(ctx);
      return await resolve();
    },
    workspaceOf: (accountRef) => {
      const config2 = current();
      const account = config2.accounts?.find((row) => row.apiKeyEnv === accountRef);
      const workspace = account?.workspaceId ?? (accountRef === config2.apiKeyEnv ? config2.workspaceId : void 0);
      return workspace !== void 0 && workspace.length > 0 ? workspace : void 0;
    },
    activeRef: () => current().apiKeyEnv
  });
  ctx.provide("openDesignGoUsage");
  ctx.set("openDesignGoUsage", usage);
  const refreshUsage = async () => {
    const write = fieldWriterOf(ctx);
    if (write === void 0) return void 0;
    const config2 = current();
    let snapshot;
    if (config2.useVelaCredential) {
      const vela = locateVela();
      if (vela === void 0) {
        snapshot = {
          asOf: (/* @__PURE__ */ new Date()).toISOString(),
          tier: "",
          eligible: false,
          windows: [],
          error: `\u672A\u627E\u5230 vela \u547D\u4EE4\u884C\u3002\uFF08home=${homedir2()} LOCALAPPDATA=${process.env.LOCALAPPDATA ?? "unset"}\uFF09\u5B89\u88C5\u5E76\u767B\u5F55 OpenDesign \u684C\u9762\u7AEF\u540E\u5373\u53EF\u81EA\u52A8\u8BFB\u53D6\u3002`
        };
      } else {
        ctx.logger.info(`llm-opendesign-go: reading quota via vela (${vela.via}) ${vela.path}`);
        snapshot = await readVelaUsage(vela.path, config2.workspaceId);
      }
    } else {
      snapshot = await usage.read();
    }
    await write("usageJson", JSON.stringify(snapshot));
    ctx.logger.info(`llm-opendesign-go: quota ${usage.describe(snapshot)}`);
    return snapshot;
  };
  const wantsUsage = () => {
    const config2 = current();
    if (config2.useVelaCredential) return true;
    if (config2.sessionRef.length === 0) return false;
    return config2.workspaceId.length > 0 || config2.accounts?.some((row) => row.workspaceId) === true;
  };
  const refreshIfConfigured = async () => {
    if (!wantsUsage()) return void 0;
    try {
      return await refreshUsage();
    } catch (error) {
      ctx.logger.warn(`llm-opendesign-go: quota refresh failed (${String(error)})`);
      return void 0;
    }
  };
  const usable = (snapshot) => snapshot !== void 0 && snapshot.error === void 0 && snapshot.windows.length > 0;
  void refreshIfConfigured();
  let lastUsageKey = `${current().useVelaCredential}|${current().sessionRef}|${current().workspaceId}`;
  let retries = 0;
  const tick = (force) => {
    const config2 = current();
    const key = `${config2.useVelaCredential}|${config2.sessionRef}|${config2.workspaceId}`;
    const changed = key !== lastUsageKey;
    if (changed) {
      lastUsageKey = key;
      retries = 0;
    }
    if (!force && !readDue({
      changed,
      retries,
      maxRetries: MAX_USAGE_RETRIES,
      wantsUsage: wantsUsage()
    })) return;
    if (!changed) retries += 1;
    void refreshIfConfigured().then((snapshot) => {
      if (usable(snapshot)) retries = MAX_USAGE_RETRIES;
    });
  };
  ctx.effect(() => {
    let timer;
    const step = () => {
      tick(false);
      timer = setTimeout(step, SLOW_POLL_MS);
    };
    const watch = setInterval(() => {
      const config2 = current();
      const key = `${config2.useVelaCredential}|${config2.sessionRef}|${config2.workspaceId}`;
      if (key === lastUsageKey) return;
      if (timer !== void 0) {
        clearTimeout(timer);
        timer = void 0;
      }
      step();
    }, FAST_WATCH_MS);
    timer = setTimeout(step, SLOW_POLL_MS);
    return () => {
      if (timer !== void 0) clearTimeout(timer);
      clearInterval(watch);
    };
  });
  const ledger = new LedgerStore(LedgerStore.pathIn(resolveDshHome()));
  let recoveredCache;
  let recoveredKey = "";
  const recoveredSpend = () => {
    const config2 = current();
    if (!config2.recoveredEnabled) return void 0;
    const key = config2.recoveredProviders;
    if (recoveredCache !== void 0 && key === recoveredKey) return recoveredCache;
    let calls = 0;
    let costUsd = 0;
    let unpricedCalls = 0;
    let cacheReadTokens = 0;
    try {
      const since = Date.now() - REPORT_WINDOW_MS;
      const scan = {
        since,
        providers: parseRecoveredProviders(config2.recoveredProviders)
      };
      for (const call of scanSessions(join4(resolveDshHome(), "sessions"), scan)) {
        const price = priceOf(call.model);
        if (price === void 0) {
          unpricedCalls += 1;
          continue;
        }
        calls += 1;
        cacheReadTokens += call.cacheReadTokens;
        costUsd += (call.inputTokens * price.input + call.outputTokens * price.output + call.cacheReadTokens * (price.cacheRead ?? price.input)) / 1e6;
      }
    } catch (error) {
      ctx.logger.warn(`llm-opendesign-go: session history scan failed (${String(error)})`);
      return void 0;
    }
    recoveredCache = { calls, costUsd, unpricedCalls, cacheReadTokens };
    recoveredKey = key;
    return recoveredCache;
  };
  let pendingReport;
  const publishReport = () => {
    if (pendingReport !== void 0) return;
    pendingReport = setTimeout(() => {
      pendingReport = void 0;
      const write = fieldWriterOf(ctx);
      if (write === void 0) return;
      const now = Date.now();
      const base = summarize(ledger.all(), now - REPORT_WINDOW_MS, now);
      const recovered = recoveredSpend();
      const report = recovered === void 0 ? base : { ...base, recovered };
      void write("reportJson", JSON.stringify(report)).catch(() => void 0);
    }, 1e3);
  };
  ctx.effect(() => () => {
    if (pendingReport !== void 0) clearTimeout(pendingReport);
  });
  const recordUsage = (call) => {
    const price = priceOf(call.model);
    ledger.record({
      at: Date.now(),
      model: call.model,
      accountRef: call.accountRef,
      inputTokens: call.usage.inputTokens,
      outputTokens: call.usage.outputTokens,
      cacheReadTokens: call.usage.cacheReadTokens ?? 0,
      cacheWriteTokens: call.usage.cacheWriteTokens ?? 0,
      costUsd: costOf(price, call.usage)
    });
    publishReport();
  };
  ctx.provide("openDesignGoUsageLedger");
  ctx.set("openDesignGoUsageLedger", { record: recordUsage, report: () => summarize(ledger.all(), Date.now() - REPORT_WINDOW_MS, Date.now()) });
  publishReport();
  const resolveApiKey = async (ref) => {
    const credentials = ctx.get("credentials");
    const hit = credentials !== void 0 ? (await credentials.resolve(credentialRef2(ref)))?.value : launchEnvironmentOf2(ctx).get(ref)?.value;
    if (hit === void 0 || hit.length === 0) return void 0;
    return assertUsableApiKey2(hit, name, ref);
  };
  let registration;
  let routeCheck = 0;
  const mediaTypeOf = (path) => {
    const lower = path.toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    return "image/png";
  };
  const imageDataUrl = (attachment) => {
    const attachments = ctx.get("attachments");
    if (attachments === void 0 || typeof attachments.imageHostPath !== "function") return void 0;
    const path = attachments.imageHostPath(attachment);
    if (path === void 0 || path.length === 0) return void 0;
    try {
      const bytes = readFileSync3(path);
      const media = mediaTypeOf(path);
      return `data:${media};base64,${bytes.toString("base64")}`;
    } catch (error) {
      ctx.logger.warn(`llm-opendesign-go: could not read image bytes (${String(error)})`);
      return void 0;
    }
  };
  const adapter = new OpenDesignAdapter({
    config: current,
    resolveApiKey,
    imageDataUrl,
    onAccountSettled: (ref) => {
      const config2 = current();
      if (config2.apiKeyEnv === ref) return;
      ctx.logger.info(`llm-opendesign-go: account settled on ${ref}`);
    },
    onUsage: recordUsage
  });
  const publishDiagnostics = (configured, triedRef, lastError) => {
    const write = fieldWriterOf(ctx);
    if (write === void 0) return;
    const payload = {
      registered: registration !== void 0,
      enabled: current().enabled,
      credentialResolved: configured,
      triedRef,
      ...lastError === void 0 ? {} : { lastError },
      modelCount: listSeedModels(PROVIDER_ID).length,
      asOf: (/* @__PURE__ */ new Date()).toISOString()
    };
    void write("diagnosticsJson", JSON.stringify(payload)).catch(() => void 0);
  };
  const applyRoute = (configured, triedRef = "") => {
    const enabled = current().enabled;
    if (configured && enabled && registration === void 0) {
      try {
        registration = ctx.llm.registerAdapter([PROVIDER_ID], adapter);
        ctx.logger.info(`llm-opendesign-go: route "${PROVIDER_ID}" registered as ${DISPLAY_NAME}`);
        publishDiagnostics(configured, triedRef);
      } catch (error) {
        ctx.logger.error(`llm-opendesign-go: not registering "${PROVIDER_ID}" (${String(error)})`);
        publishDiagnostics(configured, triedRef, String(error));
      }
      return;
    }
    if ((!configured || !enabled) && registration !== void 0) {
      registration();
      registration = void 0;
      if (!enabled) ctx.logger.info("llm-opendesign-go: disabled by configuration; the route is withdrawn");
      publishDiagnostics(configured, triedRef);
      return;
    }
    publishDiagnostics(configured, triedRef);
  };
  const syncRoute = (resolve = resolveApiKey) => {
    const check = ++routeCheck;
    const config2 = current();
    const refs = config2.autoSwitch ? accountsOf(config2).map((account) => account.apiKeyEnv) : [config2.apiKeyEnv];
    const anyRef = refs[0] ?? config2.apiKeyEnv;
    void resolve(anyRef).then((key) => {
      if (check !== routeCheck) return;
      applyRoute(key !== void 0, anyRef);
    }).catch((error) => {
      if (check !== routeCheck) return;
      if (error instanceof LlmError4 && error.code === "INVALID_CREDENTIAL") {
        ctx.logger.error(`llm-opendesign-go: ${error.message}`);
        applyRoute(false, anyRef);
        return;
      }
      ctx.logger.error(`llm-opendesign-go: credential resolution failed; keeping the previous route state (${String(error)})`);
    });
  };
  ctx.effect(() => () => {
    registration?.();
    registration = void 0;
  });
  ctx.inject(["credentials"], (credentialsCtx) => {
    const resolveVia = async (ref) => {
      const hit = (await credentialsCtx.credentials.resolve(credentialRef2(ref)))?.value;
      if (hit === void 0 || hit.length === 0) return void 0;
      return assertUsableApiKey2(hit, name, ref);
    };
    credentialsCtx.on("credentials/reference-updated", (ref) => {
      if (ref === current().apiKeyEnv) syncRoute(resolveVia);
    });
    syncRoute(resolveVia);
  });
}
export {
  CONSOLE_BASE_URL,
  Config,
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL,
  DISPLAY_NAME,
  GO_DESIGN_PLAN_MODELS,
  NS,
  OpenDesignAdapter,
  OpenDesignUsageService,
  PROVIDER_ID,
  PlainConfig,
  SETTINGS_NAMESPACE,
  apply,
  assertApiKeyEnv,
  assertBaseURL,
  inject,
  listSeedModels,
  name,
  percentUsedOf,
  readConfig,
  listSeedModels as seedCatalog,
  windowLabel
};
