import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, RefreshControl,
  StatusBar, Platform, Animated, Dimensions, StyleSheet,
} from "react-native";
import Svg, { Defs, RadialGradient, Stop, Rect as SvgRect } from "react-native-svg";
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

const { width: SW } = Dimensions.get("window");

// ── Config ────────────────────────────────────────────────────────────────────
import { getApiV1, BACKEND_HEADERS } from "./apiConfig";
const API_BASE = { toString: () => getApiV1() };

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
    "Flowering": 3, "Early Flower": 3, "Mid Flower": 3, "Late Flower": 3,
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
const HERO_H = 210;

function GrowHero({ strainName, stage, day, medium, startDate, logCount,
                    criticalCount, onBack, onCheckin, onNutrients, onTimeline, onPhotos }) {
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

  return (
    <View style={{ backgroundColor: C.bg }}>
      {/* Hero canvas */}
      <View style={{ height: HERO_H }}>

        {/* SVG radial glow */}
        <Svg style={StyleSheet.absoluteFill} width="100%" height={HERO_H}>
          <Defs>
            <RadialGradient id="hg" cx="50%" cy="65%" rx="58%" ry="62%">
              <Stop offset="0%"   stopColor={glowCol} stopOpacity="0.30" />
              <Stop offset="50%"  stopColor={glowCol} stopOpacity="0.07" />
              <Stop offset="100%" stopColor={C.bg}    stopOpacity="0"    />
            </RadialGradient>
          </Defs>
          <SvgRect x={0} y={0} width="100%" height={HERO_H} fill={C.bg} />
          <SvgRect x={0} y={0} width="100%" height={HERO_H} fill="url(#hg)" />
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
          paddingTop: Platform.OS === "android" ? 14 : 50,
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

        {/* Floating stage glyph */}
        <View style={{ position: "absolute", left: 0, right: 0,
          alignItems: "center", top: HERO_H * 0.18 }}>
          <Animated.Text style={{ fontSize: 72, transform: [{ translateY: floatY }] }}>
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
    </View>
  );
}

// ── SCREEN: Grow Detail ───────────────────────────────────────────────────────
function GrowDetailScreen({ grow, onBack, onCheckin, onNutrients, onTimeline, onPhotos }) {
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
function NewGrowModal({ onClose, onCreate }) {
  const [strainId, setStrainId]   = useState("");
  const [strainName, setStrainName] = useState("");
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

// ── Root App ──────────────────────────────────────────────────────────────────
export default function VYWEEDGrowTracker({ onGrowCountChange }) {
  const [screen, setScreen]           = useState("list");
  const [selectedGrow, setSelectedGrow] = useState(null);
  const [showNewGrow, setShowNewGrow] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinTarget, setCheckinTarget] = useState(null);
  const [checkinResult, setCheckinResult] = useState(null);
  const [listKey, setListKey]         = useState(0);

  useEffect(() => {
    requestNotificationPermissions().catch(() => {});
    scheduleDailyReminder("09:00", 1).catch(() => {});
  }, []);

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
