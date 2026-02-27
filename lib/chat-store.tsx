"use client";
import { createContext, useContext, useState } from "react";

export type ChatTrigger = {
  charName: string;
  seedPrompt: string;
  action: string;
  context?: string;
  openOnly?: boolean;
  model?: string;
} | null;

type ChatContextValue = {
  trigger: ChatTrigger;
  setTrigger: (t: ChatTrigger) => void;
};

const ChatContext = createContext<ChatContextValue>({
  trigger: null,
  setTrigger: () => {},
});

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [trigger, setTrigger] = useState<ChatTrigger>(null);
  return (
    <ChatContext.Provider value={{ trigger, setTrigger }}>
      {children}
    </ChatContext.Provider>
  );
}

export const useChatTrigger = () => useContext(ChatContext);
