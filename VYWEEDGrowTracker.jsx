/**
 * VYWEED Grow Tracker
 * React Native / Expo — copy to your Expo project as App.js or a screen component
 *
 * Aesthetic: Dark grow-room terminal. Deep blacks, phosphor-green accents,
 * monospace data readouts. Like a pro horticulture control panel.
 *
 * Setup:
 *   1. npm install @react-navigation/native @react-navigation/stack
 *      react-native-screens react-native-safe-area-context
 *   2. Set API_BASE to your FastAPI backend (localhost:8000 in Termux)
 *   3. Paste into App.js or wrap in your navigator
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, RefreshControl,
  StatusBar, Platform, Animated, Dimensions,
} from "react-native";
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
import { API_V1 as API_BASE, BACKEND_HEADERS } from "./apiConfig";

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:         "#070a07",
  surface:    "#0d120d",
  card:       "#111811",
  border:     "#1a2a1a",
  green:      "#39ff45",
  greenDim:   "#1a7a20",
  greenFaint: "#0d3d12",
  amber:      "#ffb830",
  red:        "#ff3a3a",
  blue:       "#30d5ff",
  white:      "#e8f0e8",
  grey:       "#4a5a4a",
  greyLight:  "#8a9a8a",
};

// ── Typography ────────────────────────────────────────────────────────────────
const MONO = Platform.select({ ios: "Courier New", android: "monospace" });
const SANS = Platform.select({ ios: "System", android: "sans-serif-condensed" });

// ── Tiny API client ───────────────────────────────────────────────────────────
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
    <Text style={[{ color: C.green, fontFamily: MONO }, style]} {...props}>
      {children}
    </Text>
  );
}

function Label({ style, children }) {
  return (
    <Text style={[{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
      letterSpacing: 1.5, textTransform: "uppercase" }, style]}>
      {children}
    </Text>
  );
}

function Card({ style, children }) {
  return (
    <View style={[{
      backgroundColor: C.card, borderRadius: 8,
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
        backgroundColor: danger ? "#2a0a0a" : C.greenFaint,
        borderWidth: 1,
        borderColor: danger ? C.red : C.green,
        borderRadius: 6,
        paddingVertical: small ? 8 : 12,
        paddingHorizontal: small ? 14 : 20,
        alignItems: "center",
      }, style]}
    >
      <Text style={{
        color: danger ? C.red : C.green,
        fontFamily: MONO,
        fontSize: small ? 12 : 14,
        fontWeight: "bold",
        letterSpacing: 1,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function StatBox({ label, value, unit, colour }) {
  return (
    <View style={{
      flex: 1, backgroundColor: C.surface, borderRadius: 6,
      borderWidth: 1, borderColor: C.border,
      padding: 10, alignItems: "center",
    }}>
      <Label>{label}</Label>
      <Text style={{
        color: colour || C.green, fontFamily: MONO,
        fontSize: 22, fontWeight: "bold", marginTop: 4,
      }}>
        {value ?? "—"}
      </Text>
      {unit && <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>{unit}</Text>}
    </View>
  );
}

function AlertBadge({ severity }) {
  const map = {
    critical: { bg: "#2a0808", border: C.red,   text: C.red,   label: "⚠ CRITICAL" },
    warning:  { bg: "#2a1a08", border: C.amber, text: C.amber, label: "▲ WARNING" },
    info:     { bg: "#081a2a", border: C.blue,  text: C.blue,  label: "ℹ INFO" },
  };
  const s = map[severity] || map.info;
  return (
    <View style={{
      backgroundColor: s.bg, borderWidth: 1, borderColor: s.border,
      borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3,
      alignSelf: "flex-start",
    }}>
      <Text style={{ color: s.text, fontFamily: MONO, fontSize: 10, fontWeight: "bold" }}>
        {s.label}
      </Text>
    </View>
  );
}

function StagePill({ stage }) {
  const colour = {
    Seedling: C.blue, Vegetative: C.green,
    "Pre-Flower": C.amber, Flowering: "#ff8c30",
    Harvest: C.red,
  }[stage] || C.greyLight;
  return (
    <View style={{
      backgroundColor: `${colour}22`, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 4,
      borderWidth: 1, borderColor: colour, alignSelf: "flex-start",
    }}>
      <Text style={{ color: colour, fontFamily: MONO, fontSize: 12, fontWeight: "bold" }}>
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

  // Import the default export from PhotoJournal
  const { default: PhotoJournal } = require("./PhotoJournal");
  return <PhotoJournal growId={growId} strainName={strainName} logs={logs} onBack={onBack} />;
}

// ── Grow Info Modal ───────────────────────────────────────────────────────────
function GrowInfoModal({ visible, onClose }) {
  const MONO2 = Platform.select({ ios: "Courier New", android: "monospace" });
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
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "#111811", borderTopLeftRadius: 20,
          borderTopRightRadius: 20, borderTopWidth: 2, borderColor: "#39ff45", maxHeight: "92%" }}>
          <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, backgroundColor: "#1a2a1a", borderRadius: 2 }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: "#1a2a1a" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 28 }}>📊</Text>
              <View>
                <Text style={{ color: "#39ff45", fontFamily: MONO2, fontSize: 16, fontWeight: "bold" }}>MY GROWS</Text>
                <Text style={{ color: "#4a5a4a", fontFamily: MONO2, fontSize: 10 }}>HOW TO USE THIS SCREEN</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <Text style={{ color: "#4a5a4a", fontFamily: MONO2, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <View style={{ backgroundColor: "#0d3d12", borderRadius: 8, borderWidth: 1,
              borderColor: "#1a7a20", padding: 14, marginBottom: 16 }}>
              <Text style={{ color: "#8a9a8a", fontFamily: MONO2, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 6 }}>WHAT IS THIS?</Text>
              <Text style={{ color: "#e8f0e8", fontFamily: MONO2, fontSize: 13, lineHeight: 20 }}>
                {"This is your personal grow journal. Every cannabis plant you grow is tracked here from the day it sprouts to harvest day. The app uses the specific genetics of your strain to give you personalised daily guidance — not generic one-size-fits-all advice. Think of it as a knowledgeable grow partner available 24/7."}
              </Text>
            </View>
            {sections.map((s, i) => (
              <View key={i} style={{ backgroundColor: "#0d120d", borderRadius: 8,
                borderWidth: 1, borderColor: "#1a2a1a", padding: 14, marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 18 }}>{s.icon}</Text>
                  <Text style={{ color: "#39ff45", fontFamily: MONO2, fontSize: 12, fontWeight: "bold" }}>{s.title}</Text>
                </View>
                <Text style={{ color: "#8a9a8a", fontFamily: MONO2, fontSize: 12, lineHeight: 19 }}>{s.text}</Text>
              </View>
            ))}
            <View style={{ backgroundColor: "#0d1a2a", borderRadius: 8,
              borderWidth: 1, borderColor: "#30d5ff", padding: 14 }}>
              <Text style={{ color: "#30d5ff", fontFamily: MONO2, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 6 }}>💡 PRO TIP</Text>
              <Text style={{ color: "#e8f0e8", fontFamily: MONO2, fontSize: 13, lineHeight: 19 }}>
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
  { key: "Seedling",   label: "SEED",   colour: "#30d5ff", pct: 0.08 },
  { key: "Vegetative", label: "VEG",    colour: "#39ff45", pct: 0.25 },
  { key: "Pre-Flower", label: "PRE",    colour: "#ffb830", pct: 0.12 },
  { key: "Flowering",  label: "FLOWER", colour: "#ff8c30", pct: 0.40 },
  { key: "Harvest",    label: "HARVEST",colour: "#ffd700", pct: 0.15 },
];

function GrowStageBar({ stage, day, daysToHarvest }) {
  // Map stage string to index
  const stageMap = {
    "Seedling": 0, "seedling": 0,
    "Vegetative": 1, "vegetative": 1, "Early Vegetative": 1, "Late Vegetative": 1,
    "Pre-Flower": 2, "Transition": 2, "transition": 2,
    "Flowering": 3, "Early Flower": 3, "Mid Flower": 3, "Late Flower": 3,
    "flowering": 3, "early flower": 3,
    "Harvest": 4, "Harvest Ready": 4,
  };
  const currentIdx = stageMap[stage] ?? 1;

  // Overall progress: day / (day + daysToHarvest)
  const totalEstimated = day + (daysToHarvest || 30);
  const overallPct = Math.min(1, day / totalEstimated);

  return (
    <View style={{ marginTop: 10, marginBottom: 4 }}>
      {/* Stage labels */}
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {GROW_STAGES.map((s, i) => (
          <View key={i} style={{ flex: s.pct, alignItems: "center" }}>
            <Text style={{ color: i === currentIdx ? s.colour : C.grey,
              fontFamily: MONO, fontSize: 7, fontWeight: i === currentIdx ? "bold" : "normal" }}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Segmented bar */}
      <View style={{ flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", gap: 1 }}>
        {GROW_STAGES.map((s, i) => (
          <View key={i} style={{ flex: s.pct, backgroundColor: C.border }}>
            <View style={{
              width: i < currentIdx ? "100%" : i === currentIdx ? "60%" : "0%",
              height: 6,
              backgroundColor: s.colour,
              opacity: i < currentIdx ? 0.5 : 1,
            }} />
          </View>
        ))}
      </View>

      {/* Marker dot at current position */}
      <View style={{ position: "relative", height: 8, marginTop: 1 }}>
        <View style={{
          position: "absolute",
          left: `${Math.max(0, Math.min(97, overallPct * 100))}%`,
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: GROW_STAGES[currentIdx]?.colour || C.green,
          marginLeft: -4,
        }} />
      </View>
    </View>
  );
}

// ── SCREEN: Grow List ─────────────────────────────────────────────────────────
function GrowListScreen({ onSelect, onNew, onCount }) {
  const [grows, setGrows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [online, setOnline] = useState(true);
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

  const statusIcon = (s) => ({ active: "◉", harvested: "✓", abandoned: "✗" }[s] || "◉");
  const statusColour = (s) => ({ active: C.green, harvested: C.amber, abandoned: C.grey }[s] || C.grey);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.green} size="large" />
        <GreenText style={{ marginTop: 12, fontSize: 12 }}>LOADING GROWS...</GreenText>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>VY<Text style={{ color: C.green }}>WEED</Text></Text>
          <Label>GROW TRACKER</Label>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TouchableOpacity onPress={() => setShowInfo(true)}
            style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: C.surface, borderWidth: 1, borderColor: C.greenDim,
              alignItems: "center", justifyContent: "center",
            }}>
            <Text style={{ color: C.green, fontFamily: MONO, fontSize: 14, fontWeight: "bold" }}>?</Text>
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
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.green} />}
      >
        {grows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🌱</Text>
            <GreenText style={{ fontSize: 16, marginTop: 12 }}>NO ACTIVE GROWS</GreenText>
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 12, marginTop: 6 }}>
              Tap + NEW GROW to start tracking
            </Text>
          </View>
        ) : (
          grows.map((g) => (
            <TouchableOpacity key={g.grow_id} onPress={() => onSelect(g)} activeOpacity={0.8}>
              <Card>
                {/* Top row */}
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <GreenText style={{ fontSize: 16, fontWeight: "bold" }}>{g.strain_name}</GreenText>
                    <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11, marginTop: 2 }}>
                      {g.grow_id.toUpperCase()} · {g.medium.toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={{ color: statusColour(g.status), fontFamily: MONO, fontSize: 12 }}>
                      {statusIcon(g.status)} {g.status.toUpperCase()}
                    </Text>
                    <StagePill stage={g.stage} />
                  </View>
                </View>

                {/* Stats row */}
                <View style={[styles.row, { marginTop: 12, gap: 8 }]}>
                  <StatBox label="DAY" value={g.current_day} />
                  <StatBox label="TO HARVEST" value={g.days_to_harvest ?? "?"} unit="days" colour={C.amber} />
                </View>

                {/* Stage progress bar */}
                <GrowStageBar stage={g.stage} day={g.current_day} daysToHarvest={g.days_to_harvest} />

                {/* Start date */}
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 8 }}>
                  STARTED {g.start_date}
                </Text>
              </Card>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ── SCREEN: Grow Detail ───────────────────────────────────────────────────────
function GrowDetailScreen({ grow, onBack, onCheckin, onNutrients, onTimeline, onPhotos }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("today"); // today | alerts | harvest

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
        <GreenText style={{ marginTop: 10, fontSize: 11 }}>LOADING REPORT...</GreenText>
      </View>
    );
  }

  const r = report.report || {};
  const summary = r.daily_summary || {};
  const alerts = r.environment_alerts || [];
  const harvest = r.harvest_prediction || {};
  const criticalAlerts = alerts.filter(a => a.severity === "critical");

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={{ padding: 4 }}>
          <GreenText style={{ fontSize: 18 }}>←</GreenText>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <GreenText style={{ fontSize: 16, fontWeight: "bold" }}>{report.strain_name}</GreenText>
          <View style={[styles.row, { gap: 8, marginTop: 2 }]}>
            <StagePill stage={r.stage} />
            {criticalAlerts.length > 0 && (
              <View style={{ backgroundColor: "#2a0808", borderRadius: 4,
                paddingHorizontal: 8, paddingVertical: 3,
                borderWidth: 1, borderColor: C.red }}>
                <Text style={{ color: C.red, fontFamily: MONO, fontSize: 10, fontWeight: "bold" }}>
                  ⚠ {criticalAlerts.length} CRITICAL
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <GreenBtn label="CHECK IN" onPress={() => onCheckin(grow)} small />
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity onPress={onNutrients}
              style={{ flex: 1, backgroundColor: C.surface, borderRadius: 6,
                borderWidth: 1, borderColor: C.amber,
                paddingVertical: 6, alignItems: "center" }}>
              <Text style={{ color: C.amber, fontFamily: MONO, fontSize: 9, fontWeight: "bold" }}>
                🧪 NUTRIENTS
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onTimeline}
              style={{ flex: 1, backgroundColor: C.surface, borderRadius: 6,
                borderWidth: 1, borderColor: C.blue,
                paddingVertical: 6, alignItems: "center" }}>
              <Text style={{ color: C.blue, fontFamily: MONO, fontSize: 9, fontWeight: "bold" }}>
                📈 TIMELINE
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onPhotos}
              style={{ flex: 1, backgroundColor: C.surface, borderRadius: 6,
                borderWidth: 1, borderColor: C.purple,
                paddingVertical: 6, alignItems: "center" }}>
              <Text style={{ color: C.purple, fontFamily: MONO, fontSize: 9, fontWeight: "bold" }}>
                📷 PHOTOS
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Day counter strip */}
      <View style={{
        backgroundColor: C.greenFaint, paddingVertical: 8, paddingHorizontal: 16,
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      }}>
        <Text style={{ color: C.green, fontFamily: MONO, fontSize: 11 }}>
          DAY {report.current_day} · {report.medium.toUpperCase()} · {report.start_date}
        </Text>
        <Text style={{ color: C.greenDim, fontFamily: MONO, fontSize: 11 }}>
          {report.env_log_count} LOGS
        </Text>
      </View>

      {/* Tab bar */}
      <View style={[styles.row, { borderBottomWidth: 1, borderColor: C.border }]}>
        {["today", "alerts", "harvest"].map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}
            style={{ flex: 1, paddingVertical: 12, alignItems: "center",
              borderBottomWidth: 2, borderColor: tab === t ? C.green : "transparent" }}>
            <Text style={{
              fontFamily: MONO, fontSize: 11,
              color: tab === t ? C.green : C.grey,
              letterSpacing: 1, textTransform: "uppercase",
            }}>
              {t === "today" ? "📋 Today" : t === "alerts" ? `🚨 Alerts (${alerts.length})` : "📅 Harvest"}
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
                <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, marginTop: 6, lineHeight: 20 }}>
                  💡 {summary.expert_tip_of_the_day}
                </Text>
              </Card>
            )}

            <Card>
              <Label>TODAY'S CHECKLIST</Label>
              <View style={{ marginTop: 10, gap: 8 }}>
                {(summary.checklist || []).map((item, i) => (
                  <View key={i} style={[styles.row, { gap: 10, alignItems: "flex-start" }]}>
                    <GreenText style={{ fontSize: 14 }}>□</GreenText>
                    <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13,
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
                <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, marginTop: 6, lineHeight: 19 }}>
                  {summary.watering_guidance}
                </Text>
              </Card>
            )}

            {summary.nutrient_guidance && (
              <Card style={{ borderColor: C.amber }}>
                <Label style={{ color: C.amber }}>🧪 NUTRIENTS</Label>
                <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, marginTop: 6, lineHeight: 19 }}>
                  {summary.nutrient_guidance}
                </Text>
              </Card>
            )}

            {summary.what_healthy_looks_like && (
              <Card>
                <Label>WHAT HEALTHY LOOKS LIKE</Label>
                <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
                  {summary.what_healthy_looks_like}
                </Text>
              </Card>
            )}

            {summary.upcoming?.length > 0 && (
              <Card>
                <Label>UPCOMING</Label>
                {summary.upcoming.map((u, i) => (
                  <Text key={i} style={{ color: C.amber, fontFamily: MONO,
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
                <GreenText style={{ fontSize: 32 }}>✓</GreenText>
                <GreenText style={{ marginTop: 8 }}>ALL CLEAR</GreenText>
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 12, marginTop: 4 }}>
                  No environment alerts
                </Text>
              </View>
            ) : (
              alerts.map((a, i) => (
                <Card key={i} style={{
                  borderColor: a.severity === "critical" ? C.red
                    : a.severity === "warning" ? C.amber : C.blue,
                }}>
                  <View style={[styles.row, { justifyContent: "space-between", marginBottom: 8 }]}>
                    <AlertBadge severity={a.severity} />
                    <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
                      {a.category?.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13,
                    lineHeight: 19, marginBottom: 6 }}>
                    {a.message}
                  </Text>
                  {a.consequence && (
                    <Text style={{ color: C.amber, fontFamily: MONO, fontSize: 12,
                      lineHeight: 17, marginBottom: 6 }}>
                      ⚡ {a.consequence}
                    </Text>
                  )}
                  {a.fix && (
                    <View style={{ backgroundColor: C.greenFaint, borderRadius: 4, padding: 8 }}>
                      <Text style={{ color: C.green, fontFamily: MONO, fontSize: 12, lineHeight: 17 }}>
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
              <View style={[styles.row, { gap: 8, marginTop: 12 }]}>
                <StatBox label="EARLIEST" value={harvest.earliest_harvest?.slice(5)}
                  colour={C.green} />
                <StatBox label="TYPICAL" value={harvest.typical_harvest?.slice(5)}
                  colour={C.amber} />
                <StatBox label="LATEST" value={harvest.latest_harvest?.slice(5)}
                  colour={C.red} />
              </View>
            </Card>

            <Card>
              <Label>DAYS REMAINING</Label>
              <Text style={{ color: C.amber, fontFamily: MONO,
                fontSize: 48, fontWeight: "bold", marginTop: 8 }}>
                {harvest.days_remaining_typical}
              </Text>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11 }}>days to typical harvest</Text>
            </Card>

            <Card>
              <Label>NOTE</Label>
              <Text style={{ color: C.greyLight, fontFamily: MONO,
                fontSize: 12, marginTop: 6, lineHeight: 18 }}>
                {harvest.note}
              </Text>
            </Card>

            {/* Progress bar */}
            <Card>
              <Label>GROW PROGRESS</Label>
              <View style={{ height: 8, backgroundColor: C.border, borderRadius: 4,
                marginTop: 12, overflow: "hidden" }}>
                <View style={{
                  height: 8, borderRadius: 4, backgroundColor: C.green,
                  width: `${Math.min(100, (report.current_day /
                    (report.current_day + (harvest.days_remaining_typical || 0))) * 100)}%`,
                }} />
              </View>
              <View style={[styles.row, { justifyContent: "space-between", marginTop: 4 }]}>
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
                  Day {report.current_day}
                </Text>
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
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
  const [photos, setPhotos]     = useState([]);   // local URIs before save
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

      // Calculate current day
      const start = new Date(grow.start_date);
      const day = Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000) + 1);

      // Save photos locally
      const savedFilenames = [];
      for (const uri of photos) {
        const filename = await savePhoto(uri, grow.grow_id, day);
        savedFilenames.push(filename);
      }

      const result = await api.post(`/tracker/grows/${grow.grow_id}/checkin`, {
        env: Object.keys(env).length ? env : null,
        photos: savedFilenames,
      });

      // Reset streak notification
      await resetStreakReminder(grow.grow_id, grow.strain_name);

      // Schedule harvest alert if close
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
          <View style={[styles.row, { justifyContent: "space-between", marginBottom: 16 }]}>
            <GreenText style={{ fontSize: 16, fontWeight: "bold" }}>DAILY CHECK-IN</GreenText>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <Label style={{ marginBottom: 4 }}>STRAIN</Label>
          <Text style={{ color: C.white, fontFamily: MONO, fontSize: 14, marginBottom: 16 }}>
            {grow?.strain_name}
          </Text>

          {/* Env inputs — 2 per row */}
          <View style={[styles.row, { gap: 10, marginBottom: 10 }]}>
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

          <View style={[styles.row, { gap: 10, marginBottom: 10 }]}>
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

          {/* Photos */}
          <Label style={{ marginBottom: 6, marginTop: 12 }}>
            PHOTOS (OPTIONAL)
          </Label>
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
  const [strainId, setStrainId] = useState("");
  const [strainName, setStrainName] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [medium, setMedium] = useState("soil");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

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
          <View style={[styles.row, { justifyContent: "space-between", marginBottom: 16 }]}>
            <GreenText style={{ fontSize: 16, fontWeight: "bold" }}>START NEW GROW</GreenText>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Strain search */}
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
              backgroundColor: C.surface, borderRadius: 6,
              borderWidth: 1, borderColor: C.border, marginBottom: 10,
            }}>
              {suggestions.map((s) => (
                <TouchableOpacity key={s.id} onPress={() => pickSuggestion(s)}
                  style={{ padding: 12, borderBottomWidth: 1, borderColor: C.border }}>
                  <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13 }}>
                    {s.name}
                  </Text>
                  <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
                    {s.tier} · {s.type?.toUpperCase()} · THC {s.thc_max}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {strainId && (
            <View style={{ backgroundColor: C.greenFaint, borderRadius: 4,
              padding: 8, marginBottom: 10, borderWidth: 1, borderColor: C.greenDim }}>
              <Text style={{ color: C.green, fontFamily: MONO, fontSize: 12 }}>
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
          <View style={[styles.row, { gap: 8, marginBottom: 16 }]}>
            {["soil", "coco", "hydro"].map(m => (
              <TouchableOpacity key={m} onPress={() => setMedium(m)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: "center",
                  borderWidth: 1,
                  borderColor: medium === m ? C.green : C.border,
                  backgroundColor: medium === m ? C.greenFaint : C.surface,
                }}>
                <Text style={{
                  color: medium === m ? C.green : C.grey,
                  fontFamily: MONO, fontSize: 12, textTransform: "uppercase",
                }}>
                  {m}
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
  const alerts = result.alerts || [];
  const critical = alerts.filter(a => a.severity === "critical");
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modal}>
          <GreenText style={{ fontSize: 16, fontWeight: "bold", marginBottom: 4 }}>
            ✓ CHECK-IN LOGGED
          </GreenText>
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11, marginBottom: 16 }}>
            DAY {result.day} · {result.stage?.toUpperCase()}
          </Text>

          {result.urgent && (
            <View style={{ backgroundColor: "#2a0808", borderRadius: 6,
              borderWidth: 1, borderColor: C.red, padding: 10, marginBottom: 12 }}>
              <Text style={{ color: C.red, fontFamily: MONO, fontSize: 13, fontWeight: "bold" }}>
                ⚠ URGENT ACTION REQUIRED
              </Text>
              {critical.map((a, i) => (
                <Text key={i} style={{ color: C.red, fontFamily: MONO,
                  fontSize: 12, marginTop: 4 }}>
                  · {a.message}
                </Text>
              ))}
            </View>
          )}

          {result.tip && (
            <Card style={{ borderColor: C.greenDim }}>
              <Text style={{ color: C.white, fontFamily: MONO, fontSize: 12, lineHeight: 18 }}>
                💡 {result.tip}
              </Text>
            </Card>
          )}

          <Text style={{ color: C.greyLight, fontFamily: MONO,
            fontSize: 11, marginBottom: 12 }}>
            CHECKLIST ({result.checklist?.length || 0} items)
          </Text>
          {(result.checklist || []).slice(0, 4).map((item, i) => (
            <Text key={i} style={{ color: C.white, fontFamily: MONO,
              fontSize: 12, marginBottom: 4 }}>
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
  const [screen, setScreen] = useState("list");
  const [selectedGrow, setSelectedGrow] = useState(null);
  const [showNewGrow, setShowNewGrow] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinTarget, setCheckinTarget] = useState(null);
  const [checkinResult, setCheckinResult] = useState(null);
  const [listKey, setListKey] = useState(0);

  // Request notification permissions on mount
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

  // Notify parent of active grow count for tab badge
  React.useEffect(() => {
    if (onGrowCountChange) onGrowCountChange(0); // updated after list loads
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
  screen:  { flex: 1, backgroundColor: C.bg },
  center:  { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },
  row:     { flexDirection: "row", alignItems: "center" },
  empty:   { alignItems: "center", justifyContent: "center", paddingVertical: 60 },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: Platform.OS === "android" ? 16 : 52,
    paddingBottom: 12,
    borderBottomWidth: 1, borderColor: C.border,
  },

  logo: {
    color: C.white, fontSize: 22, fontWeight: "900",
    fontFamily: Platform.select({ ios: "Courier New", android: "monospace" }),
    letterSpacing: 2,
  },

  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },

  modal: {
    backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: C.border,
    padding: 20, paddingBottom: 40,
    maxHeight: "92%",
  },

  input: {
    backgroundColor: C.surface, borderRadius: 6,
    borderWidth: 1, borderColor: C.border,
    color: C.white, fontFamily: MONO,
    fontSize: 14, padding: 12, marginBottom: 10,
  },
};
