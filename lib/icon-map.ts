import {
  Mail, BookOpen, GraduationCap, Briefcase, Heart, Palette, Wrench, Telescope,
  MessageCircle, Camera, Inbox, Send, RefreshCw,
  PenLine, Search, FileText, MessageSquare,
  Monitor, Hammer, Share2, Users, PenTool,
  HeartPulse, CalendarCheck,
  Building2, Globe, Landmark,
  Activity, Database, Eye, Compass, FolderOpen,
  CalendarDays, HardDrive,
  Reply, ListChecks, Calendar, CornerUpRight,
  Zap, MailPlus, CalendarPlus, ClipboardList, ScanLine,
  Clock, Settings, Power, AlertTriangle, FolderCog, ArrowRight,
  Play, CheckCircle, Archive, Lightbulb,
  type LucideIcon,
} from "lucide-react";
import TanaIcon from "@/components/icons/TanaIcon";

export const iconMap: Record<string, LucideIcon> = {
  Mail, BookOpen, GraduationCap, Briefcase, Heart, Palette, Wrench, Telescope,
  MessageCircle, Camera, Inbox, Send, RefreshCw,
  PenLine, Search, FileText, MessageSquare,
  Monitor, Hammer, Share2, Users, PenTool,
  HeartPulse, CalendarCheck,
  Building2, Globe, Landmark,
  Activity, Database, Eye, Compass, FolderOpen,
  CalendarDays, HardDrive,
  Reply, ListChecks, Calendar, CornerUpRight,
  Zap, MailPlus, CalendarPlus, ClipboardList, ScanLine,
  Clock, Settings, Power, AlertTriangle, FolderCog, ArrowRight,
  Play, CheckCircle, Archive, Lightbulb,
  Tana: TanaIcon as unknown as LucideIcon,
};

/** Resolve an icon string name to a Lucide component. Falls back to Mail if not found. */
export function resolveIcon(name: string): LucideIcon {
  return iconMap[name] || Mail;
}
