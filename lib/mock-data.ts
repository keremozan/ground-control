export const mockInbox = {
  personal: { unread: 3, label: "Personal" },
  school: { unread: 12, label: "Sabanci" },
  recent: [
    { from: "Basel Art Fair", subject: "Booth confirmation for September", time: "10:23", account: "personal" as const, labels: ["gallery", "exhibition"] },
    { from: "Deniz Tasar", subject: "VA 315 workshop materials ready", time: "09:45", account: "school" as const, labels: ["course"] },
    { from: "BAGEM Office", subject: "Spring advisee list update", time: "09:12", account: "school" as const, labels: ["admin", "bagem"] },
    { from: "Cambridge Workshop", subject: "Re: Plant sensing equipment", time: "Yesterday", account: "personal" as const, labels: ["research"] },
    { from: "Elif Atilir", subject: "Research document draft", time: "Yesterday", account: "school" as const, labels: ["thesis"] },
  ],
};

export const mockCalendar = {
  today: [
    { time: "10:00 - 11:30", title: "VA 204 - Language of Drawing", location: "Studio B" },
    { time: "13:00 - 14:00", title: "Thesis Meeting - Ece", location: "Office" },
    { time: "15:00 - 16:30", title: "VA 315 - Visual Culture", location: "Lecture Hall" },
  ],
  upcoming: [
    { date: "Tomorrow", title: "Faculty Meeting", time: "10:00" },
    { date: "Wed", title: "Pilates", time: "18:00" },
    { date: "Thu", title: "Thesis Jury - Mehmet", time: "14:00" },
  ],
};

export const mockTasks = [
  {
    track: "Cambridge Plant Workshop",
    tasks: [
      { name: "Confirm equipment list with lab", priority: "high" as const, status: "in-progress" as const },
      { name: "Book travel for March workshop", priority: "medium" as const, status: "backlog" as const },
    ],
  },
  {
    track: "Visual Culture (VA 315/515)",
    tasks: [
      { name: "Upload Week 8 slides to SUCourse", priority: "medium" as const, status: "in-progress" as const },
      { name: "Grade midterm papers", priority: "high" as const, status: "backlog" as const },
    ],
  },
  {
    track: "Dunyanin Sonundaki Bahce",
    tasks: [
      { name: "Send artist statement to curator", priority: "low" as const, status: "backlog" as const },
    ],
  },
  {
    track: "System & Automation",
    tasks: [
      { name: "Dashboard migration to Next.js", priority: "high" as const, status: "in-progress" as const },
    ],
  },
];

export const mockWeather = {
  city: "Istanbul",
  temp: 8,
  unit: "°C" as const,
  condition: "Overcast",
  icon: "cloud" as const,
};

export const mockHealth = {
  mcpServers: [
    { name: "Tana", status: "connected" as const },
    { name: "Gmail", status: "connected" as const },
    { name: "Calendar", status: "connected" as const },
    { name: "WhatsApp", status: "connected" as const },
    { name: "Drive", status: "connected" as const },
  ],
  lastCycle: "2 hours ago",
  errors: 0,
};

export const characters = [
  {
    name: "Postman", domain: "communications", color: "#4f46e5", model: "haiku",
    icon: "\u2709",
    skills: ["scan-mail", "scan-whatsapp", "scan-icloud", "scan-tana", "deliver", "cycle"],
    actions: ["Scan Mail", "Scan WA", "Deliver", "Cycle"],
  },
  {
    name: "Scholar", domain: "intellectual", color: "#7c3aed", model: "sonnet",
    icon: "\u2726",
    skills: ["write", "research", "thesis", "critique", "quality", "activity-report", "notebooklm"],
    actions: ["Write", "Research", "Thesis", "Critique"],
  },
  {
    name: "Proctor", domain: "teaching", color: "#db2777", model: "sonnet",
    icon: "\u25A4",
    skills: ["slides", "workshop", "assignment", "sucourse", "share", "ta-ops", "materials"],
    actions: ["Slides", "Workshop", "SUCourse", "Share"],
  },
  {
    name: "Clerk", domain: "admin", color: "#b45309", model: "haiku",
    icon: "\u2630",
    skills: ["admin", "advisory", "sign"],
    actions: ["Admin", "Advisory", "Sign"],
  },
  {
    name: "Coach", domain: "personal", color: "#047857", model: "sonnet",
    icon: "\u2665",
    skills: ["review", "checkin"],
    actions: ["Check In", "Review"],
  },
  {
    name: "Curator", domain: "art", color: "#e11d48", model: "sonnet",
    icon: "\u25C7",
    skills: ["fass", "mondial", "sanatorium"],
    actions: ["FASS", "Mondial", "Sanatorium"],
  },
  {
    name: "Architect", domain: "systems", color: "#475569", model: "sonnet",
    icon: "\u2318",
    skills: ["feature-gate", "watcher", "batch-ops", "system", "tana-schema"],
    actions: ["System", "Schema", "Build", "Watch"],
  },
  {
    name: "Oracle", domain: "strategic", color: "#9333ea", model: "opus",
    icon: "\u25C9",
    skills: ["advisory"],
    actions: ["Advise"],
  },
];

export const mockPosts = [
  { name: "Upload midterm grades to SUIS", source: "mail", type: "task", receiver: "Clerk", priority: "high", status: "pending" },
  { name: "Cambridge equipment specs question", source: "whatsapp", type: "question", receiver: "Curator", priority: "normal", status: "pending" },
  { name: "Faculty meeting agenda for Thursday", source: "mail", type: "fyi", receiver: "Clerk", priority: "low", status: "pending" },
  { name: "Review thesis abstract - Ece", source: "tana", type: "task", receiver: "Scholar", priority: "medium", status: "in-progress" },
  { name: "Send workshop confirmation to Cambridge", source: "mail", type: "task", receiver: "Proctor", priority: "high", status: "in-progress" },
];

export const mockReports = [
  { date: "Feb 23, 14:00", type: "scheduled", processed: 8 },
  { date: "Feb 23, 08:00", type: "scheduled", processed: 5 },
  { date: "Feb 22, 18:00", type: "scheduled", processed: 3 },
  { date: "Feb 22, 13:00", type: "scheduled", processed: 12 },
  { date: "Feb 21, 08:00", type: "manual", processed: 2 },
];

export const mockDrafts = [
  { to: "Deniz Tasar", subject: "Re: Workshop materials", channel: "email", preview: "Thanks Deniz, the materials look great. I'll review the updated visuals before Monday and get back to you..." },
  { to: "Cambridge Lab", subject: "Equipment confirmation", channel: "email", preview: "Confirming the following equipment for the March workshop: 3x soil moisture sensors, 2x Raspberry Pi units..." },
  { to: "VA 204 Group", subject: "Next class update", channel: "whatsapp", preview: "Hi everyone, next Monday we will focus on gesture drawing. Please bring charcoal and large format paper..." },
];
