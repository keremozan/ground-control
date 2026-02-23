import {
  Mail, BookOpen, GraduationCap, Briefcase,
  Heart, Palette, Wrench, Telescope,
  type LucideIcon,
} from "lucide-react";

export const charIcon: Record<string, LucideIcon> = {
  Postman:   Mail,
  Scholar:   BookOpen,
  Proctor:   GraduationCap,
  Clerk:     Briefcase,
  Coach:     Heart,
  Curator:   Palette,
  Architect: Wrench,
  Oracle:    Telescope,
};

// Seed prompts for Crew button → Chat auto-trigger
export const charSeeds: Record<string, Record<string, string>> = {
  Postman:   {
    "Scan Mail": "Scan and triage my email inbox.",
    "Scan WA":   "Scan and triage my WhatsApp messages.",
    Deliver:     "Review pending drafts for delivery.",
    Cycle:       "Run a full scan-process-deliver cycle.",
  },
  Scholar:   {
    Write:    "Let's work on writing. What are we writing today?",
    Research: "What topic should we research?",
    Thesis:   "I have a student thesis to work on.",
    Critique: "I have writing that needs critique.",
  },
  Proctor:   {
    Slides:    "Let's create slides for a class.",
    Workshop:  "Help me design a workshop.",
    SUCourse:  "I need to manage something on SUCourse.",
    Share:     "Let's share some teaching materials.",
  },
  Clerk:     {
    Admin:    "I have a university admin task.",
    Advisory: "I need help with student advising.",
    Sign:     "I need to sign a document.",
  },
  Coach:     {
    "Check In": "Let's do a personal check-in.",
    Review:     "I'd like to do a weekly review.",
  },
  Curator:   {
    FASS:       "Let's work on the FASS gallery.",
    Mondial:    "I need to work on the Mondial exhibition.",
    Sanatorium: "Let's work on the Sanatorium project.",
  },
  Architect: {
    System: "Run a system check.",
    Schema: "I need to update the Tana schema.",
    Build:  "Let's build or fix something.",
    Watch:  "Check the system watcher.",
  },
  Oracle:    {
    Advise: "I need strategic advice on something important.",
  },
};
