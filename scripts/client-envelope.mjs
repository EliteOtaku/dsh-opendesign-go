/**
 * Wrap a CommonJS client bundle in the DSH client module-loader envelope.
 *
 * DSH injects client plugins as ordinary scripts (`dsh-app://app/plugins/??…`),
 * not as ES modules, so a top-level `import` fails with
 * `Cannot use import statement outside a module` and takes the whole web boot
 * down. The shell instead provides `window.__ModuleLoader__.load({ id, factory })`
 * and hands the factory a `require` that resolves host-supplied dependencies
 * (`react`, `@deepseek-ai/*`). esbuild's `cjs` output already speaks that
 * `require`/`exports` protocol, so this wrapper is the whole adaptation.
 *
 * @module scripts/client-envelope
 */

/**
 * Build the envelope around a CJS body.
 * @param id - module id the loader registers, matching the package name.
 * @param cjs - CommonJS source produced by esbuild.
 * @returns a self-contained script that registers the module.
 */
export function wrapClientModule(id, cjs) {
  return `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\n`
    + 'var module = { exports: {} }; var exports = module.exports;\n'
    + `${cjs}\n`
    + 'return module.exports; } });\n'
}
