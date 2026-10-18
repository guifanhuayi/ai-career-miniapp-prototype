import type { ChoiceProps } from './types';
export default function Choice(props: ChoiceProps) {
  return (
    <button
      type="button"
      className={`${props.className ?? 'choice'}${props.selected ? ' selected' : ''}`}
      aria-label={props.label}
      aria-pressed={props.selected}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
