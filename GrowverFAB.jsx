// GrowverFAB.jsx — floating Growver button + slide-up chat panel
// Appears on Grow Tracker, Strain Browser, VPD, Virtual Grow, Outdoor Guide

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Modal, Animated, KeyboardAvoidingView, Platform,
  Dimensions, StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "./apiConfig";

// ── Build screen-aware system message ────────────────────────────────────────
function buildSystemMessage(screen, screenCtx, outdoorCtx) {
  const base = "You are Growver, an expert cannabis growing assistant built into the VYWEED app. ";

  if (screen === "outdoor" && outdoorCtx) {
    return (
      base +
      "The user is on the outdoor growing guide. You have their REAL-TIME conditions — " +
      "use them directly and do NOT ask for weather information.\n\n" +
      `Location: ${outdoorCtx.city}, ${outdoorCtx.country} (${outdoorCtx.lat}° ${outdoorCtx.hemisphere === "Northern" ? "N" : "S"})\n` +
      `Temperature: ${outdoorCtx.temp}°C (feels ${outdoorCtx.feelsLike}°C)\n` +
      `Humidity: ${outdoorCtx.humidity}%\n` +
      `Wind: ${outdoorCtx.wind}km/h ${outdoorCtx.windDir}\n` +
      `UV: ${outdoorCtx.uv ?? "N/A"} · Conditions: ${outdoorCtx.weatherDesc}\n` +
      `Daylight: ${outdoorCtx.daylightHours}h — ${outdoorCtx.daylightZone}\n` +
      `Season: ${outdoorCtx.season}, ${outdoorCtx.hemisphere} hemisphere\n` +
      `Planting status: ${outdoorCtx.plantingStatus}\n` +
      `Active risks: ${outdoorCtx.risks}`
    );
  }

  const d = screenCtx?.data;

  if (screen === "browse" && d?.strainName) {
    const typeMap = { I: "Indica", S: "Sativa", H: "Hybrid" };
    return (
      base +
      `The user is viewing the strain detail page for "${d.strainName}". ` +
      "Answer questions specifically about THIS strain — never give a generic list.\n\n" +
      `Strain: ${d.strainName}\n` +
      `Type: ${typeMap[d.type] || d.type}\n` +
      `Tier: ${d.tier} · Difficulty: ${d.difficulty}\n` +
      `THC: up to ${d.thcMax}%` + (d.cbdMax ? ` · CBD: up to ${d.cbdMax}%` : "") + "\n" +
      `Flower time: ${d.flowerWeeks} weeks\n` +
      `Effect: ${d.effect} · Auto-flower: ${d.isAutoflower ? "Yes" : "No"}\n` +
      `Aroma: ${d.aroma}\n` +
      (d.yieldIndoorMax ? `Indoor yield: up to ${d.yieldIndoorMax}g/m²\n` : "") +
      "\nWhen asked about difficulty or suitability, reference this strain's specific attributes above."
    );
  }

  if (screen === "grow" && d?.strainName) {
    return (
      base +
      `The user is in the virtual grow game, currently growing "${d.strainName}".\n\n` +
      `Strain: ${d.strainName} (${d.tier}, ${d.difficulty}, up to ${d.thcMax}% THC)\n` +
      `Aroma: ${d.aroma}\n` +
      `Day: ${d.day} of ${d.totalDays} · Stage: ${d.stage}\n` +
      `What's happening: ${d.stageDesc}\n` +
      `Grower tip: ${d.tip}\n` +
      (d.isHarvest ? "Status: HARVEST READY\n" : "") +
      `Trophies collected: ${d.trophyCount}\n` +
      "\nAnswer questions about this specific strain and stage. Reference day " + d.day + " / " + d.stage + " in your advice."
    );
  }

  if (screen === "vpd" && d?.vpd !== undefined) {
    return (
      base +
      "The user is using the VPD calculator. Here are their exact current readings — " +
      "reference these specific numbers in your answer.\n\n" +
      `Air temperature: ${d.temp}°C · Humidity: ${d.rh}%\n` +
      `Calculated VPD: ${d.vpd} kPa\n` +
      `Grow stage: ${d.stage}\n` +
      `VPD status: ${d.statusLabel}\n` +
      `Target range for ${d.stage}: ${d.targetLo}–${d.targetHi} kPa (ideal: ${d.targetIdeal} kPa)`
    );
  }

  if (screen === "grows" && d?.strainName) {
    let msg =
      base +
      "The user is tracking a real cannabis grow.\n\n" +
      `Strain: ${d.strainName} · Stage: ${d.stage} · Day: ${d.currentDay}\n` +
      `Medium: ${d.medium} · Days to harvest: ${d.daysToHarvest ?? "unknown"}\n`;
    if (d.expertTip)    msg += `Today's tip: ${d.expertTip}\n`;
    if (d.wateringGuide) msg += `Watering: ${d.wateringGuide}\n`;
    if (d.nutrientGuide) msg += `Nutrients: ${d.nutrientGuide}\n`;
    if (d.activeAlerts?.length)
      msg += `\nActive alerts:\n${d.activeAlerts.map(a => `• ${a}`).join("\n")}\n`;
    if (d.harvestTypical)
      msg += `\nExpected harvest: ${d.harvestTypical} (${d.daysToHarvestTypical} days away)\n`;
    msg += "\nAnswer questions about this specific grow. Reference stage, day count, and active alerts.";
    return msg;
  }

  return base + "Answer cannabis growing questions with expertise and accuracy.";
}
const API_BASE_URL = { toString: () => getApiBaseUrl() };

const { height: SH } = Dimensions.get("window");
const PANEL_H = SH * 0.62;

const C = {
  bg:        "#070a07",
  surface:   "#0d120d",
  card:      "#111811",
  border:    "#1a2a1a",
  green:     "#39ff45",
  greenFaint:"#0d3d12",
  greenDim:  "#1a7a20",
  amber:     "#ffb830",
  grey:      "#4a5a4a",
  greyLight: "#8a9a8a",
  white:     "#e8f0e8",
  overlay:   "rgba(0,0,0,0.7)",
};
const MONO = Platform.select({ ios: "Courier New", android: "monospace" });

// Screen-specific suggestion chips
const SCREEN_CHIPS = {
  grows:   ["Why are my leaves yellowing?", "What should I do today?", "How long until harvest?"],
  browse:  ["Is this strain for beginners?", "Best strain for yield?", "Indica vs sativa effects?"],
  vpd:     ["Explain VPD to me", "Optimal VPD for flowering?", "How do I lower my VPD?"],
  grow:    ["How do I earn trophies?", "Explain grow stages", "What triggers flowering?"],
  outdoor: ["How does today's weather affect my plants?", "Is it safe to plant right now?", "What should I watch for in these conditions?"],
};

const MAX_HISTORY = 10;
let _mid = 0;
const mid = () => String(++_mid);

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  const d1 = useRef(new Animated.Value(0.2)).current;
  const d2 = useRef(new Animated.Value(0.2)).current;
  const d3 = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    const dot = (d, delay) => Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(d, { toValue: 1,   duration: 280, useNativeDriver: true }),
      Animated.timing(d, { toValue: 0.2, duration: 280, useNativeDriver: true }),
      Animated.delay(350),
    ]));
    const a = [dot(d1, 0), dot(d2, 180), dot(d3, 360)];
    a.forEach(x => x.start());
    return () => a.forEach(x => x.stop());
  }, []);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 6 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.greenDim,
                     alignItems: "center", justifyContent: "center", marginRight: 8 }}>
        <Text style={{ fontSize: 12 }}>🤖</Text>
      </View>
      <View style={{ backgroundColor: C.card, borderRadius: 14, borderTopLeftRadius: 4,
                     paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row",
                     gap: 4, borderWidth: 1, borderColor: C.border }}>
        {[d1, d2, d3].map((d, i) => (
          <Animated.View key={i} style={{ width: 6, height: 6, borderRadius: 3,
                                          backgroundColor: C.green, opacity: d }} />
        ))}
      </View>
    </View>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ role, content }) {
  const isUser = role === "user";
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end",
                   paddingHorizontal: 12, paddingVertical: 3,
                   justifyContent: isUser ? "flex-end" : "flex-start" }}>
      {!isUser && (
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.greenDim,
                       alignItems: "center", justifyContent: "center", marginRight: 6, flexShrink: 0 }}>
          <Text style={{ fontSize: 12 }}>🤖</Text>
        </View>
      )}
      <View style={{ maxWidth: "80%", backgroundColor: isUser ? C.greenFaint : C.card,
                     borderRadius: 14, borderTopRightRadius: isUser ? 4 : 14,
                     borderTopLeftRadius: isUser ? 14 : 4,
                     paddingHorizontal: 12, paddingVertical: 8,
                     borderWidth: 1, borderColor: isUser ? C.greenDim : C.border }}>
        <Text style={{ color: isUser ? C.green : C.white, fontFamily: MONO,
                       fontSize: 12, lineHeight: 18 }}>
          {content}
        </Text>
      </View>
    </View>
  );
}

function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, {
    ...opts,
    signal: ctrl.signal,
    headers: { 'ngrok-skip-browser-warning': 'true', ...opts?.headers },
  }).finally(() => clearTimeout(t));
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GrowverFAB({ screen, onOpenFull }) {
  const [panelOpen, setPanelOpen]   = useState(false);
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [model, setModel]           = useState("llama3.2");

  const insets       = useSafeAreaInsets();
  const slideAnim    = useRef(new Animated.Value(PANEL_H)).current;
  const fadeAnim     = useRef(new Animated.Value(0)).current;
  const scaleAnim    = useRef(new Animated.Value(0)).current;
  const glowAnim     = useRef(new Animated.Value(0)).current;
  const listRef      = useRef(null);
  const inputRef     = useRef(null);
  const hasOpened    = useRef(false);
  const weatherCtx   = useRef(null); // outdoor weather (vyweed_outdoor_weather)
  const screenCtxRef = useRef(null); // current screen context (vyweed_growver_context)

  // Entrance + glow when FAB mounts
  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true,
                                  tension: 80, friction: 6 }).start();
    const glow = Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 1400, useNativeDriver: false }),
      Animated.timing(glowAnim, { toValue: 0, duration: 1400, useNativeDriver: false }),
    ]));
    glow.start();
    return () => glow.stop();
  }, []);

  const openPanel = useCallback(() => {
    hasOpened.current = true;
    setPanelOpen(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    // Load screen context (all screens) and outdoor weather (outdoor only)
    AsyncStorage.getItem("vyweed_growver_context")
      .then(raw => { if (raw) screenCtxRef.current = JSON.parse(raw); })
      .catch(() => {});
    if (screen === "outdoor") {
      AsyncStorage.getItem("vyweed_outdoor_weather")
        .then(raw => { if (raw) weatherCtx.current = JSON.parse(raw); })
        .catch(() => {});
    }
    // Probe Ollama silently on first open
    if (!hasOpened.current) {
      fetch(`${API_BASE_URL}/api/v1/growver/status`, { signal: AbortSignal.timeout?.(4000), headers: { 'ngrok-skip-browser-warning': 'true' } })
        .then(r => r.json()).then(d => { if (d.models?.length) setModel(d.models[0]); })
        .catch(() => {});
    }
  }, [screen]);

  const closePanel = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: PANEL_H, duration: 260, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 0,       duration: 200, useNativeDriver: true }),
    ]).start(() => setPanelOpen(false));
  }, []);

  const addMsg = (role, content) => {
    const m = { id: mid(), role, content };
    setMessages(prev => [...prev, m]);
    return m;
  };

  const send = useCallback(async (text) => {
    const t = (text ?? input).trim();
    if (!t || loading) return;
    setInput("");
    addMsg("user", t);
    setLoading(true);

    const baseHistory = [...messages, { role: "user", content: t }]
      .slice(-MAX_HISTORY)
      .map(({ role, content }) => ({ role, content }));

    // Backend only accepts role "user"|"assistant" — inject context as a primed
    // exchange at the start so the model treats it as established context.
    const systemContent = buildSystemMessage(
      screen,
      screenCtxRef.current,
      weatherCtx.current,
    );
    const contextPrime = [
      { role: "user",      content: `[Context for this session — use this when answering]\n${systemContent}` },
      { role: "assistant", content: "Understood. I have your context and will use it to give you specific, accurate answers." },
    ];
    const history = [...contextPrime, ...baseHistory];

    try {
      const r = await fetchWithTimeout(
        `${API_BASE_URL}/api/v1/growver/chat`,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, model }) },
        120_000,
      );
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        const detail = e.detail;
        throw new Error(
          typeof detail === "string" ? detail
          : Array.isArray(detail)   ? detail.map(d => d.msg || JSON.stringify(d)).join("; ")
          : detail                  ? JSON.stringify(detail)
          :                           `Error ${r.status}`
        );
      }
      const data = await r.json();
      addMsg("assistant", data.reply);
    } catch (e) {
      addMsg("assistant", e.name === "AbortError"
        ? "⚠️ Request timed out."
        : `⚠️ ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, model]);

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [C.greenDim, C.green],
  });

  const chips = SCREEN_CHIPS[screen] ?? SCREEN_CHIPS.grows;
  const showChips = messages.length === 0 && !loading;

  return (
    <>
      {/* ── Floating button ── */}
      <Animated.View style={[styles.fab, {
        bottom: insets.bottom + 74,
        transform: [{ scale: scaleAnim }],
      }]}>
        <Animated.View style={[styles.fabInner, { borderColor }]}>
          <TouchableOpacity onPress={openPanel} activeOpacity={0.8} style={styles.fabTouchable}>
            <Text style={styles.fabIcon}>🤖</Text>
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.fabLabel}>GROWVER</Text>
      </Animated.View>

      {/* ── Slide-up panel ── */}
      {panelOpen && (
        <Modal transparent visible={panelOpen} animationType="none"
               onRequestClose={closePanel} statusBarTranslucent>

          {/* Backdrop */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fadeAnim }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closePanel} />
          </Animated.View>

          {/* Panel */}
          <KeyboardAvoidingView style={styles.panelWrapper} behavior={Platform.OS === "ios" ? "padding" : "height"} pointerEvents="box-none">
            <Animated.View style={[styles.panel, { transform: [{ translateY: slideAnim }] }]}>

              {/* Drag handle */}
              <View style={styles.handle} />

              {/* Header */}
              <View style={styles.header}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.headerTitle}>🤖 GROWVER</Text>
                  <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
                </View>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  {messages.length > 0 && (
                    <TouchableOpacity onPress={() => setMessages([])}>
                      <Text style={styles.headerBtn}>CLEAR</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => { closePanel(); setTimeout(onOpenFull, 300); }}>
                    <Text style={[styles.headerBtn, { color: C.green }]}>FULL ↗</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={closePanel} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Context indicator — shows what Growver knows about this screen */}
              {(screen === "outdoor" ? weatherCtx.current : screenCtxRef.current?.data) && (
                <View style={{ backgroundColor: "#0a1a0a", borderBottomWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 11 }}>
                    {screen === "outdoor" ? "🌤" : screen === "browse" ? "🌿" : screen === "grow" ? "🎮" : screen === "vpd" ? "💧" : "📋"}
                  </Text>
                  <Text style={{ color: C.greenDim, fontFamily: MONO, fontSize: 10 }}>
                    {screen === "outdoor" && weatherCtx.current
                      ? `Weather-aware · ${weatherCtx.current.temp}°C · ${weatherCtx.current.city}`
                      : screen === "browse" && screenCtxRef.current?.data?.strainName
                      ? `Viewing: ${screenCtxRef.current.data.strainName}`
                      : screen === "grow" && screenCtxRef.current?.data?.strainName
                      ? `Growing: ${screenCtxRef.current.data.strainName} · Day ${screenCtxRef.current.data.day} · ${screenCtxRef.current.data.stage}`
                      : screen === "vpd" && screenCtxRef.current?.data?.vpd !== undefined
                      ? `VPD: ${screenCtxRef.current.data.vpd} kPa · ${screenCtxRef.current.data.statusLabel}`
                      : screen === "grows" && screenCtxRef.current?.data?.strainName
                      ? `Tracking: ${screenCtxRef.current.data.strainName} · Day ${screenCtxRef.current.data.currentDay}`
                      : "Screen context loaded"}
                  </Text>
                </View>
              )}

              {/* Messages or suggestion chips */}
              <View style={{ flex: 1 }}>
                {showChips ? (
                  <View style={styles.chipsContainer}>
                    <Text style={styles.chipsLabel}>QUICK QUESTIONS</Text>
                    {chips.map(c => (
                      <TouchableOpacity key={c} onPress={() => send(c)} style={styles.chip}>
                        <Text style={styles.chipText}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <FlatList
                    ref={listRef}
                    data={messages}
                    keyExtractor={m => m.id}
                    renderItem={({ item }) => <Bubble role={item.role} content={item.content} />}
                    ListFooterComponent={loading ? <TypingDots /> : null}
                    onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                    contentContainerStyle={{ paddingVertical: 8 }}
                    showsVerticalScrollIndicator={false}
                  />
                )}
              </View>

              {/* Input bar */}
              <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <TextInput
                  ref={inputRef}
                  value={input}
                  onChangeText={setInput}
                  placeholder="Ask Growver..."
                  placeholderTextColor={C.grey}
                  multiline
                  maxLength={800}
                  style={styles.input}
                  onSubmitEditing={() => send(input)}
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  onPress={() => send(input)}
                  disabled={loading || !input.trim()}
                  style={[styles.sendBtn, { backgroundColor: loading || !input.trim() ? C.grey : C.green }]}
                >
                  <Text style={styles.sendIcon}>↑</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  fab:          { position: "absolute", right: 16, alignItems: "center" },
  fabInner:     { width: 54, height: 54, borderRadius: 27, borderWidth: 2,
                  backgroundColor: C.surface, alignItems: "center", justifyContent: "center",
                  shadowColor: C.green, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8 },
  fabTouchable: { width: 54, height: 54, alignItems: "center", justifyContent: "center" },
  fabIcon:      { fontSize: 26 },
  fabLabel:     { color: C.greenDim, fontFamily: MONO, fontSize: 8,
                  letterSpacing: 1, marginTop: 4 },
  backdrop:     { backgroundColor: C.overlay },
  panelWrapper: { flex: 1, justifyContent: "flex-end" },
  panel:        { height: PANEL_H, backgroundColor: C.surface,
                  borderTopLeftRadius: 20, borderTopRightRadius: 20,
                  borderTopWidth: 2, borderLeftWidth: 1, borderRightWidth: 1,
                  borderColor: C.greenDim, overflow: "hidden" },
  handle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: C.grey,
                  alignSelf: "center", marginTop: 10, marginBottom: 6 },
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  paddingHorizontal: 16, paddingBottom: 10,
                  borderBottomWidth: 1, borderColor: C.border },
  headerTitle:  { color: C.green, fontFamily: MONO, fontSize: 15, fontWeight: "bold" },
  aiBadge:      { backgroundColor: C.greenFaint, borderRadius: 4,
                  paddingHorizontal: 5, paddingVertical: 2 },
  aiBadgeText:  { color: C.green, fontFamily: MONO, fontSize: 9 },
  headerBtn:    { color: C.greyLight, fontFamily: MONO, fontSize: 11 },
  closeBtn:     { width: 28, height: 28, borderRadius: 14, backgroundColor: C.card,
                  borderWidth: 1, borderColor: C.border,
                  alignItems: "center", justifyContent: "center" },
  closeBtnText: { color: C.greyLight, fontSize: 13 },
  chipsContainer: { padding: 14 },
  chipsLabel:   { color: C.greyLight, fontFamily: MONO, fontSize: 10,
                  letterSpacing: 1, marginBottom: 10, textAlign: "center" },
  chip:         { backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
                  borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, marginBottom: 8 },
  chipText:     { color: C.greyLight, fontFamily: MONO, fontSize: 12 },
  inputRow:     { flexDirection: "row", alignItems: "flex-end", gap: 8,
                  paddingHorizontal: 12, paddingTop: 8,
                  borderTopWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  input:        { flex: 1, backgroundColor: C.card, color: C.white,
                  fontFamily: MONO, fontSize: 13, paddingHorizontal: 14,
                  paddingVertical: 10, borderRadius: 20, borderWidth: 1,
                  borderColor: C.border, maxHeight: 100, minHeight: 42 },
  sendBtn:      { width: 42, height: 42, borderRadius: 21,
                  alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sendIcon:     { fontSize: 19, color: C.bg, marginTop: -2 },
});
