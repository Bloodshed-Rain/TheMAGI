import {
  LayoutDashboard,
  Swords,
  Clock,
  TrendingUp,
  Hexagon,
  Gamepad2,
  SlidersHorizontal,
} from "lucide-react";

interface IconProps {
  size?: number;
}

export function CoachingIcon({ size = 22 }: IconProps) {
  return <LayoutDashboard size={size} strokeWidth={1.8} />;
}

export function SessionsIcon({ size = 22 }: IconProps) {
  return <Swords size={size} strokeWidth={1.8} />;
}

export function HistoryIcon({ size = 22 }: IconProps) {
  return <Clock size={size} strokeWidth={1.8} />;
}

export function TrendsIcon({ size = 22 }: IconProps) {
  return <TrendingUp size={size} strokeWidth={1.8} />;
}

export function ProfileIcon({ size = 22 }: IconProps) {
  return <Hexagon size={size} strokeWidth={1.8} />;
}

export function CharactersIcon({ size = 22 }: IconProps) {
  return <Gamepad2 size={size} strokeWidth={1.8} />;
}

export function SettingsIcon({ size = 22 }: IconProps) {
  return <SlidersHorizontal size={size} strokeWidth={1.8} />;
}
