"use client";
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

// ── Types ──

type CharacterInfo = {
  id: string;
  name: string;
  tier: string;
  icon: string;
  color: string;
  domain?: string;
  groups?: string[];
  actions?: Array<{
    label: string;
    icon: string;
    description: string;
    autonomous?: boolean;
    autonomousInput?: boolean;
    inputPlaceholder?: string;
    endpoint?: string;
  }>;
  seeds?: Record<string, string>;
  skills?: string[];
  routingKeywords?: string[];
  sharedKnowledge?: string[];
};

type SystemConfig = {
  trackColorPatterns?: Record<string, string>;
  emailColorPatterns?: Record<string, string>;
  emailLabelColors?: Record<string, { color: string; bg: string }>;
  calendarColorPatterns?: Record<string, string>;
};

type SharedDataValue = {
  characters: CharacterInfo[];
  config: SystemConfig;
  loading: boolean;
  refresh: () => void;
};

// ── Context ──

const SharedDataContext = createContext<SharedDataValue>({
  characters: [],
  config: {},
  loading: true,
  refresh: () => {},
});

// ── Provider ──

export function SharedDataProvider({ children }: { children: ReactNode }) {
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [config, setConfig] = useState<SystemConfig>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(() => {
    Promise.all([
      fetch("/api/characters").then(r => r.json()).catch(() => ({ characters: [] })),
      fetch("/api/system/config").then(r => r.json()).catch(() => ({})),
    ]).then(([charData, configData]) => {
      setCharacters(charData.characters || []);
      setConfig(configData);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <SharedDataContext.Provider value={{ characters, config, loading, refresh: fetchAll }}>
      {children}
    </SharedDataContext.Provider>
  );
}

// ── Hooks ──

export const useSharedData = () => useContext(SharedDataContext);
export const useCharacters = () => useContext(SharedDataContext).characters;
export const useSystemConfig = () => useContext(SharedDataContext).config;
