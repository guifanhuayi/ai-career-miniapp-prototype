import type { ReactNode } from 'react';
export interface ChoiceProps {
  label: string;
  children: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
}
