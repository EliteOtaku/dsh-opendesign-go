/**
 * Compile `*.module.css` imports into JavaScript for the client bundle.
 *
 * The client ships as one CommonJS file injected as a plain `<script>`, so it
 * cannot link a stylesheet the way a bundled web app can. This plugin turns each
 * CSS module into a JavaScript module that (a) injects its compiled CSS into the
 * document exactly once and (b) default-exports the hashed class-name map, which
 * is what `import css from './X.module.css'` expects.
 *
 * Hashing comes from lightningcss's own CSS Modules implementation, so two
 * components can both call a class `.row` without colliding — the same guarantee
 * the host's own CSS modules rely on.
 *
 * @module scripts/css-modules
 */
import { readFileSync } from 'node:fs'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { transform } from 'lightningcss'

/**
 * Build the esbuild plugin.
 * @param options - `root` anchors the injected ids, `pkg` labels the style tag.
 * @returns an esbuild plugin object.
 */
export function cssModulesPlugin({ root, pkg }) {
  return {
    name: 'css-modules',
    setup(build) {
      // A CSS module is resolved to an absolute path and handed to its own
      // namespace, so esbuild's normal CSS pipeline never sees it.
      build.onResolve({ filter: /\.module\.css$/ }, (args) => ({
        path: resolve(dirname(args.importer), args.path),
        namespace: 'css-module',
      }))

      build.onLoad({ filter: /.*/, namespace: 'css-module' }, (args) => {
        const compiled = transform({
          filename: args.path,
          code: readFileSync(args.path),
          minify: true,
          cssModules: { pattern: '[hash]_[local]' },
        })
        /** `composes` chains are flattened onto the emitted class name. */
        const classes = {}
        // lightningcss returns the map in hash-table order, which differs between
        // runs. Sorting the keys keeps the bundle byte-identical across builds,
        // which is what `build.mjs --check` (and any review diff) relies on.
        for (const local of Object.keys(compiled.exports).sort()) {
          const value = compiled.exports[local]
          classes[local] = [value.name, ...value.composes].join(' ')
        }
        // The stylesheet is addressed by its own path rather than by content: two
        // files with identical rules must still be injected once each, because
        // their class names are what the components hold.
        const id = relative(root, args.path).split(sep).join('/')
        const contents = [
          `const css = ${JSON.stringify(compiled.code.toString())}`,
          `const id = ${JSON.stringify(id)}`,
          `const attr = 'data-plugin-css'`,
          `if (typeof document !== 'undefined' && document.querySelector('style[' + attr + '="' + id + '"]') === null) {`,
          `  const tag = document.createElement('style')`,
          `  tag.setAttribute('data-plugin', ${JSON.stringify(pkg)})`,
          `  tag.setAttribute(attr, id)`,
          `  tag.textContent = css`,
          `  ;(document.head || document.documentElement).appendChild(tag)`,
          `}`,
          `export default ${JSON.stringify(classes)}`,
        ].join('\n')
        return { contents, loader: 'js', resolveDir: dirname(args.path), watchFiles: [args.path] }
      })
    },
  }
}

/**
 * Guard against a basename collision making two stylesheets indistinguishable.
 *
 * Ids are relative paths, so this is only a coarse check; it exists because a
 * duplicate id would silently drop the second stylesheet at runtime.
 * @param files - absolute paths of every CSS module in the build.
 * @returns the duplicate ids, empty when all are unique.
 */
export function duplicateIds(files) {
  const names = files.map((file) => basename(file))
  return names.filter((name, index) => names.indexOf(name) !== index)
}
