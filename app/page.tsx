"use client";
import { ChatProvider } from "@/lib/chat-store";
import InboxWidget from "@/components/home/InboxWidget";
import CalendarWidget from "@/components/home/CalendarWidget";
import TasksWidget from "@/components/home/TasksWidget";
import CrewWidget from "@/components/home/CrewWidget";
import ChatWidget from "@/components/home/ChatWidget";
import StatusBar from "@/components/home/StatusBar";

export default function Home() {
  return (
    <ChatProvider>
      <div style={{
        display: "grid",
        gridTemplateRows: "44px 1fr 1.4fr",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 10,
        height: "calc(100vh - 44px)",
      }}>
        <div style={{ gridColumn: "span 3", height: "100%" }}>
          <StatusBar />
        </div>
        <InboxWidget />
        <CalendarWidget />
        <TasksWidget />
        <div style={{ gridColumn: "span 2", height: "100%" }}>
          <ChatWidget />
        </div>
        <CrewWidget />
      </div>
    </ChatProvider>
  );
}
