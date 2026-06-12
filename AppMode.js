/**
 * AppMode.js
 * Global app mode context — Virtual vs IRL Grower + Pro tier
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
const PRO_KEY  = "vyweed_is_pro";

export const AppModeContext = createContext({
  mode: "virtual",          // "virtual" | "irl"
  setMode: () => {},
  isIRL: false,
  isVirtual: true,
  loaded: false,
  isPro: false,
  setIsPro: () => {},
});

export function AppModeProvider({ children }) {
  const [mode, setModeState] = useState("virtual");
  const [isPro, setIsProState] = useState(false);
  const [loaded, setLoaded]  = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(MODE_KEY).catch(() => null),
      AsyncStorage.getItem(PRO_KEY).catch(() => null),
    ]).then(([savedMode, savedPro]) => {
      if (savedMode === "irl" || savedMode === "virtual") setModeState(savedMode);
      if (savedPro === "true") setIsProState(true);
    }).finally(() => setLoaded(true));
  }, []);

  const setMode = async (newMode) => {
    setModeState(newMode);
    await AsyncStorage.setItem(MODE_KEY, newMode).catch(() => {});
  };

  const setIsPro = async (val) => {
    setIsProState(val);
    await AsyncStorage.setItem(PRO_KEY, String(val)).catch(() => {});
  };

  return (
    <AppModeContext.Provider value={{
      mode,
      setMode,
      isIRL: mode === "irl",
      isVirtual: mode === "virtual",
      loaded,
      isPro,
      setIsPro,
    }}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  return useContext(AppModeContext);
}
