interface FloatingActionProps {
  children: React.ReactNode;
  visible: boolean;
}

export function FloatingAction({ children, visible }: FloatingActionProps) {
  if (!visible) return null;
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 w-full max-w-[400px] z-[60] px-3 animate-slide-up"
      style={{ bottom: 'calc(var(--nav-h, 56px) + 4px)' }}
    >
      <div className="rounded-2xl bg-card/95 border border-primary/20 backdrop-blur-xl p-2 shadow-[0_0_20px_oklch(0.715_0.143_215.221/0.15)]">
        {children}
      </div>
    </div>
  );
}
