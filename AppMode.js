/**
 * AppMode.js
 * Global app mode context — Virtual vs IRL Grower
 *
 * Virtual: game mode, strain list locked, wait timer
 * IRL: full app, strain browser unlocked, grow tools
 *
 * In beta: free toggle in settings
 * Post-launch: IRL requires subscription
 */

import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MODE_KEY = "vyweed_app_mode";

export const AppModeContext = createContext({
  mode: "virtual",          // "virtual" | "irl"
  setMode: () => {},
  isIRL: false,
  isVirtual: true,
  loaded: false,
});

export function AppModeProvider({ children }) {
  const [mode, setModeState] = useState("virtual");
  const [loaded, setLoaded]  = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then(saved => {
        if (saved === "irl" || saved === "virtual") setModeState(saved);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setMode = async (newMode) => {
    setModeState(newMode);
    await AsyncStorage.setItem(MODE_KEY, newMode).catch(() => {});
  };

  return (
    <AppModeContext.Provider value={{
      mode,
      setMode,
      isIRL: mode === "irl",
      isVirtual: mode === "virtual",
      loaded,
    }}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  return useContext(AppModeContext);
}
