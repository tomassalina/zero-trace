import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ArrowLeft,
  Github,
  Shield,
  Crosshair,
  Move,
  Trophy,
  Lock,
  Zap,
  Users,
  Clock,
} from 'lucide-react';

const REPO_URL = 'https://github.com/tomassalina/zero-trace';

const steps = [
  {
    icon: <Users size={18} />,
    title: '1. Create or Join a Room',
    desc: 'Stake XLM to create a public or private room. Share the room ID (and password for private rooms) with your opponent. Both players lock the same stake amount in the smart contract.',
  },
  {
    icon: <Shield size={18} />,
    title: '2. Commit Your Position',
    desc: "Choose a starting cell on the 6x6 grid. Your position is hashed with a random salt and committed on-chain as a zero-knowledge proof. Neither player can see the other's position. You have 3 minutes to commit or the game is cancelled with a full refund.",
  },
  {
    icon: <Crosshair size={18} />,
    title: '3. Fire Simultaneously',
    desc: "Both players choose a target cell and fire at the same time. Neither player sees the other's target until both have fired. You have 3 minutes per round to fire.",
  },
  {
    icon: <Zap size={18} />,
    title: '4. Resolve & Move',
    desc: 'The game auto-detects whether each shot was a hit or miss by comparing it to your committed position. If you survived (opponent missed), you must move to an adjacent cell. Both players move simultaneously.',
  },
  {
    icon: <Trophy size={18} />,
    title: '5. Win, Lose, or Draw',
    desc: "The game continues until a player is hit. If both players hit each other in the same round, it's a draw and both stakes are refunded. The winner takes the pot (minus protocol fee). Rematch option available.",
  },
];

const securityPoints = [
  {
    icon: <Lock size={16} />,
    title: 'Hidden Positions',
    desc: "Your position is never stored in plain text on-chain. It's committed as a Poseidon2 hash — a ZK-friendly hash function that makes it computationally impossible to reverse.",
  },
  {
    icon: <Shield size={16} />,
    title: 'Zero-Knowledge Proofs',
    desc: 'When you respond to a shot, you prove whether it was a hit or miss without revealing your actual position. The smart contract verifies the proof on-chain.',
  },
  {
    icon: <Users size={16} />,
    title: 'Simultaneous Actions',
    desc: "Both players act at the same time. No information advantage — you can't react to your opponent's move because you don't see it until both are submitted.",
  },
  {
    icon: <Clock size={16} />,
    title: 'Enforced Timeouts',
    desc: 'The smart contract enforces 3-minute action windows. If a player goes AFK, their opponent can claim a timeout win. No games stuck forever.',
  },
];

const faq = [
  {
    q: "What happens if I don't act in time?",
    a: 'Each action has a 3-minute window. If you fail to fire, respond, or move within that time, your opponent can claim a timeout win and take your entire stake.',
  },
  {
    q: 'What if both players hit each other?',
    a: "It's a draw. Both players get 100% of their stake refunded. You'll be offered a rematch.",
  },
  {
    q: "Can I see my opponent's position?",
    a: 'No. Positions are committed as zero-knowledge hashes. The only information revealed is whether a specific shot was a hit or miss, proven via ZK proofs.',
  },
  {
    q: 'What wallet do I need?',
    a: 'Any Stellar-compatible wallet works: Freighter, xBull, Lobstr, Albedo, or Hana. Connect through the button in the top-right corner.',
  },
  {
    q: 'Is this on mainnet?',
    a: 'Currently testnet only. All XLM used is testnet XLM with no real value. You can get free testnet XLM through the Fund button on the Account page.',
  },
  {
    q: 'How are stakes handled?',
    a: 'Stakes are locked in the smart contract when both players join. The winner receives 90% of the total pot (both stakes combined). The remaining 10% is a protocol fee.',
  },
  {
    q: 'What is Poseidon2?',
    a: "Poseidon2 is a hash function designed specifically for zero-knowledge proof systems. It's much more efficient inside ZK circuits than traditional hashes like SHA-256, enabling faster proof generation.",
  },
  {
    q: 'What are blocked cells?',
    a: 'After each round, all missed shot locations become blocked. Neither player can move to a blocked cell. This prevents infinite games by shrinking the playable area over time.',
  },
  {
    q: 'How long do public rooms last?',
    a: "Public rooms expire after 10 minutes. If no opponent joins within that time, the creator's stake is refunded and the room is removed.",
  },
];

export function HowItWorksScreen() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in pt-2">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft size={18} />
        </Button>
        <h2 className="text-lg font-bold">How It Works</h2>
      </div>

      {/* Intro */}
      <p className="text-sm text-muted-foreground leading-relaxed">
        Zero Trace is a ZK-powered battleship game on Stellar. Two players stake XLM, hide their
        positions using zero-knowledge proofs, and hunt each other on a 6x6 grid. Every action is
        verified on-chain — no trusted server, no cheating possible.
      </p>

      {/* Game Flow */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Game Flow
        </p>
        {steps.map((step) => (
          <Card key={step.title}>
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-primary">
                {step.icon}
                <h3 className="text-sm font-bold">{step.title}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Security */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Why It's Secure
        </p>
        <div className="grid grid-cols-2 gap-2">
          {securityPoints.map((point) => (
            <Card key={point.title}>
              <CardContent className="p-3 space-y-1.5">
                <div className="text-primary">{point.icon}</div>
                <p className="text-xs font-bold">{point.title}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{point.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          FAQ
        </p>
        <Accordion type="single" collapsible className="space-y-1">
          {faq.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border rounded-lg px-3">
              <AccordionTrigger className="text-xs font-medium text-left py-3 hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground leading-relaxed pb-3">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* Repository */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-xs font-bold">Open Source</p>
            <p className="text-[10px] text-muted-foreground">View the code on GitHub</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              <Github size={14} />
              <span>Repository</span>
            </a>
          </Button>
        </CardContent>
      </Card>

      <div className="h-4" />
    </div>
  );
}
