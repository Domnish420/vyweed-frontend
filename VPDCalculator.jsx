/**
 * VPDCalculator.jsx
 * Real-time VPD calculator + interactive scenario simulator.
 * CALC tab — live VPD readout with +/- controls.
 * SIMULATE tab — interactive plant simulator with health model + day log.
 */

import React, { useState, useMemo, useEffect } from "react";
import { setGrowverContext } from "./growverContext";
import {
  View, Text, ScrollView, TouchableOpacity,
  Platform, Dimensions, Modal,
} from "react-native";
import PlantRenderer from "./PlantRenderer";

const { width: SW } = Dimensions.get("window");

const C = {
  bg:         "#070a07",
  surface:    "#0d120d",
  card:       "#111811",
  border:     "#1a2a1a",
  green:      "#39ff45",
  greenFaint: "#0d3d12",
  greenDim:   "#1a7a20",
  amber:      "#ffb830",
  red:        "#ff3a3a",
  blue:       "#30d5ff",
  white:      "#e8f0e8",
  grey:       "#4a5a4a",
  greyLight:  "#8a9a8a",
};

const MONO = Platform.select({ ios: "Courier New", android: "monospace" });

// ── VPD maths ─────────────────────────────────────────────────────────────────
function svp(tempC) {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}
function calcVPD(airTempC, rh, leafTempOffset = -2) {
  const leafTemp = airTempC + leafTempOffset;
  const svpLeaf  = svp(leafTemp);
  const svpAir   = svp(airTempC);
  const actualVP = svpAir * (rh / 100);
  return Math.max(0, svpLeaf - actualVP);
}

// ── Stage targets ─────────────────────────────────────────────────────────────
const STAGE_TARGETS = {
  Seedling:      { lo: 0.4, hi: 0.8,  ideal: 0.6,  label: "🌱 Seedling" },
  Vegetative:    { lo: 0.8, hi: 1.2,  ideal: 1.0,  label: "🍃 Vegetative" },
  "Pre-Flower":  { lo: 1.0, hi: 1.5,  ideal: 1.2,  label: "🌸 Pre-Flower" },
  Flowering:     { lo: 1.0, hi: 1.5,  ideal: 1.2,  label: "🌺 Flowering" },
  "Late Flower": { lo: 1.5, hi: 2.0,  ideal: 1.7,  label: "🌾 Late Flower" },
};

function vpdStatus(vpd, stage) {
  const t = STAGE_TARGETS[stage] || STAGE_TARGETS.Vegetative;
  if (vpd < t.lo) return { status: "low",  colour: C.blue,  label: "TOO LOW — raise temp or lower humidity" };
  if (vpd > t.hi) return { status: "high", colour: C.red,   label: "TOO HIGH — lower temp or raise humidity" };
  const dist = Math.abs(vpd - t.ideal);
  if (dist <= 0.1) return { status: "ideal", colour: C.green, label: "PERFECT ✓" };
  return               { status: "ok",    colour: C.amber, label: "ACCEPTABLE" };
}

// ── Health model functions ────────────────────────────────────────────────────
function calcVpdFactor(vpd, stage) {
  const t = STAGE_TARGETS[stage] || STAGE_TARGETS.Vegetative;
  if (vpd < t.lo * 0.5) return 0.20;
  if (vpd < t.lo)        return 0.55 + 0.45 * (vpd / t.lo);
  if (vpd <= t.hi)       return 1.00;
  if (vpd <= t.hi * 1.3) return 0.72;
  if (vpd <= 2.0)        return 0.42;
  return 0.12;
}
function calcTempFactor(t) {
  if (t < 14)  return 0.10;
  if (t < 18)  return 0.50;
  if (t <= 28) return 1.00;
  if (t <= 31) return 0.65;
  if (t <= 34) return 0.35;
  return 0.12;
}
const NUTRIENT_FACTOR = { low: 0.68, med: 1.00, high: 0.80, toxic: 0.28 };
const WATER_FACTOR    = { dry: 0.48, ok: 1.00, over: 0.62 };

function calcDayHealth(temp, rh, stage, nutrients, water) {
  const vpd = calcVPD(temp, rh);
  return calcVpdFactor(vpd, stage)
    * calcTempFactor(temp)
    * (NUTRIENT_FACTOR[nutrients] ?? 1)
    * (WATER_FACTOR[water] ?? 1);
}

function getSymptoms(health, temp, vpd, stage, nutrients, water) {
  const t = STAGE_TARGETS[stage] || STAGE_TARGETS.Vegetative;
  const s = [];
  if (vpd < t.lo * 0.5)    s.push("Stomata closed — zero nutrient transport");
  else if (vpd < t.lo)     s.push("Low VPD — sluggish transpiration");
  else if (vpd > 2.0)      s.push("Emergency shutdown — stomata sealed");
  else if (vpd > t.hi * 1.3) s.push("VPD critical — severe leaf tacoing");
  else if (vpd > t.hi)     s.push("VPD high — plant working overtime");
  if (temp > 32)           s.push("Heat stress — bleaching + tip burn");
  else if (temp > 29)      s.push("Warm stress — tip burn risk");
  else if (temp < 16)      s.push("Cold stress — root zone stalled");
  else if (temp < 18)      s.push("Cool temps — reduced metabolism");
  if (nutrients === "toxic") s.push("Nute toxicity — burn across all leaves");
  else if (nutrients === "high") s.push("Overfeeding — tip burn developing");
  else if (nutrients === "low")  s.push("Underfeeding — pale interveinal chlorosis");
  if (water === "dry")     s.push("Drought stress — wilting, stomata shut");
  else if (water === "over") s.push("Overwatering — root hypoxia, yellowing");
  if (health < 0.30)       s.push("Severe stress — growth fully halted");
  else if (health < 0.55)  s.push("Moderate stress — yield impact certain");
  if (s.length === 0)      s.push("Plant is healthy and thriving");
  return s;
}

function getPreventionTips(temp, vpd, stage, nutrients, water) {
  const t = STAGE_TARGETS[stage] || STAGE_TARGETS.Vegetative;
  const tips = [];
  if (vpd > t.hi)          tips.push("Lower temp or raise RH to reduce VPD");
  else if (vpd < t.lo)     tips.push("Raise temp or lower RH to increase VPD");
  if (temp > 28)           tips.push(`Reduce temp to 24–26°C (you are ${(temp-26).toFixed(0)}°C over)`);
  else if (temp < 18)      tips.push(`Raise temp to 20–26°C (you are ${(18-temp).toFixed(0)}°C under)`);
  if (nutrients === "toxic") tips.push("Flush medium with plain pH water — 3× pot volume");
  else if (nutrients === "high") tips.push("Reduce feed concentration by 25–30%");
  else if (nutrients === "low")  tips.push("Step up feed — work toward full strength");
  if (water === "dry")     tips.push("Water now — check medium every 12–24h");
  else if (water === "over") tips.push("Let medium dry out — 30% weight loss before next water");
  if (tips.length === 0)   tips.push("Conditions are optimal — maintain these parameters");
  return tips;
}

function runSimulation(days, temp, rh, stage, nutrients, water) {
  let health = 1.0;
  const log = [];
  for (let d = 1; d <= days; d++) {
    const target = calcDayHealth(temp, rh, stage, nutrients, water);
    health = health + (target - health) * 0.28;
    health = Math.max(0.02, Math.min(1.0, health));
    const vpd = calcVPD(temp, rh);
    log.push({
      day: d,
      health: Math.round(health * 100),
      vpd: vpd.toFixed(2),
      symptoms: getSymptoms(health, temp, vpd, stage, nutrients, water),
    });
  }
  return log;
}

// ── Scenario bank ─────────────────────────────────────────────────────────────
const SCENARIOS = [
  { name: "HEAT WAVE",       icon: "🔥", temp: 33, rh: 38, light: "12", nutrients: "med",   water: "dry",  desc: "AC fails — heat + drought combo" },
  { name: "COLD SNAP",       icon: "❄️", temp: 16, rh: 84, light: "12", nutrients: "med",   water: "ok",   desc: "Heating cuts out overnight" },
  { name: "HUMIDITY CRISIS", icon: "💧", temp: 24, rh: 78, light: "12", nutrients: "med",   water: "over", desc: "Dehumidifier fails in flower" },
  { name: "PERFECT VEG",     icon: "🍃", temp: 24, rh: 62, light: "18", nutrients: "med",   water: "ok",   desc: "Dialled vegetative environment" },
  { name: "PERFECT FLOWER",  icon: "🌺", temp: 26, rh: 50, light: "12", nutrients: "med",   water: "ok",   desc: "Optimal mid-flower conditions" },
  { name: "LATE FLOWER",     icon: "💎", temp: 27, rh: 44, light: "12", nutrients: "low",   water: "ok",   desc: "Resin push — final 2 weeks" },
  { name: "OVERFEEDING",     icon: "☠️", temp: 24, rh: 58, light: "18", nutrients: "toxic", water: "ok",   desc: "Nute toxicity — beginner trap" },
  { name: "ROOT DROWN",      icon: "🌊", temp: 22, rh: 65, light: "18", nutrients: "med",   water: "over", desc: "Overwatering — anaerobic roots" },
];

// ── Plant state data per VPD band ─────────────────────────────────────────────
const VPD_PLANT_STATES = [
  {
    range:        [0, 0.4],
    stateLabel:   "STOMATA CLOSED",
    colour:       C.blue,
    transpiration:"Almost none — nutrient transport stalled",
    summary:      "Air is nearly saturated. The plant has no vapour pressure gradient to drive transpiration. Stomata stay shut and the plant stops feeding.",
    symptoms:     ["Zero visible growth", "Limp soft stems despite wet soil", "Condensation forming on leaves", "Grey mould appearing inside buds"],
    risk:         "CRITICAL — botrytis (bud rot) can destroy your harvest within 48 hours",
    riskColour:   C.red,
    fix:          ["Run dehumidifier on max", "Crank extraction fan to full", "Add direct oscillating fans through canopy", "Remove any affected buds immediately — mould spreads fast"],
  },
  {
    range:        [0.4, 0.8],
    stateLabel:   "MINIMAL TRANSPIRATION",
    colour:       "#88d8ff",
    transpiration:"Low — only suitable for seedlings",
    summary:      "Plant is barely breathing. Fine for seedlings whose roots are small, but vegetative and flowering plants need more vapour pressure to pull nutrients.",
    symptoms:     ["Slow growth", "Slightly limp canopy", "Damp microclimate between dense leaves", "Early mould spots on older fan leaves"],
    risk:         "Moderate — mould risk increases each day you stay here in veg/flower",
    riskColour:   C.amber,
    fix:          ["Lower humidity by 5–10%", "Raise temperature slightly", "Improve airflow through canopy", "Fine for seedlings — no action needed before week 2"],
  },
  {
    range:        [0.8, 1.5],
    stateLabel:   "ACTIVE TRANSPIRATION",
    colour:       C.green,
    transpiration:"Optimal — plant drawing nutrients efficiently",
    summary:      "Stomata open, transpiration running at full capacity. The plant is actively pulling water and dissolved nutrients up from the roots. This is where growth happens.",
    symptoms:     ["Turgid, upward-pointing leaves", "Visible new growth daily", "Good water uptake", "Strong internodal spacing"],
    risk:         "Minimal — ideal range. Focus on light and nutrients.",
    riskColour:   C.green,
    fix:          ["Hold these conditions", "This is the sweet spot — any energy goes into nutrients and training"],
  },
  {
    range:        [1.5, 2.0],
    stateLabel:   "HEAVY TRANSPIRATION",
    colour:       C.amber,
    transpiration:"High — plant is working hard",
    summary:      "Plant is under mild intentional stress. Higher VPD in late flower forces the plant to produce more resin as a defence mechanism. Only sustainable for the final 1–2 weeks.",
    symptoms:     ["Leaf edges curling upward slightly (tacoing)", "Fast water uptake — check daily", "Buds thickening and becoming stickier", "Slight yellowing on oldest leaves (normal in late flower)"],
    risk:         "Manageable — but only push this in the final 2 weeks of flower",
    riskColour:   C.amber,
    fix:          ["Water more frequently — roots must stay hydrated", "Don't push above 2.0 kPa", "Ensure strong airflow over buds", "Only sustainable for 7–14 days maximum"],
  },
  {
    range:        [2.0, 99],
    stateLabel:   "EMERGENCY SHUTDOWN",
    colour:       C.red,
    transpiration:"Zero — plant is protecting itself from death",
    summary:      "Stomata have closed to prevent fatal water loss. All photosynthesis, nutrient uptake and growth have stopped. The plant is in survival mode.",
    symptoms:     ["Leaves curling up tightly (taco-ing)", "Wilting despite wet soil (roots can't push fast enough)", "Bleached or pale patches near the light", "Rapid nutrient burn appearing on tips", "Complete growth halt"],
    risk:         "SEVERE — significant yield loss is certain without immediate intervention",
    riskColour:   C.red,
    fix:          ["Lower temperature IMMEDIATELY — raise lights, add cooling", "Raise humidity 10–15% right now", "Check roots are not dehydrated (heat above 26°C dries medium fast)", "Remove lollipop lower growth to reduce plant's total transpiration load", "Do not feed until stress resolves"],
  },
];

// ── Shared sub-components ─────────────────────────────────────────────────────
function InfoBtn({ onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface,
        borderWidth: 1, borderColor: C.greenDim, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: C.green, fontFamily: MONO, fontSize: 14, fontWeight: "bold" }}>?</Text>
    </TouchableOpacity>
  );
}

function Label({ children, style }) {
  return (
    <Text style={[{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
      letterSpacing: 1.5, textTransform: "uppercase" }, style]}>
      {children}
    </Text>
  );
}

function NumInput({ label, value, onChange, unit, min, max, step = 0.5 }) {
  const dec = () => onChange(Math.max(min, parseFloat((+value - step).toFixed(1))));
  const inc = () => onChange(Math.min(max, parseFloat((+value + step).toFixed(1))));
  return (
    <View style={{ marginBottom: 16 }}>
      <Label style={{ marginBottom: 6 }}>{label}</Label>
      <View style={{ flexDirection: "row", alignItems: "center",
        backgroundColor: C.surface, borderRadius: 8,
        borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
        <TouchableOpacity onPress={dec}
          style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
          <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 20 }}>−</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: C.green, fontFamily: MONO, fontSize: 26, fontWeight: "bold" }}>
            {value}
          </Text>
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11 }}>{unit}</Text>
        </View>
        <TouchableOpacity onPress={inc}
          style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
          <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 20 }}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function VPDGauge({ vpd, stage }) {
  const t = STAGE_TARGETS[stage] || STAGE_TARGETS.Vegetative;
  const { colour } = vpdStatus(vpd, stage);
  const pct   = Math.min(100, (vpd / 3) * 100);
  const loPos = (t.lo / 3) * 100;
  const hiPos = (t.hi / 3) * 100;
  return (
    <View style={{ marginVertical: 8 }}>
      <View style={{ height: 12, backgroundColor: C.border, borderRadius: 6,
        overflow: "hidden", position: "relative" }}>
        <View style={{ position: "absolute", left: `${loPos}%`, width: `${hiPos - loPos}%`,
          height: 12, backgroundColor: `${C.green}33`,
          borderLeftWidth: 2, borderRightWidth: 2, borderColor: C.greenDim }} />
        <View style={{ width: `${pct}%`, height: 12,
          backgroundColor: colour, borderRadius: 6, opacity: 0.85 }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9 }}>0</Text>
        <Text style={{ color: C.greenDim, fontFamily: MONO, fontSize: 9 }}>
          {t.lo}–{t.hi} TARGET
        </Text>
        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9 }}>3.0</Text>
      </View>
    </View>
  );
}

// ── Pill selector ─────────────────────────────────────────────────────────────
function PillSelector({ options, value, onChange }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={{
            paddingHorizontal: 12, paddingVertical: 7,
            borderRadius: 6, borderWidth: 1,
            backgroundColor: value === opt.value ? C.greenFaint : C.surface,
            borderColor: value === opt.value ? C.green : C.border,
          }}>
          <Text style={{ fontFamily: MONO, fontSize: 11,
            color: value === opt.value ? C.green : C.greyLight }}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Info modal ────────────────────────────────────────────────────────────────
const VPD_INFO = {
  title: "VPD CALCULATOR",
  emoji: "🌡",
  what: "VPD (Vapour Pressure Deficit) measures the difference between how much moisture the air is holding and how much it could hold. Plants use this gradient to decide how hard to breathe — too low and they stop, too high and they shut down.",
  sections: [
    { icon: "📐", title: "THE NUMBER (kPa)", text: "kPa = kilopascals. Think of it as how hard your plant is working. 0.4-0.8 for seedlings. 0.8-1.2 for veg. 1.0-1.5 for flower. 1.5-2.0 for the final 2 weeks of late flower only." },
    { icon: "🌿", title: "SIMULATE TAB", text: "Set your environment (temp, RH, light, nutrients, water) and run a 7, 14 or 21-day simulation. The plant visual reflects accumulated stress. Day log shows per-day health, VPD, active symptoms and prevention tips." },
    { icon: "🌸", title: "SCENARIO BANK", text: "Real-world crisis scenarios — heat waves, humidity spikes, cold snaps, overfeeding. Tap any card to pre-load all 5 condition variables, then hit a run button to simulate." },
    { icon: "💧", title: "PLANT STATE CARD", text: "Below the grid, the plant state card updates live. Tap it to expand — shows transpiration status, visible symptoms, risk level, and a numbered fix list. This is your on-the-spot grow doctor." },
  ],
  tip: "Change humidity first — it's easier than temperature. A dehumidifier, humidifier, or even a bowl of water can shift RH 5-15% faster than you can change air temp.",
};

function VPDInfoModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20,
          borderTopRightRadius: 20, borderTopWidth: 2, borderColor: C.green, maxHeight: "90%" }}>
          <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2 }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 28 }}>{VPD_INFO.emoji}</Text>
              <View>
                <Text style={{ color: C.green, fontFamily: MONO, fontSize: 16, fontWeight: "bold" }}>
                  {VPD_INFO.title}
                </Text>
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>HOW TO USE THIS SCREEN</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <View style={{ backgroundColor: C.greenFaint, borderRadius: 8,
              borderWidth: 1, borderColor: C.greenDim, padding: 14, marginBottom: 16 }}>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 6 }}>WHAT IS THIS?</Text>
              <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, lineHeight: 20 }}>
                {VPD_INFO.what}
              </Text>
            </View>
            {VPD_INFO.sections.map((s, i) => (
              <View key={i} style={{ backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center",
                  gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 18 }}>{s.icon}</Text>
                  <Text style={{ color: C.green, fontFamily: MONO,
                    fontSize: 12, fontWeight: "bold" }}>
                    {s.title}
                  </Text>
                </View>
                <Text style={{ color: C.greyLight, fontFamily: MONO,
                  fontSize: 12, lineHeight: 19 }}>
                  {s.text}
                </Text>
              </View>
            ))}
            <View style={{ backgroundColor: "#0d1a2a", borderRadius: 8,
              borderWidth: 1, borderColor: C.blue, padding: 14 }}>
              <Text style={{ color: C.blue, fontFamily: MONO, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 6 }}>💡 PRO TIP</Text>
              <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, lineHeight: 19 }}>
                {VPD_INFO.tip}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function VPDCalculator() {
  const [temp,          setTemp]          = useState(24.0);
  const [rh,            setRh]            = useState(55.0);
  const [stage,         setStage]         = useState("Vegetative");
  const [tab,           setTab]           = useState("calc");    // "calc" | "simulate"
  const [showInfo,      setShowInfo]      = useState(false);
  const [activeScenario, setActiveScenario] = useState(null);

  // Simulate tab state
  const [simNutrients,  setSimNutrients]  = useState("med");   // "low"|"med"|"high"|"toxic"
  const [simWater,      setSimWater]      = useState("ok");    // "dry"|"ok"|"over"
  const [simLight,      setSimLight]      = useState("18");    // "18"|"12"
  const [simLog,        setSimLog]        = useState([]);
  const [simHealth,     setSimHealth]     = useState(100);
  const [hasSimulated,  setHasSimulated]  = useState(false);

  const vpd = useMemo(() => calcVPD(temp, rh), [temp, rh]);
  const { colour, label: statusLabel } = vpdStatus(vpd, stage);
  const target = STAGE_TARGETS[stage];

  useEffect(() => {
    const { label } = vpdStatus(vpd, stage);
    const t = STAGE_TARGETS[stage];
    setGrowverContext("vpd", {
      temp, rh,
      vpd:         Math.round(vpd * 100) / 100,
      stage,
      statusLabel: label,
      targetLo:    t.lo,
      targetHi:    t.hi,
      targetIdeal: t.ideal,
    });
  }, [vpd, stage, temp, rh]);

  const refTable = useMemo(() => {
    return [20, 22, 24, 26, 28, 30].map(t => {
      const ideal       = target.ideal;
      const svpLeaf     = svp(t - 2);
      const svpAir      = svp(t);
      const rhForIdeal  = ((svpAir - (svpLeaf - ideal)) / svpAir) * 100;
      return { temp: t, rh: Math.round(Math.max(0, Math.min(100, rhForIdeal))) };
    });
  }, [stage, target]);

  const adjustmentTip = useMemo(() => {
    const { status } = vpdStatus(vpd, stage);
    if (status === "ideal" || status === "ok") return null;
    if (status === "low") {
      return `RAISE TEMP to ${Math.round((temp + 1) * 2) / 2}°C  OR  LOWER RH to ${Math.round(rh - 5)}%`;
    }
    return `LOWER TEMP to ${Math.round((temp - 1) * 2) / 2}°C  OR  RAISE RH to ${Math.round(rh + 5)}%`;
  }, [vpd, stage, temp, rh]);

  function loadScenario(s) {
    setTemp(s.temp);
    setRh(s.rh);
    setSimLight(s.light || "12");
    setSimNutrients(s.nutrients || "med");
    setSimWater(s.water || "ok");
    setActiveScenario(s.name);
    setSimLog([]);
    setHasSimulated(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>

      {/* Header */}
      <View style={{ paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 16 : 52,
        paddingBottom: 14, borderBottomWidth: 1, borderColor: C.border,
        flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View>
          <Text style={{ color: C.white, fontFamily: MONO,
            fontSize: 22, fontWeight: "900", letterSpacing: 2 }}>
            VY<Text style={{ color: C.green }}>WEED</Text>
          </Text>
          <Label>VPD CALCULATOR</Label>
        </View>
        <InfoBtn onPress={() => setShowInfo(true)} />
      </View>

      {/* Stage selector */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {Object.keys(STAGE_TARGETS).map(s => (
              <TouchableOpacity key={s} onPress={() => setStage(s)}
                style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8,
                  borderWidth: 1,
                  borderColor: stage === s ? "rgba(120,200,130,0.35)" : C.border,
                  backgroundColor: stage === s ? "rgba(255,255,255,0.055)" : C.surface }}>
                <Text style={{ color: stage === s ? "rgba(170,230,178,0.9)" : C.greyLight,
                  fontFamily: MONO, fontSize: 12 }}>
                  {STAGE_TARGETS[s].label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Tab bar */}
      <View style={{ flexDirection: "row", marginHorizontal: 16, marginTop: 14,
        backgroundColor: C.surface, borderRadius: 10, borderWidth: 1,
        borderColor: C.border, overflow: "hidden" }}>
        {[["calc", "CALCULATOR"], ["simulate", "SIMULATE"]].map(([key, lbl]) => (
          <TouchableOpacity key={key} onPress={() => setTab(key)}
            style={{ flex: 1, paddingVertical: 10, alignItems: "center",
              backgroundColor: tab === key ? C.card : "transparent",
              borderRightWidth: key === "calc" ? 1 : 0,
              borderColor: C.border }}>
            <Text style={{ color: tab === key ? C.green : C.greyLight,
              fontFamily: MONO, fontSize: 11, fontWeight: "bold", letterSpacing: 1 }}>
              {lbl}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── CALCULATOR TAB ── */}
      {tab === "calc" && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

          {/* Big VPD readout */}
          <View style={{ backgroundColor: C.card, borderRadius: 12,
            borderWidth: 2, borderColor: colour,
            padding: 20, alignItems: "center", marginBottom: 16 }}>
            <Label>CURRENT VPD</Label>
            <Text style={{ color: colour, fontFamily: MONO,
              fontSize: 64, fontWeight: "bold", lineHeight: 72, marginTop: 4 }}>
              {vpd.toFixed(2)}
            </Text>
            <Text style={{ color: colour, fontFamily: MONO,
              fontSize: 12, fontWeight: "bold", letterSpacing: 1 }}>
              kPa — {statusLabel}
            </Text>
            <VPDGauge vpd={vpd} stage={stage} />
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 4 }}>
              TARGET {target.lo}–{target.hi} kPa (IDEAL {target.ideal})
            </Text>
          </View>

          <NumInput label="AIR TEMPERATURE" value={temp}
            onChange={setTemp} unit="°C" min={10} max={40} step={0.5} />
          <NumInput label="RELATIVE HUMIDITY" value={rh}
            onChange={setRh} unit="%" min={10} max={100} step={1} />

          {adjustmentTip && (
            <View style={{ backgroundColor: `${colour}15`, borderRadius: 6,
              borderWidth: 1, borderColor: colour, padding: 10, marginTop: 8 }}>
              <Text style={{ color: colour, fontFamily: MONO, fontSize: 12, lineHeight: 18 }}>
                ⚡ FIX: {adjustmentTip}
              </Text>
            </View>
          )}

          <View style={{ backgroundColor: C.surface, borderRadius: 6,
            borderWidth: 1, borderColor: C.border,
            padding: 10, marginTop: 12, marginBottom: 20 }}>
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11, lineHeight: 17 }}>
              ℹ Leaf temp assumed 2°C below air temp (standard indoor).{"\n"}
              VPD = Vapour Pressure Deficit — measures transpiration pressure.
            </Text>
          </View>

          {/* Reference table */}
          <Label style={{ marginBottom: 10 }}>
            IDEAL RH FOR {target.ideal} kPa TARGET BY TEMP
          </Label>
          <View style={{ backgroundColor: C.card, borderRadius: 8,
            borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", backgroundColor: C.surface,
              paddingVertical: 8, paddingHorizontal: 12,
              borderBottomWidth: 1, borderColor: C.border }}>
              <Text style={{ flex: 1, color: C.greyLight, fontFamily: MONO, fontSize: 10 }}>TEMP</Text>
              <Text style={{ flex: 1, color: C.greyLight, fontFamily: MONO,
                fontSize: 10, textAlign: "right" }}>IDEAL RH</Text>
            </View>
            {refTable.map((row, i) => {
              const isMatch = row.temp === Math.round(temp);
              return (
                <View key={row.temp} style={{ flexDirection: "row",
                  paddingVertical: 10, paddingHorizontal: 12,
                  borderBottomWidth: i < refTable.length - 1 ? 1 : 0,
                  borderColor: C.border,
                  backgroundColor: isMatch ? C.greenFaint : "transparent" }}>
                  <Text style={{ flex: 1, color: isMatch ? C.green : C.white,
                    fontFamily: MONO, fontSize: 13, fontWeight: isMatch ? "bold" : "normal" }}>
                    {row.temp}°C{isMatch ? " ◀" : ""}
                  </Text>
                  <Text style={{ flex: 1, color: isMatch ? C.green : C.greyLight,
                    fontFamily: MONO, fontSize: 13, fontWeight: isMatch ? "bold" : "normal",
                    textAlign: "right" }}>
                    {row.rh}%
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ── SIMULATE TAB ── */}
      {tab === "simulate" && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>

          {/* A. Plant display + health bar */}
          <View style={{ alignItems: "center", marginBottom: 8 }}>
            <PlantRenderer
              width={SW - 48}
              height={200}
              stage={stage}
              stressLevel={hasSimulated ? (100 - simHealth) / 100 : 0}
            />
          </View>
          <View style={{ marginBottom: 16 }}>
            <View style={{ height: 8, backgroundColor: C.surface, borderRadius: 4,
              overflow: "hidden", marginBottom: 6 }}>
              {hasSimulated && (
                <View style={{
                  width: `${simHealth}%`, height: 8, borderRadius: 4,
                  backgroundColor: simHealth >= 80 ? C.green : simHealth >= 55 ? C.amber : C.red,
                }} />
              )}
            </View>
            <Text style={{ fontFamily: MONO, fontSize: 12,
              color: hasSimulated
                ? (simHealth >= 80 ? C.green : simHealth >= 55 ? C.amber : C.red)
                : C.greyLight,
              textAlign: "center" }}>
              {hasSimulated
                ? `${simHealth}%  ${simHealth >= 80 ? "HEALTHY" : simHealth >= 55 ? "RECOVERING" : "STRESSED"}`
                : "READY TO SIMULATE"}
            </Text>
          </View>

          {/* B. Environment controls */}
          <Label style={{ marginBottom: 12 }}>Environment</Label>
          <NumInput label="TEMPERATURE" value={temp}
            onChange={v => { setTemp(v); setActiveScenario(null); }}
            unit="°C" min={10} max={40} step={0.5} />
          <NumInput label="HUMIDITY" value={rh}
            onChange={v => { setRh(v); setActiveScenario(null); }}
            unit="%" min={20} max={95} step={1} />

          {/* Live VPD readout */}
          <View style={{ flexDirection: "row", alignItems: "center",
            justifyContent: "space-between", marginBottom: 16 }}>
            <Text style={{ fontFamily: MONO, fontSize: 11, color: C.greyLight }}>LIVE VPD</Text>
            <Text style={{ fontFamily: MONO, fontSize: 18, fontWeight: "bold", color: colour }}>
              {vpd.toFixed(2)} kPa — {statusLabel}
            </Text>
          </View>

          <View style={{ marginBottom: 14 }}>
            <Label style={{ marginBottom: 8 }}>Light cycle</Label>
            <PillSelector
              options={[
                { value: "18", label: "18H  VEG" },
                { value: "12", label: "12H  FLOWER" },
              ]}
              value={simLight}
              onChange={setSimLight}
            />
          </View>

          <View style={{ marginBottom: 14 }}>
            <Label style={{ marginBottom: 8 }}>Nutrients</Label>
            <PillSelector
              options={[
                { value: "low",   label: "LOW" },
                { value: "med",   label: "MEDIUM" },
                { value: "high",  label: "HIGH" },
                { value: "toxic", label: "TOXIC ☠" },
              ]}
              value={simNutrients}
              onChange={setSimNutrients}
            />
          </View>

          <View style={{ marginBottom: 16 }}>
            <Label style={{ marginBottom: 8 }}>Water</Label>
            <PillSelector
              options={[
                { value: "dry",  label: "DRY" },
                { value: "ok",   label: "CORRECT" },
                { value: "over", label: "OVERWATERED" },
              ]}
              value={simWater}
              onChange={setSimWater}
            />
          </View>

          {/* C. Run buttons */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {[7, 14, 21].map(d => (
              <TouchableOpacity key={d} onPress={() => {
                const log = runSimulation(d, temp, rh, stage, simNutrients, simWater);
                setSimLog(log);
                setSimHealth(log[log.length - 1].health);
                setHasSimulated(true);
              }} style={{ flex: 1, paddingVertical: 12, backgroundColor: C.greenFaint,
                borderRadius: 8, borderWidth: 1, borderColor: C.greenDim, alignItems: "center" }}>
                <Text style={{ fontFamily: MONO, fontSize: 12, color: C.green }}>▶ {d}D</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => {
              setSimLog([]);
              setSimHealth(100);
              setHasSimulated(false);
              setActiveScenario(null);
            }}
              style={{ paddingHorizontal: 14, paddingVertical: 12, backgroundColor: C.surface,
                borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: "center" }}>
              <Text style={{ fontFamily: MONO, fontSize: 12, color: C.greyLight }}>↺</Text>
            </TouchableOpacity>
          </View>

          {/* D. Active symptoms */}
          {hasSimulated && simLog.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Label style={{ marginBottom: 8 }}>Active symptoms</Label>
              {simLog[simLog.length - 1].symptoms.map((s, i) => (
                <Text key={i} style={{ fontFamily: MONO, fontSize: 12,
                  color: s.includes("healthy") ? C.green : C.amber, marginBottom: 4 }}>
                  {s.includes("healthy") ? "✓ " : "⚠ "}{s}
                </Text>
              ))}
            </View>
          )}

          {/* E. Prevention tips */}
          {hasSimulated && (() => {
            const currentVpd = calcVPD(temp, rh);
            const tips = getPreventionTips(temp, currentVpd, stage, simNutrients, simWater);
            return (
              <View style={{ marginTop: 16 }}>
                <Label style={{ marginBottom: 8 }}>Prevention</Label>
                {tips.map((tip, i) => (
                  <Text key={i} style={{ fontFamily: MONO, fontSize: 12,
                    color: tip.includes("optimal") ? C.green : C.blue, marginBottom: 4 }}>
                    {tip.includes("optimal") ? "✓ " : "→ "}{tip}
                  </Text>
                ))}
              </View>
            );
          })()}

          {/* F. Day log */}
          {hasSimulated && simLog.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Label style={{ marginBottom: 8 }}>Day log</Label>
              {[...simLog].reverse().map(entry => {
                const hc = entry.health >= 80 ? C.green : entry.health >= 55 ? C.amber : C.red;
                return (
                  <View key={entry.day} style={{ flexDirection: "row", alignItems: "center",
                    paddingVertical: 8, borderBottomWidth: 1, borderColor: C.border }}>
                    <Text style={{ fontFamily: MONO, fontSize: 11, color: C.grey, width: 44 }}>
                      DAY {entry.day}
                    </Text>
                    <View style={{ flex: 1, height: 6, backgroundColor: C.surface,
                      borderRadius: 3, overflow: "hidden", marginHorizontal: 8 }}>
                      <View style={{ width: `${entry.health}%`, height: 6,
                        backgroundColor: hc, borderRadius: 3 }} />
                    </View>
                    <Text style={{ fontFamily: MONO, fontSize: 11, color: hc, width: 36, textAlign: "right" }}>
                      {entry.health}%
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* G. Scenario bank */}
          <View style={{ marginTop: 20 }}>
            <Label style={{ marginBottom: 10 }}>Scenario bank</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {SCENARIOS.map(s => (
                <TouchableOpacity
                  key={s.name}
                  onPress={() => loadScenario(s)}
                  style={{
                    width: (SW - 48 - 8) / 2,
                    padding: 12,
                    backgroundColor: activeScenario === s.name ? C.greenFaint : C.surface,
                    borderRadius: 8, borderWidth: 1,
                    borderColor: activeScenario === s.name ? C.green : C.border,
                  }}>
                  <Text style={{ fontFamily: MONO, fontSize: 16, marginBottom: 4 }}>{s.icon}</Text>
                  <Text style={{ fontFamily: MONO, fontSize: 11, color: C.white, marginBottom: 3, letterSpacing: 0.5 }}>
                    {s.name}
                  </Text>
                  <Text style={{ fontFamily: MONO, fontSize: 10, color: C.greyLight, lineHeight: 15 }}>
                    {s.desc}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

        </ScrollView>
      )}

      <VPDInfoModal visible={showInfo} onClose={() => setShowInfo(false)} />
    </View>
  );
}
