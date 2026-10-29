/**
 * Ambient types for the client's CSS modules.
 *
 * The build compiles each `*.module.css` into JavaScript (see
 * `scripts/css-modules.mjs`) and default-exports the hashed class-name map, so
 * every key is a string at runtime and an unknown key is a programming error the
 * type system cannot see. `Key` stays a string; the value is what components
 * pass to `className`.
 *
 * @module dsh-opendesign-go/client/css-modules
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
