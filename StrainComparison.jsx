/**
 * StrainComparison.jsx
 * Compare 2-3 strains side by side
 * Strains are pre-selected from the strain list — no search bar here
 * Also includes yield calculator integrated at the bottom
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator,
} from "react-native";
import { cachedFetch } from "./cache";

import { API_V1 as API_BASE } from "./apiConfig";
const MONO = Platform.select({ ios: "Courier New", android: "monospace" });

const C = {
  bg: "#070a07", surface: "#0d120d", card: "#111811",
  border: "#1a2a1a", green: "#39ff45", greenFaint: "#0d3d12",
  greenDim: "#1a7a20", amber: "#ffb830", red: "#ff3a3a",
  blue: "#30d5ff", purple: "#c084fc", white: "#e8f0e8",
  grey: "#4a5a4a", greyLight: "#8a9a8a",
};

const SLOT_COLOURS = ["#39ff45", "#ffb830", "#30d5ff"];
const DIFF_COL = { beginner: "#39ff45", intermediate: "#ffb830", advanced: "#ff3a3a" };
const DIFF_SCORE = { beginner: 1, intermediate: 2, advanced: 3 };

// Yield multipliers
const MEDIUM_MULT  = { soil: 1.0, coco: 1.15, hydro: 1.3 };
const SKILL_MULT   = { beginner: 0.6, intermediate: 0.85, advanced: 1.0 };
const TRAINING_MULT = { none: 1.0, lst: 1.2, topping: 1.25, scrog: 1.35 };

function Label({ children, style }) {
  return (
    <Text style={[{ color: C.greyLight, fontFamily: MONO,
      fontSize: 10, letterSpacing: 1.5 }, style]}>
      {children}
    </Text>
  );
}

function StatBar({ value, max, colour }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <View style={{ height: 6, backgroundColor: C.border,
      borderRadius: 3, overflow: "hidden", flex: 1 }}>
      <View style={{ width: `${pct}%`, height: 6,
        backgroundColor: colour, borderRadius: 3 }} />
    </View>
  );
}

function CompareRow({ label, strains, getValue, renderValue, max, colours }) {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 8,
      borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 8 }}>
      <Label style={{ marginBottom: 8 }}>{label}</Label>
      {strains.map((s, i) => {
        const val = getValue(s);
        const display = renderValue ? renderValue(s) : String(val ?? "—");
        const col = colours[i];
        return (
          <View key={i} style={{ marginBottom: i < strains.length - 1 ? 8 : 0 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between",
              alignItems: "center", marginBottom: 4 }}>
              <Text style={{ color: col, fontFamily: MONO, fontSize: 11, flex: 1 }}
                numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={{ color: col, fontFamily: MONO,
                fontSize: 12, fontWeight: "bold", marginLeft: 8 }}>
                {display}
              </Text>
            </View>
            {max != null && val != null && (
              <StatBar value={val} max={max} colour={col} />
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function StrainComparison({ initialStrains = [], onBack }) {
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState({});
  const [medium, setMedium]   = useState("soil");
  const [skill, setSkill]     = useState("intermediate");
  const [training, setTraining] = useState("lst");
  const [tentArea, setTentArea] = useState(1.0); // m²

  const strains = initialStrains.filter(Boolean);
  const colours = strains.map((_, i) => SLOT_COLOURS[i]);

  // Load full detail for each strain
  useEffect(() => {
    strains.forEach(async (s) => {
      if (details[s.id] || loading[s.id]) return;
      setLoading(prev => ({ ...prev, [s.id]: true }));
      try {
        const r = await cachedFetch(`${API_BASE}/search/strain/${s.id}`);
        setDetails(prev => ({ ...prev, [s.id]: r.data }));
      } catch {}
      finally {
        setLoading(prev => ({ ...prev, [s.id]: false }));
      }
    });
  }, [strains.map(s => s.id).join(",")]);

  const get = (s) => details[s?.id] || s;

  // Yield calculation per strain
  const calcYield = (s) => {
    const d = get(s);
    const mult = MEDIUM_MULT[medium] * SKILL_MULT[skill] * TRAINING_MULT[training];
    const min = Math.round((d.yield_min_gm2 || 350) * tentArea * mult);
    const max = Math.round((d.yield_max_gm2 || 500) * tentArea * mult);
    return { min, max };
  };

  const TENT_PRESETS = [
    { l: "60×60", a: 0.36 }, { l: "80×80", a: 0.64 },
    { l: "100×100", a: 1.0 }, { l: "120×120", a: 1.44 },
    { l: "150×150", a: 2.25 }, { l: "240×120", a: 2.88 },
  ];

  if (strains.length < 2) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center",
        justifyContent: "center", padding: 32 }}>
        <Text style={{ fontSize: 48 }}>⚖️</Text>
        <Text style={{ color: C.red, fontFamily: MONO,
          fontSize: 14, fontWeight: "bold", marginTop: 16 }}>
          NOT ENOUGH STRAINS
        </Text>
        <Text style={{ color: C.grey, fontFamily: MONO,
          fontSize: 12, marginTop: 8, textAlign: "center" }}>
          Select 2-3 strains from the list first using COMPARE mode
        </Text>
        <TouchableOpacity onPress={onBack}
          style={{ marginTop: 20, backgroundColor: C.greenFaint,
            borderRadius: 8, borderWidth: 1, borderColor: C.green,
            paddingHorizontal: 24, paddingVertical: 12 }}>
          <Text style={{ color: C.green, fontFamily: MONO, fontSize: 13 }}>
            ← BACK TO LIST
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 16 : 52,
        paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border }}>
        <TouchableOpacity onPress={onBack} style={{ marginBottom: 8 }}>
          <Text style={{ color: C.green, fontFamily: MONO, fontSize: 14 }}>← BACK</Text>
        </TouchableOpacity>
        <Text style={{ color: C.white, fontFamily: MONO,
          fontSize: 20, fontWeight: "bold" }}>
          STRAIN COMPARISON
        </Text>

        {/* Strain colour pills */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          {strains.map((s, i) => (
            <View key={i} style={{ backgroundColor: `${colours[i]}22`,
              borderRadius: 6, borderWidth: 1, borderColor: colours[i],
              paddingHorizontal: 10, paddingVertical: 5, flex: 1 }}>
              <Text style={{ color: colours[i], fontFamily: MONO,
                fontSize: 11, fontWeight: "bold", textAlign: "center" }}
                numberOfLines={1}>
                {s.name}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>

        {/* THC */}
        <CompareRow label="THC CONTENT" strains={strains} colours={colours}
          getValue={s => get(s).thc_max || 0}
          renderValue={s => {
            const d = get(s);
            return d.thc_min ? `${d.thc_min}–${d.thc_max}%` : `${d.thc_max || "?"}%`;
          }}
          max={35}
        />

        {/* Flower time */}
        <CompareRow label="FLOWER TIME" strains={strains} colours={colours}
          getValue={s => get(s).flower_wk_max || 0}
          renderValue={s => {
            const d = get(s);
            return d.flower_wk_min && d.flower_wk_min !== d.flower_wk_max
              ? `${d.flower_wk_min}–${d.flower_wk_max}wk`
              : `${d.flower_wk_max || "?"}wk`;
          }}
          max={16}
        />

        {/* Height */}
        <CompareRow label="INDOOR HEIGHT" strains={strains} colours={colours}
          getValue={s => get(s).height_max_cm || 0}
          renderValue={s => get(s).height_max_cm ? `${get(s).height_max_cm}cm` : "?"}
          max={200}
        />

        {/* Difficulty */}
        <View style={{ backgroundColor: C.card, borderRadius: 8,
          borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 8 }}>
          <Label style={{ marginBottom: 10 }}>DIFFICULTY</Label>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {strains.map((s, i) => {
              const diff = get(s).difficulty || "intermediate";
              const col = DIFF_COL[diff];
              return (
                <View key={i} style={{ flex: 1, backgroundColor: `${col}15`,
                  borderRadius: 6, borderWidth: 1, borderColor: col,
                  padding: 10, alignItems: "center" }}>
                  <Text style={{ color: colours[i], fontFamily: MONO,
                    fontSize: 10 }} numberOfLines={1}>{s.name}</Text>
                  <Text style={{ color: col, fontFamily: MONO,
                    fontSize: 14, fontWeight: "bold", marginTop: 4 }}>
                    {"●".repeat(DIFF_SCORE[diff] || 2)}
                  </Text>
                  <Text style={{ color: col, fontFamily: MONO, fontSize: 10 }}>
                    {diff}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Effect */}
        <View style={{ backgroundColor: C.card, borderRadius: 8,
          borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 8 }}>
          <Label style={{ marginBottom: 10 }}>EFFECT</Label>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {strains.map((s, i) => {
              const eff = get(s).effect || "balanced";
              const effectCols = { uplifting: C.green, balanced: C.amber, sedating: C.purple };
              const icons = { uplifting: "↑", balanced: "↔", sedating: "↓" };
              const col = effectCols[eff] || C.amber;
              return (
                <View key={i} style={{ flex: 1, backgroundColor: `${col}15`,
                  borderRadius: 6, borderWidth: 1, borderColor: col,
                  padding: 10, alignItems: "center" }}>
                  <Text style={{ color: colours[i], fontFamily: MONO,
                    fontSize: 10 }} numberOfLines={1}>{s.name}</Text>
                  <Text style={{ color: col, fontFamily: MONO,
                    fontSize: 20, marginTop: 4 }}>
                    {icons[eff] || "↔"}
                  </Text>
                  <Text style={{ color: col, fontFamily: MONO, fontSize: 10 }}>{eff}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Terpenes */}
        <View style={{ backgroundColor: C.card, borderRadius: 8,
          borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 8 }}>
          <Label style={{ marginBottom: 10 }}>TERPENES</Label>
          {strains.map((s, i) => {
            const terps = get(s).terpenes || [];
            return (
              <View key={i} style={{ marginBottom: i < strains.length - 1 ? 10 : 0 }}>
                <Text style={{ color: colours[i], fontFamily: MONO,
                  fontSize: 11, fontWeight: "bold", marginBottom: 6 }}>
                  {s.name}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {terps.length > 0 ? terps.map((t, j) => (
                    <View key={j} style={{ backgroundColor: `${colours[i]}15`,
                      borderRadius: 4, borderWidth: 1, borderColor: `${colours[i]}44`,
                      paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: colours[i], fontFamily: MONO, fontSize: 10 }}>
                        🧪 {t}
                      </Text>
                    </View>
                  )) : (
                    <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11 }}>
                      No data
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Genetics */}
        <View style={{ backgroundColor: C.card, borderRadius: 8,
          borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 16 }}>
          <Label style={{ marginBottom: 10 }}>GENETICS</Label>
          {strains.map((s, i) => (
            <View key={i} style={{ marginBottom: i < strains.length - 1 ? 10 : 0 }}>
              <Text style={{ color: colours[i], fontFamily: MONO,
                fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>
                {s.name}
              </Text>
              <Text style={{ color: C.amber, fontFamily: MONO,
                fontSize: 11, lineHeight: 17 }}>
                🧬 {get(s).lineage || "Unknown"}
              </Text>
            </View>
          ))}
        </View>

        {/* ── YIELD CALCULATOR ─────────────────────────────────────────────── */}
        <View style={{ backgroundColor: C.surface, borderRadius: 10,
          borderWidth: 2, borderColor: C.amber, padding: 16, marginBottom: 12 }}>
          <Text style={{ color: C.amber, fontFamily: MONO,
            fontSize: 14, fontWeight: "bold", marginBottom: 12 }}>
            📦 YIELD CALCULATOR
          </Text>

          {/* Tent size */}
          <Label style={{ marginBottom: 8 }}>TENT SIZE</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, flexDirection: "row", marginBottom: 12 }}>
            {TENT_PRESETS.map(p => (
              <TouchableOpacity key={p.l} onPress={() => setTentArea(p.a)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
                  borderWidth: 1,
                  borderColor: tentArea === p.a ? C.amber : C.border,
                  backgroundColor: tentArea === p.a ? `${C.amber}22` : C.card }}>
                <Text style={{ color: tentArea === p.a ? C.amber : C.greyLight,
                  fontFamily: MONO, fontSize: 11,
                  fontWeight: tentArea === p.a ? "bold" : "normal" }}>
                  {p.l}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Medium + Skill + Training in one row each */}
          {[
            { label: "MEDIUM", opts: ["soil","coco","hydro"], val: medium, set: setMedium },
            { label: "SKILL", opts: ["beginner","intermediate","advanced"], val: skill, set: setSkill },
            { label: "TRAINING", opts: ["none","lst","topping","scrog"], val: training, set: setTraining },
          ].map(({ label, opts, val, set }) => (
            <View key={label} style={{ marginBottom: 12 }}>
              <Label style={{ marginBottom: 6 }}>{label}</Label>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {opts.map(o => (
                  <TouchableOpacity key={o} onPress={() => set(o)}
                    style={{ flex: 1, paddingVertical: 7, borderRadius: 6,
                      borderWidth: 1,
                      borderColor: val === o ? C.amber : C.border,
                      backgroundColor: val === o ? `${C.amber}22` : C.card,
                      alignItems: "center" }}>
                    <Text style={{ color: val === o ? C.amber : C.greyLight,
                      fontFamily: MONO, fontSize: 10,
                      fontWeight: val === o ? "bold" : "normal" }}>
                      {o.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          {/* Yield results per strain */}
          <Label style={{ marginBottom: 10 }}>ESTIMATED YIELD FROM {tentArea}m²</Label>
          {strains.map((s, i) => {
            const { min, max } = calcYield(s);
            const col = colours[i];
            return (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between",
                alignItems: "center", paddingVertical: 10,
                borderBottomWidth: i < strains.length - 1 ? 1 : 0,
                borderColor: C.border }}>
                <Text style={{ color: col, fontFamily: MONO,
                  fontSize: 13, flex: 1 }} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={{ color: col, fontFamily: MONO,
                  fontSize: 18, fontWeight: "bold" }}>
                  {min}–{max}g
                </Text>
              </View>
            );
          })}

          {/* Winner */}
          {strains.length >= 2 && (() => {
            const best = strains.reduce((a, b) =>
              calcYield(a).max > calcYield(b).max ? a : b);
            const col = colours[strains.indexOf(best)];
            return (
              <View style={{ marginTop: 12, backgroundColor: `${col}15`,
                borderRadius: 8, borderWidth: 1, borderColor: col,
                padding: 12, alignItems: "center" }}>
                <Text style={{ color: col, fontFamily: MONO,
                  fontSize: 12, fontWeight: "bold" }}>
                  🏆 HIGHEST YIELD: {best.name}
                </Text>
                <Text style={{ color: `${col}88`, fontFamily: MONO,
                  fontSize: 10, marginTop: 4 }}>
                  Based on your settings and {tentArea}m² grow space
                </Text>
              </View>
            );
          })()}
        </View>

      </ScrollView>
    </View>
  );
}
