import { Clock } from 'lucide-react';

interface SideControlsProps {
  onClaimTimeout?: () => void;
  showTimeout?: boolean;
}

export function SideControls({ onClaimTimeout, showTimeout }: SideControlsProps) {
  if (!showTimeout) return null;
  return (
    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
      <button
        onClick={onClaimTimeout}
        className="w-8 h-8 rounded-full bg-card/80 border border-border/50 backdrop-blur flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
        title="Claim timeout"
      >
        <Clock size={14} />
      </button>
    </div>
  );
}
