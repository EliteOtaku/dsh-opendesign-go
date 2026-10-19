import { Context } from '@deepseek-ai/cordis'
import * as plug from './lib/index.js'

// 用最小 stub 验证 registerAdapter 是否被调用、是否成功
const registered = []
const ctx = new Context()
ctx.provide('llm')
ctx.set('llm', {
  registerAdapter(ids, adapter) {
    registered.push({ ids, hasListModels: typeof adapter.listModels === 'function' })
    return () => {}
  },
})
ctx.provide('credentials')
ctx.set('credentials', {
  async resolve(ref) { return undefined },
  async describe(ref) { return { configured: false, writable: true } },
  async set() {}, async unset() {},
  on() { return () => {} },
})
try {
  plug.apply(ctx)
  await new Promise((r) => setTimeout(r, 300))
  console.log('apply OK')
  console.log('registered:', JSON.stringify(registered))
} catch (e) {
  console.log('apply THREW:', e.message)
}
