"use client";

import { BadgeCheck, Bus, Clapperboard, Coffee, Gift, GraduationCap, HeartPulse, Home, Laptop, PawPrint, PiggyBank, Plane, ShoppingBag, Store, Tag, Target, Utensils, Wallet, Zap, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "badge-check": BadgeCheck,
  "bus": Bus,
  "clapperboard": Clapperboard,
  "coffee": Coffee,
  "gift": Gift,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  "home": Home,
  "laptop": Laptop,
  "paw-print": PawPrint,
  "piggy-bank": PiggyBank,
  "plane": Plane,
  "shopping-bag": ShoppingBag,
  "store": Store,
  "tag": Tag,
  "target": Target,
  "utensils": Utensils,
  "wallet": Wallet,
  "zap": Zap,
};

export function CategoryIcon({
  name,
  className,
  style,
}: {
  name: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Icon = (name && ICONS[name]) || Tag;
  return <Icon className={className} style={style} aria-hidden />;
}
