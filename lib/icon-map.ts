import {
  Mail, BookOpen, GraduationCap, Briefcase, Heart, Palette, Wrench, Telescope,
  MessageCircle, Camera, Inbox, Send, RefreshCw,
  Pen, PenLine, Search, FileText, MessageSquare,
  Monitor, Hammer, Share2, Users, PenTool,
  HeartPulse, CalendarCheck,
  Building2, Globe, Landmark,
  Activity, Database, Eye, Compass, FolderOpen,
  CalendarDays, CalendarClock, CalendarSearch, HardDrive,
  Reply, ListChecks, Calendar, CornerUpRight,
  Zap, MailPlus, MailX, CalendarPlus, ClipboardList, ScanLine,
  Clock, Settings, Power, AlertTriangle, FolderCog, ArrowRight,
  Play, CheckCircle, Archive, Lightbulb, Stethoscope, RotateCcw,
  Layers, Network, BookMarked, Eraser,
  Crosshair, Scale, FlaskConical, BarChart,
  type LucideIcon,
} from "lucide-react";
import TanaIcon from "@/components/icons/TanaIcon";

export const iconMap: Record<string, LucideIcon> = {
  Mail, BookOpen, GraduationCap, Briefcase, Heart, Palette, Wrench, Telescope,
  MessageCircle, Camera, Inbox, Send, RefreshCw,
  Pen, PenLine, Search, FileText, MessageSquare,
  Monitor, Hammer, Share2, Users, PenTool,
  HeartPulse, CalendarCheck,
  Building2, Globe, Landmark,
  Activity, Database, Eye, Compass, FolderOpen,
  CalendarDays, CalendarClock, CalendarSearch, HardDrive,
  Reply, ListChecks, Calendar, CornerUpRight,
  Zap, MailPlus, MailX, CalendarPlus, ClipboardList, ScanLine,
  Clock, Settings, Power, AlertTriangle, FolderCog, ArrowRight,
  Play, CheckCircle, Archive, Lightbulb, Stethoscope, RotateCcw,
  Layers, Network, BookMarked, Eraser,
  Crosshair, Scale, FlaskConical, BarChart,
  Tana: TanaIcon as unknown as LucideIcon,
};

/** Resolve an icon string name to a Lucide component. Falls back to Mail if not found. */
export function resolveIcon(name: string): LucideIcon {
  return iconMap[name] || Mail;
}
