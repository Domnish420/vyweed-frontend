/**
 * VPDCalculator.jsx
 * Real-time VPD calculator — no API needed, pure maths on device
 * Copy to your Expo project root
 */

import React, { useState, useMemo, useEffect } from "react";
import { setGrowverContext } from "./growverContext";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  Platform, StatusBar, Dimensions, Modal,
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

// ── Shared info components (duplicated here for standalone file) ───────────────
function InfoBtn({ onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: "#0d120d",
        borderWidth: 1, borderColor: "#1a7a20",
        alignItems: "center", justifyContent: "center",
      }}>
      <Text style={{ color: "#39ff45", fontFamily: MONO,
        fontSize: 14, fontWeight: "bold" }}>?</Text>
    </TouchableOpacity>
  );
}

const VPD_INFO = {
  title: "VPD CALCULATOR",
  emoji: "🌡",
  what: "VPD stands for Vapour Pressure Deficit. It measures the difference between how much moisture the air is holding and how much it could hold at that temperature. Plants use VPD to decide how hard to work — too low and they can't breathe, too high and they shut down to conserve water.",
  sections: [
    { icon: "📐", title: "THE NUMBER (kPa)", text: "kPa = kilopascals, a unit of pressure. Think of it as a score for how hard your plant is working. 0.4-0.8 for seedlings (gentle). 0.8-1.2 for veg (moderate). 1.0-1.5 for flower (working hard). 1.5-2.0 for late flower (maximum stress — increases resin production)." },
    { icon: "🌡", title: "TEMPERATURE", text: "Use the + and - buttons to set your air temperature at canopy height. This is NOT your light temperature or room temperature — hold your thermometer at the top of your plants for an accurate reading." },
    { icon: "💧", title: "HUMIDITY", text: "This is relative humidity — how full the air is with water vapour. 100% = air is completely saturated. Measure at canopy height with a hygrometer. Seedlings = 70-80%. Veg = 50-70%. Early flower = 50-60%. Late flower = 40-50% to prevent mould." },
    { icon: "🌸", title: "GROW STAGE", text: "Scroll the stage selector to match where your plant actually is in its life cycle. Each stage has different optimal VPD targets because the plant's needs change as it grows." },
    { icon: "📊", title: "REFERENCE TABLE", text: "The table at the bottom shows what humidity achieves ideal VPD at each temperature. Your current temperature row is highlighted in green. This is your cheat sheet — no calculation needed." },
  ],
  tip: "Change humidity first (easier than temperature). A humidifier raises it, a dehumidifier lowers it. Even a wet towel in the room can raise humidity 5-10%.",
};

function VPDInfoModal({ visible, onClose }) {
  const info = VPD_INFO;
  const C2 = { card: "#111811", surface: "#0d120d", border: "#1a2a1a", green: "#39ff45",
    greenFaint: "#0d3d12", greenDim: "#1a7a20", blue: "#30d5ff", white: "#e8f0e8",
    grey: "#4a5a4a", greyLight: "#8a9a8a" };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: C2.card, borderTopLeftRadius: 20,
          borderTopRightRadius: 20, borderTopWidth: 2, borderColor: C2.green, maxHeight: "90%" }}>
          <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, backgroundColor: C2.border, borderRadius: 2 }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: C2.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 28 }}>{info.emoji}</Text>
              <View>
                <Text style={{ color: C2.green, fontFamily: MONO, fontSize: 16, fontWeight: "bold" }}>{info.title}</Text>
                <Text style={{ color: C2.grey, fontFamily: MONO, fontSize: 10 }}>HOW TO USE THIS SCREEN</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <Text style={{ color: C2.grey, fontFamily: MONO, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <View style={{ backgroundColor: C2.greenFaint, borderRadius: 8, borderWidth: 1,
              borderColor: C2.greenDim, padding: 14, marginBottom: 16 }}>
              <Text style={{ color: "#8a9a8a", fontFamily: MONO, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 6 }}>WHAT IS THIS?</Text>
              <Text style={{ color: C2.white, fontFamily: MONO, fontSize: 13, lineHeight: 20 }}>{info.what}</Text>
            </View>
            {info.sections.map((s, i) => (
              <View key={i} style={{ backgroundColor: C2.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C2.border, padding: 14, marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 18 }}>{s.icon}</Text>
                  <Text style={{ color: C2.green, fontFamily: MONO, fontSize: 12, fontWeight: "bold" }}>{s.title}</Text>
                </View>
                <Text style={{ color: C2.greyLight, fontFamily: MONO, fontSize: 12, lineHeight: 19 }}>{s.text}</Text>
              </View>
            ))}
            <View style={{ backgroundColor: "#0d1a2a", borderRadius: 8,
              borderWidth: 1, borderColor: C2.blue, padding: 14 }}>
              <Text style={{ color: C2.blue, fontFamily: MONO, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 6 }}>💡 PRO TIP</Text>
              <Text style={{ color: C2.white, fontFamily: MONO, fontSize: 13, lineHeight: 19 }}>{info.tip}</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── VPD maths ─────────────────────────────────────────────────────────────────
// Tetens equation for saturation vapour pressure (kPa)
function svp(tempC) {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

// Leaf temp is ~2°C cooler than air in most indoor setups
function calcVPD(airTempC, rh, leafTempOffset = -2) {
  const leafTemp = airTempC + leafTempOffset;
  const svpLeaf = svp(leafTemp);
  const svpAir  = svp(airTempC);
  const actualVP = svpAir * (rh / 100);
  return Math.max(0, svpLeaf - actualVP);
}

// Stage-specific VPD targets (kPa)
const STAGE_TARGETS = {
  Seedling:    { lo: 0.4, hi: 0.8,  ideal: 0.6,  label: "🌱 Seedling" },
  Vegetative:  { lo: 0.8, hi: 1.2,  ideal: 1.0,  label: "🍃 Vegetative" },
  "Pre-Flower":{ lo: 1.0, hi: 1.5,  ideal: 1.2,  label: "🌸 Pre-Flower" },
  Flowering:   { lo: 1.0, hi: 1.5,  ideal: 1.2,  label: "🌺 Flowering" },
  "Late Flower":{ lo: 1.5, hi: 2.0, ideal: 1.7,  label: "🌾 Late Flower" },
};

function vpdStatus(vpd, stage) {
  const t = STAGE_TARGETS[stage] || STAGE_TARGETS.Vegetative;
  if (vpd < t.lo) return { status: "low",    colour: C.blue,  label: "TOO LOW — raise temp or lower humidity" };
  if (vpd > t.hi) return { status: "high",   colour: C.red,   label: "TOO HIGH — lower temp or raise humidity" };
  const dist = Math.abs(vpd - t.ideal);
  if (dist <= 0.1)  return { status: "ideal",  colour: C.green, label: "PERFECT ✓" };
  return             { status: "ok",     colour: C.amber, label: "ACCEPTABLE" };
}

// ── Components ────────────────────────────────────────────────────────────────
function Label({ children, style }) {
  return (
    <Text style={[{
      color: C.greyLight, fontFamily: MONO, fontSize: 10,
      letterSpacing: 1.5, textTransform: "uppercase",
    }, style]}>
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
      <View style={{
        flexDirection: "row", alignItems: "center",
        backgroundColor: C.surface, borderRadius: 8,
        borderWidth: 1, borderColor: C.border, overflow: "hidden",
      }}>
        <TouchableOpacity onPress={dec}
          style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.surface }}>
          <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 20 }}>−</Text>
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: C.green, fontFamily: MONO, fontSize: 26, fontWeight: "bold" }}>
            {value}
          </Text>
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11 }}>{unit}</Text>
        </View>

        <TouchableOpacity onPress={inc}
          style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.surface }}>
          <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 20 }}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Gauge arc — SVG-free approximation using a View + rotation trick
function VPDGauge({ vpd, stage }) {
  const t = STAGE_TARGETS[stage] || STAGE_TARGETS.Vegetative;
  const { colour } = vpdStatus(vpd, stage);

  // Map 0–3 kPa to 0–100%
  const pct = Math.min(100, (vpd / 3) * 100);
  const loPos = (t.lo / 3) * 100;
  const hiPos = (t.hi / 3) * 100;

  return (
    <View style={{ marginVertical: 8 }}>
      {/* Track */}
      <View style={{
        height: 12, backgroundColor: C.border,
        borderRadius: 6, overflow: "hidden", position: "relative",
      }}>
        {/* Target zone */}
        <View style={{
          position: "absolute",
          left: `${loPos}%`, width: `${hiPos - loPos}%`,
          height: 12, backgroundColor: `${C.green}33`,
          borderLeftWidth: 2, borderRightWidth: 2, borderColor: C.greenDim,
        }} />
        {/* Current */}
        <View style={{
          width: `${pct}%`, height: 12,
          backgroundColor: colour, borderRadius: 6, opacity: 0.85,
        }} />
      </View>

      {/* Labels */}
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

// ── Main screen ───────────────────────────────────────────────────────────────
export default function VPDCalculator() {
  const [temp, setTemp]   = useState(24.0);
  const [rh, setRh]       = useState(55.0);
  const [stage, setStage] = useState("Vegetative");
  const [showInfo, setShowInfo] = useState(false);

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

  // Build a reference table: what RH gives ideal VPD at this temp?
  const refTable = useMemo(() => {
    return [20, 22, 24, 26, 28, 30].map(t => {
      // Solve: vpd = svp(t-2) - svp(t) * rh/100 = ideal
      // rh = (svp(t) - ideal) / svp(t) * 100
      const ideal = target.ideal;
      const svpLeaf = svp(t - 2);
      const svpAir  = svp(t);
      const rhForIdeal = ((svpAir - (svpLeaf - ideal)) / svpAir) * 100;
      return { temp: t, rh: Math.round(Math.max(0, Math.min(100, rhForIdeal))) };
    });
  }, [stage, target]);

  const TipBox = ({ text, colour: col }) => (
    <View style={{
      backgroundColor: `${col}15`, borderRadius: 6,
      borderWidth: 1, borderColor: col,
      padding: 10, marginTop: 8,
    }}>
      <Text style={{ color: col, fontFamily: MONO, fontSize: 12, lineHeight: 18 }}>
        {text}
      </Text>
    </View>
  );

  const adjustmentTip = useMemo(() => {
    const { status } = vpdStatus(vpd, stage);
    if (status === "ideal" || status === "ok") return null;
    if (status === "low") {
      const tempNeeded = Math.round((temp + 1) * 2) / 2;
      const rhNeeded   = Math.round(rh - 5);
      return `RAISE TEMP to ${tempNeeded}°C  OR  LOWER RH to ${rhNeeded}%`;
    }
    const tempNeeded = Math.round((temp - 1) * 2) / 2;
    const rhNeeded   = Math.round(rh + 5);
    return `LOWER TEMP to ${tempNeeded}°C  OR  RAISE RH to ${rhNeeded}%`;
  }, [vpd, stage, temp, rh]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 16 : 52,
        paddingBottom: 14,
        borderBottomWidth: 1, borderColor: C.border,
        flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
      }}>
        <View>
          <Text style={{ color: C.white, fontFamily: MONO, fontSize: 22,
            fontWeight: "900", letterSpacing: 2 }}>
            VY<Text style={{ color: C.green }}>WEED</Text>
          </Text>
          <Label>VPD CALCULATOR</Label>
        </View>
        <InfoBtn onPress={() => setShowInfo(true)} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* Stage selector */}
        <View style={{ marginBottom: 20 }}>
          <Label style={{ marginBottom: 8 }}>GROW STAGE</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {Object.keys(STAGE_TARGETS).map(s => (
                <TouchableOpacity key={s} onPress={() => setStage(s)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 9,
                    borderRadius: 8, borderWidth: 1,
                    borderColor: stage === s ? "rgba(120,200,130,0.35)" : C.border,
                    backgroundColor: stage === s ? "rgba(255,255,255,0.055)" : C.surface,
                  }}
                >
                  <Text style={{
                    color: stage === s ? "rgba(170,230,178,0.9)" : C.greyLight,
                    fontFamily: MONO, fontSize: 12,
                  }}>
                    {STAGE_TARGETS[s].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Big VPD readout */}
        <View style={{
          backgroundColor: C.card, borderRadius: 12,
          borderWidth: 2, borderColor: colour,
          padding: 20, alignItems: "center", marginBottom: 16,
        }}>
          <Label>CURRENT VPD</Label>
          <Text style={{ color: colour, fontFamily: MONO,
            fontSize: 64, fontWeight: "bold", lineHeight: 72, marginTop: 4 }}>
            {vpd.toFixed(2)}
          </Text>
          <Text style={{ color: colour, fontFamily: MONO, fontSize: 12,
            fontWeight: "bold", letterSpacing: 1 }}>
            kPa — {statusLabel}
          </Text>

          <VPDGauge vpd={vpd} stage={stage} />

          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 4 }}>
            TARGET {target.lo}–{target.hi} kPa (IDEAL {target.ideal})
          </Text>
        </View>

        {/* Controls */}
        <NumInput label="AIR TEMPERATURE" value={temp}
          onChange={setTemp} unit="°C" min={10} max={40} step={0.5} />

        <NumInput label="RELATIVE HUMIDITY" value={rh}
          onChange={setRh} unit="%" min={10} max={100} step={1} />

        {/* Adjustment tip */}
        {adjustmentTip && (
          <TipBox text={`⚡ FIX: ${adjustmentTip}`} colour={colour} />
        )}

        {/* Leaf temp note */}
        <View style={{
          backgroundColor: C.surface, borderRadius: 6,
          borderWidth: 1, borderColor: C.border,
          padding: 10, marginTop: 12, marginBottom: 20,
        }}>
          <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11, lineHeight: 17 }}>
            ℹ Leaf temp assumed 2°C below air temp (standard indoor).{"\n"}
            VPD = Vapour Pressure Deficit — measures how hard your plant is working to transpire.
          </Text>
        </View>

        {/* Reference table */}
        <View style={{ marginBottom: 8 }}>
          <Label style={{ marginBottom: 10 }}>
            IDEAL RH FOR {target.ideal} kPa TARGET BY TEMP
          </Label>
          <View style={{
            backgroundColor: C.card, borderRadius: 8,
            borderWidth: 1, borderColor: C.border, overflow: "hidden",
          }}>
            {/* Header */}
            <View style={{
              flexDirection: "row", backgroundColor: C.surface,
              paddingVertical: 8, paddingHorizontal: 12,
              borderBottomWidth: 1, borderColor: C.border,
            }}>
              <Text style={{ flex: 1, color: C.greyLight, fontFamily: MONO, fontSize: 10 }}>TEMP</Text>
              <Text style={{ flex: 1, color: C.greyLight, fontFamily: MONO, fontSize: 10, textAlign: "right" }}>
                IDEAL RH
              </Text>
            </View>
            {refTable.map((row, i) => {
              const isMatch = row.temp === Math.round(temp);
              return (
                <View key={row.temp} style={{
                  flexDirection: "row", paddingVertical: 10, paddingHorizontal: 12,
                  borderBottomWidth: i < refTable.length - 1 ? 1 : 0,
                  borderColor: C.border,
                  backgroundColor: isMatch ? C.greenFaint : "transparent",
                }}>
                  <Text style={{
                    flex: 1, color: isMatch ? C.green : C.white,
                    fontFamily: MONO, fontSize: 13, fontWeight: isMatch ? "bold" : "normal",
                  }}>
                    {row.temp}°C{isMatch ? " ◀" : ""}
                  </Text>
                  <Text style={{
                    flex: 1, color: isMatch ? C.green : C.greyLight,
                    fontFamily: MONO, fontSize: 13, fontWeight: isMatch ? "bold" : "normal",
                    textAlign: "right",
                  }}>
                    {row.rh}%
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

      </ScrollView>
      <VPDInfoModal visible={showInfo} onClose={() => setShowInfo(false)} />
    </View>
  );
}
