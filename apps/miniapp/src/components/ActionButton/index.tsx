import { Button } from '@tarojs/components';
import type { ActionButtonProps } from './types';

export default function ActionButton(props: ActionButtonProps) {
  return (
    <Button
      className={`primary ${props.variant ?? ''}`}
      ariaRole="button"
      ariaLabel={props.label}
      loading={props.loading}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  );
}
