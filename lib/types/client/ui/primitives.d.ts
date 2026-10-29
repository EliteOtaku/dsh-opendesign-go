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
import type { ReactElement, ReactNode } from 'react';
/** Join class names, dropping the falsy ones. */
export declare function cx(...names: (string | false | undefined)[]): string;
/** Semantic colour of a badge or a bar. */
export type Tone = 'neutral' | 'ok' | 'warn' | 'stop';
/**
 * One titled block of related settings.
 * @param props - header content plus the body.
 * @returns the card.
 */
export declare function Card({ title, description, badge, actions, children, columns }: {
    readonly title: ReactNode;
    readonly description?: ReactNode | undefined;
    readonly badge?: ReactNode | undefined;
    readonly actions?: ReactNode | undefined;
    readonly children?: ReactNode | undefined;
    /** Two-column body for label/control pairs that need an aligned gutter. */
    readonly columns?: boolean | undefined;
}): ReactElement;
/**
 * A label (with its explanation) beside one control.
 * @param props - the row's two halves.
 * @returns the row.
 */
export declare function Row({ label, hint, children, htmlFor, align }: {
    readonly label: ReactNode;
    readonly hint?: ReactNode | undefined;
    readonly children?: ReactNode | undefined;
    readonly htmlFor?: string | undefined;
    /** `top` keeps a tall control (a list, a textarea) optically aligned. */
    readonly align?: 'center' | 'top' | undefined;
}): ReactElement;
/**
 * A short status word with a tinted background.
 * @param props - the tone and the text.
 * @returns the badge.
 */
export declare function Badge({ tone, children }: {
    readonly tone?: Tone | undefined;
    readonly children: ReactNode;
}): ReactElement;
/**
 * Secondary prose under a heading.
 * @param props - the sentence.
 * @returns the paragraph.
 */
export declare function Hint({ children }: {
    readonly children: ReactNode;
}): ReactElement;
/**
 * A hairline between two groups inside one card.
 * @returns the separator.
 */
export declare function Divider(): ReactElement;
/**
 * An on/off control that reads as a switch rather than a checkbox.
 *
 * `role="switch"` keeps the state announced correctly for a screen reader and
 * for keyboard use, both of which a styled `<span>` on top of a hidden checkbox
 * tends to lose.
 * @param props - the current value and the writer.
 * @returns the switch.
 */
export declare function Switch({ checked, onChange, label, disabled }: {
    readonly checked: boolean;
    readonly onChange: (next: boolean) => void;
    readonly label: string;
    readonly disabled?: boolean | undefined;
}): ReactElement;
/**
 * A button in one of the two weights the page uses.
 * @param props - text, handler and weight.
 * @returns the button.
 */
export declare function Button({ children, onClick, variant, disabled, title, type }: {
    readonly children: ReactNode;
    readonly onClick?: (() => void) | undefined;
    readonly variant?: 'ghost' | 'primary' | 'danger' | undefined;
    readonly disabled?: boolean | undefined;
    readonly title?: string | undefined;
    readonly type?: 'button' | 'submit' | undefined;
}): ReactElement;
/**
 * A quota bar, filled with what is left.
 * @param props - percentage, colour and the accessible name.
 * @returns the bar.
 */
export declare function Bar({ percent, color, label }: {
    readonly percent: number;
    readonly color: string;
    readonly label: string;
}): ReactElement;
/**
 * A number with its caption, for the figures a card leads with.
 * @param props - value, caption and optional tone.
 * @returns the figure.
 */
export declare function Stat({ label, value, hint, tone }: {
    readonly label: ReactNode;
    readonly value: ReactNode;
    readonly hint?: ReactNode | undefined;
    readonly tone?: Tone | undefined;
}): ReactElement;
/**
 * A single-line text field with its caption above it.
 *
 * The page has a handful of fields (account name, key, workspace id) and no
 * other input surface, so one stacked field keeps every form the same shape.
 * @param props - caption, current value, change handler and input type.
 * @returns the field.
 */
export declare function Field({ label, hint, children }: {
    readonly label: ReactNode;
    readonly hint?: ReactNode | undefined;
    readonly children: ReactNode;
}): ReactElement;
/**
 * The text input every field uses.
 * @param props - value, change handler, placeholder and input type.
 * @returns the input.
 */
export declare function Input({ value, onChange, placeholder, type }: {
    readonly value: string;
    readonly onChange: (next: string) => void;
    readonly placeholder?: string | undefined;
    readonly type?: 'text' | 'password' | 'number' | undefined;
}): ReactElement;
