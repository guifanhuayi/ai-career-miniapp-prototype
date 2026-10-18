import { Button } from '@tarojs/components';
import type { ChoiceProps } from './types';
export default function Choice(props: ChoiceProps) {
  return (
    <Button
      className={`${props.className ?? 'choice'}${props.selected ? ' selected' : ''}`}
      ariaLabel={props.label}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}
