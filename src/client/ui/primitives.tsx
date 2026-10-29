/**
 * The primitives every card is built from: card, field row, badge, switch,
 * button, progress bar.
 *
 * They exist so the page reads as one system instead of six independently
 * styled boxes: spacing, radius, border weight and type scale are decided once
 * here. Each primitive is a plain function component with no state, so a card
 * can compose them without inheriting behaviour.
 *
 * @module dsh-opendesign-go/client/ui/primitives
 */
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import styles from './primitives.module.css'

/** Join class names, dropping the falsy ones. */
export function cx(...names: (string | false | undefined)[]): string {
  return names.filter((name): name is string => typeof name === 'string' && name.length > 0).join(' ')
}

/** Semantic colour of a badge or a bar. */
export type Tone = 'neutral' | 'ok' | 'warn' | 'stop'

const badgeTone: Readonly<Record<Tone, string>> = {
  neutral: styles.badgeNeutral ?? '',
  ok: styles.badgeOk ?? '',
  warn: styles.badgeWarn ?? '',
  stop: styles.badgeStop ?? '',
}

/**
 * One titled block of related settings.
 * @param props - header content plus the body.
 * @returns the card.
 */
export function Card({ title, description, badge, actions, children, columns }: {
  readonly title: ReactNode
  readonly description?: ReactNode | undefined
  readonly badge?: ReactNode | undefined
  readonly actions?: ReactNode | undefined
  readonly children?: ReactNode | undefined
  /** Two-column body for label/control pairs that need an aligned gutter. */
  readonly columns?: boolean | undefined
}): ReactElement {
  return (
    <section className={styles.card}>
      <header className={styles.cardHead}>
        <div className={styles.cardHeading}>
          <h2 className={styles.cardTitle}>{title}</h2>
          {badge !== undefined && <span className={styles.cardBadge}>{badge}</span>}
        </div>
        {actions !== undefined && <div className={styles.cardActions}>{actions}</div>}
        {description !== undefined && <p className={styles.cardDesc}>{description}</p>}
      </header>
      {children !== undefined && (
        <div className={cx(styles.cardBody, columns === true && styles.cardBodyColumns)}>{children}</div>
      )}
    </section>
  )
}

/**
 * A label (with its explanation) beside one control.
 * @param props - the row's two halves.
 * @returns the row.
 */
export function Row({ label, hint, children, htmlFor, align }: {
  readonly label: ReactNode
  readonly hint?: ReactNode | undefined
  readonly children?: ReactNode | undefined
  readonly htmlFor?: string | undefined
  /** `top` keeps a tall control (a list, a textarea) optically aligned. */
  readonly align?: 'center' | 'top' | undefined
}): ReactElement {
  const heading = (
    <div className={styles.rowText}>
      <div className={styles.rowLabel}>{label}</div>
      {hint !== undefined && <p className={styles.rowHint}>{hint}</p>}
    </div>
  )
  return (
    <div className={cx(styles.row, align === 'top' && styles.rowTop)}>
      {htmlFor === undefined ? heading : <label htmlFor={htmlFor} className={styles.rowLabelWrap}>{heading}</label>}
      {children !== undefined && <div className={styles.rowControl}>{children}</div>}
    </div>
  )
}

/**
 * A short status word with a tinted background.
 * @param props - the tone and the text.
 * @returns the badge.
 */
export function Badge({ tone = 'neutral', children }: {
  readonly tone?: Tone | undefined
  readonly children: ReactNode
}): ReactElement {
  return <span className={cx(styles.badge, badgeTone[tone])}>{children}</span>
}

/**
 * Secondary prose under a heading.
 * @param props - the sentence.
 * @returns the paragraph.
 */
export function Hint({ children }: { readonly children: ReactNode }): ReactElement {
  return <p className={styles.hint}>{children}</p>
}

/**
 * A hairline between two groups inside one card.
 * @returns the separator.
 */
export function Divider(): ReactElement {
  return <div className={styles.divider} role="presentation" />
}

/**
 * An on/off control that reads as a switch rather than a checkbox.
 *
 * `role="switch"` keeps the state announced correctly for a screen reader and
 * for keyboard use, both of which a styled `<span>` on top of a hidden checkbox
 * tends to lose.
 * @param props - the current value and the writer.
 * @returns the switch.
 */
export function Switch({ checked, onChange, label, disabled }: {
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
  readonly label: string
  readonly disabled?: boolean | undefined
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled === true}
      className={cx(styles.switch, checked && styles.switchOn)}
      onClick={() => { onChange(!checked) }}
    >
      <span className={styles.switchThumb} />
    </button>
  )
}

/**
 * A button in one of the two weights the page uses.
 * @param props - text, handler and weight.
 * @returns the button.
 */
export function Button({ children, onClick, variant = 'ghost', disabled, title, type = 'button' }: {
  readonly children: ReactNode
  readonly onClick?: (() => void) | undefined
  readonly variant?: 'ghost' | 'primary' | 'danger' | undefined
  readonly disabled?: boolean | undefined
  readonly title?: string | undefined
  readonly type?: 'button' | 'submit' | undefined
}): ReactElement {
  const weight = variant === 'primary'
    ? styles.btnPrimary
    : variant === 'danger' ? styles.btnDanger : styles.btnGhost
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled === true}
      title={title}
      className={cx(styles.btn, weight)}
    >
      {children}
    </button>
  )
}

/**
 * A quota bar, filled with what is left.
 * @param props - percentage, colour and the accessible name.
 * @returns the bar.
 */
export function Bar({ percent, color, label }: {
  readonly percent: number
  readonly color: string
  readonly label: string
}): ReactElement {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div
      className={styles.bar}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={styles.barFill} style={{ width: `${clamped}%`, background: color }} />
    </div>
  )
}

/**
 * A number with its caption, for the figures a card leads with.
 * @param props - value, caption and optional tone.
 * @returns the figure.
 */
export function Stat({ label, value, hint, tone }: {
  readonly label: ReactNode
  readonly value: ReactNode
  readonly hint?: ReactNode | undefined
  readonly tone?: Tone | undefined
}): ReactElement {
  const color = tone === undefined || tone === 'neutral'
    ? undefined
    : tone === 'ok' ? 'var(--ods-ok)' : tone === 'warn' ? 'var(--ods-warn)' : 'var(--ods-stop)'
  const style: CSSProperties | undefined = color === undefined ? undefined : { color }
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} style={style}>{value}</div>
      {hint !== undefined && <div className={styles.statHint}>{hint}</div>}
    </div>
  )
}

/**
 * A single-line text field with its caption above it.
 *
 * The page has a handful of fields (account name, key, workspace id) and no
 * other input surface, so one stacked field keeps every form the same shape.
 * @param props - caption, current value, change handler and input type.
 * @returns the field.
 */
export function Field({ label, hint, children }: {
  readonly label: ReactNode
  readonly hint?: ReactNode | undefined
  readonly children: ReactNode
}): ReactElement {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {hint !== undefined && <span className={styles.fieldHint}>{hint}</span>}
    </label>
  )
}

/**
 * The text input every field uses.
 * @param props - value, change handler, placeholder and input type.
 * @returns the input.
 */
export function Input({ value, onChange, placeholder, type = 'text' }: {
  readonly value: string
  readonly onChange: (next: string) => void
  readonly placeholder?: string | undefined
  readonly type?: 'text' | 'password' | 'number' | undefined
}): ReactElement {
  return (
    <input
      className={styles.input}
      type={type}
      value={value}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => { onChange(event.target.value) }}
    />
  )
}
