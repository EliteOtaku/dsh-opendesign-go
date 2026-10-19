// src/index.ts
import { launchEnvironmentOf as launchEnvironmentOf2 } from "@deepseek-ai/dsh-launch-environment";
import { credentialRef as credentialRef3 } from "@deepseek-ai/dsh-credentials";
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

// src/config-contract.ts
var PROVIDER_ID = "dsh-opendesign-go";
var DISPLAY_NAME = "DSH OpenDesign Go";
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
function deriveAccountRef(index) {
  return `OPENDESIGN_ACCOUNT_${index + 1}`;
}

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
function seedModel(id) {
  return GO_DESIGN_PLAN_MODELS.find((model) => model.id === id);
}
function listSeedModels(provider) {
  return GO_DESIGN_PLAN_MODELS.map((model) => ({
    provider,
    id: model.id,
    name: model.name,
    ...model.inputModalities === void 0 ? {} : { inputModalities: model.inputModalities }
  }));
}

// src/conversion.ts
import { LlmError as LlmError2 } from "@deepseek-ai/dsh-llm";

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
function textOf(blocks, where) {
  let text = "";
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
      case "image":
        throw unsupportedBlock(
          `OpenDesign Chat Completions cannot carry image content yet (scheduled for M6); the ${where} contains one`
        );
      case "file":
        throw unsupportedBlock(
          `OpenDesign Chat Completions receives files as text handles; the ${where} still carries a raw file block`
        );
      default:
        break;
    }
  }
  return text;
}
function assistantMessage(content) {
  const text = textOf(content, "assistant message");
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
  return toolCalls.length === 0 ? { role: "assistant", content: text } : { role: "assistant", content: text, tool_calls: toolCalls };
}
function toChatMessage(message) {
  switch (message.role) {
    case "system": {
      const text = textOf(message.content, "system message");
      return text === "" ? void 0 : { role: "system", content: text };
    }
    case "developer": {
      const text = textOf(message.content, "developer message");
      return text === "" ? void 0 : { role: "system", content: text };
    }
    case "user": {
      const text = textOf(message.content, "user message");
      return text === "" ? void 0 : { role: "user", content: text };
    }
    case "assistant":
      return assistantMessage(message.content);
    case "tool": {
      const text = textOf(message.content, "tool message");
      return { role: "tool", tool_call_id: message.toolCallId, content: text };
    }
  }
}
function mergeSystem(system, existing) {
  return existing === "" ? system : `${system}

${existing}`;
}
function toChatMessages(options) {
  const messages = [];
  for (const message of options.messages) {
    const converted = toChatMessage(message);
    if (converted !== void 0) messages.push(converted);
  }
  const system = options.system;
  if (system !== void 0 && system.trim() !== "") {
    const first = messages[0];
    if (first !== void 0 && first.role === "system") {
      messages[0] = { role: "system", content: mergeSystem(system, first.content) };
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
   * Advertise the Design Plan seed catalog.
   * @param provider - registered provider route.
   * @returns the seed rows projected for this route, in display order.
   */
  async listModels(provider) {
    return listSeedModels(provider);
  }
  /**
   * Resolve metadata for one exact model.
   *
   * Routing accepts ids outside the seed catalog, so an unknown id resolves to
   * itself instead of failing; the catalog stays advisory.
   * @param provider - registered provider route.
   * @param model - exact model id from the request.
   * @param _signal - cancellation for this lookup; the seed needs none.
   * @returns provider/model identity plus any seed-declared modalities.
   */
  async resolveModel(provider, model, _signal) {
    const row = seedModel(model);
    if (row === void 0) return { provider, id: model, name: model };
    return {
      provider,
      id: row.id,
      name: row.name,
      ...row.inputModalities === void 0 ? {} : { inputModalities: row.inputModalities }
    };
  }
  /**
   * Stream one Chat Completions call.
   * @param options - fully assembled request.
   * @returns the translated chunk stream.
   * @throws LlmError - classified gateway failure, missing credential, or an
   * empty response.
   */
  async *stream(options) {
    const config = this.#options.config();
    const candidates = config.autoSwitch ? accountsOf(config).map((account) => account.apiKeyEnv) : [config.apiKeyEnv];
    let lastFailure;
    for (const ref of candidates) {
      const apiKey = await this.#apiKey(ref);
      const response = await dispatch(options, config, apiKey);
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
async function dispatch(options, config, apiKey) {
  const baseURL = config.baseURL.replace(/\/+$/u, "");
  if (baseURL === "") throw new LlmError3("OpenDesign: baseURL is not configured", GATEWAY_CODES.invalidRequest);
  const body = {
    model: options.model,
    messages: toChatMessages(options),
    stream: true,
    stream_options: { include_usage: true }
  };
  const tools = toChatTools(options);
  if (tools !== void 0) body.tools = tools;
  if (options.temperature !== void 0) body.temperature = options.temperature;
  if (options.maxTokens !== void 0) body.max_tokens = options.maxTokens;
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

// src/account-service.ts
import { credentialRef } from "@deepseek-ai/dsh-credentials";
var AccountService = class {
  #ctx;
  #config;
  /**
   * @param ctx - host context carrying `credentials` and `settings`.
   * @param config - reads the current resolved configuration.
   */
  constructor(ctx, config) {
    this.#ctx = ctx;
    this.#config = config;
  }
  /**
   * Execute one validated command.
   * @param command - the command from the page.
   * @returns the outcome the page displays.
   */
  async execute(command) {
    const credentials = this.#ctx.get("credentials");
    const settings = this.#ctx.get("settings");
    if (credentials === void 0 || settings === void 0 || settings.writable !== true) return "rejected";
    const current = this.#config();
    const accounts = accountsOf(current);
    try {
      if (command.kind === "add") return await this.#add(credentials, command, accounts);
      if (command.kind === "remove") return await this.#remove(credentials, command.ref, accounts);
      if (command.kind === "select") return await this.#select(command.ref, accounts);
      if (command.kind === "rename") return await this.#rename(command.ref, command.name, accounts);
      if (command.kind === "replace-key") {
        await credentials.set(credentialRef(command.ref), command.key);
        return "applied";
      }
      return await this.#writeAccounts(accounts, current.apiKeyEnv, { autoSwitch: command.value });
    } catch (error) {
      this.#ctx.logger.warn(`llm-opendesign-go: account command failed (${String(error)})`);
      return "unknown";
    }
  }
  /**
   * Store a key and add the account row.
   * @param credentials - credential seam.
   * @param command - the add command.
   * @param accounts - current accounts.
   * @returns the outcome.
   */
  async #add(credentials, command, accounts) {
    if (accounts.some((account2) => account2.id === command.id)) return "applied";
    if (accounts.length >= MAX_ACCOUNTS) return "rejected";
    const used = new Set(accounts.map((account2) => account2.apiKeyEnv));
    let index = 0;
    while (used.has(deriveAccountRef(index))) index += 1;
    const ref = deriveAccountRef(index);
    await credentials.set(credentialRef(ref), command.key);
    const account = {
      id: command.id,
      name: command.name,
      apiKeyEnv: ref,
      ...command.workspaceId === void 0 ? {} : { workspaceId: command.workspaceId }
    };
    return await this.#writeAccounts([...accounts, account], this.#config().apiKeyEnv || ref);
  }
  /**
   * Remove an account row and its key.
   * @param credentials - credential seam.
   * @param ref - credential reference to drop.
   * @param accounts - current accounts.
   * @returns the outcome.
   */
  async #remove(credentials, ref, accounts) {
    const next = accounts.filter((account) => account.apiKeyEnv !== ref);
    if (next.length === 0) return "rejected";
    const selected = next[0];
    if (selected === void 0) return "rejected";
    const result = await this.#writeAccounts(next, selected.apiKeyEnv);
    if (result !== "applied") return result;
    const info = await credentials.describe(credentialRef(ref));
    if (info.writable) await credentials.unset(credentialRef(ref));
    return "applied";
  }
  /**
   * Promote one account by reordering, which is what selection means here.
   * @param ref - reference to promote.
   * @param accounts - current accounts.
   * @returns the outcome.
   */
  async #select(ref, accounts) {
    if (!accounts.some((account) => account.apiKeyEnv === ref)) return "rejected";
    return await this.#writeAccounts(accounts, ref);
  }
  /**
   * Rename one account.
   * @param ref - reference to rename.
   * @param name - new display name.
   * @param accounts - current accounts.
   * @returns the outcome.
   */
  async #rename(ref, name2, accounts) {
    if (!accounts.some((account) => account.apiKeyEnv === ref)) return "rejected";
    return await this.#writeAccounts(
      accounts.map((account) => account.apiKeyEnv === ref ? { ...account, name: name2 } : account),
      this.#config().apiKeyEnv || ref
    );
  }
  /**
   * Persist the account list and selection.
   * @param accounts - next list.
   * @param selectedRef - reference that becomes active.
   * @param extra - additional fields to write in the same mutation.
   * @returns the outcome.
   */
  async #writeAccounts(accounts, selectedRef, extra = {}) {
    const settings = this.#ctx.get("settings");
    if (settings === void 0) return "rejected";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = settings.describe().find((candidate) => candidate.ns === PROFILE_ENTRY_ID);
      if (row === void 0) return "rejected";
      try {
        await settings.update(PROFILE_ENTRY_ID, {
          accounts: accounts.map((account) => ({ ...account })),
          apiKeyEnv: selectedRef,
          ...extra
        }, row.revision);
        return "applied";
      } catch (error) {
        if (attempt === 2) {
          this.#ctx.logger.warn(`llm-opendesign-go: could not persist accounts (${String(error)})`);
          return "unknown";
        }
      }
    }
    return "unknown";
  }
  /**
   * Report whether each account's key is stored, without reading any value.
   * @param refs - references to check.
   * @returns configured state per reference.
   */
  async describeKeys(refs) {
    const credentials = this.#ctx.get("credentials");
    if (credentials === void 0) return {};
    const out = {};
    for (const ref of refs) {
      try {
        out[ref] = (await credentials.describe(credentialRef(ref))).configured;
      } catch {
        out[ref] = false;
      }
    }
    return out;
  }
};

// src/account-command.ts
var REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
function parseAccountCommand(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("\u8D26\u53F7\u547D\u4EE4\u683C\u5F0F\u65E0\u6548");
  }
  const row = value;
  const kind = row.kind;
  if (kind === "add") {
    if (typeof row.id !== "string" || row.id.length === 0 || row.id.length > 128) {
      throw new Error("\u8D26\u53F7 id \u65E0\u6548");
    }
    if (typeof row.name !== "string" || row.name.trim().length === 0 || row.name.length > 80) {
      throw new Error("\u8D26\u53F7\u540D\u79F0\u65E0\u6548");
    }
    if (typeof row.key !== "string" || row.key.trim().length === 0) {
      throw new Error("\u7F3A\u5C11 API Key");
    }
    if (row.workspaceId !== void 0 && (typeof row.workspaceId !== "string" || row.workspaceId.trim().length === 0)) {
      throw new Error("\u5DE5\u4F5C\u7A7A\u95F4 ID \u65E0\u6548");
    }
    return {
      kind,
      id: row.id,
      name: row.name.trim(),
      key: row.key.trim(),
      ...row.workspaceId === void 0 ? {} : { workspaceId: row.workspaceId }
    };
  }
  if (kind === "remove" || kind === "select") {
    if (typeof row.ref !== "string" || !REF_PATTERN.test(row.ref)) throw new Error("\u8D26\u53F7\u5F15\u7528\u65E0\u6548");
    return { kind, ref: row.ref };
  }
  if (kind === "rename") {
    if (typeof row.ref !== "string" || !REF_PATTERN.test(row.ref)) throw new Error("\u8D26\u53F7\u5F15\u7528\u65E0\u6548");
    if (typeof row.name !== "string" || row.name.trim().length === 0 || row.name.length > 80) {
      throw new Error("\u8D26\u53F7\u540D\u79F0\u65E0\u6548");
    }
    return { kind, ref: row.ref, name: row.name.trim() };
  }
  if (kind === "replace-key") {
    if (typeof row.ref !== "string" || !REF_PATTERN.test(row.ref)) throw new Error("\u8D26\u53F7\u5F15\u7528\u65E0\u6548");
    if (typeof row.key !== "string" || row.key.trim().length === 0) throw new Error("\u7F3A\u5C11 API Key");
    return { kind, ref: row.ref, key: row.key.trim() };
  }
  if (kind === "auto-switch") {
    if (typeof row.value !== "boolean") throw new Error("\u81EA\u52A8\u5207\u6362\u53D6\u503C\u65E0\u6548");
    return { kind, value: row.value };
  }
  throw new Error("\u672A\u77E5\u7684\u8D26\u53F7\u547D\u4EE4");
}
function parseCommandResult(value) {
  if (value === "applied" || value === "rejected" || value === "unknown") return value;
  throw new Error("\u8D26\u53F7\u547D\u4EE4\u7ED3\u679C\u65E0\u6548");
}

// src/remote-contract.ts
var ACCOUNTS_NAMESPACE = "openDesignGoAccounts";
var REMOTE_PACKAGE = "dsh-opendesign-go";
var commandCodec = {
  mode: "strict",
  typeSymbol: "dsh-opendesign-go#AccountCommand",
  schema: { parse: parseAccountCommand },
  create: () => ({ parse: parseAccountCommand })
};
var resultCodec = {
  mode: "strict",
  typeSymbol: "dsh-opendesign-go#AccountCommandResult",
  schema: { parse: parseCommandResult },
  create: () => ({ parse: parseCommandResult })
};
var accountsRemote = {
  package: REMOTE_PACKAGE,
  descriptors: [{
    id: `${REMOTE_PACKAGE}#${ACCOUNTS_NAMESPACE}/execute`,
    service: ACCOUNTS_NAMESPACE,
    namespace: ACCOUNTS_NAMESPACE,
    method: "execute",
    invocation: { kind: "direct" },
    parameters: [{ name: "command", wire: "command", source: "json", codec: commandCodec }],
    result: resultCodec
  }]
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

// src/index.ts
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";

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
  const settings = ctx.get("settings");
  if (settings === void 0 || typeof settings.update !== "function" || typeof settings.describe !== "function" || settings.writable !== true) return void 0;
  return async (field, json) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = settings.describe().find((candidate) => candidate.ns === PROFILE_ENTRY_ID);
      if (row === void 0) return;
      try {
        await settings.update(PROFILE_ENTRY_ID, { [field]: json }, row.revision);
        return;
      } catch (error) {
        if (attempt === 2) {
          ctx.logger.warn(`llm-opendesign-go: could not cache ${field} (${String(error)})`);
        }
      }
    }
  };
}

// src/usage.ts
import { credentialRef as credentialRef2 } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";

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
function percentUsedOf(usedCredits, limitCredits) {
  const used = creditsToNumber(usedCredits);
  const limit = creditsToNumber(limitCredits);
  if (used === null || limit === null || limit <= 0) return null;
  return Math.min(100, Math.max(0, Math.round(used / limit * 100)));
}

// src/usage.ts
var CONSOLE_BASE_URL = "https://amr-api.open-design.ai/api/v1";
var DEFAULT_SESSION_REF = "OPENDESIGN_SESSION";
function stringOf(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function windowOf(raw, asOf) {
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
    const windows = Array.isArray(payload.windows) ? payload.windows.map((row) => windowOf(row, asOf)).filter((row) => row !== void 0) : [];
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
    const hit = credentials !== void 0 ? (await credentials.resolve(credentialRef2(DEFAULT_SESSION_REF)))?.value : launchEnvironmentOf(ctx).get(DEFAULT_SESSION_REF)?.value;
    return hit === void 0 || hit.length === 0 ? void 0 : hit.trim();
  };
}

// src/index.ts
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
    if (write === void 0) return;
    const snapshot = await usage.read();
    await write("usageJson", JSON.stringify(snapshot));
    ctx.logger.info(`llm-opendesign-go: quota ${usage.describe(snapshot)}`);
  };
  const refreshIfConfigured = () => {
    const config2 = current();
    if (config2.sessionRef.length === 0) return;
    if (config2.workspaceId.length === 0 && !config2.accounts?.some((row) => row.workspaceId)) return;
    void refreshUsage().catch((error) => {
      ctx.logger.warn(`llm-opendesign-go: quota refresh failed (${String(error)})`);
    });
  };
  refreshIfConfigured();
  let lastUsageKey = `${current().sessionRef}|${current().workspaceId}`;
  ctx.effect(() => {
    const timer = setInterval(() => {
      const config2 = current();
      const key = `${config2.sessionRef}|${config2.workspaceId}`;
      if (key === lastUsageKey) return;
      lastUsageKey = key;
      refreshIfConfigured();
    }, 5e3);
    return () => {
      clearInterval(timer);
    };
  });
  const accounts = new AccountService(ctx, current);
  ctx.provide(ACCOUNTS_NAMESPACE);
  ctx.set(ACCOUNTS_NAMESPACE, accounts);
  ctx.inject(["typert"], (scope) => {
    scope.effect(() => scope.typert.remotes.register(accountsRemote));
  });
  const ledger = new LedgerStore(LedgerStore.pathIn(resolveDshHome()));
  let pendingReport;
  const publishReport = () => {
    if (pendingReport !== void 0) return;
    pendingReport = setTimeout(() => {
      pendingReport = void 0;
      const write = fieldWriterOf(ctx);
      if (write === void 0) return;
      const now = Date.now();
      const report = summarize(ledger.all(), now - REPORT_WINDOW_MS, now);
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
    const hit = credentials !== void 0 ? (await credentials.resolve(credentialRef3(ref)))?.value : launchEnvironmentOf2(ctx).get(ref)?.value;
    if (hit === void 0 || hit.length === 0) return void 0;
    return assertUsableApiKey2(hit, name, ref);
  };
  let registration;
  let routeCheck = 0;
  const adapter = new OpenDesignAdapter({
    config: current,
    resolveApiKey,
    onAccountSettled: (ref) => {
      const config2 = current();
      if (config2.apiKeyEnv === ref) return;
      ctx.logger.info(`llm-opendesign-go: account settled on ${ref}`);
    },
    onUsage: recordUsage
  });
  const applyRoute = (configured) => {
    const enabled = current().enabled;
    if (configured && enabled && registration === void 0) {
      try {
        registration = ctx.llm.registerAdapter([PROVIDER_ID], adapter);
        ctx.logger.info(`llm-opendesign-go: route "${PROVIDER_ID}" registered as ${DISPLAY_NAME}`);
      } catch (error) {
        ctx.logger.error(`llm-opendesign-go: not registering "${PROVIDER_ID}" (${String(error)})`);
      }
      return;
    }
    if ((!configured || !enabled) && registration !== void 0) {
      registration();
      registration = void 0;
      if (!enabled) ctx.logger.info("llm-opendesign-go: disabled by configuration; the route is withdrawn");
    }
  };
  const syncRoute = () => {
    const check = ++routeCheck;
    const config2 = current();
    const refs = config2.autoSwitch ? accountsOf(config2).map((account) => account.apiKeyEnv) : [config2.apiKeyEnv];
    const anyRef = refs[0] ?? config2.apiKeyEnv;
    void resolveApiKey(anyRef).then((key) => {
      if (check !== routeCheck) return;
      applyRoute(key !== void 0);
    }).catch((error) => {
      if (check !== routeCheck) return;
      if (error instanceof LlmError4 && error.code === "INVALID_CREDENTIAL") {
        ctx.logger.error(`llm-opendesign-go: ${error.message}`);
        applyRoute(false);
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
    credentialsCtx.on("credentials/reference-updated", (ref) => {
      if (ref === current().apiKeyEnv) syncRoute();
    });
    syncRoute();
  });
  syncRoute();
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
