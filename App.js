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
  bg:         "#070a07",
  surface:    "#0d120d",
  card:       "#111811",
  border:     "#1a2a1a",
  green:      "#39ff45",
  greenFaint: "#0d3d12",
  greenDim:   "#1a7a20",
  amber:      "#ffb830",
  blue:       "#30d5ff",
  grey:       "#4a5a4a",
  greyLight:  "#8a9a8a",
  white:      "#e8f0e8",
};

const MONO = Platform.select({ ios: "Courier New", android: "monospace" });

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
              borderColor: isActive ? C.green : "transparent",
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
              color: isActive ? C.green : C.grey,
              fontFamily: MONO,
              fontSize: 9,
              fontWeight: isActive ? "bold" : "normal",
              letterSpacing: 0.8,
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

  // When user taps "Start Grow" in strain browser — switch to grows tab
  const handleSelectStrain = useCallback((strain) => {
    // In a real app you'd pass strain data through to the tracker
    // For now just switch tabs — tracker has its own "New Grow" button
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
          <VYWEEDGrowTracker onGrowCountChange={setGrowCount} />
        </View>

        {/* GROW GAME */}
        <View style={{ flex: 1, display: activeTab === "grow" ? "flex" : "none" }}>
          <VirtualGrow />
        </View>

        {/* OUTDOOR GUIDE */}
        <View style={{ flex: 1, display: activeTab === "outdoor" ? "flex" : "none" }}>
          <OutdoorGuide />
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

  if (!ready) return (
    <View style={{ flex: 1, backgroundColor: "#070a07", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#39ff45", fontFamily: Platform.select({ ios: "Courier New", android: "monospace" }), fontSize: 12 }}>
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
