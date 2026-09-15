import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Действие выполняется: кнопка заблокирована и показывает ожидание. */
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

/** Единственная реализация кнопки с занятостью — защита от двойного нажатия видна и в UI. */
export function Button({
  busy = false,
  variant = 'primary',
  disabled,
  children,
  type = 'button',
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`button button--${variant} ${className}`.trim()}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
