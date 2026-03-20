"use client";
import { createContext, useContext, useState } from "react";
import type { ChatTrigger, ChatContextValue } from "@/types";

export type { ChatTrigger } from "@/types";

const ChatContext = createContext<ChatContextValue>({
  trigger: null,
  setTrigger: () => {},
});

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [trigger, setTrigger] = useState<ChatTrigger | null>(null);
  return (
    <ChatContext.Provider value={{ trigger, setTrigger }}>
      {children}
    </ChatContext.Provider>
  );
}

export const useChatTrigger = () => useContext(ChatContext);
