"use client";

// One lookup from the app's own icon vocabulary to lucide-react, so no component imports
// lucide directly and swapping the icon set later touches this file only. An unknown name
// renders a neutral dot rather than throwing — a missing icon should never take a tab down.

import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, Bookmark, Brain, Briefcase, Calendar,
  Check, ChevronDown, ChevronRight, ChevronUp, Circle, Download, Filter, Info, Layers,
  LayoutDashboard, Map, Megaphone, MessageSquare, Moon, Newspaper, Radio, RefreshCw,
  Search, Shield, Sparkles, Sun, Target, Ticket, TrendingUp, Users, X, Zap,
} from "lucide-react";

type IconCmp = typeof Circle;

const MAP: Record<string, IconCmp> = {
  dashboard: LayoutDashboard,
  megaphone: Megaphone,
  search: Search,
  briefcase: Briefcase,
  newspaper: Newspaper,
  radio: Radio,
  map: Map,
  ticket: Ticket,
  activity: Activity,
  trending: TrendingUp,
  brain: Brain,
  shield: Shield,
  message: MessageSquare,
  moon: Moon,
  sun: Sun,
  layers: Layers,
  refresh: RefreshCw,
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  "chevron-right": ChevronRight,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  "alert-triangle": AlertTriangle,
  check: Check,
  circle: Circle,
  info: Info,
  download: Download,
  filter: Filter,
  calendar: Calendar,
  x: X,
  sparkles: Sparkles,
  target: Target,
  zap: Zap,
  users: Users,
  bookmark: Bookmark,
};

export default function Icon({
  name,
  size = 16,
  className,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Cmp = MAP[name] ?? Circle;
  return <Cmp size={size} className={className} style={style} aria-hidden strokeWidth={1.9} />;
}
