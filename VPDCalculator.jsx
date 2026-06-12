/**
 * VPDCalculator.jsx
 * Real-time VPD calculator + interactive scenario simulator.
 * CALC tab — live VPD readout with +/- controls.
 * SIMULATE tab — interactive heatmap grid, plant-state panel, scenario bank.
 */

import React, { useState, useMemo, useEffect } from "react";
import { setGrowverContext } from "./growverContext";
import {
  View, Text, ScrollView, TouchableOpacity,
  Platform, Dimensions, Modal,
} from "react-native";

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

function getPlantState(vpd) {
  return VPD_PLANT_STATES.find(s => vpd >= s.range[0] && vpd < s.range[1])
    || VPD_PLANT_STATES[VPD_PLANT_STATES.length - 1];
}

// ── Scenario bank ─────────────────────────────────────────────────────────────
const SCENARIOS = [
  { name: "HEAT WAVE",         icon: "🔥", temp: 33, rh: 38, desc: "Summer: AC fails mid-day" },
  { name: "COLD SNAP",         icon: "❄️", temp: 16, rh: 84, desc: "Winter: heating cuts out overnight" },
  { name: "HUMIDITY CRISIS",   icon: "💧", temp: 24, rh: 78, desc: "Dehumidifier breaks in flower" },
  { name: "PERFECT VEG",       icon: "🍃", temp: 24, rh: 62, desc: "Dialled vegetative environment" },
  { name: "PERFECT FLOWER",    icon: "🌺", temp: 26, rh: 50, desc: "Optimal flowering conditions" },
  { name: "LATE FLOWER PUSH",  icon: "💎", temp: 27, rh: 44, desc: "Resin push in final 2 weeks" },
  { name: "NIGHT DROP",        icon: "🌙", temp: 20, rh: 72, desc: "Lights-off temp/humidity shift" },
  { name: "VEG UNDERFEEDING",  icon: "🌿", temp: 22, rh: 68, desc: "Cool veg with low VPD" },
];

// ── Grid colour helper ────────────────────────────────────────────────────────
function vpdCellColor(vpd) {
  if (vpd < 0.4)  return "#0a1e35";
  if (vpd < 0.8)  return "#0d2a48";
  if (vpd < 1.0)  return "#0a2d12";
  if (vpd < 1.3)  return "#0d4016";
  if (vpd < 1.5)  return "#1a6020";
  if (vpd < 1.8)  return "#4a3200";
  if (vpd < 2.0)  return "#6a3800";
  return "#4a0a0a";
}
function vpdCellBorder(vpd) {
  if (vpd < 0.4)  return "#30d5ff44";
  if (vpd < 0.8)  return "#30d5ff22";
  if (vpd < 1.5)  return "#39ff4522";
  if (vpd < 2.0)  return "#ffb83022";
  return "#ff3a3a22";
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

// ── Heatmap grid ──────────────────────────────────────────────────────────────
const GRID_TEMPS = [18, 20, 22, 24, 26, 28, 30, 32];
const GRID_RHS   = [80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30];

function VPDGrid({ temp, rh, onSelect }) {
  const yAxisW = 34;
  const cellW  = Math.floor((SW - 32 - yAxisW) / GRID_TEMPS.length);
  const cellH  = 22;

  const nearestGridTemp = GRID_TEMPS.reduce((a, b) =>
    Math.abs(b - temp) < Math.abs(a - temp) ? b : a);
  const nearestGridRh = GRID_RHS.reduce((a, b) =>
    Math.abs(b - rh) < Math.abs(a - rh) ? b : a);

  return (
    <View>
      {/* X-axis header */}
      <View style={{ flexDirection: "row", paddingLeft: yAxisW, marginBottom: 2 }}>
        {GRID_TEMPS.map(t => (
          <View key={t} style={{ width: cellW, alignItems: "center" }}>
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 8 }}>{t}°</Text>
          </View>
        ))}
      </View>

      {/* Grid rows */}
      {GRID_RHS.map(h => (
        <View key={h} style={{ flexDirection: "row", alignItems: "center", marginBottom: 1 }}>
          <Text style={{ width: yAxisW, color: C.greyLight, fontFamily: MONO,
            fontSize: 8, textAlign: "right", paddingRight: 5 }}>
            {h}%
          </Text>
          {GRID_TEMPS.map(t => {
            const v          = calcVPD(t, h);
            const isCurrent  = t === nearestGridTemp && h === nearestGridRh;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => onSelect(t, h)}
                style={{
                  width: cellW, height: cellH,
                  backgroundColor: vpdCellColor(v),
                  borderWidth: isCurrent ? 2 : 0.5,
                  borderColor:  isCurrent ? "#ffffff" : vpdCellBorder(v),
                  alignItems: "center", justifyContent: "center",
                }}>
                {isCurrent && (
                  <View style={{ width: 6, height: 6, borderRadius: 3,
                    backgroundColor: "#ffffff" }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* X-axis label + legend */}
      <View style={{ flexDirection: "row", justifyContent: "space-between",
        paddingLeft: yAxisW, marginTop: 6 }}>
        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9 }}>← COOLER</Text>
        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9, textAlign: "center" }}>
          TEMPERATURE
        </Text>
        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9 }}>HOTTER →</Text>
      </View>

      {/* Legend row */}
      <View style={{ flexDirection: "row", justifyContent: "center",
        gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        {[
          { color: "#0d2a48", label: "Too Low" },
          { color: "#1a6020", label: "Ideal" },
          { color: "#6a3800", label: "High" },
          { color: "#4a0a0a", label: "Danger" },
        ].map(item => (
          <View key={item.label}
            style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 12, height: 12, backgroundColor: item.color,
              borderRadius: 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }} />
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 9 }}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Plant state card ──────────────────────────────────────────────────────────
function PlantStateCard({ vpd, stage }) {
  const ps  = getPlantState(vpd);
  const { colour: stColour } = vpdStatus(vpd, stage);
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: ps.colour,
      backgroundColor: `${ps.colour}10`, overflow: "hidden", marginBottom: 16 }}>

      {/* Header row */}
      <TouchableOpacity onPress={() => setExpanded(e => !e)}
        style={{ flexDirection: "row", alignItems: "center",
          justifyContent: "space-between", padding: 14 }}>
        <View>
          <Text style={{ color: ps.colour, fontFamily: MONO,
            fontSize: 13, fontWeight: "bold", letterSpacing: 1.5 }}>
            {ps.stateLabel}
          </Text>
          <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11, marginTop: 3 }}>
            {ps.transpiration}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ color: stColour, fontFamily: MONO, fontSize: 22, fontWeight: "bold" }}>
            {vpd.toFixed(2)}
          </Text>
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9 }}>kPa  {expanded ? "▲" : "▼"}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          {/* Summary */}
          <Text style={{ color: C.white, fontFamily: MONO, fontSize: 12,
            lineHeight: 19, marginBottom: 14 }}>
            {ps.summary}
          </Text>

          {/* What you'll see */}
          <View style={{ backgroundColor: "rgba(0,0,0,0.30)", borderRadius: 8,
            padding: 12, marginBottom: 10 }}>
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
              letterSpacing: 1.5, marginBottom: 8 }}>WHAT YOU'LL SEE ON THE PLANT</Text>
            {ps.symptoms.map((s, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "flex-start",
                marginBottom: 5 }}>
                <Text style={{ color: ps.colour, fontFamily: MONO,
                  fontSize: 11, marginRight: 8, marginTop: 1 }}>→</Text>
                <Text style={{ color: C.white, fontFamily: MONO,
                  fontSize: 12, lineHeight: 17, flex: 1 }}>
                  {s}
                </Text>
              </View>
            ))}
          </View>

          {/* Risk badge */}
          <View style={{ backgroundColor: `${ps.riskColour}18`, borderRadius: 8,
            borderWidth: 1, borderColor: ps.riskColour, padding: 10, marginBottom: 10 }}>
            <Text style={{ color: ps.riskColour, fontFamily: MONO, fontSize: 10,
              letterSpacing: 1.5, marginBottom: 4 }}>RISK LEVEL</Text>
            <Text style={{ color: C.white, fontFamily: MONO,
              fontSize: 12, lineHeight: 18 }}>
              {ps.risk}
            </Text>
          </View>

          {/* Fix steps */}
          <View style={{ backgroundColor: "rgba(0,0,0,0.30)", borderRadius: 8, padding: 12 }}>
            <Text style={{ color: C.green, fontFamily: MONO, fontSize: 10,
              letterSpacing: 1.5, marginBottom: 8 }}>HOW TO FIX IT</Text>
            {ps.fix.map((f, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "flex-start",
                marginBottom: 6 }}>
                <Text style={{ color: C.green, fontFamily: MONO,
                  fontSize: 11, marginRight: 8, fontWeight: "bold" }}>
                  {i + 1}.
                </Text>
                <Text style={{ color: C.white, fontFamily: MONO,
                  fontSize: 12, lineHeight: 17, flex: 1 }}>
                  {f}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ── Scenario card ─────────────────────────────────────────────────────────────
function ScenarioCard({ scenario, stage, onLoad, isActive }) {
  const vpd    = calcVPD(scenario.temp, scenario.rh);
  const { colour, label: statusLabel } = vpdStatus(vpd, stage);

  return (
    <TouchableOpacity onPress={onLoad} activeOpacity={0.75}
      style={{ width: (SW - 48) / 2, borderRadius: 10, borderWidth: 1.5,
        borderColor: isActive ? colour : C.border,
        backgroundColor: isActive ? `${colour}12` : C.card,
        padding: 12, marginBottom: 10 }}>
      <Text style={{ fontSize: 22, marginBottom: 6 }}>{scenario.icon}</Text>
      <Text style={{ color: isActive ? colour : C.white, fontFamily: MONO,
        fontSize: 11, fontWeight: "bold", marginBottom: 3 }}>
        {scenario.name}
      </Text>
      <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9,
        marginBottom: 8, lineHeight: 13 }}>
        {scenario.desc}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between",
        alignItems: "center" }}>
        <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 9 }}>
          {scenario.temp}°C / {scenario.rh}%
        </Text>
        <Text style={{ color: colour, fontFamily: MONO,
          fontSize: 11, fontWeight: "bold" }}>
          {vpd.toFixed(2)} kPa
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Info modal ────────────────────────────────────────────────────────────────
const VPD_INFO = {
  title: "VPD CALCULATOR",
  emoji: "🌡",
  what: "VPD (Vapour Pressure Deficit) measures the difference between how much moisture the air is holding and how much it could hold. Plants use this gradient to decide how hard to breathe — too low and they stop, too high and they shut down.",
  sections: [
    { icon: "📐", title: "THE NUMBER (kPa)", text: "kPa = kilopascals. Think of it as how hard your plant is working. 0.4-0.8 for seedlings. 0.8-1.2 for veg. 1.0-1.5 for flower. 1.5-2.0 for the final 2 weeks of late flower only." },
    { icon: "🗺", title: "SIMULATE TAB — THE GRID", text: "The heatmap shows VPD for every temp/RH combination. Blue = too low, green = ideal, amber/red = too high. Tap any cell to snap to those conditions and see what happens to your plant." },
    { icon: "🌸", title: "SCENARIO BANK", text: "Real-world crisis scenarios — heat waves, humidity spikes, cold snaps. Tap any card to load that environment and read the full plant response: what happens, what you'll see on the leaves, and step-by-step rescue plan." },
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
  const [temp,     setTemp]     = useState(24.0);
  const [rh,       setRh]       = useState(55.0);
  const [stage,    setStage]    = useState("Vegetative");
  const [tab,      setTab]      = useState("calc");    // "calc" | "simulate"
  const [showInfo, setShowInfo] = useState(false);
  const [activeScenario, setActiveScenario] = useState(null);

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

  const loadScenario = (s) => {
    setTemp(s.temp);
    setRh(s.rh);
    setActiveScenario(s.name);
  };

  const handleGridSelect = (t, h) => {
    setTemp(t);
    setRh(h);
    setActiveScenario(null);
  };

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

          {/* Live VPD badge */}
          <View style={{ flexDirection: "row", alignItems: "center",
            justifyContent: "space-between", marginBottom: 14 }}>
            <View>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                letterSpacing: 1.5 }}>CURRENT CONDITIONS</Text>
              <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, marginTop: 2 }}>
                {temp}°C · {rh}% RH
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: colour, fontFamily: MONO,
                fontSize: 28, fontWeight: "bold" }}>
                {vpd.toFixed(2)}
              </Text>
              <Text style={{ color: colour, fontFamily: MONO,
                fontSize: 10, fontWeight: "bold" }}>
                kPa — {statusLabel}
              </Text>
            </View>
          </View>

          {/* Heatmap grid */}
          <View style={{ backgroundColor: C.card, borderRadius: 10,
            borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 16 }}>
            <Label style={{ marginBottom: 10 }}>
              VPD ZONE MAP — TAP ANY CELL TO EXPLORE
            </Label>
            <Text style={{ color: C.grey, fontFamily: MONO,
              fontSize: 10, marginBottom: 10, lineHeight: 15 }}>
              White dot = your current conditions. Tap a cell to snap to those values.
            </Text>
            <VPDGrid temp={temp} rh={rh} onSelect={handleGridSelect} />
          </View>

          {/* Plant state card */}
          <Label style={{ marginBottom: 8 }}>PLANT STATE AT CURRENT VPD</Label>
          <PlantStateCard vpd={vpd} stage={stage} />

          {/* Mini controls so you don't have to switch tabs */}
          <View style={{ backgroundColor: C.card, borderRadius: 10,
            borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 16 }}>
            <Label style={{ marginBottom: 12 }}>FINE-TUNE CONDITIONS</Label>
            <NumInput label="TEMPERATURE" value={temp}
              onChange={v => { setTemp(v); setActiveScenario(null); }}
              unit="°C" min={10} max={40} step={0.5} />
            <NumInput label="HUMIDITY" value={rh}
              onChange={v => { setRh(v); setActiveScenario(null); }}
              unit="%" min={10} max={100} step={1} />
          </View>

          {/* Scenario bank */}
          <Label style={{ marginBottom: 6 }}>SCENARIO BANK</Label>
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10,
            lineHeight: 15, marginBottom: 12 }}>
            Tap a scenario to load it and see the full plant response — what's happening, what you'd see, and how to rescue it.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap",
            justifyContent: "space-between" }}>
            {SCENARIOS.map(s => (
              <ScenarioCard
                key={s.name}
                scenario={s}
                stage={stage}
                isActive={activeScenario === s.name}
                onLoad={() => loadScenario(s)}
              />
            ))}
          </View>
        </ScrollView>
      )}

      <VPDInfoModal visible={showInfo} onClose={() => setShowInfo(false)} />
    </View>
  );
}
