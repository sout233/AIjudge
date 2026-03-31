import {
  Trophy,
  Cpu,
  Code2,
  Rocket,
  Target,
  ShieldCheck,
  Zap,
  Globe,
  Atom
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContestLogoProps {
  url?: string;
  name: string;
  id?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const PLACEHOLDER_ICONS = [Trophy, Cpu, Code2, Rocket, Target, ShieldCheck, Zap, Globe, Atom];
const GRADIENTS = [
  'from-cyan-500 to-blue-600',
  'from-purple-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
  'from-blue-400 to-cyan-500',
  'from-amber-400 to-orange-500',
];

export function ContestLogo({ url, name, id, className, size = 'md' }: ContestLogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 rounded-lg',
    md: 'w-12 h-12 rounded-xl',
    lg: 'w-16 h-16 rounded-2xl',
    xl: 'w-24 h-24 rounded-[2rem]',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  if (url) {
    return (
      <div className={cn("overflow-hidden border border-white/10 bg-slate-900 shadow-inner", sizeClasses[size], className)}>
        <img src={url} alt={name} className="w-full h-full object-cover" />
      </div>
    );
  }

  const seed = (id || name).length;
  const iconIdx = seed % PLACEHOLDER_ICONS.length;
  const gradIdx = seed % GRADIENTS.length;
  const Icon = PLACEHOLDER_ICONS[iconIdx];
  const gradient = GRADIENTS[gradIdx];

  return (
    <div className={cn(
      "flex items-center justify-center border border-white/20 shadow-lg relative group overflow-hidden",
      "bg-gradient-to-br",
      gradient,
      sizeClasses[size],
      className
    )}>
      <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-white/10 rotate-45 blur-2xl pointer-events-none" />

      <Icon className={cn("text-white drop-shadow-md relative z-10", iconSizes[size])} />

      {size === 'xl' && (
        <span className="absolute bottom-2 text-[8px] font-black text-white/30 tracking-widest uppercase">
          AI_PROTO
        </span>
      )}
    </div>
  );
}
