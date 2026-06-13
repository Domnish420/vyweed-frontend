/**
 * VYWEED — App.js
 * Tab navigator wiring Strain Browser + Grow Tracker + VPD Calc + Settings
 *
 * Setup in Termux:
 *   npx create-expo-app vyweed --template blank
 *   cd vyweed
 *   npm install @react-navigation/native @react-navigation/bottom-tabs
 *   npm install react-native-screens react-native-safe-area-context
 *   cp ~/storage/downloads/App.js .
 *   cp ~/storage/downloads/VYWEEDStrainBrowser.jsx .
 *   cp ~/storage/downloads/VYWEEDGrowTracker.jsx .
 *   npx expo start
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, TouchableOpacity, Platform, StatusBar,
  Dimensions, Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { setApiBaseUrl } from "./apiConfig";

import VYWEEDStrainBrowser from "./VYWEEDStrainBrowser";
import VYWEEDGrowTracker   from "./VYWEEDGrowTracker";
import VPDCalculator        from "./VPDCalculator";
import SettingsScreen       from "./SettingsScreen";
import Glossary             from "./Glossary";
import VirtualGrow          from "./VirtualGrow";
import OutdoorGuide         from "./OutdoorGuide";
import Growver              from "./Growver";
import GrowverFAB           from "./GrowverFAB";
import { AppModeProvider, useAppMode } from "./AppMode";
import {
  addNotificationResponseListener,
  addNotificationReceivedListener,
} from "./notifications";

const { width: SW } = Dimensions.get("window");

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:          "#0a0f0a",
  surface:     "#0f150f",
  card:        "#141a13",
  border:      "#2a3d2e",
  green:       "#4d7358",
  greenFaint:  "#1a2d1f",
  greenDim:    "#3a5c44",
  greenBright: "#6db87f",
  amber:       "#c17a4a",
  blue:        "#5b9bd5",
  grey:        "#4a5a4a",
  greyLight:   "#8a9e8c",
  white:       "#e8e4d9",
};

const HEADING = "BebasNeue_400Regular";
const SANS    = "SpaceGrotesk_400Regular";
const SANS_MED  = "SpaceGrotesk_500Medium";
const SANS_BOLD = "SpaceGrotesk_700Bold";
const MONO = SANS;

// Screens where the Growver FAB floats (excludes the Growver tab itself)
const GROWVER_FAB_SCREENS = ["grows", "browse", "vpd", "grow", "outdoor"];

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { id: "browse",   label: "STRAINS",  icon: "🌿" },
  { id: "grows",    label: "MY GROWS", icon: "📊" },
  { id: "grow",     label: "GROW",     icon: "🎮" },
  { id: "outdoor",  label: "OUTDOOR",  icon: "🌤" },
  { id: "vpd",      label: "VPD",      icon: "🌡" },
  { id: "glossary", label: "GLOSSARY", icon: "📖" },
  { id: "growver",  label: "GROWVER",  icon: "🤖" },
  { id: "settings", label: "SETTINGS", icon: "⚙" },
];

// ── Custom tab bar ────────────────────────────────────────────────────────────
function TabBar({ active, onPress, growCount, tabs }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{
      flexDirection: "row",
      backgroundColor: C.card,
      borderTopWidth: 1,
      borderColor: C.border,
      paddingBottom: insets.bottom || 8,
      paddingTop: 8,
    }}>
      {(tabs || TABS).map(tab => {
        const isActive = active === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            onPress={() => onPress(tab.id)}
            activeOpacity={0.7}
            style={{
              flex: 1, alignItems: "center", paddingVertical: 4,
              borderTopWidth: 2,
              borderColor: isActive ? C.greenBright : "transparent",
            }}
          >
            {/* Icon with badge for grows */}
            <View style={{ position: "relative" }}>
              <Text style={{ fontSize: 20 }}>{tab.icon}</Text>
              {tab.id === "grows" && growCount > 0 && (
                <View style={{
                  position: "absolute", top: -4, right: -8,
                  backgroundColor: C.green, borderRadius: 8,
                  minWidth: 16, height: 16,
                  alignItems: "center", justifyContent: "center",
                  paddingHorizontal: 3,
                }}>
                  <Text style={{
                    color: C.bg, fontFamily: MONO,
                    fontSize: 9, fontWeight: "bold",
                  }}>
                    {growCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{
              color: isActive ? C.greenBright : C.grey,
              fontFamily: HEADING,
              fontSize: 11,
              letterSpacing: 0.5,
              marginTop: 3,
            }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Root app ──────────────────────────────────────────────────────────────────
function AppInner() {
  const [activeTab, setActiveTab]   = useState("browse");
  const [growCount, setGrowCount]   = useState(0);
  const { mode, isIRL, isVirtual }  = useAppMode();

  // Shared trophy + token state — spans GROW (spending) and OUTDOOR (earning)
  const [trophies, setTrophies] = useState([]);
  const [tokens,   setTokens]   = useState(0);

  useEffect(() => {
    AsyncStorage.getItem("vyweed_trophies")
      .then(raw => { if (raw) setTrophies(JSON.parse(raw)); })
      .catch(() => {});
    AsyncStorage.getItem("vyweed_tokens")
      .then(raw => { if (raw) setTokens(parseInt(raw, 10) || 0); })
      .catch(() => {});
  }, []);

  const addTrophy = async (trophy) => {
    const updated = [...trophies, trophy];
    setTrophies(updated);
    await AsyncStorage.setItem("vyweed_trophies", JSON.stringify(updated)).catch(() => {});
  };

  const earnToken = async (count = 1) => {
    const n = tokens + count;
    setTokens(n);
    await AsyncStorage.setItem("vyweed_tokens", String(n)).catch(() => {});
  };

  // Returns true if a token was successfully spent
  const spendToken = async () => {
    if (tokens <= 0) return false;
    const n = tokens - 1;
    setTokens(n);
    await AsyncStorage.setItem("vyweed_tokens", String(n)).catch(() => {});
    return true;
  };

  // Atomic multi-token spend — returns true if count tokens were available and spent
  const spendTokens = async (count = 1) => {
    if (tokens < count) return false;
    const n = tokens - count;
    setTokens(n);
    await AsyncStorage.setItem("vyweed_tokens", String(n)).catch(() => {});
    return true;
  };

  // Handle notification taps
  useEffect(() => {
    const sub = addNotificationResponseListener(response => {
      const { type } = response.notification.request.content.data || {};
      if (type === "plant_ready") setActiveTab("grow");
      if (type === "daily_reminder") setActiveTab("grows");
      if (type === "harvest_alert") setActiveTab("grows");
      if (type === "streak_reminder") setActiveTab("grows");
    });
    return () => sub.remove();
  }, []);

  // IRL-only tabs — hidden in virtual mode
  const IRL_ONLY = ["grows", "outdoor", "vpd", "glossary"];

  // If current tab becomes hidden on mode switch, go to browse
  React.useEffect(() => {
    if (isVirtual && IRL_ONLY.includes(activeTab)) {
      setActiveTab("browse");
    }
  }, [mode]);

  // Filter tabs based on mode
  const visibleTabs = TABS.filter(t =>
    isIRL ? true : !IRL_ONLY.includes(t.id)
  );

  // When user taps "Start Grow" in strain browser — pass strain to tracker
  const [pendingStrain, setPendingStrain] = useState(null);
  const handleSelectStrain = useCallback((strain) => {
    setPendingStrain({ id: strain.id, name: strain.name });
    setActiveTab("grows");
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Screens — all mounted, only one visible at a time for instant switching */}
      <View style={{ flex: 1, backgroundColor: C.bg }}>

        {/* STRAIN BROWSER */}
        <View style={{ flex: 1, display: activeTab === "browse" ? "flex" : "none" }}>
          <VYWEEDStrainBrowser onSelectStrain={handleSelectStrain} />
        </View>

        {/* GROW TRACKER */}
        <View style={{ flex: 1, display: activeTab === "grows" ? "flex" : "none" }}>
          <VYWEEDGrowTracker
            onGrowCountChange={setGrowCount}
            pendingStrain={pendingStrain}
            onPendingStrainConsumed={() => setPendingStrain(null)}
          />
        </View>

        {/* GROW GAME */}
        <View style={{ flex: 1, display: activeTab === "grow" ? "flex" : "none" }}>
          <VirtualGrow
            trophies={trophies}
            onAddTrophy={addTrophy}
            tokens={tokens}
            onSpendToken={spendToken}
            activeTab={activeTab}
          />
        </View>

        {/* OUTDOOR GUIDE */}
        <View style={{ flex: 1, display: activeTab === "outdoor" ? "flex" : "none" }}>
          <OutdoorGuide
            trophies={trophies}
            onAddTrophy={addTrophy}
            tokens={tokens}
            onEarnToken={earnToken}
            onSpendToken={spendTokens}
          />
        </View>

        {/* VPD CALCULATOR */}
        <View style={{ flex: 1, display: activeTab === "vpd" ? "flex" : "none" }}>
          <VPDCalculator />
        </View>

        {/* GLOSSARY */}
        <View style={{ flex: 1, display: activeTab === "glossary" ? "flex" : "none" }}>
          <Glossary />
        </View>

        {/* GROWVER */}
        <View style={{ flex: 1, display: activeTab === "growver" ? "flex" : "none" }}>
          <Growver />
        </View>

        {/* SETTINGS */}
        <View style={{ flex: 1, display: activeTab === "settings" ? "flex" : "none" }}>
          <SettingsScreen />
        </View>

        {/* Growver FAB — floats above tab bar on relevant screens */}
        {GROWVER_FAB_SCREENS.includes(activeTab) && (
          <GrowverFAB
            screen={activeTab}
            onOpenFull={() => setActiveTab("growver")}
          />
        )}

      </View>

      {/* Tab bar always at bottom */}
      <TabBar
        active={activeTab}
        onPress={setActiveTab}
        growCount={growCount}
        tabs={visibleTabs}
      />
    </SafeAreaProvider>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [fontsLoaded] = useFonts({
    BebasNeue_400Regular,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    AsyncStorage.getItem("vyweed_settings")
      .then(json => {
        if (json) {
          const s = JSON.parse(json);
          if (s?.api_url) setApiBaseUrl(s.api_url);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  if (!ready || !fontsLoaded) return (
    <View style={{ flex: 1, backgroundColor: "#0a0f0a", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#4d7358", fontSize: 28, letterSpacing: 4, fontFamily: "BebasNeue_400Regular" }}>
        VYWEED
      </Text>
    </View>
  );

  return (
    <AppModeProvider>
      <AppInner />
    </AppModeProvider>
  );
}
