"use client";
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { CharacterInfo, SystemConfig } from "@/types";

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
    ]).then(([charRes, configRes]) => {
      // Unwrap { ok, data } envelope from standardized API routes
      const charData = charRes?.data ?? charRes;
      const configData = configRes?.data ?? configRes;
      setCharacters(charData?.characters || []);
      setConfig(configData || {});
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
