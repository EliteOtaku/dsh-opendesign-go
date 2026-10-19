/**
 * The one Remote contribution this plugin publishes, shared by both faces.
 *
 * One method only: `execute(command)`. Everything the page needs to change an
 * account — including storing a key — goes through it, so there is a single
 * validated write path and no second way for a secret to travel.
 *
 * @module dsh-opendesign-go/remote-contract
 */
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { parseAccountCommand, parseCommandResult } from './account-command.ts'

/** Namespace the page calls: `ctx.remote.openDesignGoAccounts.execute(...)`. */
export const ACCOUNTS_NAMESPACE = 'openDesignGoAccounts'

/** Stable package identity owning these methods. */
export const REMOTE_PACKAGE = 'dsh-opendesign-go'

/** Codec for the command argument. */
const commandCodec = {
  mode: 'strict' as const,
  typeSymbol: 'dsh-opendesign-go#AccountCommand',
  schema: { parse: parseAccountCommand },
  create: () => ({ parse: parseAccountCommand }),
}

/** Codec for the result value. */
const resultCodec = {
  mode: 'strict' as const,
  typeSymbol: 'dsh-opendesign-go#AccountCommandResult',
  schema: { parse: parseCommandResult },
  create: () => ({ parse: parseCommandResult }),
}

/**
 * Declare the Remote method both faces agree on.
 *
 * `invocation.kind: 'direct'` means the Host resolves the owning service by the
 * key below; the page never names an implementation.
 */
export const accountsRemote: TypertRemoteContribution = {
  package: REMOTE_PACKAGE,
  descriptors: [{
    id: `${REMOTE_PACKAGE}#${ACCOUNTS_NAMESPACE}/execute`,
    service: ACCOUNTS_NAMESPACE,
    namespace: ACCOUNTS_NAMESPACE,
    method: 'execute',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'command', wire: 'command', source: 'json', codec: commandCodec }],
    result: resultCodec,
  }],
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    /** Account mutations, including the one write that carries a secret. */
    openDesignGoAccounts: {
      execute(command: unknown): Promise<{ readonly ok: true, readonly value: string } | { readonly ok: false, readonly error: unknown }>
    }
  }
}
