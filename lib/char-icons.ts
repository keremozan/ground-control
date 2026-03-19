import {
  Mail, BookOpen, Briefcase,
  Heart, Wrench, Telescope,
  Users, Stethoscope, Palette, GraduationCap,
  Pen, Eye, Hammer, Archive, Clock, Compass,
  Crosshair, Scale, Layers, Sprout,
  type LucideIcon,
} from "lucide-react";

// Canonical character colors — client-safe (no fs dependency)
// Palette chosen for max hue separation across characters
export const charColor: Record<string, string> = {
  postman:   '#2563eb',  // blue
  scholar:   '#7c3aed',  // purple
  clerk:     '#b45309',  // amber
  coach:     '#059669',  // emerald
  curator:   '#be185d',  // rose
  proctor:   '#c026d3',  // fuchsia
  architect: '#475569',  // slate
  oracle:    '#0891b2',  // cyan/teal
  doctor:    '#0284c7',  // sky blue
  scribe:    '#d97706',  // amber
  watcher:   '#64748b',  // slate
  engineer:  '#374151',  // gray
  archivist: '#92400e',  // brown
  steward:   '#0d9488',  // teal
  kybernetes:'#4f46e5',  // indigo
  prober:    '#0891b2',  // cyan
  auditor:   '#059669',  // emerald
  tutor:     '#65a30d',  // lime
  system:    '#64748b',  // gray
};

export const charIcon: Record<string, LucideIcon> = {
  Postman:   Mail,
  Scholar:   BookOpen,
  Clerk:     Briefcase,
  Coach:     Heart,
  Curator:   Palette,
  Proctor:   GraduationCap,
  Architect: Layers,
  Oracle:    Telescope,
  Doctor:    Stethoscope,
  Scribe:    Pen,
  Watcher:   Eye,
  Engineer:  Hammer,
  Archivist: Archive,
  Steward:   Clock,
  Kybernetes:Compass,
  Prober:    Crosshair,
  Auditor:   Scale,
  Tutor:     Sprout,
  Crew:      Users,
};

// Reverse lookup: hex color → { Icon, color }
// Used by Calendar and Inbox to map pattern colors to crew icons
const colorToChar: Record<string, string> = Object.fromEntries(
  Object.entries(charColor).map(([name, hex]) => [hex.toLowerCase(), name])
);

export function iconForColor(hex: string): { Icon: LucideIcon; color: string } | null {
  const name = colorToChar[hex.toLowerCase()];
  if (!name) return null;
  const key = name.charAt(0).toUpperCase() + name.slice(1);
  const Icon = charIcon[key] as LucideIcon | undefined;
  if (!Icon) return null;
  return { Icon, color: hex };
}
