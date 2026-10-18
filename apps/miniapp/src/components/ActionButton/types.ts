export interface ActionButtonProps {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'link';
  onClick: () => void;
}
