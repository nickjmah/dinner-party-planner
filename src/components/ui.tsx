import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';

export function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft' }) {
  return <button className={`button button-${variant} ${className}`} {...props} />;
}

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card({ className = '', ...props }, ref) {
  return <div ref={ref} className={`card ${className}`} {...props} />;
});

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{children}</p></div>;
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading-state"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-state"><AlertCircle /><div><strong>Something went wrong</strong><p>{message}</p>{retry && <Button variant="soft" onClick={retry}>Try again</Button>}</div></div>;
}

export function SaveState({ pending, saved }: { pending: boolean; saved?: boolean }) {
  return <span className="save-state" aria-live="polite">{pending ? <><LoaderCircle className="spin" size={14} />Saving…</> : saved ? <><CheckCircle2 size={14} />Saved</> : null}</span>;
}
