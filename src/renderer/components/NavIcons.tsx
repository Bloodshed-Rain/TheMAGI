import {
  LayoutDashboard,
  Swords,
  Clock,
  TrendingUp,
  Hexagon,
  Gamepad2,
  SlidersHorizontal,
  Library,
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

export function LibraryIcon({ size = 22 }: IconProps) {
  return <Library size={size} strokeWidth={1.8} />;
}

// Alias — Dashboard uses LayoutDashboard, same icon historically exported as
// CoachingIcon. Kept as a named export so LiquidShell reads cleanly.
export function DashboardIcon({ size = 22 }: IconProps) {
  return <LayoutDashboard size={size} strokeWidth={1.8} />;
}

export function PracticeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 6v12M6 12h12" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
