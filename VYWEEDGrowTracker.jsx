import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, RefreshControl,
  StatusBar, Platform, Animated, Dimensions, StyleSheet, Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import Svg, { Defs, RadialGradient, Stop, Rect, Circle, ClipPath, Path, G } from "react-native-svg";
import NutrientSchedule from "./NutrientSchedule";
import GrowTimeline from "./GrowTimeline";
import { cachedFetch, saveToCache, loadFromCache } from "./cache";
import OfflineBanner from "./OfflineBanner";
import { PhotoStrip, PhotoTimelineStrip, savePhoto, pickPhoto } from "./PhotoJournal";
import {
  scheduleDailyReminder, scheduleHarvestAlert,
  resetStreakReminder, cancelGrowNotifications,
  requestNotificationPermissions,
} from "./notifications";

import { getApiV1, BACKEND_HEADERS } from "./apiConfig";
import { setGrowverContext } from "./growverContext";
const { width: SW, height: SH } = Dimensions.get("window");
const API_BASE = { toString: () => getApiV1() };

// ── Guided scan steps ─────────────────────────────────────────────────────────
const SCAN_STEPS = [
  {
    id: "canopy",
    label: "TOP-DOWN CANOPY",
    instruction: "Hold phone directly above — look straight down at the full canopy",
    icon: "🌿",
    guide: "topCircle",
  },
  {
    id: "side",
    label: "FULL SIDE VIEW",
    instruction: "Step back — frame the entire plant from pot base to top",
    icon: "📏",
    guide: "fullRect",
  },
  {
    id: "cola",
    label: "MAIN COLA",
    instruction: "Get close to the largest bud site — fill the frame with it",
    icon: "🌸",
    guide: "centerCircle",
  },
  {
    id: "leaf",
    label: "FAN LEAF",
    instruction: "Find a mid-canopy fan leaf — fill the frame. Shows deficiencies.",
    icon: "🍃",
    guide: "leafRect",
  },
  {
    id: "base",
    label: "BASE & STEM",
    instruction: "Point down at the pot and stem base — shows root zone health",
    icon: "🪴",
    guide: "baseCircle",
  },
];

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
  red:         "#a83030",
  blue:        "#5b9bd5",
  grey:        "#4a5a4a",
  greyLight:   "#8a9e8c",
  white:       "#e8e4d9",
  purple:      "#8b6abf",
};

// ── Typography ────────────────────────────────────────────────────────────────
const HEADING   = "BebasNeue_400Regular";
const SANS      = "SpaceGrotesk_400Regular";
const SANS_MED  = "SpaceGrotesk_500Medium";
const SANS_BOLD = "SpaceGrotesk_700Bold";
const MONO      = SANS;

// ── API client ────────────────────────────────────────────────────────────────
const api = {
  async get(path) {
    const result = await cachedFetch(`${API_BASE}${path}`);
    return result.data;
  },
  async getWithMeta(path) {
    return await cachedFetch(`${API_BASE}${path}`);
  },
  async post(path, body) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { ...BACKEND_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  async patch(path, body) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      headers: { ...BACKEND_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  async del(path) {
    const r = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers: BACKEND_HEADERS });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
};

// ── Shared components ─────────────────────────────────────────────────────────

function GreenText({ style, children, ...props }) {
  return (
    <Text style={[{ color: C.greenBright, fontFamily: SANS_BOLD }, style]} {...props}>
      {children}
    </Text>
  );
}

function Label({ style, children }) {
  return (
    <Text style={[{
      color: C.greyLight, fontFamily: HEADING,
      fontSize: 12, letterSpacing: 2, textTransform: "uppercase",
    }, style]}>
      {children}
    </Text>
  );
}

function Card({ style, children }) {
  return (
    <View style={[{
      backgroundColor: C.card, borderRadius: 10,
      borderWidth: 1, borderColor: C.border,
      padding: 14, marginBottom: 12,
    }, style]}>
      {children}
    </View>
  );
}

function GreenBtn({ label, onPress, style, small, danger }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[{
        backgroundColor: danger ? "#1a0808" : C.greenFaint,
        borderWidth: 1,
        borderColor: danger ? C.red : C.green,
        borderRadius: 8,
        paddingVertical: small ? 8 : 13,
        paddingHorizontal: small ? 14 : 20,
        alignItems: "center",
      }, style]}
    >
      <Text style={{
        color: danger ? C.red : C.greenBright,
        fontFamily: HEADING,
        fontSize: small ? 14 : 17,
        letterSpacing: 1.5,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function StatBox({ label, value, unit, colour }) {
  return (
    <View style={{
      flex: 1, backgroundColor: C.surface, borderRadius: 8,
      borderWidth: 1, borderColor: C.border,
      padding: 10, alignItems: "center",
    }}>
      <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 11, letterSpacing: 2 }}>
        {label}
      </Text>
      <Text style={{
        color: colour || C.greenBright, fontFamily: HEADING,
        fontSize: 28, letterSpacing: 1, marginTop: 2,
      }}>
        {value ?? "—"}
      </Text>
      {unit && (
        <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 10 }}>{unit}</Text>
      )}
    </View>
  );
}

function AlertBadge({ severity }) {
  const map = {
    critical: { bg: "#1a0808", border: C.red,   text: C.red,   label: "⚠ CRITICAL" },
    warning:  { bg: "#1a1008", border: C.amber, text: C.amber, label: "▲ WARNING"  },
    info:     { bg: "#08121a", border: C.blue,  text: C.blue,  label: "ℹ INFO"     },
  };
  const s = map[severity] || map.info;
  return (
    <View style={{
      backgroundColor: s.bg, borderWidth: 1, borderColor: s.border,
      borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3,
      alignSelf: "flex-start",
    }}>
      <Text style={{ color: s.text, fontFamily: HEADING, fontSize: 12, letterSpacing: 1.5 }}>
        {s.label}
      </Text>
    </View>
  );
}

function StagePill({ stage }) {
  const colour = {
    Seedling:     C.blue,
    Vegetative:   C.greenBright,
    "Pre-Flower": C.amber,
    Flowering:    "#c8733a",
    Harvest:      "#d4a84b",
  }[stage] || C.greyLight;
  return (
    <View style={{
      backgroundColor: `${colour}1a`, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 4,
      borderWidth: 1, borderColor: `${colour}80`, alignSelf: "flex-start",
    }}>
      <Text style={{ color: colour, fontFamily: HEADING, fontSize: 13, letterSpacing: 1.5 }}>
        {stage?.toUpperCase()}
      </Text>
    </View>
  );
}

// ── Photo Journal Screen wrapper ──────────────────────────────────────────────
function PhotoJournalScreen({ growId, strainName, onBack }) {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    api.get(`/tracker/grows/${growId}/timeline`)
      .then(data => setLogs(data.logs || []))
      .catch(() => {});
  }, [growId]);

  const { default: PhotoJournal } = require("./PhotoJournal");
  return <PhotoJournal growId={growId} strainName={strainName} logs={logs} onBack={onBack} />;
}

// ── Grow Info Modal ───────────────────────────────────────────────────────────
function GrowInfoModal({ visible, onClose }) {
  const sections = [
    { icon: "🌱", title: "STARTING A GROW", text: "Tap + NEW GROW, search your strain name, pick the date you planted your seed or cutting, and choose your growing medium (soil, coco, or hydro). The app then tracks every single day from that point." },
    { icon: "📋", title: "TODAY TAB — DAILY CHECKLIST", text: "Every day the app generates a personalised to-do list based on exactly where your plant is in its life cycle. Day 3 is very different from Day 45. Follow the checklist every day — it's the most important thing in this app." },
    { icon: "🌡", title: "CHECK IN BUTTON", text: "Tap CHECK IN to log your environment readings. Temperature = air temp at plant level. Humidity = moisture in the air. pH = acidity of your water (6.0-7.0 is ideal for most). EC = how strong your nutrient solution is. You don't need all four — log what you have." },
    { icon: "🚨", title: "ALERTS TAB", text: "If anything is wrong with your environment, alerts appear here. Critical = fix immediately, your plant is being damaged. Warning = fix soon. Info = good to know. Each alert tells you exactly what's wrong and how to fix it." },
    { icon: "📅", title: "HARVEST TAB", text: "Shows your predicted harvest window based on your strain's genetics and your start date. Earliest = minimum possible. Typical = when most growers harvest. Latest = if you want maximum maturity. Always confirm with a 60x loupe — look for cloudy/amber trichomes." },
    { icon: "✓ HARVESTED / ✗ ABANDONED", title: "UPDATING STATUS", text: "When you harvest, tap the grow and update its status to HARVESTED. This keeps your history clean. ABANDONED is for grows that didn't make it — track these too so you can learn from them." },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          borderTopWidth: 1, borderColor: C.green, maxHeight: "92%",
        }}>
          <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 3, backgroundColor: C.border, borderRadius: 2 }} />
          </View>
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingHorizontal: 16, paddingBottom: 12,
            borderBottomWidth: 1, borderColor: C.border,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 26 }}>📊</Text>
              <View>
                <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 20, letterSpacing: 2 }}>
                  MY GROWS
                </Text>
                <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 10 }}>
                  HOW TO USE THIS SCREEN
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <Text style={{ color: C.grey, fontFamily: SANS_BOLD, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <View style={{
              backgroundColor: C.greenFaint, borderRadius: 8,
              borderWidth: 1, borderColor: C.greenDim, padding: 14, marginBottom: 16,
            }}>
              <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 12,
                letterSpacing: 2, marginBottom: 6 }}>WHAT IS THIS?</Text>
              <Text style={{ color: C.white, fontFamily: SANS, fontSize: 13, lineHeight: 20 }}>
                {"This is your personal grow journal. Every cannabis plant you grow is tracked here from the day it sprouts to harvest day. The app uses the specific genetics of your strain to give you personalised daily guidance — not generic one-size-fits-all advice. Think of it as a knowledgeable grow partner available 24/7."}
              </Text>
            </View>
            {sections.map((s, i) => (
              <View key={i} style={{
                backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 18 }}>{s.icon}</Text>
                  <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 14, letterSpacing: 1.5 }}>
                    {s.title}
                  </Text>
                </View>
                <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 12, lineHeight: 19 }}>
                  {s.text}
                </Text>
              </View>
            ))}
            <View style={{
              backgroundColor: "#080f1a", borderRadius: 8,
              borderWidth: 1, borderColor: C.blue, padding: 14,
            }}>
              <Text style={{ color: C.blue, fontFamily: HEADING, fontSize: 12,
                letterSpacing: 2, marginBottom: 6 }}>💡 PRO TIP</Text>
              <Text style={{ color: C.white, fontFamily: SANS, fontSize: 13, lineHeight: 19 }}>
                {"Log a check-in every single day, even if everything looks fine and nothing has changed. Consistent daily data lets the app spot trends before they become problems. A pH that drifts 0.1 per day looks fine on day 1 but causes serious issues by day 10."}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Grow Stage Progress Bar ───────────────────────────────────────────────────
const GROW_STAGES = [
  { key: "Seedling",   label: "SEED",    colour: "#5b9bd5", pct: 0.08 },
  { key: "Vegetative", label: "VEG",     colour: "#6db87f", pct: 0.25 },
  { key: "Pre-Flower", label: "PRE",     colour: "#c17a4a", pct: 0.12 },
  { key: "Flowering",  label: "FLOWER",  colour: "#c8733a", pct: 0.40 },
  { key: "Harvest",    label: "HARVEST", colour: "#d4a84b", pct: 0.15 },
];

function GrowStageBar({ stage, day, daysToHarvest }) {
  const stageMap = {
    "Seedling": 0, "seedling": 0,
    "Vegetative": 1, "vegetative": 1, "Early Vegetative": 1, "Late Vegetative": 1,
    "Pre-Flower": 2, "Transition": 2, "transition": 2,
    "Flowering": 3, "Early Flower": 3, "Bud Swell": 3, "Mid Flower": 3, "Late Flower": 3,
    "flowering": 3, "early flower": 3,
    "Harvest": 4, "Harvest Ready": 4,
  };
  const currentIdx = stageMap[stage] ?? 1;
  const totalEstimated = day + (daysToHarvest || 30);
  const overallPct = Math.min(1, day / totalEstimated);

  return (
    <View style={{ marginTop: 10, marginBottom: 4 }}>
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {GROW_STAGES.map((s, i) => (
          <View key={i} style={{ flex: s.pct, alignItems: "center" }}>
            <Text style={{
              color: i === currentIdx ? s.colour : C.grey,
              fontFamily: HEADING, fontSize: 8, letterSpacing: 0.5,
            }}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", height: 4, borderRadius: 2, overflow: "hidden", gap: 1 }}>
        {GROW_STAGES.map((s, i) => (
          <View key={i} style={{ flex: s.pct, backgroundColor: C.border }}>
            <View style={{
              width: i < currentIdx ? "100%" : i === currentIdx ? "60%" : "0%",
              height: 4, backgroundColor: s.colour,
              opacity: i < currentIdx ? 0.4 : 1,
            }} />
          </View>
        ))}
      </View>

      <View style={{ position: "relative", height: 8, marginTop: 1 }}>
        <View style={{
          position: "absolute",
          left: `${Math.max(0, Math.min(97, overallPct * 100))}%`,
          width: 6, height: 6, borderRadius: 3,
          backgroundColor: GROW_STAGES[currentIdx]?.colour || C.greenBright,
          marginLeft: -3, marginTop: 1,
        }} />
      </View>
    </View>
  );
}

// ── SCREEN: Grow List ─────────────────────────────────────────────────────────
function GrowListScreen({ onSelect, onNew, onCount }) {
  const [grows, setGrows]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [online, setOnline]     = useState(true);
  const [cachedAt, setCachedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getWithMeta("/tracker/grows");
      setGrows(result.data);
      setOnline(result.online);
      if (!result.online) setCachedAt(result.cachedAt);
      onCount?.(result.data.filter(g => g.status === "active").length);
    } catch (e) {
      Alert.alert("Connection Error", `Can't reach backend.\n${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusIcon   = (s) => ({ active: "◉", harvested: "✓", abandoned: "✗" }[s] || "◉");
  const statusColour = (s) => ({ active: C.greenBright, harvested: C.amber, abandoned: C.grey }[s] || C.grey);
  const stageAccent  = (stage) => ({
    Seedling: C.blue, Vegetative: C.greenBright,
    "Pre-Flower": C.amber, Flowering: "#c8733a", Harvest: "#d4a84b",
  }[stage] || C.grey);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.green} size="large" />
        <Text style={{ color: C.greenBright, fontFamily: HEADING,
          fontSize: 16, letterSpacing: 3, marginTop: 12 }}>LOADING GROWS...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>VY<Text style={{ color: C.greenBright }}>WEED</Text></Text>
          <Text style={{ color: C.grey, fontFamily: HEADING, fontSize: 12, letterSpacing: 3 }}>
            GROW TRACKER
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TouchableOpacity onPress={() => setShowInfo(true)} style={{
            width: 34, height: 34, borderRadius: 17,
            backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
            alignItems: "center", justifyContent: "center",
          }}>
            <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 16 }}>?</Text>
          </TouchableOpacity>
          <GreenBtn label="+ NEW GROW" onPress={onNew} small />
        </View>
      </View>

      <GrowInfoModal visible={showInfo} onClose={() => setShowInfo(false)} />
      <OfflineBanner
        visible={!online}
        cachedAt={cachedAt}
        onRetry={() => { setRefreshing(true); load(); }}
      />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={C.green} />
        }
      >
        {grows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🌱</Text>
            <Text style={{ color: C.greenBright, fontFamily: HEADING,
              fontSize: 22, letterSpacing: 3, marginTop: 12 }}>NO ACTIVE GROWS</Text>
            <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 13, marginTop: 6 }}>
              Tap + NEW GROW to start tracking
            </Text>
          </View>
        ) : (
          grows.map((g) => {
            const accent = stageAccent(g.stage);
            return (
              <TouchableOpacity key={g.grow_id} onPress={() => onSelect(g)} activeOpacity={0.8}>
                <View style={{
                  backgroundColor: C.card, borderRadius: 10, marginBottom: 12,
                  borderWidth: 1, borderColor: C.border,
                  flexDirection: "row", overflow: "hidden",
                }}>
                  <View style={{ width: 4, backgroundColor: accent }} />
                  <View style={{ flex: 1, padding: 14 }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start",
                      justifyContent: "space-between" }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ color: C.white, fontFamily: HEADING,
                          fontSize: 22, letterSpacing: 1, lineHeight: 24 }}>
                          {g.strain_name}
                        </Text>
                        <Text style={{ color: C.grey, fontFamily: SANS_MED,
                          fontSize: 11, marginTop: 2 }}>
                          {g.grow_id.toUpperCase()} · {g.medium.toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={{
                          color: statusColour(g.status), fontFamily: HEADING,
                          fontSize: 13, letterSpacing: 1.5,
                        }}>
                          {statusIcon(g.status)} {g.status.toUpperCase()}
                        </Text>
                        <StagePill stage={g.stage} />
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
                      <StatBox label="DAY" value={g.current_day} />
                      <StatBox label="TO HARVEST" value={g.days_to_harvest ?? "?"}
                        unit="days" colour={C.amber} />
                    </View>

                    <GrowStageBar stage={g.stage} day={g.current_day}
                      daysToHarvest={g.days_to_harvest} />

                    <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 10, marginTop: 6 }}>
                      STARTED {g.start_date}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ── Grow Hero ─────────────────────────────────────────────────────────────────
const STAGE_GLYPH = {
  Seedling: "🌱", Vegetative: "🌿", "Pre-Flower": "🌸",
  Flowering: "💐", Harvest: "✂️",
};
const STAGE_GLOW = {
  Seedling: C.blue, Vegetative: C.greenBright,
  "Pre-Flower": C.amber, Flowering: "#c8733a", Harvest: "#d4a84b",
};
// Taller stage so the plant has room to "grow" as the grow ages (IRL + in-app)
const HERO_H = Math.round(SH * 0.35);

function GrowHero({ strainName, stage, day, medium, startDate, logCount,
                    criticalCount, onBack, onCheckin, onNutrients, onTimeline, onPhotos, onScan, onGuidedScan, onVideoScan }) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 3200, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 3200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const floatY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });

  const glyph    = STAGE_GLYPH[stage] || "🌱";
  const glowCol  = STAGE_GLOW[stage]  || C.greenBright;
  // Plant gets bigger as the grow ages — it grows alongside the real plant
  const plantSize = Math.min(150, 88 + (day || 0) * 1.1);

  return (
    <View style={{ backgroundColor: C.bg }}>
      {/* Hero canvas */}
      <View style={{ height: HERO_H }}>

        {/* SVG radial glow */}
        <Svg style={StyleSheet.absoluteFill} width="100%" height={HERO_H}>
          <Defs>
            <RadialGradient id="hg" cx="50%" cy="56%" rx="60%" ry="60%">
              <Stop offset="0%"   stopColor={glowCol} stopOpacity="0.30" />
              <Stop offset="50%"  stopColor={glowCol} stopOpacity="0.07" />
              <Stop offset="100%" stopColor={C.bg}    stopOpacity="0"    />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height={HERO_H} fill={C.bg} />
          <Rect x={0} y={0} width="100%" height={HERO_H} fill="url(#hg)" />
        </Svg>

        {/* HUD corner brackets */}
        {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v, h]) => (
          <View key={v+h} style={{
            position: "absolute", [v]: 14, [h]: 14, width: 18, height: 18,
          }}>
            <View style={{
              position: "absolute",
              [v === "top" ? "top" : "bottom"]: 0,
              left: 0, right: 0, height: 2,
              backgroundColor: glowCol, opacity: 0.45,
            }} />
            <View style={{
              position: "absolute",
              [h === "left" ? "left" : "right"]: 0,
              top: 0, bottom: 0, width: 2,
              backgroundColor: glowCol, opacity: 0.45,
            }} />
          </View>
        ))}

        {/* Nav bar — back + critical badge + check-in */}
        <View style={{
          position: "absolute", top: 0, left: 0, right: 0,
          paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 16 : 50,
          paddingHorizontal: 16,
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        }}>
          <TouchableOpacity onPress={onBack} style={{ padding: 4 }}>
            <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {criticalCount > 0 && (
              <View style={{ backgroundColor: "#1a0808", borderRadius: 4,
                paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.red }}>
                <Text style={{ color: C.red, fontFamily: HEADING, fontSize: 12, letterSpacing: 1 }}>
                  ⚠ {criticalCount}
                </Text>
              </View>
            )}
            <GreenBtn label="CHECK IN" onPress={onCheckin} small />
          </View>
        </View>

        {/* Floating stage glyph — vertically centred so it has room to grow */}
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
          alignItems: "center", justifyContent: "center" }} pointerEvents="none">
          <Animated.Text style={{ fontSize: plantSize, transform: [{ translateY: floatY }] }}>
            {glyph}
          </Animated.Text>
        </View>

        {/* DAY counter — bottom-right */}
        <View style={{ position: "absolute", bottom: 14, right: 16, alignItems: "flex-end" }}>
          <Text style={{ color: glowCol, fontFamily: HEADING,
            fontSize: 60, letterSpacing: 2, lineHeight: 60, opacity: 0.92 }}>
            {day}
          </Text>
          <Text style={{ color: C.greyLight, fontFamily: HEADING,
            fontSize: 13, letterSpacing: 5, marginTop: -8 }}>
            DAY
          </Text>
        </View>
      </View>

      {/* Floating name plate — overlaps hero bottom */}
      <View style={{ marginHorizontal: 16, marginTop: -18, marginBottom: 0,
        backgroundColor: C.card, borderRadius: 10,
        borderWidth: 1, borderColor: C.border,
        paddingHorizontal: 14, paddingVertical: 10,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        elevation: 6, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8,
      }}>
        <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 22,
          letterSpacing: 1, flex: 1 }} numberOfLines={1}>
          {strainName}
        </Text>
        <StagePill stage={stage} />
      </View>

      {/* Meta strip */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 8,
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        borderBottomWidth: 1, borderColor: C.border }}>
        <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 11 }}>
          {medium?.toUpperCase()} · {startDate}
        </Text>
        <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 11 }}>
          {logCount} LOGS
        </Text>
      </View>

      {/* Action pills */}
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10,
        borderBottomWidth: 1, borderColor: C.border }}>
        <TouchableOpacity onPress={onNutrients} style={{
          flex: 1, backgroundColor: C.surface, borderRadius: 20,
          borderWidth: 1, borderColor: C.amber, paddingVertical: 8, alignItems: "center",
        }}>
          <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 12, letterSpacing: 1 }}>
            🧪 NUTRIENTS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onTimeline} style={{
          flex: 1, backgroundColor: C.surface, borderRadius: 20,
          borderWidth: 1, borderColor: C.blue, paddingVertical: 8, alignItems: "center",
        }}>
          <Text style={{ color: C.blue, fontFamily: HEADING, fontSize: 12, letterSpacing: 1 }}>
            📈 TIMELINE
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPhotos} style={{
          flex: 1, backgroundColor: C.surface, borderRadius: 20,
          borderWidth: 1, borderColor: C.purple, paddingVertical: 8, alignItems: "center",
        }}>
          <Text style={{ color: C.purple, fontFamily: HEADING, fontSize: 12, letterSpacing: 1 }}>
            📷 PHOTOS
          </Text>
        </TouchableOpacity>
      </View>

      {/* Scan plant actions */}
      <View style={{ paddingHorizontal: 16, paddingTop: 0, paddingBottom: 10,
        borderBottomWidth: 1, borderColor: C.border, gap: 8 }}>
        <TouchableOpacity onPress={onScan} style={{
          backgroundColor: C.surface, borderRadius: 20,
          borderWidth: 1, borderColor: C.amber, paddingVertical: 8, alignItems: "center",
        }}>
          <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 12, letterSpacing: 1 }}>
            📸 SCAN PLANT
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onGuidedScan} style={{
          borderWidth: 1, borderColor: C.green,
          borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16,
          flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <Text style={{ color: C.green, fontFamily: MONO, fontSize: 11 }}>
            📐 GUIDED SCAN — 5 SHOTS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onVideoScan} style={{
          borderWidth: 1, borderColor: "#a855f7",
          borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16,
          flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
          marginTop: 6,
        }}>
          <Text style={{ color: "#a855f7", fontFamily: MONO, fontSize: 11 }}>
            🎥 3D VIDEO SCAN — BUILD MY PLANT
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── SCREEN: Grow Detail ───────────────────────────────────────────────────────
function GrowDetailScreen({ grow, onBack, onCheckin, onNutrients, onTimeline, onPhotos, onScan, onGuidedScan, onVideoScan }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("today");

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/tracker/grows/${grow.grow_id}`);
      setReport(data);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [grow.grow_id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!report) return;
    const r       = report.report || {};
    const summary = r.daily_summary || {};
    const alerts  = r.environment_alerts || [];
    const harvest = r.harvest_prediction || {};
    setGrowverContext("grows", {
      strainName:           grow.strain_name,
      stage:                grow.stage,
      currentDay:           grow.current_day,
      medium:               grow.medium,
      status:               grow.status,
      daysToHarvest:        grow.days_to_harvest,
      expertTip:            summary.expert_tip_of_the_day,
      wateringGuide:        summary.watering_guidance,
      nutrientGuide:        summary.nutrient_guidance,
      whatHealthyLooksLike: summary.what_healthy_looks_like,
      activeAlerts:         alerts.map(a => `[${a.severity.toUpperCase()}] ${a.message}`),
      harvestTypical:       harvest.typical_harvest,
      daysToHarvestTypical: harvest.days_remaining_typical,
    });
  }, [report]);

  if (loading || !report) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.green} />
        <Text style={{ color: C.greenBright, fontFamily: HEADING,
          fontSize: 15, letterSpacing: 2, marginTop: 10 }}>LOADING REPORT...</Text>
      </View>
    );
  }

  const r              = report.report || {};
  const summary        = r.daily_summary || {};
  const alerts         = r.environment_alerts || [];
  const harvest        = r.harvest_prediction || {};
  const criticalAlerts = alerts.filter(a => a.severity === "critical");

  return (
    <View style={styles.screen}>
      <GrowHero
        strainName={report.strain_name}
        stage={r.stage}
        day={report.current_day}
        medium={report.medium}
        startDate={report.start_date}
        logCount={report.env_log_count}
        criticalCount={criticalAlerts.length}
        onBack={onBack}
        onCheckin={() => onCheckin(grow)}
        onNutrients={onNutrients}
        onTimeline={onTimeline}
        onPhotos={onPhotos}
        onScan={onScan}
        onGuidedScan={onGuidedScan}
        onVideoScan={onVideoScan}
      />

      {/* Tab bar */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: C.border }}>
        {["today", "alerts", "harvest"].map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={{
            flex: 1, paddingVertical: 12, alignItems: "center",
            borderBottomWidth: 2, borderColor: tab === t ? C.greenBright : "transparent",
          }}>
            <Text style={{
              fontFamily: HEADING, fontSize: 14, letterSpacing: 1.5,
              color: tab === t ? C.greenBright : C.grey,
            }}>
              {t === "today" ? "TODAY"
                : t === "alerts" ? `ALERTS (${alerts.length})`
                : "HARVEST"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* TODAY TAB */}
        {tab === "today" && (
          <>
            {summary.expert_tip_of_the_day && (
              <Card style={{ borderColor: C.greenDim, backgroundColor: C.greenFaint }}>
                <Label style={{ color: C.greenDim }}>EXPERT TIP · DAY {report.current_day}</Label>
                <Text style={{ color: C.white, fontFamily: SANS, fontSize: 13,
                  marginTop: 6, lineHeight: 20 }}>
                  💡 {summary.expert_tip_of_the_day}
                </Text>
              </Card>
            )}

            <Card>
              <Label>TODAY'S CHECKLIST</Label>
              <View style={{ marginTop: 10, gap: 10 }}>
                {(summary.checklist || []).map((item, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                    <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 16 }}>□</Text>
                    <Text style={{ color: C.white, fontFamily: SANS, fontSize: 13,
                      flex: 1, lineHeight: 19 }}>
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>

            {summary.watering_guidance && (
              <Card style={{ borderColor: C.blue }}>
                <Label style={{ color: C.blue }}>💧 WATERING</Label>
                <Text style={{ color: C.white, fontFamily: SANS, fontSize: 13,
                  marginTop: 6, lineHeight: 19 }}>
                  {summary.watering_guidance}
                </Text>
              </Card>
            )}

            {summary.nutrient_guidance && (
              <Card style={{ borderColor: C.amber }}>
                <Label style={{ color: C.amber }}>🧪 NUTRIENTS</Label>
                <Text style={{ color: C.white, fontFamily: SANS, fontSize: 13,
                  marginTop: 6, lineHeight: 19 }}>
                  {summary.nutrient_guidance}
                </Text>
              </Card>
            )}

            {summary.what_healthy_looks_like && (
              <Card>
                <Label>WHAT HEALTHY LOOKS LIKE</Label>
                <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 12,
                  marginTop: 6, lineHeight: 18 }}>
                  {summary.what_healthy_looks_like}
                </Text>
              </Card>
            )}

            {summary.upcoming?.length > 0 && (
              <Card>
                <Label>UPCOMING</Label>
                {summary.upcoming.map((u, i) => (
                  <Text key={i} style={{ color: C.amber, fontFamily: SANS_MED,
                    fontSize: 12, marginTop: 6 }}>→ {u}</Text>
                ))}
              </Card>
            )}
          </>
        )}

        {/* ALERTS TAB */}
        {tab === "alerts" && (
          <>
            {alerts.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 48 }}>✓</Text>
                <Text style={{ color: C.greenBright, fontFamily: HEADING,
                  fontSize: 22, letterSpacing: 3, marginTop: 8 }}>ALL CLEAR</Text>
                <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 13, marginTop: 4 }}>
                  No environment alerts
                </Text>
              </View>
            ) : (
              alerts.map((a, i) => (
                <Card key={i} style={{
                  borderColor: a.severity === "critical" ? C.red
                    : a.severity === "warning" ? C.amber : C.blue,
                }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 8 }}>
                    <AlertBadge severity={a.severity} />
                    <Text style={{ color: C.grey, fontFamily: HEADING,
                      fontSize: 11, letterSpacing: 1 }}>
                      {a.category?.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={{ color: C.white, fontFamily: SANS, fontSize: 13,
                    lineHeight: 19, marginBottom: 6 }}>
                    {a.message}
                  </Text>
                  {a.consequence && (
                    <Text style={{ color: C.amber, fontFamily: SANS_MED, fontSize: 12,
                      lineHeight: 17, marginBottom: 6 }}>
                      ⚡ {a.consequence}
                    </Text>
                  )}
                  {a.fix && (
                    <View style={{ backgroundColor: C.greenFaint, borderRadius: 6, padding: 10 }}>
                      <Text style={{ color: C.greenBright, fontFamily: SANS_MED,
                        fontSize: 12, lineHeight: 17 }}>
                        FIX: {a.fix}
                      </Text>
                    </View>
                  )}
                </Card>
              ))
            )}
          </>
        )}

        {/* HARVEST TAB */}
        {tab === "harvest" && harvest.typical_harvest && (
          <>
            <Card style={{ borderColor: C.amber }}>
              <Label style={{ color: C.amber }}>HARVEST WINDOW</Label>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <StatBox label="EARLIEST" value={harvest.earliest_harvest?.slice(5)}
                  colour={C.greenBright} />
                <StatBox label="TYPICAL" value={harvest.typical_harvest?.slice(5)}
                  colour={C.amber} />
                <StatBox label="LATEST" value={harvest.latest_harvest?.slice(5)}
                  colour={C.red} />
              </View>
            </Card>

            <Card>
              <Label>DAYS REMAINING</Label>
              <Text style={{ color: C.amber, fontFamily: HEADING,
                fontSize: 64, letterSpacing: 2, marginTop: 4 }}>
                {harvest.days_remaining_typical}
              </Text>
              <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 12 }}>
                days to typical harvest
              </Text>
            </Card>

            <Card>
              <Label>NOTE</Label>
              <Text style={{ color: C.greyLight, fontFamily: SANS,
                fontSize: 12, marginTop: 6, lineHeight: 18 }}>
                {harvest.note}
              </Text>
            </Card>

            <Card>
              <Label>GROW PROGRESS</Label>
              <View style={{ height: 6, backgroundColor: C.border, borderRadius: 3,
                marginTop: 12, overflow: "hidden" }}>
                <View style={{
                  height: 6, borderRadius: 3, backgroundColor: C.greenBright,
                  width: `${Math.min(100, (report.current_day /
                    (report.current_day + (harvest.days_remaining_typical || 0))) * 100)}%`,
                }} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 11 }}>
                  Day {report.current_day}
                </Text>
                <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 11 }}>
                  {report.current_day + (harvest.days_remaining_typical || 0)} days total
                </Text>
              </View>
            </Card>
          </>
        )}

      </ScrollView>
    </View>
  );
}

// ── MODAL: Check-in ───────────────────────────────────────────────────────────
function CheckinModal({ grow, onClose, onComplete }) {
  const [temp, setTemp]         = useState("");
  const [humidity, setHumidity] = useState("");
  const [ph, setPh]             = useState("");
  const [ec, setEc]             = useState("");
  const [notes, setNotes]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [photos, setPhotos]     = useState([]);
  const [photoLoading, setPhotoLoading] = useState(false);

  const handleAddPhoto = async (source) => {
    setPhotoLoading(true);
    try {
      const uri = await pickPhoto(source);
      if (uri) setPhotos(prev => [...prev, uri]);
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleRemovePhoto = (idx) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    setLoading(true);
    try {
      const env = {};
      if (temp)     env.temp_day = parseFloat(temp);
      if (humidity) env.humidity = parseFloat(humidity);
      if (ph)       env.ph = parseFloat(ph);
      if (ec)       env.ec = parseFloat(ec);
      if (notes)    env.notes = notes;

      const start = new Date(grow.start_date);
      const day = Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000) + 1);

      const savedFilenames = [];
      for (const uri of photos) {
        const filename = await savePhoto(uri, grow.grow_id, day);
        savedFilenames.push(filename);
      }

      const result = await api.post(`/tracker/grows/${grow.grow_id}/checkin`, {
        env: Object.keys(env).length ? env : null,
        photos: savedFilenames,
      });

      await resetStreakReminder(grow.grow_id, grow.strain_name);

      if (result.harvest_prediction?.days_remaining_typical < 21) {
        await scheduleHarvestAlert(
          grow.grow_id, grow.strain_name,
          result.harvest_prediction.days_remaining_typical
        );
      }

      onComplete({ ...result, photos: savedFilenames });
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modal}>
          <View style={{ flexDirection: "row", justifyContent: "space-between",
            alignItems: "center", marginBottom: 16 }}>
            <Text style={{ color: C.greenBright, fontFamily: HEADING,
              fontSize: 22, letterSpacing: 2 }}>DAILY CHECK-IN</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: C.grey, fontFamily: SANS_BOLD, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <Label style={{ marginBottom: 4 }}>STRAIN</Label>
          <Text style={{ color: C.white, fontFamily: SANS_MED, fontSize: 14, marginBottom: 16 }}>
            {grow?.strain_name}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Label>TEMP °C</Label>
              <TextInput
                style={styles.input} value={temp}
                onChangeText={setTemp} keyboardType="decimal-pad"
                placeholder="24.0" placeholderTextColor={C.grey}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Label>HUMIDITY %</Label>
              <TextInput
                style={styles.input} value={humidity}
                onChangeText={setHumidity} keyboardType="decimal-pad"
                placeholder="55" placeholderTextColor={C.grey}
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Label>PH</Label>
              <TextInput
                style={styles.input} value={ph}
                onChangeText={setPh} keyboardType="decimal-pad"
                placeholder="6.3" placeholderTextColor={C.grey}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Label>EC (mS/cm)</Label>
              <TextInput
                style={styles.input} value={ec}
                onChangeText={setEc} keyboardType="decimal-pad"
                placeholder="1.4" placeholderTextColor={C.grey}
              />
            </View>
          </View>

          <Label style={{ marginBottom: 4 }}>NOTES (OPTIONAL)</Label>
          <TextInput
            style={[styles.input, { height: 64, textAlignVertical: "top" }]}
            value={notes} onChangeText={setNotes}
            placeholder="Leaves look healthy, started LST..."
            placeholderTextColor={C.grey} multiline
          />

          <Label style={{ marginBottom: 6, marginTop: 12 }}>PHOTOS (OPTIONAL)</Label>
          <PhotoStrip
            photos={photos}
            onAdd={handleAddPhoto}
            onRemove={handleRemovePhoto}
            loading={photoLoading}
          />

          <GreenBtn
            label={loading ? "LOGGING..." : "LOG CHECK-IN"}
            onPress={submit} style={{ marginTop: 16 }}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── MODAL: New Grow ───────────────────────────────────────────────────────────
function NewGrowModal({ onClose, onCreate, prefillStrain }) {
  const [strainId, setStrainId]   = useState(prefillStrain?.id   ?? "");
  const [strainName, setStrainName] = useState(prefillStrain?.name ?? "");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [medium, setMedium]       = useState("soil");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading]     = useState(false);

  const fetchSuggestions = async (q) => {
    if (q.length < 2) { setSuggestions([]); return; }
    try {
      const data = await api.get(`/search/suggest?q=${encodeURIComponent(q)}&limit=6`);
      setSuggestions(data.suggestions || []);
    } catch { setSuggestions([]); }
  };

  const pickSuggestion = (s) => {
    setStrainId(s.id);
    setStrainName(s.name);
    setSuggestions([]);
  };

  const submit = async () => {
    if (!strainId || !strainName) {
      Alert.alert("Required", "Select a strain first");
      return;
    }
    setLoading(true);
    try {
      const result = await api.post("/tracker/grows", {
        strain_id: strainId,
        strain_name: strainName,
        start_date: startDate,
        medium,
      });
      onCreate(result);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modal}>
          <View style={{ flexDirection: "row", justifyContent: "space-between",
            alignItems: "center", marginBottom: 16 }}>
            <Text style={{ color: C.greenBright, fontFamily: HEADING,
              fontSize: 22, letterSpacing: 2 }}>START NEW GROW</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: C.grey, fontFamily: SANS_BOLD, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <Label style={{ marginBottom: 4 }}>SEARCH STRAIN</Label>
          <TextInput
            style={styles.input}
            value={strainName}
            onChangeText={(t) => { setStrainName(t); setStrainId(""); fetchSuggestions(t); }}
            placeholder="e.g. Gelato, OG Kush..."
            placeholderTextColor={C.grey}
          />

          {suggestions.length > 0 && (
            <View style={{
              backgroundColor: C.surface, borderRadius: 8,
              borderWidth: 1, borderColor: C.border, marginBottom: 10,
            }}>
              {suggestions.map((s) => (
                <TouchableOpacity key={s.id} onPress={() => pickSuggestion(s)}
                  style={{ padding: 12, borderBottomWidth: 1, borderColor: C.border }}>
                  <Text style={{ color: C.white, fontFamily: SANS_MED, fontSize: 13 }}>
                    {s.name}
                  </Text>
                  <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 10 }}>
                    {s.tier} · {s.type?.toUpperCase()} · THC {s.thc_max}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {strainId && (
            <View style={{ backgroundColor: C.greenFaint, borderRadius: 6,
              padding: 8, marginBottom: 10, borderWidth: 1, borderColor: C.greenDim }}>
              <Text style={{ color: C.greenBright, fontFamily: SANS_MED, fontSize: 12 }}>
                ✓ SELECTED: {strainId}
              </Text>
            </View>
          )}

          <Label style={{ marginBottom: 4 }}>START DATE</Label>
          <TextInput
            style={[styles.input, { marginBottom: 10 }]}
            value={startDate} onChangeText={setStartDate}
            placeholder="YYYY-MM-DD" placeholderTextColor={C.grey}
          />

          <Label style={{ marginBottom: 6 }}>MEDIUM</Label>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            {["soil", "coco", "hydro"].map(m => (
              <TouchableOpacity key={m} onPress={() => setMedium(m)} style={{
                flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center",
                borderWidth: 1,
                borderColor: medium === m ? C.green : C.border,
                backgroundColor: medium === m ? C.greenFaint : C.surface,
              }}>
                <Text style={{
                  color: medium === m ? C.greenBright : C.grey,
                  fontFamily: HEADING, fontSize: 14, letterSpacing: 1,
                }}>
                  {m.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <GreenBtn
            label={loading ? "STARTING..." : "🌱 START GROW"}
            onPress={submit}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── MODAL: Check-in Result ────────────────────────────────────────────────────
function CheckinResultModal({ result, onClose }) {
  if (!result) return null;
  const alerts   = result.alerts || [];
  const critical = alerts.filter(a => a.severity === "critical");
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modal}>
          <Text style={{ color: C.greenBright, fontFamily: HEADING,
            fontSize: 22, letterSpacing: 2, marginBottom: 4 }}>
            ✓ CHECK-IN LOGGED
          </Text>
          <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 11, marginBottom: 16 }}>
            DAY {result.day} · {result.stage?.toUpperCase()}
          </Text>

          {result.urgent && (
            <View style={{ backgroundColor: "#1a0808", borderRadius: 8,
              borderWidth: 1, borderColor: C.red, padding: 12, marginBottom: 12 }}>
              <Text style={{ color: C.red, fontFamily: HEADING,
                fontSize: 15, letterSpacing: 1, marginBottom: 4 }}>
                ⚠ URGENT ACTION REQUIRED
              </Text>
              {critical.map((a, i) => (
                <Text key={i} style={{ color: C.red, fontFamily: SANS_MED,
                  fontSize: 12, marginTop: 4 }}>
                  · {a.message}
                </Text>
              ))}
            </View>
          )}

          {result.tip && (
            <Card style={{ borderColor: C.greenDim }}>
              <Text style={{ color: C.white, fontFamily: SANS, fontSize: 12, lineHeight: 18 }}>
                💡 {result.tip}
              </Text>
            </Card>
          )}

          <Text style={{ color: C.greyLight, fontFamily: HEADING,
            fontSize: 13, letterSpacing: 1.5, marginBottom: 12 }}>
            CHECKLIST ({result.checklist?.length || 0} items)
          </Text>
          {(result.checklist || []).slice(0, 4).map((item, i) => (
            <Text key={i} style={{ color: C.white, fontFamily: SANS,
              fontSize: 12, marginBottom: 6 }}>
              □ {item}
            </Text>
          ))}

          <GreenBtn label="DONE" onPress={onClose} style={{ marginTop: 16 }} />
        </View>
      </View>
    </Modal>
  );
}

// ── MODAL: Plant Scan (Growver AI Vision) ────────────────────────────────────
//
// Backend API contract:
//   POST /api/v1/vision/analyze-plant
//   Content-Type: multipart/form-data
//   Body fields:
//     image    — (file) JPEG photo of the plant
//     grow_id  — (string, optional) ID of the grow being scanned
//
//   Response 200:
//   {
//     stage:        string,    // e.g. "Mid Flower"
//     health_pct:   number,    // 0–100
//     deficiencies: string[],  // e.g. ["nitrogen", "calcium"] or []
//     issues:       string[],  // e.g. ["slight overwatering"] or []
//     notes:        string,    // Growver one-liner observation
//     confidence:   number     // 0–1
//   }

function PlantScanModal({ visible, growId, onClose, onApply }) {
  const [photo,   setPhoto]   = useState(null);   // { uri, width, height }
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);   // analysis JSON from backend

  // Reset state whenever the modal opens fresh
  useEffect(() => {
    if (visible) {
      setPhoto(null);
      setLoading(false);
      setResult(null);
    }
  }, [visible]);

  // Pulsing animation for the loading overlay
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (!loading) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [loading]);

  // Slide-up animation for the results card
  const slideAnim = useRef(new Animated.Value(80)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!result) return;
    slideAnim.setValue(80);
    fadeAnim.setValue(0);
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0,   duration: 380, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1.0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [result]);

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera access required", "Allow camera access in your device settings.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.75,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!res.canceled && res.assets?.[0]) {
      handlePhoto(res.assets[0]);
    }
  }

  async function pickFromGallery() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.75,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!res.canceled && res.assets?.[0]) {
      handlePhoto(res.assets[0]);
    }
  }

  async function handlePhoto(asset) {
    setPhoto(asset);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", {
        uri:  asset.uri,
        type: "image/jpeg",
        name: "plant_scan.jpg",
      });
      if (growId) formData.append("grow_id", growId);

      // NOTE: Do NOT set Content-Type manually — fetch sets the multipart boundary
      const res = await fetch(`${getApiV1()}/vision/analyze-plant`, {
        method:  "POST",
        headers: { ...BACKEND_HEADERS },
        body:    formData,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (e) {
      Alert.alert("Analysis failed", e.message || "Could not reach Growver. Check your connection.");
      setPhoto(null);
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!result || !growId) return;
    try {
      const key = `scan:${growId}:${Date.now()}`;
      await AsyncStorage.setItem(key, JSON.stringify({
        ...result,
        photo_uri:  photo?.uri,
        scanned_at: new Date().toISOString(),
      }));
      onApply(result);
    } catch {}
    onClose();
  }

  // ── Stage colour helper ──────────────────────────────────────────────────────
  function stageColour(stage) {
    if (!stage) return C.greyLight;
    const s = stage.toLowerCase();
    if (s.includes("seed"))    return C.blue;
    if (s.includes("veg"))     return C.greenBright;
    if (s.includes("pre"))     return C.amber;
    if (s.includes("flower"))  return "#c8733a";
    if (s.includes("harvest")) return "#d4a84b";
    return C.greyLight;
  }

  // ── Health bar colour ────────────────────────────────────────────────────────
  function healthColour(pct) {
    if (pct >= 75) return C.greenBright;
    if (pct >= 50) return C.amber;
    return C.red;
  }

  // ── Stage glyph ──────────────────────────────────────────────────────────────
  function stageGlyph(stage) {
    if (!stage) return "🌱";
    const s = stage.toLowerCase();
    if (s.includes("seed"))    return "🌱";
    if (s.includes("veg"))     return "🌿";
    if (s.includes("pre"))     return "🌸";
    if (s.includes("flower"))  return "💐";
    if (s.includes("harvest")) return "✂️";
    return "🌱";
  }

  const photoH = Math.round(SH * 0.42);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>

        {/* ── PHASE 1: Source picker (no photo yet) ─────────────────────── */}
        {!photo && !loading && !result && (
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            {/* Dark backdrop tap area to dismiss */}
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={onClose}
            >
              <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} />
            </TouchableOpacity>

            <View style={{
              backgroundColor: C.card,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              borderTopWidth: 1, borderColor: C.border,
              paddingHorizontal: 24, paddingTop: 16, paddingBottom: 48,
            }}>
              {/* Drag handle */}
              <View style={{ alignItems: "center", marginBottom: 20 }}>
                <View style={{ width: 36, height: 4, backgroundColor: C.border, borderRadius: 2 }} />
              </View>

              {/* Header */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 }}>
                <Text style={{ fontSize: 28 }}>📸</Text>
                <View>
                  <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 26, letterSpacing: 2 }}>
                    SCAN YOUR PLANT
                  </Text>
                  <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 12 }}>
                    Growver will analyse stage, health and deficiencies
                  </Text>
                </View>
              </View>

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: C.border, marginVertical: 20 }} />

              {/* Camera button */}
              <TouchableOpacity
                onPress={pickFromCamera}
                activeOpacity={0.75}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 14,
                  backgroundColor: C.surface, borderRadius: 14,
                  borderWidth: 1, borderColor: C.green,
                  paddingVertical: 16, paddingHorizontal: 20, marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 24 }}>📷</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 18, letterSpacing: 1.5 }}>
                    OPEN CAMERA
                  </Text>
                  <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 11 }}>
                    Take a fresh photo right now
                  </Text>
                </View>
                <Text style={{ color: C.greenDim, fontFamily: HEADING, fontSize: 18 }}>›</Text>
              </TouchableOpacity>

              {/* Gallery button */}
              <TouchableOpacity
                onPress={pickFromGallery}
                activeOpacity={0.75}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 14,
                  backgroundColor: C.surface, borderRadius: 14,
                  borderWidth: 1, borderColor: C.border,
                  paddingVertical: 16, paddingHorizontal: 20, marginBottom: 24,
                }}
              >
                <Text style={{ fontSize: 24 }}>🖼</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 18, letterSpacing: 1.5 }}>
                    CHOOSE FROM GALLERY
                  </Text>
                  <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 11 }}>
                    Pick an existing photo
                  </Text>
                </View>
                <Text style={{ color: C.grey, fontFamily: HEADING, fontSize: 18 }}>›</Text>
              </TouchableOpacity>

              {/* Cancel */}
              <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ alignItems: "center", paddingVertical: 10 }}>
                <Text style={{ color: C.grey, fontFamily: HEADING, fontSize: 15, letterSpacing: 2 }}>
                  CANCEL
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── PHASE 2: Photo + pulsing loading overlay ──────────────────── */}
        {photo && (loading || (!loading && !result)) && (
          <View style={{ flex: 1 }}>
            {/* Photo fills most of the screen */}
            <Image
              source={{ uri: photo.uri }}
              style={{ width: "100%", height: photoH, resizeMode: "cover" }}
            />

            {/* Loading overlay */}
            {loading && (
              <View style={{
                position: "absolute", top: 0, left: 0, right: 0, height: photoH,
                backgroundColor: "rgba(0,0,0,0.55)",
                alignItems: "center", justifyContent: "center",
              }}>
                <Animated.View style={{ opacity: pulseAnim, alignItems: "center", gap: 12 }}>
                  <View style={{
                    width: 18, height: 18, borderRadius: 9,
                    backgroundColor: C.greenBright,
                    shadowColor: C.greenBright, shadowRadius: 12, shadowOpacity: 0.9,
                    elevation: 8,
                  }} />
                  <Text style={{
                    color: C.greenBright, fontFamily: HEADING,
                    fontSize: 18, letterSpacing: 3, textAlign: "center",
                  }}>
                    GROWVER IS ANALYSING{"\n"}YOUR PLANT...
                  </Text>
                </Animated.View>
              </View>
            )}

            {/* Cancel strip below photo */}
            {loading && (
              <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
                <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ padding: 12 }}>
                  <Text style={{ color: C.grey, fontFamily: HEADING, fontSize: 14, letterSpacing: 2 }}>
                    CANCEL
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── PHASE 3: Results card ─────────────────────────────────────── */}
        {photo && result && !loading && (
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }} bounces={false}>
            {/* Photo at half height */}
            <Image
              source={{ uri: photo.uri }}
              style={{ width: "100%", aspectRatio: 3 / 4, resizeMode: "cover", maxHeight: photoH }}
            />

            {/* Results card slides up over photo */}
            <Animated.View style={{
              backgroundColor: C.card,
              borderRadius: 20,
              borderWidth: 1, borderColor: C.border,
              padding: 20,
              marginTop: -24,
              marginHorizontal: 0,
              transform: [{ translateY: slideAnim }],
              opacity: fadeAnim,
            }}>

              {/* Stage pill */}
              {result.stage && (() => {
                const col = stageColour(result.stage);
                return (
                  <View style={{
                    flexDirection: "row", alignItems: "center",
                    gap: 8, marginBottom: 16,
                  }}>
                    <View style={{
                      backgroundColor: `${col}22`,
                      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
                      borderWidth: 1, borderColor: `${col}80`,
                      flexDirection: "row", alignItems: "center", gap: 6,
                    }}>
                      <Text style={{ fontSize: 16 }}>{stageGlyph(result.stage)}</Text>
                      <Text style={{ color: col, fontFamily: HEADING, fontSize: 18, letterSpacing: 2 }}>
                        {result.stage.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 11 }}>
                      DETECTED STAGE
                    </Text>
                  </View>
                );
              })()}

              {/* Health bar */}
              {result.health_pct != null && (() => {
                const pct = Math.max(0, Math.min(100, result.health_pct));
                const col = healthColour(pct);
                return (
                  <View style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 12, letterSpacing: 2 }}>
                        PLANT HEALTH
                      </Text>
                      <Text style={{ color: col, fontFamily: HEADING, fontSize: 18, letterSpacing: 1 }}>
                        {pct}%
                      </Text>
                    </View>
                    <View style={{ height: 8, backgroundColor: C.border, borderRadius: 4, overflow: "hidden" }}>
                      <View style={{
                        height: 8, borderRadius: 4,
                        backgroundColor: col,
                        width: `${pct}%`,
                      }} />
                    </View>
                  </View>
                );
              })()}

              {/* Deficiencies */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 12,
                  letterSpacing: 2, marginBottom: 8 }}>DEFICIENCIES</Text>
                {(!result.deficiencies || result.deficiencies.length === 0) ? (
                  <Text style={{ color: C.greenBright, fontFamily: SANS_MED, fontSize: 13 }}>
                    None detected ✓
                  </Text>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {result.deficiencies.map((d, i) => (
                      <View key={i} style={{
                        backgroundColor: "#1a0808", borderRadius: 6,
                        paddingHorizontal: 10, paddingVertical: 4,
                        borderWidth: 1, borderColor: C.red,
                      }}>
                        <Text style={{ color: C.red, fontFamily: SANS_MED, fontSize: 12 }}>
                          {d}
                        </Text>
                      </View>
                    ))}
                    {(result.issues || []).map((iss, i) => (
                      <View key={`iss-${i}`} style={{
                        backgroundColor: "#1a1008", borderRadius: 6,
                        paddingHorizontal: 10, paddingVertical: 4,
                        borderWidth: 1, borderColor: C.amber,
                      }}>
                        <Text style={{ color: C.amber, fontFamily: SANS_MED, fontSize: 12 }}>
                          {iss}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Growver one-liner observation */}
              {result.notes && (
                <View style={{
                  backgroundColor: "#1a150a", borderRadius: 10,
                  borderWidth: 1, borderColor: `${C.amber}60`,
                  padding: 14, marginBottom: 16,
                }}>
                  <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 11,
                    letterSpacing: 2, marginBottom: 6 }}>GROWVER SAYS</Text>
                  <Text style={{
                    color: C.amber, fontFamily: SANS,
                    fontSize: 13, lineHeight: 20, fontStyle: "italic",
                  }}>
                    "{result.notes}"
                  </Text>
                </View>
              )}

              {/* Confidence */}
              {result.confidence != null && (
                <Text style={{
                  color: C.grey, fontFamily: SANS_MED, fontSize: 11,
                  marginBottom: 20,
                }}>
                  Confidence: {Math.round(result.confidence * 100)}%
                </Text>
              )}

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: C.border, marginBottom: 16 }} />

              {/* Action buttons */}
              <TouchableOpacity
                onPress={apply}
                activeOpacity={0.75}
                style={{
                  backgroundColor: C.greenFaint, borderRadius: 10,
                  borderWidth: 1, borderColor: C.green,
                  paddingVertical: 14, alignItems: "center", marginBottom: 10,
                }}
              >
                <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 18, letterSpacing: 2 }}>
                  ✓ APPLY TO GROW
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.7}
                style={{ alignItems: "center", paddingVertical: 12 }}
              >
                <Text style={{ color: C.grey, fontFamily: HEADING, fontSize: 15, letterSpacing: 2 }}>
                  DISMISS
                </Text>
              </TouchableOpacity>

            </Animated.View>
          </ScrollView>
        )}

      </View>
    </Modal>
  );
}

// ── COMPONENT: SVG scan guide overlays ───────────────────────────────────────
function ScanGuide({ type, width, height }) {
  const stroke = "#00ff88";
  const sw = 2;
  const dash = "8 6";
  const op = 0.6;
  const fillOp = 0.05;
  const cx = width / 2;
  const cy = height / 2;

  if (type === "topCircle") {
    const r = Math.min(width, height) * 0.42;
    return (
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Circle
          cx={cx} cy={cy} r={r}
          stroke={stroke} strokeWidth={sw} strokeDasharray={dash}
          fill={stroke} fillOpacity={fillOp}
          strokeOpacity={op}
        />
      </Svg>
    );
  }

  if (type === "fullRect") {
    const rw = width * 0.55;
    const rh = height * 0.85;
    return (
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Rect
          x={cx - rw / 2} y={cy - rh / 2} width={rw} height={rh}
          rx={10} ry={10}
          stroke={stroke} strokeWidth={sw} strokeDasharray={dash}
          fill={stroke} fillOpacity={fillOp}
          strokeOpacity={op}
        />
      </Svg>
    );
  }

  if (type === "centerCircle") {
    const r = Math.min(width, height) * 0.30;
    return (
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Circle
          cx={cx} cy={cy} r={r}
          stroke={stroke} strokeWidth={sw} strokeDasharray={dash}
          fill={stroke} fillOpacity={fillOp}
          strokeOpacity={op}
        />
      </Svg>
    );
  }

  if (type === "leafRect") {
    const rw = width * 0.78;
    const rh = height * 0.45;
    return (
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Rect
          x={cx - rw / 2} y={cy - rh / 2} width={rw} height={rh}
          rx={10} ry={10}
          stroke={stroke} strokeWidth={sw} strokeDasharray={dash}
          fill={stroke} fillOpacity={fillOp}
          strokeOpacity={op}
        />
      </Svg>
    );
  }

  if (type === "baseCircle") {
    const r = Math.min(width, height) * 0.28;
    const bcy = height * 0.72;
    return (
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Circle
          cx={cx} cy={bcy} r={r}
          stroke={stroke} strokeWidth={sw} strokeDasharray={dash}
          fill={stroke} fillOpacity={fillOp}
          strokeOpacity={op}
        />
      </Svg>
    );
  }

  return null;
}

// ── MODAL: Guided 5-shot plant scan ──────────────────────────────────────────
//
// Backend API contract:
//   POST /api/v1/vision/analyze-plant-multi
//   Content-Type: multipart/form-data
//   Fields: image_1..image_5 (jpeg files), grow_id (optional), scan_type="guided_5shot"
//
//   Response 200: same schema as /vision/analyze-plant
//   {
//     stage, health_pct, deficiencies, issues, notes, confidence
//   }

function GuidedScanModal({ visible, growId, onClose, onApply }) {
  // step: 0–4 = capture, 5 = review, 6 = analysing, 7 = results
  const [step,    setStep]   = useState(0);
  const [photos,  setPhotos] = useState([]);  // array of { uri }
  const [result,  setResult] = useState(null);
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();

  // Cycling status messages during analysis
  const analysisMsgs = [
    "Checking stage...",
    "Scanning for deficiencies...",
    "Reading trichome development...",
    "Assessing root zone...",
  ];
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    if (step !== 6) return;
    setMsgIdx(0);
    const iv = setInterval(() => setMsgIdx(i => (i + 1) % analysisMsgs.length), 2000);
    return () => clearInterval(iv);
  }, [step]);

  // Pulsing animation for analysis overlay
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (step !== 6) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [step]);

  // Slide-up animation for results
  const slideAnim = useRef(new Animated.Value(80)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (step !== 7 || !result) return;
    slideAnim.setValue(80);
    fadeAnim.setValue(0);
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0,   duration: 380, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1.0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [step, result]);

  const reset = () => {
    setStep(0);
    setPhotos([]);
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const capture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.75, skipProcessing: false });
      const next = [...photos, { uri: photo.uri }];
      setPhotos(next);
      if (step < SCAN_STEPS.length - 1) {
        setStep(s => s + 1);
      } else {
        setStep(5); // go to review
      }
    } catch (e) {
      Alert.alert("Capture failed", e.message);
    }
  };

  const analyse = async () => {
    setStep(6);
    try {
      const formData = new FormData();
      photos.forEach((p, i) => {
        formData.append(`image_${i + 1}`, {
          uri:  p.uri,
          type: "image/jpeg",
          name: `scan_${SCAN_STEPS[i].id}.jpg`,
        });
      });
      if (growId) formData.append("grow_id", String(growId));
      formData.append("scan_type", "guided_5shot");

      const res = await fetch(`${getApiV1()}/vision/analyze-plant-multi`, {
        method:  "POST",
        headers: { ...BACKEND_HEADERS },
        body:    formData,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setResult(data);
      setStep(7);
    } catch (e) {
      Alert.alert("Analysis failed", e.message || "Could not reach Growver.");
      setStep(5); // back to review
    }
  };

  const apply = async () => {
    try {
      await AsyncStorage.setItem(
        `guided_scan:${growId}:${Date.now()}`,
        JSON.stringify({ ...result, photos: photos.map(p => p.uri), scanned_at: new Date().toISOString() })
      );
      onApply(result);
    } catch {}
    handleClose();
  };

  // ── Shared result-card helpers (same as PlantScanModal) ───────────────────
  function stageColour(stage) {
    if (!stage) return C.greyLight;
    const s = stage.toLowerCase();
    if (s.includes("seed"))    return C.blue;
    if (s.includes("veg"))     return C.greenBright;
    if (s.includes("pre"))     return C.amber;
    if (s.includes("flower"))  return "#c8733a";
    if (s.includes("harvest")) return "#d4a84b";
    return C.greyLight;
  }
  function healthColour(pct) {
    if (pct >= 75) return C.greenBright;
    if (pct >= 50) return C.amber;
    return C.red;
  }
  function stageGlyph(stage) {
    if (!stage) return "🌱";
    const s = stage.toLowerCase();
    if (s.includes("seed"))    return "🌱";
    if (s.includes("veg"))     return "🌿";
    if (s.includes("pre"))     return "🌸";
    if (s.includes("flower"))  return "💐";
    if (s.includes("harvest")) return "✂️";
    return "🌱";
  }

  const camW = SW;
  const camH = Math.round(SH * 0.52);
  const currentStep = SCAN_STEPS[step] || SCAN_STEPS[0];

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: "#050a05" }}>

        {/* ── PHASE 0–4: Guided capture ──────────────────────────────────── */}
        {step >= 0 && step <= 4 && (
          <View style={{ flex: 1 }}>
            {/* Progress dots + shot label */}
            <View style={{
              paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 10 : 54,
              paddingHorizontal: 20, paddingBottom: 10,
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            }}>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                {SCAN_STEPS.map((_, i) => (
                  <View key={i} style={{
                    width: i === step ? 10 : 7,
                    height: i === step ? 10 : 7,
                    borderRadius: 5,
                    backgroundColor: i < step ? "#00ff88" : i === step ? C.white : C.grey,
                    borderWidth: i > step ? 1 : 0,
                    borderColor: C.grey,
                  }} />
                ))}
              </View>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11, letterSpacing: 1 }}>
                SHOT {step + 1} OF {SCAN_STEPS.length}
              </Text>
            </View>

            {/* Step icon + label */}
            <View style={{ paddingHorizontal: 20, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 22 }}>{currentStep.icon}</Text>
              <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 18, letterSpacing: 2 }}>
                {currentStep.label}
              </Text>
            </View>

            {/* Camera view */}
            <View style={{ width: camW, height: camH, backgroundColor: "#000", position: "relative" }}>
              {!permission?.granted ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
                  <Text style={{ color: C.white, fontFamily: SANS_MED, fontSize: 14, textAlign: "center", marginBottom: 16 }}>
                    Camera permission is required to use guided scan.
                  </Text>
                  <GreenBtn label="GRANT CAMERA ACCESS" onPress={requestPermission} small />
                </View>
              ) : (
                <>
                  <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing="back"
                  />
                  <ScanGuide type={currentStep.guide} width={camW} height={camH} />
                </>
              )}
            </View>

            {/* Instruction */}
            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 }}>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 13, lineHeight: 20, textAlign: "center" }}>
                {currentStep.instruction}
              </Text>
            </View>

            {/* Capture button */}
            <View style={{ alignItems: "center", paddingVertical: 10 }}>
              <TouchableOpacity
                onPress={capture}
                activeOpacity={0.8}
                style={{
                  width: 70, height: 70, borderRadius: 35,
                  backgroundColor: "#00ff88",
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 3, borderColor: C.white,
                  shadowColor: "#00ff88", shadowRadius: 14, shadowOpacity: 0.7, elevation: 8,
                }}
              >
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#050a05" }} />
              </TouchableOpacity>
              <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 12, letterSpacing: 2, marginTop: 8 }}>
                CAPTURE
              </Text>
            </View>

            {/* Cancel */}
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}
              style={{ alignItems: "center", paddingVertical: 12 }}>
              <Text style={{ color: C.grey, fontFamily: HEADING, fontSize: 13, letterSpacing: 2 }}>
                ✕ CANCEL SCAN
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── PHASE 5: Review thumbnails ─────────────────────────────────── */}
        {step === 5 && (
          <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
            {/* Header */}
            <View style={{
              paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 16 : 58,
              paddingHorizontal: 20, paddingBottom: 14,
              borderBottomWidth: 1, borderColor: C.border,
            }}>
              <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 22, letterSpacing: 2 }}>
                REVIEW SHOTS
              </Text>
              <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 12, marginTop: 2 }}>
                5 angles captured — ready to send to Growver
              </Text>
            </View>

            {/* 2-column thumbnail grid */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 10 }}>
              {photos.map((p, i) => {
                const thumbW = (SW - 44) / 2;
                const isLast = i === photos.length - 1 && photos.length % 2 === 1;
                return (
                  <View key={i} style={{
                    width: isLast ? "100%" : thumbW,
                    alignItems: isLast ? "center" : "flex-start",
                  }}>
                    <View style={{ position: "relative", width: isLast ? thumbW : "100%" }}>
                      <Image
                        source={{ uri: p.uri }}
                        style={{
                          width: "100%", height: 150,
                          borderRadius: 8, resizeMode: "cover",
                          backgroundColor: C.surface,
                        }}
                      />
                      {/* Green tick overlay */}
                      <View style={{
                        position: "absolute", top: 6, right: 6,
                        width: 22, height: 22, borderRadius: 11,
                        backgroundColor: "#00ff88", alignItems: "center", justifyContent: "center",
                      }}>
                        <Text style={{ color: "#050a05", fontSize: 13, fontFamily: SANS_BOLD }}>✓</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, paddingLeft: 2 }}>
                      <Text style={{ fontSize: 11 }}>{SCAN_STEPS[i].icon}</Text>
                      <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 9, letterSpacing: 1 }}>
                        {SCAN_STEPS[i].label}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Action buttons */}
            <View style={{ paddingHorizontal: 20, gap: 10, marginTop: 6 }}>
              <TouchableOpacity
                onPress={analyse}
                activeOpacity={0.8}
                style={{
                  backgroundColor: C.greenFaint, borderRadius: 10,
                  borderWidth: 1, borderColor: C.green,
                  paddingVertical: 15, alignItems: "center",
                }}
              >
                <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 18, letterSpacing: 2 }}>
                  ANALYSE PLANT →
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setPhotos([]); setStep(0); }}
                activeOpacity={0.7}
                style={{
                  borderWidth: 1, borderColor: C.border, borderRadius: 10,
                  paddingVertical: 12, alignItems: "center",
                }}
              >
                <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 15, letterSpacing: 2 }}>
                  RETAKE →
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleClose} activeOpacity={0.7}
                style={{ alignItems: "center", paddingVertical: 10 }}>
                <Text style={{ color: C.grey, fontFamily: HEADING, fontSize: 13, letterSpacing: 2 }}>
                  ✕ CANCEL
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── PHASE 6: Analysing overlay ─────────────────────────────────── */}
        {step === 6 && (
          <View style={{ flex: 1 }}>
            {/* Small thumbnails grid in background */}
            <View style={{ flex: 1, padding: 16 }}>
              <View style={{
                paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 10 : 54,
                paddingBottom: 16,
              }}>
                <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 14, letterSpacing: 2, textAlign: "center" }}>
                  5 ANGLES CAPTURED
                </Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {photos.map((p, i) => (
                  <Image key={i} source={{ uri: p.uri }} style={{
                    width: (SW - 56) / 3, height: 80,
                    borderRadius: 6, resizeMode: "cover",
                    backgroundColor: C.surface, opacity: 0.5,
                  }} />
                ))}
              </View>
            </View>

            {/* Dark overlay */}
            <View style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: "rgba(5,10,5,0.78)",
              alignItems: "center", justifyContent: "center",
            }}>
              <Animated.View style={{ opacity: pulseAnim, alignItems: "center", gap: 16 }}>
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  backgroundColor: "#00ff88",
                  shadowColor: "#00ff88", shadowRadius: 16, shadowOpacity: 1,
                  elevation: 10,
                }} />
                <Text style={{
                  color: "#00ff88", fontFamily: HEADING,
                  fontSize: 18, letterSpacing: 3, textAlign: "center",
                }}>
                  GROWVER IS ANALYSING{"\n"}5 ANGLES...
                </Text>
                <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 13, textAlign: "center" }}>
                  {analysisMsgs[msgIdx]}
                </Text>
              </Animated.View>
            </View>
          </View>
        )}

        {/* ── PHASE 7: Results ───────────────────────────────────────────── */}
        {step === 7 && result && (
          <ScrollView contentContainerStyle={{ paddingBottom: 48 }} bounces={false}>
            {/* Horizontal strip of thumbnails */}
            <View style={{
              paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 10 : 54,
              paddingBottom: 10,
            }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                {photos.map((p, i) => (
                  <View key={i} style={{ alignItems: "center", gap: 4 }}>
                    <Image source={{ uri: p.uri }} style={{
                      width: 64, height: 64, borderRadius: 8,
                      resizeMode: "cover", backgroundColor: C.surface,
                    }} />
                    <Text style={{ fontSize: 10 }}>{SCAN_STEPS[i].icon}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>

            {/* Results card */}
            <Animated.View style={{
              backgroundColor: C.card,
              borderRadius: 20,
              borderWidth: 1, borderColor: C.border,
              padding: 20,
              marginHorizontal: 0,
              marginTop: 4,
              transform: [{ translateY: slideAnim }],
              opacity: fadeAnim,
            }}>

              {/* Stage pill */}
              {result.stage && (() => {
                const col = stageColour(result.stage);
                return (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <View style={{
                      backgroundColor: `${col}22`, borderRadius: 20,
                      paddingHorizontal: 14, paddingVertical: 6,
                      borderWidth: 1, borderColor: `${col}80`,
                      flexDirection: "row", alignItems: "center", gap: 6,
                    }}>
                      <Text style={{ fontSize: 16 }}>{stageGlyph(result.stage)}</Text>
                      <Text style={{ color: col, fontFamily: HEADING, fontSize: 18, letterSpacing: 2 }}>
                        {result.stage.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 11 }}>
                      DETECTED STAGE
                    </Text>
                  </View>
                );
              })()}

              {/* Health bar */}
              {result.health_pct != null && (() => {
                const pct = Math.max(0, Math.min(100, result.health_pct));
                const col = healthColour(pct);
                return (
                  <View style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 12, letterSpacing: 2 }}>
                        PLANT HEALTH
                      </Text>
                      <Text style={{ color: col, fontFamily: HEADING, fontSize: 18, letterSpacing: 1 }}>
                        {pct}%
                      </Text>
                    </View>
                    <View style={{ height: 8, backgroundColor: C.border, borderRadius: 4, overflow: "hidden" }}>
                      <View style={{ height: 8, borderRadius: 4, backgroundColor: col, width: `${pct}%` }} />
                    </View>
                  </View>
                );
              })()}

              {/* Deficiencies + issues */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 12,
                  letterSpacing: 2, marginBottom: 8 }}>DEFICIENCIES</Text>
                {(!result.deficiencies || result.deficiencies.length === 0) ? (
                  <Text style={{ color: C.greenBright, fontFamily: SANS_MED, fontSize: 13 }}>
                    None detected ✓
                  </Text>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {result.deficiencies.map((d, i) => (
                      <View key={i} style={{
                        backgroundColor: "#1a0808", borderRadius: 6,
                        paddingHorizontal: 10, paddingVertical: 4,
                        borderWidth: 1, borderColor: C.red,
                      }}>
                        <Text style={{ color: C.red, fontFamily: SANS_MED, fontSize: 12 }}>{d}</Text>
                      </View>
                    ))}
                    {(result.issues || []).map((iss, i) => (
                      <View key={`iss-${i}`} style={{
                        backgroundColor: "#1a1008", borderRadius: 6,
                        paddingHorizontal: 10, paddingVertical: 4,
                        borderWidth: 1, borderColor: C.amber,
                      }}>
                        <Text style={{ color: C.amber, fontFamily: SANS_MED, fontSize: 12 }}>{iss}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Growver notes */}
              {result.notes && (
                <View style={{
                  backgroundColor: "#1a150a", borderRadius: 10,
                  borderWidth: 1, borderColor: `${C.amber}60`,
                  padding: 14, marginBottom: 16,
                }}>
                  <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 11,
                    letterSpacing: 2, marginBottom: 6 }}>GROWVER SAYS</Text>
                  <Text style={{ color: C.amber, fontFamily: SANS, fontSize: 13, lineHeight: 20, fontStyle: "italic" }}>
                    "{result.notes}"
                  </Text>
                </View>
              )}

              {/* Confidence */}
              {result.confidence != null && (
                <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 11, marginBottom: 20 }}>
                  Confidence: {Math.round(result.confidence * 100)}%
                </Text>
              )}

              <View style={{ height: 1, backgroundColor: C.border, marginBottom: 16 }} />

              {/* Apply */}
              <TouchableOpacity
                onPress={apply}
                activeOpacity={0.75}
                style={{
                  backgroundColor: C.greenFaint, borderRadius: 10,
                  borderWidth: 1, borderColor: C.green,
                  paddingVertical: 14, alignItems: "center", marginBottom: 10,
                }}
              >
                <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 18, letterSpacing: 2 }}>
                  ✓ APPLY TO GROW
                </Text>
              </TouchableOpacity>

              {/* Dismiss */}
              <TouchableOpacity onPress={handleClose} activeOpacity={0.7}
                style={{ alignItems: "center", paddingVertical: 12 }}>
                <Text style={{ color: C.grey, fontFamily: HEADING, fontSize: 15, letterSpacing: 2 }}>
                  DISMISS
                </Text>
              </TouchableOpacity>

            </Animated.View>
          </ScrollView>
        )}

      </View>
    </Modal>
  );
}

// ── MODAL: Video Orbit Scan for 3D Plant Reconstruction ──────────────────────
//
// Backend API contract:
//   POST /api/v1/vision/reconstruct-3d
//   Content-Type: multipart/form-data
//   Fields:
//     video     — mp4 file, 5–20 seconds, 720p
//     grow_id   — string (optional)
//     scan_type — "video_orbit"
//
//   Response 202 (async job started):
//   {
//     job_id: string,
//     estimated_minutes: number,
//     message: string
//   }
//
//   Backend pipeline:
//     1. ffmpeg: extract frame every 0.5s (~20-40 frames)
//     2. rembg: background removal on each frame (rotoscoping)
//     3. COLMAP: sparse reconstruction with masked images
//     4. OpenMVS: dense reconstruction → mesh
//     5. glTF export → .glb stored as grow_{grow_id}.glb
//     6. Push notification to device when complete

function VideoScanModal({ visible, growId, onClose, onDone }) {
  const [phase, setPhase] = useState("intro");
  // "intro" | "recording" | "confirming" | "uploading" | "done"
  const [videoUri,    setVideoUri]    = useState(null);
  const [duration,    setDuration]    = useState(0);    // seconds recorded
  const [uploadPct,   setUploadPct]   = useState(0);    // 0-100 fake progress
  const cameraRef = useRef(null);
  const timerRef  = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();

  // Orbit animation for intro screen
  const orbitAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase !== "intro") return;
    const loop = Animated.loop(
      Animated.timing(orbitAnim, { toValue: 1, duration: 3000, useNativeDriver: false })
    );
    loop.start();
    return () => loop.stop();
  }, [phase]);

  // Upload icon pulse
  const uploadPulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (phase !== "uploading") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(uploadPulse, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        Animated.timing(uploadPulse, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase]);

  // Fake upload progress bar animated value
  const uploadBarAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase !== "uploading") return;
    uploadBarAnim.setValue(0);
    const anim = Animated.timing(uploadBarAnim, { toValue: 85, duration: 8000, useNativeDriver: false });
    anim.start();
    const listener = uploadBarAnim.addListener(({ value }) => setUploadPct(Math.round(value)));
    return () => {
      uploadBarAnim.removeListener(listener);
      anim.stop();
    };
  }, [phase]);

  // Timer counter during recording
  useEffect(() => {
    if (phase !== "recording") return;
    timerRef.current = setInterval(() => {
      setDuration(d => {
        if (d >= 19) {
          stopRecording();
          return d;
        }
        return d + 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const reset = () => {
    clearInterval(timerRef.current);
    setPhase("intro");
    setVideoUri(null);
    setDuration(0);
    setUploadPct(0);
  };

  const startRecording = async () => {
    if (!cameraRef.current) return;
    setPhase("recording");
    setDuration(0);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 20 });
      clearInterval(timerRef.current);
      setVideoUri(video.uri);
      setPhase("confirming");
    } catch (e) {
      clearInterval(timerRef.current);
      Alert.alert("Recording failed", e.message);
      setPhase("intro");
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    cameraRef.current?.stopRecording();
    // recordAsync promise resolves after stopRecording is called
  };

  const upload = async () => {
    setPhase("uploading");
    try {
      const formData = new FormData();
      formData.append('video', {
        uri: videoUri,
        type: 'video/mp4',
        name: 'plant_orbit.mp4',
      });
      if (growId) formData.append('grow_id', String(growId));
      formData.append('scan_type', 'video_orbit');

      const res = await fetch(`${getApiV1()}/vision/reconstruct-3d`, {
        method: 'POST',
        headers: { ...BACKEND_HEADERS },
        body: formData,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      // const data = await res.json(); // { job_id, estimated_minutes }
      setPhase("done");
    } catch (e) {
      Alert.alert("Upload failed", e.message || "Check your connection and try again.");
      setPhase("confirming");
    }
  };

  const fmtTime = (secs) =>
    `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  // Circular progress ring for stop button (SVG strokeDasharray trick)
  const ringR = 42;
  const ringCircumference = 2 * Math.PI * ringR;
  const ringProgress = Math.min(1, duration / 20);
  const ringDashoffset = ringCircumference * (1 - ringProgress);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => { reset(); onClose(); }}
    >
      <View style={{ flex: 1, backgroundColor: C.bg }}>

        {/* ── PHASE: intro ──────────────────────────────────────────────────── */}
        {phase === "intro" && (
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
            {/* Header */}
            <View style={{ alignItems: "center", marginBottom: 28 }}>
              <Text style={{ fontSize: 36, marginBottom: 6 }}>🎥</Text>
              <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 28, letterSpacing: 3, textAlign: "center" }}>
                3D PLANT SCAN
              </Text>
            </View>

            {/* Animated orbit illustration */}
            <View style={{ alignItems: "center", marginBottom: 24, height: 130 }}>
              <Svg width={130} height={130}>
                {/* Orbit circle */}
                <Circle
                  cx={65} cy={65} r={50}
                  stroke={C.border} strokeWidth={1.5}
                  fill="none" strokeDasharray="4 4"
                />
                {/* Plant stem */}
                <Path
                  d="M65 85 L65 68"
                  stroke={C.greenBright} strokeWidth={2}
                />
                {/* Plant triangle */}
                <Path
                  d="M65 42 L57 68 L73 68 Z"
                  fill={C.greenBright} opacity={0.9}
                />
                {/* Animated phone orbiting */}
              </Svg>
              {/* Phone marker animated on top */}
              <Animated.View
                style={{
                  position: "absolute",
                  width: 10, height: 18,
                  backgroundColor: C.greenBright,
                  borderRadius: 2,
                  transform: [
                    {
                      translateX: orbitAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 0],
                      }),
                    },
                  ],
                  // compute x/y via JS-driven animated
                  left: (() => {
                    const cx = 65 - 5; // centre minus half width
                    return cx;
                  })(),
                  top: (() => {
                    const cy = 65 - 9; // centre minus half height
                    return cy;
                  })(),
                }}
              >
                {/* This view is the phone icon — we use a wrapper Animated.View that rotates around origin */}
              </Animated.View>
              {/* Use a rotating container approach instead */}
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  width: 130, height: 130,
                  transform: [{
                    rotate: orbitAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "360deg"],
                    }),
                  }],
                }}
              >
                {/* Phone at 3 o'clock position: offset 55px right of centre */}
                <View style={{
                  position: "absolute",
                  left: 65 + 55 - 5,   // cx + r - halfW
                  top:  65      - 9,   // cy     - halfH
                  width: 10, height: 18,
                  backgroundColor: C.greenBright,
                  borderRadius: 2,
                }}/>
              </Animated.View>
            </View>

            {/* How it works */}
            <View style={{
              backgroundColor: C.card, borderRadius: 12, padding: 20,
              borderWidth: 1, borderColor: C.border, marginBottom: 20,
            }}>
              <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 13, letterSpacing: 2, marginBottom: 14 }}>
                HOW IT WORKS
              </Text>
              {[
                "Stand 60–90cm from your plant",
                "Press REC and walk slowly in a full circle around the plant",
                "Keep the full plant in frame",
                "One smooth 10–15 second orbit",
              ].map((step, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                  <View style={{
                    width: 20, height: 20, borderRadius: 10,
                    backgroundColor: C.greenFaint, borderWidth: 1, borderColor: C.greenDim,
                    alignItems: "center", justifyContent: "center", marginTop: 1,
                  }}>
                    <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 11 }}>{i + 1}</Text>
                  </View>
                  <Text style={{ color: C.white, fontFamily: SANS, fontSize: 13, lineHeight: 20, flex: 1 }}>
                    {step}
                  </Text>
                </View>
              ))}
            </View>

            {/* Info blurb */}
            <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 12, lineHeight: 19, textAlign: "center", marginBottom: 28 }}>
              {"Growver removes the background and builds a 3D model of your actual plant.\nYou'll get a notification when it's ready (usually 5–10 minutes)."}
            </Text>

            {/* Start button */}
            {!permission?.granted ? (
              <GreenBtn
                label="GRANT CAMERA ACCESS"
                onPress={requestPermission}
                style={{ marginBottom: 12 }}
              />
            ) : (
              <TouchableOpacity
                onPress={startRecording}
                activeOpacity={0.8}
                style={{
                  backgroundColor: C.greenFaint, borderRadius: 10,
                  borderWidth: 1, borderColor: C.green,
                  paddingVertical: 16, alignItems: "center", marginBottom: 12,
                }}
              >
                <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 20, letterSpacing: 2 }}>
                  🎥 START SCAN
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => { reset(); onClose(); }}
              activeOpacity={0.7}
              style={{ alignItems: "center", paddingVertical: 12 }}
            >
              <Text style={{ color: C.grey, fontFamily: HEADING, fontSize: 15, letterSpacing: 2 }}>
                CANCEL
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── PHASE: recording ──────────────────────────────────────────────── */}
        {phase === "recording" && (
          <View style={{ flex: 1 }}>
            {/* Live camera */}
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              mode="video"
            />

            {/* Orbit guide ring overlay */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                alignItems: "center", justifyContent: "center",
              }}
            >
              <Svg width={SW * 0.8} height={SW * 0.8}>
                <Circle
                  cx={SW * 0.4} cy={SW * 0.4} r={SW * 0.38}
                  stroke={C.greenBright}
                  strokeWidth={2}
                  strokeDasharray="10 8"
                  fill="none"
                  opacity={0.5}
                />
                {/* Arrow marker at top of ring */}
                <Path
                  d={`M${SW * 0.4 - 10} ${SW * 0.4 - SW * 0.38 + 10} L${SW * 0.4} ${SW * 0.4 - SW * 0.38 - 8} L${SW * 0.4 + 10} ${SW * 0.4 - SW * 0.38 + 10}`}
                  stroke={C.greenBright}
                  strokeWidth={2.5}
                  fill="none"
                  opacity={0.8}
                />
              </Svg>
            </View>

            {/* Timer at top centre */}
            <View style={{
              position: "absolute",
              top: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 20 : 60,
              left: 0, right: 0, alignItems: "center",
            }}>
              <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 40, letterSpacing: 3 }}>
                {fmtTime(duration)}
              </Text>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11, letterSpacing: 2, marginTop: 2 }}>
                MAX 20s
              </Text>
            </View>

            {/* STOP button with circular progress ring */}
            <View style={{
              position: "absolute", bottom: 60, left: 0, right: 0,
              alignItems: "center", justifyContent: "center",
            }}>
              {/* Progress ring around button */}
              <Svg
                width={100} height={100}
                style={{ position: "absolute" }}
              >
                {/* Background ring */}
                <Circle
                  cx={50} cy={50} r={ringR}
                  stroke={C.border}
                  strokeWidth={4}
                  fill="none"
                />
                {/* Progress ring */}
                <Circle
                  cx={50} cy={50} r={ringR}
                  stroke={C.greenBright}
                  strokeWidth={4}
                  fill="none"
                  strokeDasharray={`${ringCircumference}`}
                  strokeDashoffset={ringDashoffset}
                  strokeLinecap="round"
                  transform={`rotate(-90, 50, 50)`}
                />
              </Svg>
              {/* Red stop button */}
              <TouchableOpacity
                onPress={stopRecording}
                activeOpacity={0.8}
                style={{
                  width: 72, height: 72, borderRadius: 36,
                  backgroundColor: C.red,
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 3, borderColor: C.white,
                }}
              >
                <Text style={{ color: C.white, fontSize: 28 }}>■</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── PHASE: confirming ─────────────────────────────────────────────── */}
        {phase === "confirming" && (
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
            {/* Header */}
            <View style={{ alignItems: "center", marginBottom: 24 }}>
              <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 26, letterSpacing: 2 }}>
                ✓ SCAN CAPTURED
              </Text>
              <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 14, marginTop: 6 }}>
                Duration: {fmtTime(duration)}
              </Text>
            </View>

            {/* Info card */}
            <View style={{
              backgroundColor: C.card, borderRadius: 12, padding: 20,
              borderWidth: 1, borderColor: C.border, marginBottom: 16,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <Text style={{ fontSize: 24 }}>🎥</Text>
                <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 16, letterSpacing: 1.5 }}>
                  VIDEO READY TO UPLOAD
                </Text>
              </View>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 13, lineHeight: 20 }}>
                {"Growver will rotoscope each frame and reconstruct your plant in 3D."}
              </Text>
            </View>

            {/* Data warning */}
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 8,
              backgroundColor: "#1a1a0a", borderRadius: 8,
              borderWidth: 1, borderColor: C.amber,
              padding: 12, marginBottom: 24,
            }}>
              <Text style={{ fontSize: 16 }}>⚠</Text>
              <Text style={{ color: C.amber, fontFamily: SANS_MED, fontSize: 12, flex: 1 }}>
                This may use ~30–50MB of data
              </Text>
            </View>

            {/* Upload button */}
            <TouchableOpacity
              onPress={upload}
              activeOpacity={0.8}
              style={{
                backgroundColor: C.greenFaint, borderRadius: 10,
                borderWidth: 1, borderColor: C.green,
                paddingVertical: 16, alignItems: "center", marginBottom: 12,
              }}
            >
              <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 18, letterSpacing: 2 }}>
                📤 BUILD MY 3D PLANT
              </Text>
            </TouchableOpacity>

            {/* Retake */}
            <TouchableOpacity
              onPress={() => { setVideoUri(null); setDuration(0); startRecording(); }}
              activeOpacity={0.7}
              style={{ alignItems: "center", paddingVertical: 12 }}
            >
              <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 15, letterSpacing: 2 }}>
                ↩ RETAKE
              </Text>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              onPress={() => { reset(); onClose(); }}
              activeOpacity={0.7}
              style={{ alignItems: "center", paddingVertical: 12 }}
            >
              <Text style={{ color: C.grey, fontFamily: HEADING, fontSize: 15, letterSpacing: 2 }}>
                CANCEL
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── PHASE: uploading ──────────────────────────────────────────────── */}
        {phase === "uploading" && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            {/* Animated upload icon */}
            <Animated.Text style={{ fontSize: 64, opacity: uploadPulse, marginBottom: 20 }}>
              📤
            </Animated.Text>

            <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 22, letterSpacing: 3, marginBottom: 32, textAlign: "center" }}>
              UPLOADING SCAN...
            </Text>

            {/* Progress bar */}
            <View style={{ width: "100%", marginBottom: 12 }}>
              <View style={{ height: 4, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" }}>
                <Animated.View style={{
                  height: 4, backgroundColor: C.green, borderRadius: 2,
                  width: uploadBarAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ["0%", "100%"],
                  }),
                }} />
              </View>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11, marginTop: 6, textAlign: "right" }}>
                {uploadPct}%
              </Text>
            </View>

            <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 12 }}>
              Growver is preparing your frames for reconstruction...
            </Text>
            <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 11, textAlign: "center" }}>
              ~30–50MB — stay on WiFi
            </Text>
          </View>
        )}

        {/* ── PHASE: done ───────────────────────────────────────────────────── */}
        {phase === "done" && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <Text style={{ fontSize: 64, marginBottom: 20 }}>🌿</Text>

            <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 22, letterSpacing: 2, textAlign: "center", marginBottom: 20 }}>
              YOUR SCAN IS WITH GROWVER
            </Text>

            <View style={{
              backgroundColor: C.card, borderRadius: 12, padding: 20,
              borderWidth: 1, borderColor: C.border, marginBottom: 32, width: "100%",
            }}>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 13, lineHeight: 20, textAlign: "center", marginBottom: 12 }}>
                {"We're rotoscoping your frames and building the 3D model. This usually takes 5–15 minutes."}
              </Text>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 13, lineHeight: 20, textAlign: "center" }}>
                {"You'll be notified when your plant model is ready."}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => {
                reset();
                onDone();
              }}
              activeOpacity={0.8}
              style={{
                backgroundColor: C.greenFaint, borderRadius: 10,
                borderWidth: 1, borderColor: C.green,
                paddingVertical: 16, paddingHorizontal: 40, alignItems: "center",
              }}
            >
              <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 20, letterSpacing: 2 }}>
                ✓ DONE
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </View>
    </Modal>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function VYWEEDGrowTracker({ onGrowCountChange, pendingStrain, onPendingStrainConsumed }) {
  const [screen, setScreen]           = useState("list");
  const [selectedGrow, setSelectedGrow] = useState(null);
  const [showNewGrow, setShowNewGrow] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinTarget, setCheckinTarget] = useState(null);
  const [checkinResult, setCheckinResult] = useState(null);
  const [listKey, setListKey]         = useState(0);

  // Plant scan state
  const [showScan,   setShowScan]   = useState(false);
  const [scanGrowId, setScanGrowId] = useState(null);

  // Guided 5-shot scan state
  const [showGuidedScan,   setShowGuidedScan]   = useState(false);
  const [guidedScanGrowId, setGuidedScanGrowId] = useState(null);

  // Video orbit scan state
  const [showVideoScan,   setShowVideoScan]   = useState(false);
  const [videoScanGrowId, setVideoScanGrowId] = useState(null);

  useEffect(() => {
    requestNotificationPermissions().catch(() => {});
    scheduleDailyReminder("09:00", 1).catch(() => {});
  }, []);

  useEffect(() => {
    if (pendingStrain) {
      setShowNewGrow(true);
      onPendingStrainConsumed?.();
    }
  }, [pendingStrain]);

  const handleSelectGrow = (grow) => {
    setSelectedGrow(grow);
    setScreen("detail");
  };

  const handleCheckinComplete = (result) => {
    setShowCheckin(false);
    setCheckinResult(result);
  };

  React.useEffect(() => {
    if (onGrowCountChange) onGrowCountChange(0);
  }, [listKey]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {screen === "list" && (
        <GrowListScreen
          key={listKey}
          onSelect={handleSelectGrow}
          onNew={() => setShowNewGrow(true)}
          onCount={(n) => onGrowCountChange?.(n)}
        />
      )}

      {screen === "detail" && selectedGrow && (
        <GrowDetailScreen
          grow={selectedGrow}
          onBack={() => setScreen("list")}
          onCheckin={(g) => { setCheckinTarget(g); setShowCheckin(true); }}
          onNutrients={() => setScreen("nutrients")}
          onTimeline={() => setScreen("timeline")}
          onPhotos={() => setScreen("photos")}
          onScan={() => { setScanGrowId(selectedGrow.grow_id); setShowScan(true); }}
          onGuidedScan={() => { setGuidedScanGrowId(selectedGrow.grow_id); setShowGuidedScan(true); }}
          onVideoScan={() => { setVideoScanGrowId(selectedGrow.grow_id); setShowVideoScan(true); }}
        />
      )}

      {screen === "nutrients" && selectedGrow && (
        <NutrientSchedule
          strainId={selectedGrow.strain_id}
          strainName={selectedGrow.strain_name}
          flowerWeeks={selectedGrow.flower_wk_max || 9}
          medium={selectedGrow.medium || "soil"}
          onBack={() => setScreen("detail")}
        />
      )}

      {screen === "timeline" && selectedGrow && (
        <GrowTimeline
          growId={selectedGrow.grow_id}
          strainName={selectedGrow.strain_name}
          onBack={() => setScreen("detail")}
        />
      )}

      {screen === "photos" && selectedGrow && (
        <PhotoJournalScreen
          growId={selectedGrow.grow_id}
          strainName={selectedGrow.strain_name}
          onBack={() => setScreen("detail")}
        />
      )}

      {showNewGrow && (
        <NewGrowModal
          prefillStrain={pendingStrain}
          onClose={() => setShowNewGrow(false)}
          onCreate={(result) => {
            setShowNewGrow(false);
            setListKey(k => k + 1);
            Alert.alert("🌱 Grow Started", `Grow ID: ${result.grow_id}`);
          }}
        />
      )}

      {showCheckin && checkinTarget && (
        <CheckinModal
          grow={checkinTarget}
          onClose={() => setShowCheckin(false)}
          onComplete={handleCheckinComplete}
        />
      )}

      {checkinResult && (
        <CheckinResultModal
          result={checkinResult}
          onClose={() => setCheckinResult(null)}
        />
      )}

      {showScan && (
        <PlantScanModal
          visible={showScan}
          growId={scanGrowId}
          onClose={() => { setShowScan(false); setScanGrowId(null); }}
          onApply={(result) => {
            // Optional: could auto-update the grow's stage here in future
            setShowScan(false);
            setScanGrowId(null);
          }}
        />
      )}

      {showGuidedScan && (
        <GuidedScanModal
          visible={showGuidedScan}
          growId={guidedScanGrowId}
          onClose={() => { setShowGuidedScan(false); setGuidedScanGrowId(null); }}
          onApply={() => { setShowGuidedScan(false); setGuidedScanGrowId(null); }}
        />
      )}

      {showVideoScan && (
        <VideoScanModal
          visible={showVideoScan}
          growId={videoScanGrowId}
          onClose={() => { setShowVideoScan(false); setVideoScanGrowId(null); }}
          onDone={() => { setShowVideoScan(false); setVideoScanGrowId(null); }}
        />
      )}
    </View>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const styles = {
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },
  row:    { flexDirection: "row", alignItems: "center" },
  empty:  { alignItems: "center", justifyContent: "center", paddingVertical: 60 },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 16 : 52,
    paddingBottom: 12,
    borderBottomWidth: 1, borderColor: C.border,
  },

  logo: {
    color: C.white, fontFamily: HEADING,
    fontSize: 28, letterSpacing: 4,
  },

  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "flex-end",
  },

  modal: {
    backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: C.border,
    padding: 20, paddingBottom: 40,
    maxHeight: "92%",
  },

  input: {
    backgroundColor: C.surface, borderRadius: 8,
    borderWidth: 1, borderColor: C.border,
    color: C.white, fontFamily: SANS,
    fontSize: 14, padding: 12, marginBottom: 10,
  },
};
