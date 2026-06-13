/**
 * VPDCalculator.jsx
 * Real-time VPD calculator + VPD Hazard Simulator.
 * CALC tab — live VPD readout with +/- controls.
 * SIMULATE tab — 3-phase grow simulator with Growver narration.
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setGrowverContext } from "./growverContext";
import {
  View, Text, ScrollView, TouchableOpacity,
  Platform, Dimensions, Modal,
} from "react-native";
import PlantRenderer3D from "./PlantRenderer3D";

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

function calcDayHealth(temp, rh, stageKey) {
  const vpd = calcVPD(temp, rh);
  const vpds = SIM_STAGES.find(s => s.key === stageKey)?.vpds || "Vegetative";
  return calcVpdFactor(vpd, vpds) * calcTempFactor(temp);
}

// ── Sim stages ────────────────────────────────────────────────────────────────
const SIM_STAGES = [
  { key: "seedling",      label: "SEEDLING",     dayRange: "Days 1–7",   rendStage: "Seedling",     vpds: "Seedling",     totalDays: 7  },
  { key: "early_veg",    label: "EARLY VEG",    dayRange: "Days 8–21",  rendStage: "Vegetative",   vpds: "Vegetative",   totalDays: 14 },
  { key: "late_veg",     label: "LATE VEG",     dayRange: "Days 22–35", rendStage: "Vegetative",   vpds: "Vegetative",   totalDays: 14 },
  { key: "transition",   label: "TRANSITION",   dayRange: "Days 36–49", rendStage: "Transition",   vpds: "Pre-Flower",   totalDays: 14 },
  { key: "early_flower", label: "EARLY FLOWER", dayRange: "Days 50–58", rendStage: "Early Flower", vpds: "Flowering",    totalDays: 9  },
  { key: "bud_swell",   label: "BUD SWELL",    dayRange: "Days 59–65", rendStage: "Bud Swell",    vpds: "Flowering",    totalDays: 7  },
  { key: "mid_flower",  label: "MID FLOWER",   dayRange: "Days 66–77", rendStage: "Mid Flower",   vpds: "Flowering",    totalDays: 12 },
  { key: "late_flower",  label: "LATE FLOWER",  dayRange: "Days 78–91", rendStage: "Late Flower",  vpds: "Late Flower",  totalDays: 14 },
];

// ── Hazards ───────────────────────────────────────────────────────────────────
const SIM_HAZARDS = [
  {
    key: "HEAT_WAVE",
    name: "HEAT WAVE", icon: "🔥",
    temp: 34, rh: 35,
    growver: "Your tent just crept past 34°C — the plant is shutting down to survive.",
    cause: "Above 32°C, photosynthetic enzymes begin to break down. The plant closes stomata to prevent fatal water loss — all nutrient transport stops with them.",
    effects: ["Leaves taco and curl upward within hours", "Tip burn appears — calcium can't move fast enough", "Terpenes volatilise in flower — potency and smell drop", "Root zone dries 3× faster — feeding becomes unreliable"],
    fix: ["Raise lights by 10–15 cm immediately", "Direct an oscillating fan across the canopy", "Place frozen bottles in front of the intake duct", "Get below 28°C within 2 hours or damage compounds"],
    severity: "high",
  },
  {
    key: "COLD_SNAP",
    name: "COLD SNAP", icon: "❄️",
    temp: 14, rh: 86,
    growver: "Temperature dropped to 14°C overnight — the plant just hit cold shock.",
    cause: "Below 16°C, root enzyme activity stalls. Water and nutrient uptake nearly stop as root membranes lose permeability and the soil microbiome shuts down.",
    effects: ["Purple/blue colouring on leaves and stems", "Nutrient deficiencies appear despite rich media — it's lockout, not deficiency", "Growth slows to near zero for 48–72 hours", "High humidity at low temp is a perfect mould incubator"],
    fix: ["Check heater thermostat — replace if faulty", "Lower lights closer to provide radiant warmth", "Add a seedling heat mat under the pot", "Drop humidity to below 55% — cold + wet = botrytis"],
    severity: "medium",
  },
  {
    key: "HUMIDITY_CRISIS",
    name: "HUMIDITY CRISIS", icon: "💧",
    temp: 24, rh: 78,
    growver: "RH hit 78% — you're incubating grey mould inside your buds right now.",
    cause: "At 78% RH the VPD drops near zero. Bud interiors — where airflow can't reach — hit 85–90% humidity. Botrytis spores germinate in as little as 6 hours in these conditions.",
    effects: ["Grey fuzzy mould appears inside dense bud sites first", "Infected buds spread spores to every neighbouring cola", "Cannot be reversed — only the spread can be slowed", "One infected plant can ruin an entire room"],
    fix: ["Run dehumidifier on maximum — target below 50% RH", "Crank extraction to 100%", "Lollipop lower 30% of the plant to open canopy airflow", "Remove any infected buds immediately — every hour matters"],
    severity: "critical",
  },
  {
    key: "DARK_INTERRUPT",
    name: "LIGHT LEAK", icon: "💡",
    temp: 24, rh: 55,
    growver: "A light leak broke the dark period — the plant's internal clock just reset.",
    cause: "Cannabis flowering requires an uninterrupted dark period. Even one minute of light triggers phytochrome reversal — the plant receives a 'morning' signal and resets its hormone cycle.",
    effects: ["Flowering reverts toward vegetative growth — 2–3 week setback", "Hermaphrodite risk spikes as stress triggers pollen sacs", "Irregular foxtailing bud structure on new growth", "Seeds in sinsemilla if pollen sacs open near flowering females"],
    fix: ["Seal every light leak — use black-out tape and tent socks", "Verify timer is set correctly and functioning", "Do a midnight check inside your tent with all lights off", "If hermies appear, remove pollen sacs with tweezers before they open"],
    severity: "high",
  },
  {
    key: "OVERFEEDING",
    name: "OVERFEEDING", icon: "☠️",
    temp: 24, rh: 58,
    growver: "EC is too high — you've over-salted the root zone.",
    cause: "When dissolved salt concentration exceeds what's inside the roots, osmotic pressure reverses — water is drawn OUT of the roots. The plant starves while sitting in a rich medium.",
    effects: ["Bright red-orange burn on all leaf tips simultaneously", "Older leaves show multiple deficiency signs — nothing absorbs", "Growth slows or stops completely", "Roots appear brown and slimy if you inspect"],
    fix: ["Flush medium with 3× pot volume of plain pH'd water", "Target 0 EC runoff — check with a meter", "Wait 48h before resuming feed at 50% strength", "Work back up over 1 week maximum"],
    severity: "high",
  },
  {
    key: "ROOT_DROWN",
    name: "OVERWATERING", icon: "🌊",
    temp: 22, rh: 65,
    growver: "The medium hasn't dried out. Roots are sitting waterlogged — anaerobic bacteria are moving in.",
    cause: "Roots need oxygen. Waterlogged media drives out all air pockets. Anaerobic bacteria produce alcohol and acids that damage root tissue. The most common beginner mistake.",
    effects: ["Leaves droop and look 'too healthy' then start yellowing", "Medium stays wet for 4+ days with no drying cycle", "Root rot colonises — roots go brown and smell of decay", "Plant appears deficient despite a rich medium"],
    fix: ["Stop watering entirely — let medium reach 30% of its dry weight", "Lift the pot to judge water content by weight", "Improve drainage — check saucers aren't holding water", "Add 3ml/L of 3% H2O2 to next watering to oxygenate roots"],
    severity: "medium",
  },
  {
    key: "LATE_PUSH",
    name: "LATE PUSH", icon: "💎",
    temp: 27, rh: 44,
    growver: "Intentional late-stage stress — pushing VPD high to trigger resin defence.",
    cause: "In the final 1–2 weeks, elevated VPD (1.5–2.0 kPa) mimics dry season conditions. Cannabis responds by producing more trichomes as UV protection and moisture retention defence.",
    effects: ["Resin production increases noticeably", "Terpene concentration and aroma intensify", "Some leaf yellowing and tacoing — acceptable at this stage", "Water demand increases — medium can dry in 12–18 hours"],
    fix: ["Water more frequently — check medium twice daily", "Don't push above 2.0 kPa or 28°C — yields drop fast", "Only sustainable for 7–10 days maximum", "Watch for amber pistils to confirm harvest window is open"],
    severity: "low",
  },
];

// ── Scenario library — pre-built real-life crisis situations ─────────────────
const SCENARIO_LIBRARY = [
  {
    key: "first_timer",
    name: "FIRST TIMER",      icon: "🌱",
    desc: "The two most common beginner mistakes — overwatering then overfeeding",
    slots: { seedling: "ROOT_DROWN", early_veg: "ROOT_DROWN", late_veg: "OVERFEEDING" },
  },
  {
    key: "summer_meltdown",
    name: "SUMMER MELTDOWN",  icon: "☀️",
    desc: "AC fails mid-grow — heat stress locks in through the critical flower window",
    slots: { transition: "HEAT_WAVE", early_flower: "HEAT_WAVE", mid_flower: "HEAT_WAVE" },
  },
  {
    key: "winter_blackout",
    name: "WINTER BLACKOUT",  icon: "❄️",
    desc: "Heating cuts out overnight — cold shock stalls veg growth and locks out nutrients",
    slots: { early_veg: "COLD_SNAP", late_veg: "COLD_SNAP" },
  },
  {
    key: "bud_rot_season",
    name: "BUD ROT SEASON",   icon: "🍄",
    desc: "Dehumidifier dies in flower — grey mould colonises dense bud sites",
    slots: { mid_flower: "HUMIDITY_CRISIS", late_flower: "HUMIDITY_CRISIS" },
  },
  {
    key: "hermie_harvest",
    name: "HERMIE HARVEST",   icon: "💡",
    desc: "A light leak during early flower triggers hermaphroditism — seeds ruin the crop",
    slots: { early_flower: "DARK_INTERRUPT" },
  },
  {
    key: "nute_lockout",
    name: "NUTE LOCKOUT",     icon: "☠️",
    desc: "Overfeeding during stretch burns the root zone and locks everything out",
    slots: { late_veg: "OVERFEEDING", transition: "OVERFEEDING" },
  },
  {
    key: "perfect_storm",
    name: "PERFECT STORM",    icon: "⛈️",
    desc: "Heat wave into flower followed by a humidity crisis — a complete disaster",
    slots: { early_flower: "HEAT_WAVE", mid_flower: "HUMIDITY_CRISIS", late_flower: "HUMIDITY_CRISIS" },
  },
  {
    key: "away_for_a_week",
    name: "AWAY A WEEK",      icon: "✈️",
    desc: "Left the grow unattended — multiple issues compound without intervention",
    slots: { early_veg: "ROOT_DROWN", late_veg: "OVERFEEDING", transition: "HEAT_WAVE" },
  },
  {
    key: "root_rot_spiral",
    name: "ROOT ROT SPIRAL",  icon: "🌊",
    desc: "Chronic overwatering from seedling leads to progressive anaerobic root decay",
    slots: { seedling: "ROOT_DROWN", early_veg: "ROOT_DROWN", late_veg: "ROOT_DROWN" },
  },
  {
    key: "resin_run",
    name: "RESIN RUN",        icon: "💎",
    desc: "Intentional late push — controlled stress to maximise terpene and resin yield",
    slots: { late_flower: "LATE_PUSH" },
  },
];

// ── Sim engine ────────────────────────────────────────────────────────────────
function computeGrow(baseTemp, baseRh, hazardSlots, allHazards = SIM_HAZARDS) {
  let health = 1.0;
  return SIM_STAGES.map(stage => {
    const hazardKey = hazardSlots[stage.key];
    const hazard    = hazardKey ? allHazards.find(h => h.key === hazardKey) : null;
    const temp      = hazard ? hazard.temp : baseTemp;
    const rh        = hazard ? hazard.rh   : baseRh;
    const startH    = health;
    for (let d = 0; d < stage.totalDays; d++) {
      const target = calcDayHealth(temp, rh, stage.key);
      health = health + (target - health) * 0.28;
      health = Math.max(0.05, Math.min(1.0, health));
    }
    const vpd = calcVPD(temp, rh);
    return { stage, hazard, startHealth: startH, endHealth: health, vpd };
  });
}

// ── Severity colour ───────────────────────────────────────────────────────────
function severityColor(s) {
  if (s === "critical") return C.red;
  if (s === "high")     return "#ff7730";
  if (s === "medium")   return C.amber;
  return C.blue;
}

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

// ── Info modal ────────────────────────────────────────────────────────────────
const VPD_INFO = {
  title: "VPD CALCULATOR",
  emoji: "🌡",
  what: "VPD (Vapour Pressure Deficit) measures the difference between how much moisture the air is holding and how much it could hold. Plants use this gradient to decide how hard to breathe — too low and they stop, too high and they shut down.",
  sections: [
    { icon: "📐", title: "THE NUMBER (kPa)", text: "kPa = kilopascals. Think of it as how hard your plant is working. 0.4-0.8 for seedlings. 0.8-1.2 for veg. 1.0-1.5 for flower. 1.5-2.0 for the final 2 weeks of late flower only." },
    { icon: "🌿", title: "SIMULATE TAB", text: "Assign hazard events to any of 7 grow stages, then run a full season simulation. The plant visual updates each stage. Hazard cards show Growver narration, causes, effects, and fixes." },
    { icon: "🔥", title: "HAZARD EVENTS", text: "Heat Wave, Cold Snap, Humidity Crisis, Light Leak, Overfeeding, Overwatering, Late Push. Each fires real environmental conditions and drags the plant's health across the entire stage." },
    { icon: "💧", title: "PLANT STATE CARD", text: "The RESULTS screen shows a per-stage health timeline, final plant visual, and a summary of every hazard that fired and how much health it cost." },
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
            <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2 }} 
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
  const [temp,     setTemp]     = useState(24.0);
  const [rh,       setRh]       = useState(55.0);
  const [stage,    setStage]    = useState("Vegetative");
  const [tab,      setTab]      = useState("calc");    // "calc" | "simulate"
  const [showInfo, setShowInfo] = useState(false);

  // Hazard simulator state
  const [simPhase,         setSimPhase]         = useState("setup");
  const [hazardSlots,      setHazardSlots]      = useState({});
  const [simLog,           setSimLog]           = useState([]);
  const [simStageIdx,      setSimStageIdx]      = useState(0);
  const [runCount,         setRunCount]         = useState(0);
  const [freeChoice,       setFreeChoice]       = useState({});
  const [pickingHazardFor, setPickingHazardFor] = useState(null);
  // Custom hazards (pro-locked)
  const [isPro,            setIsPro]            = useState(false);
  const [customHazards,    setCustomHazards]    = useState([]);
  const [showCustomForm,   setShowCustomForm]   = useState(false);
  const [cName,            setCName]            = useState("");
  const [cTemp,            setCTemp]            = useState(30);
  const [cRh,              setCRh]              = useState(40);
  const [cDesc,            setCDesc]            = useState("");

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

  useEffect(() => {
    AsyncStorage.getItem("vyweed_subscription").then(raw => {
      if (raw) { try { const d = JSON.parse(raw); setIsPro(d.plan === "max"); } catch {} }
    });
    AsyncStorage.getItem("vyweed_custom_hazards").then(raw => {
      if (raw) { try { setCustomHazards(JSON.parse(raw)); } catch {} }
    });
  }, []);

  const allHazards = [...SIM_HAZARDS, ...customHazards];

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

  // ── Playback advance ──────────────────────────────────────────────────────
  function advance(choice) {
    if (runCount > 0 && choice) {
      setFreeChoice(prev => ({ ...prev, [simLog[simStageIdx].stage.key]: choice }));
    }
    const next = simStageIdx + 1;
    if (next >= simLog.length) {
      setSimPhase("results");
    } else {
      setSimStageIdx(next);
    }
  }

  const hasAnyHazard = Object.keys(hazardSlots).length > 0;

  // ── Health bar color ──────────────────────────────────────────────────────
  function healthColor(h) {
    if (h >= 0.80) return C.green;
    if (h >= 0.50) return C.amber;
    return C.red;
  }

  // ── Health grade ──────────────────────────────────────────────────────────
  function healthGrade(h) {
    const pct = h * 100;
    if (pct >= 80) return "A";
    if (pct >= 65) return "B";
    if (pct >= 50) return "C";
    if (pct >= 35) return "D";
    return "F";
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
        <InfoBtn onPress={() => setShowInfo(true)} 
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
            <VPDGauge vpd={vpd} stage={stage} 
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 4 }}>
              TARGET {target.lo}–{target.hi} kPa (IDEAL {target.ideal})
            </Text>
          </View>

          <NumInput label="AIR TEMPERATURE" value={temp}
            onChange={setTemp} unit="°C" min={10} max={40} step={0.5} 
          <NumInput label="RELATIVE HUMIDITY" value={rh}
            onChange={setRh} unit="%" min={10} max={100} step={1} 

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

          {/* ── A. SETUP PHASE ── */}
          {simPhase === "setup" && (
            <View>
              {/* Header */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ color: C.green, fontFamily: MONO, fontSize: 20,
                  fontWeight: "bold", letterSpacing: 2, marginBottom: 4 }}>
                  VPD HAZARD SIM
                </Text>
                <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 12 }}>
                  Assign hazards to your grow. Run the sim. See what breaks.
                </Text>
                {runCount > 0 && (
                  <Text style={{ color: C.amber, fontFamily: MONO, fontSize: 11, marginTop: 6 }}>
                    Free run — choose FIX or IGNORE at each hazard
                  </Text>
                )}
              </View>

              {/* ── Scenario library ── */}
              <Label style={{ marginBottom: 10 }}>SCENARIO LIBRARY</Label>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11, marginBottom: 10 }}>
                Real grow crises — tap to load, then hit RUN
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                {SCENARIO_LIBRARY.map(sc => (
                  <TouchableOpacity key={sc.key} onPress={() => {
                    setHazardSlots({ ...sc.slots });
                  }} style={{
                    width: 160,
                    backgroundColor: JSON.stringify(hazardSlots) === JSON.stringify(sc.slots)
                      ? C.greenFaint : C.surface,
                    borderRadius: 8, borderWidth: 1,
                    borderColor: JSON.stringify(hazardSlots) === JSON.stringify(sc.slots)
                      ? C.green : C.border,
                    padding: 12,
                  }}>
                    <Text style={{ fontSize: 22, marginBottom: 6 }}>{sc.icon}</Text>
                    <Text style={{ color: C.white, fontFamily: MONO, fontSize: 11,
                      fontWeight: "bold", marginBottom: 4 }}>{sc.name}</Text>
                    <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                      lineHeight: 15 }}>{sc.desc}</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3, marginTop: 8 }}>
                      {Object.keys(sc.slots).map(stKey => {
                        const haz = SIM_HAZARDS.find(h => h.key === sc.slots[stKey]);
                        return haz ? (
                          <Text key={stKey} style={{ fontFamily: MONO, fontSize: 9,
                            color: severityColor(haz.severity) }}>
                            {haz.icon}
                          </Text>
                        ) : null;
                      })}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* ── Baseline conditions ── */}
              <Label style={{ marginBottom: 10 }}>BASELINE CONDITIONS</Label>
              <NumInput label="BASELINE TEMP" value={temp}
                onChange={setTemp} unit="°C" min={10} max={40} step={0.5} 
              <NumInput label="BASELINE RH" value={rh}
                onChange={setRh} unit="%" min={10} max={100} step={1} 

              {/* Stage hazard grid */}
              <Label style={{ marginBottom: 10 }}>ASSIGN HAZARDS TO STAGES</Label>
              {SIM_STAGES.map(simStage => {
                const assignedKey  = hazardSlots[simStage.key];
                const assignedHaz  = assignedKey ? SIM_HAZARDS.find(h => h.key === assignedKey) : null;
                return (
                  <View key={simStage.key} style={{
                    backgroundColor: C.surface, borderRadius: 8,
                    borderWidth: 1, borderColor: C.border,
                    padding: 12, marginBottom: 8,
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.white, fontFamily: MONO,
                        fontSize: 12, fontWeight: "bold" }}>
                        {simStage.label}
                      </Text>
                      <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
                        {simStage.dayRange}
                      </Text>
                    </View>
                    {assignedHaz ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ backgroundColor: `${severityColor(assignedHaz.severity)}22`,
                          borderRadius: 6, borderWidth: 1,
                          borderColor: severityColor(assignedHaz.severity),
                          paddingHorizontal: 10, paddingVertical: 5 }}>
                          <Text style={{ fontFamily: MONO, fontSize: 12 }}>
                            {assignedHaz.icon} {assignedHaz.name}
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => {
                          const next = { ...hazardSlots };
                          delete next[simStage.key];
                          setHazardSlots(next);
                        }} style={{ padding: 4 }}>
                          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 16 }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => setPickingHazardFor(simStage.key)}
                        style={{ backgroundColor: C.greenFaint, borderRadius: 6,
                          borderWidth: 1, borderColor: C.greenDim,
                          paddingHorizontal: 12, paddingVertical: 6 }}>
                        <Text style={{ color: C.green, fontFamily: MONO, fontSize: 11 }}>
                          + ADD HAZARD
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              {/* Hazard picker overlay */}
              {pickingHazardFor !== null && (
                <View style={{ backgroundColor: C.card, borderRadius: 10,
                  borderWidth: 1, borderColor: C.border,
                  marginTop: 8, marginBottom: 8, padding: 12 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 10 }}>
                    <Text style={{ color: C.greyLight, fontFamily: MONO,
                      fontSize: 10, letterSpacing: 1.5 }}>
                      SELECT HAZARD FOR{" "}
                      {SIM_STAGES.find(s => s.key === pickingHazardFor)?.label}
                    </Text>
                    <TouchableOpacity onPress={() => setPickingHazardFor(null)}>
                      <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  {/* NONE option */}
                  <TouchableOpacity onPress={() => {
                    const next = { ...hazardSlots };
                    delete next[pickingHazardFor];
                    setHazardSlots(next);
                    setPickingHazardFor(null);
                  }} style={{ flexDirection: "row", alignItems: "center",
                    paddingVertical: 10, borderBottomWidth: 1, borderColor: C.border, gap: 10 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5,
                      backgroundColor: C.grey }} 
                    <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 12 }}>
                      NONE — no hazard
                    </Text>
                  </TouchableOpacity>
                  {allHazards.map(haz => (
                    <TouchableOpacity key={haz.key} onPress={() => {
                      setHazardSlots(prev => ({ ...prev, [pickingHazardFor]: haz.key }));
                      setPickingHazardFor(null);
                    }} style={{ flexDirection: "row", alignItems: "center",
                      paddingVertical: 10, borderBottomWidth: 1, borderColor: C.border, gap: 10 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5,
                        backgroundColor: severityColor(haz.severity) }} 
                      <Text style={{ fontSize: 16 }}>{haz.icon}</Text>
                      <Text style={{ flex: 1, color: C.white, fontFamily: MONO, fontSize: 12 }}>
                        {haz.name}
                        {haz.key.startsWith("CUSTOM_") && (
                          <Text style={{ color: C.amber }}> — custom</Text>
                        )}
                      </Text>
                      <Text style={{ color: severityColor(haz.severity),
                        fontFamily: MONO, fontSize: 10, textTransform: "uppercase" }}>
                        {haz.severity}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {/* Custom hazard entry */}
                  {isPro ? (
                    <TouchableOpacity onPress={() => { setShowCustomForm(true); setPickingHazardFor(null); }}
                      style={{ flexDirection: "row", alignItems: "center",
                        paddingVertical: 12, gap: 10, marginTop: 4 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5,
                        backgroundColor: C.amber }} 
                      <Text style={{ color: C.amber, fontFamily: MONO, fontSize: 12 }}>
                        + DEFINE CUSTOM HAZARD
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ paddingVertical: 10, flexDirection: "row",
                      alignItems: "center", gap: 8, marginTop: 4 }}>
                      <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11 }}>
                        🔒  CUSTOM HAZARDS — IRL GROWER (MAX) ONLY
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* ── Custom hazard form (pro) ── */}
              {showCustomForm && (
                <View style={{ backgroundColor: C.card, borderRadius: 10,
                  borderWidth: 1, borderColor: C.amber,
                  padding: 16, marginBottom: 12 }}>
                  <Text style={{ color: C.amber, fontFamily: MONO, fontSize: 12,
                    letterSpacing: 1.5, marginBottom: 12 }}>DEFINE YOUR HAZARD</Text>
                  <Text style={{ color: C.greyLight, fontFamily: MONO,
                    fontSize: 10, marginBottom: 4 }}>NAME</Text>
                  <View style={{ backgroundColor: C.surface, borderRadius: 6,
                    borderWidth: 1, borderColor: C.border, marginBottom: 12 }}>
                    <Text
                      style={{ color: cName || C.grey, fontFamily: MONO,
                        fontSize: 13, padding: 10 }}
                      onPress={() => {}}
                    >{cName || "e.g. BALLAST OVERHEATED"}</Text>
                  </View>
                  <NumInput label="HAZARD TEMP" value={cTemp}
                    onChange={setCTemp} unit="°C" min={10} max={45} step={1} 
                  <NumInput label="HAZARD RH" value={cRh}
                    onChange={setCRh} unit="%" min={10} max={99} step={1} 
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                    <TouchableOpacity onPress={() => {
                      if (!cName.trim()) return;
                      const idx = customHazards.length;
                      const newHaz = {
                        key: `CUSTOM_${idx}`,
                        name: cName.trim().toUpperCase(),
                        icon: "⚙️",
                        temp: cTemp,
                        rh: cRh,
                        growver: `Custom hazard — ${cTemp}°C / ${cRh}% RH — your real grow room conditions.`,
                        cause: "User-defined hazard based on actual grow room readings.",
                        effects: [`Temperature: ${cTemp}°C`, `Humidity: ${cRh}%`,
                          `VPD: ~${calcVPD(cTemp, cRh).toFixed(2)} kPa`],
                        fix: ["Adjust conditions to hit your stage target VPD range"],
                        severity: calcVPD(cTemp, cRh) > 2.0 ? "critical" :
                          calcVPD(cTemp, cRh) > 1.5 ? "high" : "medium",
                      };
                      const updated = [...customHazards, newHaz];
                      setCustomHazards(updated);
                      AsyncStorage.setItem("vyweed_custom_hazards", JSON.stringify(updated));
                      setCName(""); setCTemp(30); setCRh(40);
                      setShowCustomForm(false);
                    }} style={{ flex: 1, paddingVertical: 12, backgroundColor: C.greenFaint,
                      borderRadius: 8, borderWidth: 1, borderColor: C.green,
                      alignItems: "center" }}>
                      <Text style={{ color: C.green, fontFamily: MONO, fontSize: 12 }}>SAVE HAZARD</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowCustomForm(false)}
                      style={{ paddingHorizontal: 20, paddingVertical: 12, backgroundColor: C.surface,
                        borderRadius: 8, borderWidth: 1, borderColor: C.border,
                        alignItems: "center" }}>
                      <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 12 }}>CANCEL</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* RUN SIMULATION button */}
              <TouchableOpacity
                disabled={!hasAnyHazard}
                onPress={() => {
                  const log = computeGrow(temp, rh, hazardSlots, allHazards);
                  setSimLog(log);
                  setSimStageIdx(0);
                  setFreeChoice({});
                  setSimPhase("playing");
                }}
                style={{ marginTop: 16, paddingVertical: 16, borderRadius: 10,
                  alignItems: "center", justifyContent: "center",
                  backgroundColor: hasAnyHazard ? C.greenFaint : C.surface,
                  borderWidth: 1,
                  borderColor: hasAnyHazard ? C.green : C.border }}>
                <Text style={{ fontFamily: MONO, fontSize: 14, fontWeight: "bold",
                  letterSpacing: 2,
                  color: hasAnyHazard ? C.green : C.grey }}>
                  RUN SIMULATION
                </Text>
                {!hasAnyHazard && (
                  <Text style={{ fontFamily: MONO, fontSize: 10, color: C.grey, marginTop: 3 }}>
                    assign at least one hazard to continue
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ── B. PLAYING PHASE ── */}
          {simPhase === "playing" && simLog.length > 0 && (() => {
            const currentEntry = simLog[simStageIdx];
            const { stage: curStage, hazard, endHealth } = currentEntry;
            const healthPct = Math.round(endHealth * 100);
            const hc = healthColor(endHealth);
            const progressPct = ((simStageIdx + 1) / simLog.length) * 100;

            return (
              <View>
                {/* Top bar with abort */}
                <View style={{ flexDirection: "row", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 12 }}>
                  <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11 }}>
                    STAGE {simStageIdx + 1} / {simLog.length}
                  </Text>
                  <TouchableOpacity onPress={() => {
                    setSimPhase("setup");
                    setSimStageIdx(0);
                  }} style={{ paddingHorizontal: 10, paddingVertical: 5,
                    borderRadius: 6, borderWidth: 1, borderColor: C.border }}>
                    <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11 }}>✗ ABORT</Text>
                  </TouchableOpacity>
                </View>

                {/* Stage label */}
                <Text style={{ color: C.white, fontFamily: MONO, fontSize: 16,
                  fontWeight: "bold", letterSpacing: 1, marginBottom: 2 }}>
                  {curStage.label}
                </Text>
                <Text style={{ color: C.greyLight, fontFamily: MONO,
                  fontSize: 11, marginBottom: 10 }}>
                  {curStage.dayRange}
                </Text>

                {/* Progress bar */}
                <View style={{ height: 4, backgroundColor: C.surface,
                  borderRadius: 2, overflow: "hidden", marginBottom: 16 }}>
                  <View style={{ width: `${progressPct}%`, height: 4,
                    backgroundColor: C.greenDim, borderRadius: 2 }} 
                </View>

                {/* Plant visual */}
                <View style={{ backgroundColor: C.surface, borderRadius: 12,
                  overflow: "hidden", alignItems: "center",
                  marginBottom: 16, padding: 8 }}>
                  <PlantRenderer
                    width={SW - 48}
                    height={190}
                    stage={curStage.rendStage}
                    stressLevel={1 - endHealth}
                    strainType="H"
                    tier="T2"
                    strainSeed={42}
                  
                </View>

                {/* Health readout */}
                <View style={{ marginBottom: 16 }}>
                  <Label style={{ marginBottom: 6 }}>PLANT HEALTH — END OF STAGE</Label>
                  <View style={{ height: 10, backgroundColor: C.surface,
                    borderRadius: 5, overflow: "hidden", marginBottom: 6 }}>
                    <View style={{ width: `${healthPct}%`, height: 10,
                      backgroundColor: hc, borderRadius: 5 }} 
                  </View>
                  <Text style={{ fontFamily: MONO, fontSize: 13,
                    fontWeight: "bold", color: hc }}>
                    {healthPct}%{" "}
                    {healthPct >= 80 ? "HEALTHY" : healthPct >= 50 ? "STRESSED" : "CRITICAL"}
                  </Text>
                </View>

                {/* No hazard stage */}
                {!hazard && (
                  <View>
                    <View style={{ backgroundColor: C.greenFaint, borderRadius: 8,
                      borderWidth: 1, borderColor: C.greenDim,
                      padding: 14, marginBottom: 16 }}>
                      <Text style={{ color: C.green, fontFamily: MONO, fontSize: 13 }}>
                        ✓ STAGE CLEAN — no hazard this stage
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => advance(null)}
                      style={{ paddingVertical: 15, borderRadius: 10,
                        backgroundColor: C.greenFaint, borderWidth: 1,
                        borderColor: C.green, alignItems: "center" }}>
                      <Text style={{ color: C.green, fontFamily: MONO,
                        fontSize: 13, fontWeight: "bold" }}>
                        CONTINUE →
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Hazard pause card */}
                {hazard && (
                  <View>
                    <View style={{ backgroundColor: C.surface, borderRadius: 8,
                      borderWidth: 1, borderColor: C.border,
                      borderLeftWidth: 3, borderLeftColor: severityColor(hazard.severity),
                      padding: 16, marginBottom: 14 }}>
                      {/* Growver narration */}
                      <Text style={{ color: C.amber, fontFamily: MONO,
                        fontSize: 13, fontStyle: "italic",
                        lineHeight: 20, marginBottom: 12 }}>
                        "{hazard.growver}"
                      </Text>

                      {/* Severity badge */}
                      <View style={{ flexDirection: "row", alignItems: "center",
                        gap: 8, marginBottom: 12 }}>
                        <Text style={{ fontSize: 18 }}>{hazard.icon}</Text>
                        <Text style={{ color: C.white, fontFamily: MONO,
                          fontSize: 13, fontWeight: "bold" }}>
                          {hazard.name}
                        </Text>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 3,
                          borderRadius: 4,
                          backgroundColor: `${severityColor(hazard.severity)}22`,
                          borderWidth: 1, borderColor: severityColor(hazard.severity) }}>
                          <Text style={{ color: severityColor(hazard.severity),
                            fontFamily: MONO, fontSize: 10,
                            textTransform: "uppercase" }}>
                            {hazard.severity}
                          </Text>
                        </View>
                      </View>

                      {/* Cause */}
                      <Label style={{ marginBottom: 5 }}>CAUSE</Label>
                      <Text style={{ color: C.greyLight, fontFamily: MONO,
                        fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
                        {hazard.cause}
                      </Text>

                      {/* Effects */}
                      <Label style={{ marginBottom: 5 }}>EFFECTS</Label>
                      {hazard.effects.map((e, i) => (
                        <Text key={i} style={{ color: C.white, fontFamily: MONO,
                          fontSize: 12, lineHeight: 19, marginBottom: 3 }}>
                          • {e}
                        </Text>
                      ))}

                      {/* Fix */}
                      <Label style={{ marginTop: 10, marginBottom: 5 }}>FIX</Label>
                      {hazard.fix.map((f, i) => (
                        <Text key={i} style={{ color: C.green, fontFamily: MONO,
                          fontSize: 12, lineHeight: 19, marginBottom: 3 }}>
                          → {f}
                        </Text>
                      ))}
                    </View>

                    {/* First run: linear */}
                    {runCount === 0 && (
                      <TouchableOpacity onPress={() => advance(null)}
                        style={{ paddingVertical: 15, borderRadius: 10,
                          backgroundColor: C.greenFaint, borderWidth: 1,
                          borderColor: C.green, alignItems: "center" }}>
                        <Text style={{ color: C.green, fontFamily: MONO,
                          fontSize: 13, fontWeight: "bold" }}>
                          CONTINUE →
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Free runs: fix or ignore */}
                    {runCount > 0 && (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <TouchableOpacity onPress={() => advance("fix")}
                          style={{ flex: 1, paddingVertical: 15, borderRadius: 10,
                            backgroundColor: C.greenFaint, borderWidth: 1,
                            borderColor: C.green, alignItems: "center" }}>
                          <Text style={{ color: C.green, fontFamily: MONO,
                            fontSize: 13, fontWeight: "bold" }}>
                            ✓ FIX IT
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => advance("ignore")}
                          style={{ flex: 1, paddingVertical: 15, borderRadius: 10,
                            backgroundColor: C.surface, borderWidth: 1,
                            borderColor: C.red, alignItems: "center" }}>
                          <Text style={{ color: C.red, fontFamily: MONO,
                            fontSize: 13, fontWeight: "bold" }}>
                            ✗ IGNORE
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })()}

          {/* ── C. RESULTS PHASE ── */}
          {simPhase === "results" && simLog.length > 0 && (() => {
            const lastEntry  = simLog[simLog.length - 1];
            const finalH     = lastEntry.endHealth;
            const finalPct   = Math.round(finalH * 100);
            const grade      = healthGrade(finalH);
            const hc         = healthColor(finalH);

            return (
              <View>
                {/* Header */}
                <Text style={{ color: C.green, fontFamily: MONO, fontSize: 18,
                  fontWeight: "bold", letterSpacing: 2, marginBottom: 4 }}>
                  SIMULATION COMPLETE
                </Text>
                <Text style={{ color: C.greyLight, fontFamily: MONO,
                  fontSize: 11, marginBottom: 20 }}>
                  {runCount === 0
                    ? "First run — all hazards fired. Try a free run to explore outcomes."
                    : `Free run ${runCount} complete.`}
                </Text>

                {/* Final plant visual */}
                <View style={{ backgroundColor: C.surface, borderRadius: 12,
                  overflow: "hidden", alignItems: "center",
                  marginBottom: 16, padding: 8 }}>
                  <PlantRenderer
                    width={SW - 48}
                    height={200}
                    stage="Late Flower"
                    stressLevel={1 - finalH}
                    strainType="H"
                    tier="T2"
                    strainSeed={42}
                  
                </View>

                {/* Final health + grade */}
                <View style={{ backgroundColor: C.card, borderRadius: 10,
                  borderWidth: 1, borderColor: hc,
                  padding: 16, alignItems: "center", marginBottom: 20 }}>
                  <Text style={{ color: hc, fontFamily: MONO,
                    fontSize: 48, fontWeight: "bold" }}>
                    {grade}
                  </Text>
                  <Text style={{ color: hc, fontFamily: MONO,
                    fontSize: 16, fontWeight: "bold" }}>
                    {finalPct}% FINAL HEALTH
                  </Text>
                </View>

                {/* Per-stage timeline */}
                <Label style={{ marginBottom: 10 }}>STAGE BREAKDOWN</Label>
                {simLog.map((entry, i) => {
                  const ehPct = Math.round(entry.endHealth * 100);
                  const ehc   = healthColor(entry.endHealth);
                  return (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center",
                      paddingVertical: 9, borderBottomWidth: 1, borderColor: C.border, gap: 8 }}>
                      <Text style={{ fontFamily: MONO, fontSize: 10,
                        color: C.greyLight, width: 80 }}>
                        {entry.stage.label}
                      </Text>
                      <View style={{ flex: 1, height: 7, backgroundColor: C.surface,
                        borderRadius: 4, overflow: "hidden" }}>
                        <View style={{ width: `${ehPct}%`, height: 7,
                          backgroundColor: ehc, borderRadius: 4 }} 
                      </View>
                      <Text style={{ fontFamily: MONO, fontSize: 11,
                        color: ehc, width: 36, textAlign: "right" }}>
                        {ehPct}%
                      </Text>
                      {entry.hazard && (
                        <Text style={{ fontSize: 14 }}>{entry.hazard.icon}</Text>
                      )}
                    </View>
                  );
                })}

                {/* Summary */}
                {simLog.some(e => e.hazard) && (
                  <View style={{ marginTop: 20 }}>
                    <Label style={{ marginBottom: 10 }}>HAZARD IMPACT</Label>
                    {simLog.filter(e => e.hazard).map((entry, i) => {
                      const startPct = Math.round(entry.startHealth * 100);
                      const endPct   = Math.round(entry.endHealth * 100);
                      return (
                        <Text key={i} style={{ fontFamily: MONO, fontSize: 12,
                          color: C.greyLight, lineHeight: 20, marginBottom: 4 }}>
                          {entry.hazard.icon} {entry.hazard.name}{" "}
                          <Text style={{ color: C.grey }}>({entry.stage.label})</Text>
                          {" — "}
                          <Text style={{ color: C.amber }}>
                            health dropped from {startPct}% to {endPct}%
                          </Text>
                        </Text>
                      );
                    })}
                  </View>
                )}

                {/* Action buttons */}
                <View style={{ gap: 10, marginTop: 24 }}>
                  <TouchableOpacity onPress={() => {
                    setRunCount(r => r + 1);
                    setSimStageIdx(0);
                    setFreeChoice({});
                    const log = computeGrow(temp, rh, hazardSlots, allHazards);
                    setSimLog(log);
                    setSimPhase("playing");
                  }} style={{ paddingVertical: 15, borderRadius: 10,
                    backgroundColor: C.greenFaint, borderWidth: 1,
                    borderColor: C.green, alignItems: "center" }}>
                    <Text style={{ color: C.green, fontFamily: MONO,
                      fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>
                      RUN AGAIN — FREE RUN
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    setSimPhase("setup");
                    setHazardSlots({});
                    setRunCount(0);
                    setSimLog([]);
                    setSimStageIdx(0);
                    setFreeChoice({});
                  }} style={{ paddingVertical: 15, borderRadius: 10,
                    backgroundColor: C.surface, borderWidth: 1,
                    borderColor: C.border, alignItems: "center" }}>
                    <Text style={{ color: C.greyLight, fontFamily: MONO,
                      fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>
                      NEW SIMULATION
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}

        </ScrollView>
      )}

      <VPDInfoModal visible={showInfo} onClose={() => setShowInfo(false)} 
    </View>
  );
}
