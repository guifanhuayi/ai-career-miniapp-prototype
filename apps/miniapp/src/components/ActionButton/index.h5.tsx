import type { ActionButtonProps } from './types';

// H5 test carrier needs native keyboard and accessibility semantics. WeChat uses Taro Button.
export default function ActionButton(props: ActionButtonProps) {
  return (
    <button
      type="button"
      className={`primary ${props.variant ?? ''}`}
      aria-label={props.label}
      aria-busy={props.loading}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.loading ? `${props.label}…` : props.label}
    </button>
  );
}
