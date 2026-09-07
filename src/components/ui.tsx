import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from 'react';

/* ----------------------------- Sheet ----------------------------- */

interface SheetProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ open, title, onClose, children }: SheetProps) {
  // Blokada scrollowania tła, inaczej iOS przewija stronę pod arkuszem.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="sheet-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grabber" />
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/* ----------------------------- Toast ----------------------------- */

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  const show = useCallback((text: string) => {
    setMessage(text);
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2600);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <div className="toast" role="status" aria-live="polite">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* -------------------------- Segmented ---------------------------- */

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------- Field ----------------------------- */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="tiny dim">{hint}</span>}
    </label>
  );
}

/** Wiersz ustawienia z liczbą i przyciskami −/+ — wygodniejsze niż klawiatura. */
interface StepperRowProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  hint?: string;
}

export function StepperRow({
  label, value, onChange, step = 1, min = 0, max = 999, suffix, hint,
}: StepperRowProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="stack-sm">
      <div className="row-between">
        <span className="grow">{label}</span>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onChange(clamp(value - step))}
            aria-label={`Zmniejsz: ${label}`}
          >
            −
          </button>
          <span className="mono strong" style={{ minWidth: 62, textAlign: 'center' }}>
            {value}{suffix ? ` ${suffix}` : ''}
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onChange(clamp(value + step))}
            aria-label={`Zwiększ: ${label}`}
          >
            +
          </button>
        </div>
      </div>
      {hint && <span className="tiny dim">{hint}</span>}
    </div>
  );
}

/* ------------------------ ConfirmButton -------------------------- */

/** Akcje nieodwracalne wymagają dwóch kliknięć — na telefonie łatwo o pomyłkę. */
export function ConfirmButton({
  label, confirmLabel, onConfirm, className = 'btn btn-danger',
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (armed) {
          onConfirm();
          setArmed(false);
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

/* --------------------------- EmptyState -------------------------- */

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">{icon}</span>
      <div className="strong" style={{ color: 'var(--text-2)' }}>{title}</div>
      {hint && <div style={{ marginTop: 6 }}>{hint}</div>}
    </div>
  );
}
