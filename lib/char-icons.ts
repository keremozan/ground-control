import {
  Mail, BookOpen, Briefcase,
  Heart, Wrench, Telescope,
  Users,
  type LucideIcon,
} from "lucide-react";

// Canonical character colors — client-safe (no fs dependency)
// Palette chosen for max hue separation across characters
export const charColor: Record<string, string> = {
  postman:   '#2563eb',  // blue
  scholar:   '#7c3aed',  // purple
  clerk:     '#b45309',  // amber
  coach:     '#059669',  // emerald
  architect: '#475569',  // slate
  oracle:    '#0891b2',  // cyan/teal
  system:    '#64748b',  // gray
  // Additional colors for user-defined characters (used by config-driven patterns)
  proctor:   '#c026d3',  // fuchsia
  curator:   '#dc2626',  // red
};

export const charIcon: Record<string, LucideIcon> = {
  Postman:   Mail,
  Scholar:   BookOpen,
  Clerk:     Briefcase,
  Coach:     Heart,
  Architect: Wrench,
  Oracle:    Telescope,
  Crew:      Users,
};
