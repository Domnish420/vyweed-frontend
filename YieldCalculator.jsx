/**
 * YieldCalculator.jsx
 * Calculate expected yield based on tent size + strain recommendations
 * No API needed for calculation — pure maths. Strain recommendations use API.
 */

import React, { useState, useMemo, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Platform, ActivityIndicator,
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

// Preset tent sizes (cm)
const TENT_PRESETS = [
  { label: "60×60",  w: 60,  h: 60,  plants: 1 },
  { label: "80×80",  w: 80,  h: 80,  plants: 2 },
  { label: "100×100", w: 100, h: 100, plants: 4 },
  { label: "120×120", w: 120, h: 120, plants: 6 },
  { label: "120×240", w: 120, h: 240, plants: 9 },
  { label: "150×150", w: 150, h: 150, plants: 9 },
  { label: "CUSTOM",  w: null, h: null, plants: null },
];

// Medium efficiency multipliers
const MEDIUM_MULT = { soil: 1.0, coco: 1.15, hydro: 1.3 };
const MEDIUM_LABEL = {
  soil: "Soil — natural, forgiving, baseline yield",
  coco: "Coco — 15% higher yield than soil on average",
  hydro: "Hydro — up to 30% higher, but most technical",
};

// Skill multipliers
const SKILL_MULT = { beginner: 0.6, intermediate: 0.85, advanced: 1.0 };
const SKILL_LABEL = {
  beginner: "First few grows — expect 60% of maximum potential",
  intermediate: "Some experience — expect 85% of maximum",
  advanced: "Experienced — approaching full potential",
};

// Training multipliers
const TRAINING_MULT = { none: 1.0, lst: 1.2, scrog: 1.35, topping: 1.25 };
const TRAINING_LABEL = {
  none: "No training — single main cola per plant",
  lst: "LST — low stress training, +20% yield",
  scrog: "SCROG — screen of green, +35% yield",
  topping: "Topping — multiple colas, +25% yield",
};

// Light efficiency
const LIGHT_MULT = { led: 1.0, hps: 0.9, cfl: 0.6 };
const LIGHT_LABEL = {
  led: "LED — most efficient, best g/watt",
  hps: "HPS — effective but less efficient",
  cfl: "CFL — budget option, lower output",
};

function Label({ children, style }) {
  return (
    <Text style={[{ color: C.greyLight, fontFamily: MONO,
      fontSize: 10, letterSpacing: 1.5 }, style]}>
      {children}
    </Text>
  );
}

function OptionRow({ options, selected, onSelect, getLabel }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, flexDirection: "row", paddingVertical: 4 }}>
      {options.map(opt => {
        const key = typeof opt === "string" ? opt : opt.label;
        const isSelected = selected === (typeof opt === "string" ? opt : opt);
        return (
          <TouchableOpacity key={key} onPress={() => onSelect(opt)}
            style={{ paddingHorizontal: 14, paddingVertical: 8,
              borderRadius: 8, borderWidth: 1,
              borderColor: isSelected ? C.green : C.border,
              backgroundColor: isSelected ? C.greenFaint : C.surface }}>
            <Text style={{ color: isSelected ? C.green : C.greyLight,
              fontFamily: MONO, fontSize: 11,
              fontWeight: isSelected ? "bold" : "normal" }}>
              {key}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export default function YieldCalculator({ onBack }) {
  const [tent, setTent]       = useState(TENT_PRESETS[2]); // 100×100 default
  const [customW, setCustomW] = useState("100");
  const [customH, setCustomH] = useState("100");
  const [medium, setMedium]   = useState("soil");
  const [skill, setSkill]     = useState("intermediate");
  const [training, setTraining] = useState("lst");
  const [light, setLight]     = useState("led");
  const [strains, setStrains] = useState([]);
  const [loadingStrains, setLoadingStrains] = useState(false);

  // Calculate area
  const area = useMemo(() => {
    if (tent.label === "CUSTOM") {
      const w = parseFloat(customW) || 0;
      const h = parseFloat(customH) || 0;
      return (w * h) / 10000; // convert cm² to m²
    }
    return (tent.w * tent.h) / 10000;
  }, [tent, customW, customH]);

  const plants = useMemo(() => {
    if (tent.label === "CUSTOM") {
      return Math.max(1, Math.round(area * 4));
    }
    return tent.plants;
  }, [tent, area]);

  // Yield calculation
  const yieldResult = useMemo(() => {
    const baseMin = 350; // g/m² conservative
    const baseMax = 600; // g/m² optimistic

    const mult = MEDIUM_MULT[medium] * SKILL_MULT[skill] *
      TRAINING_MULT[training] * LIGHT_MULT[light];

    const totalMin = Math.round(area * baseMin * mult);
    const totalMax = Math.round(area * baseMax * mult);
    const perPlantMin = Math.round(totalMin / plants);
    const perPlantMax = Math.round(totalMax / plants);

    return { totalMin, totalMax, perPlantMin, perPlantMax, mult };
  }, [area, medium, skill, training, light, plants]);

  // Load recommended strains for the space
  useEffect(() => {
    const maxHeight = tent.label === "CUSTOM"
      ? 150 : Math.min(200, tent.w * 1.2); // estimate max plant height from tent width

    setLoadingStrains(true);
    cachedFetch(`${API_BASE}/search/recommend?experience=${skill}&space_cm=${Math.round(maxHeight)}&want_auto=${area < 0.36}&limit=6`)
      .then(r => setStrains(r.data?.recommendations || []))
      .catch(() => {})
      .finally(() => setLoadingStrains(false));
  }, [skill, tent, area]);

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
          YIELD CALCULATOR
        </Text>
        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11, marginTop: 2 }}>
          Estimate your harvest before you grow
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* Result card — prominent at top */}
        <View style={{ backgroundColor: C.greenFaint, borderRadius: 12,
          borderWidth: 2, borderColor: C.green, padding: 20,
          alignItems: "center", marginBottom: 20 }}>
          <Label style={{ color: C.greenDim, marginBottom: 8 }}>
            ESTIMATED TOTAL YIELD
          </Label>
          <Text style={{ color: C.green, fontFamily: MONO,
            fontSize: 42, fontWeight: "bold" }}>
            {yieldResult.totalMin}–{yieldResult.totalMax}g
          </Text>
          <Text style={{ color: C.greenDim, fontFamily: MONO,
            fontSize: 12, marginTop: 4 }}>
            {yieldResult.perPlantMin}–{yieldResult.perPlantMax}g per plant · {plants} plant{plants !== 1 ? "s" : ""}
          </Text>
          <Text style={{ color: C.greyLight, fontFamily: MONO,
            fontSize: 11, marginTop: 6 }}>
            {area.toFixed(2)}m² grow space · {(yieldResult.mult * 100).toFixed(0)}% efficiency
          </Text>
        </View>

        {/* Tent size */}
        <View style={{ backgroundColor: C.card, borderRadius: 8,
          borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 }}>
          <Label style={{ marginBottom: 10 }}>TENT SIZE</Label>
          <OptionRow
            options={TENT_PRESETS}
            selected={tent}
            onSelect={setTent}
            getLabel={p => p.label}
          />
          {tent.label === "CUSTOM" && (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Label style={{ marginBottom: 4 }}>WIDTH (cm)</Label>
                <TextInput
                  style={{ backgroundColor: C.surface, borderRadius: 6,
                    borderWidth: 1, borderColor: C.green,
                    color: C.white, fontFamily: MONO, fontSize: 16,
                    padding: 10, textAlign: "center" }}
                  value={customW} onChangeText={setCustomW}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Label style={{ marginBottom: 4 }}>DEPTH (cm)</Label>
                <TextInput
                  style={{ backgroundColor: C.surface, borderRadius: 6,
                    borderWidth: 1, borderColor: C.green,
                    color: C.white, fontFamily: MONO, fontSize: 16,
                    padding: 10, textAlign: "center" }}
                  value={customH} onChangeText={setCustomH}
                  keyboardType="numeric"
                />
              </View>
            </View>
          )}
        </View>

        {/* Medium */}
        <View style={{ backgroundColor: C.card, borderRadius: 8,
          borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 }}>
          <Label style={{ marginBottom: 10 }}>GROWING MEDIUM</Label>
          <OptionRow
            options={["soil", "coco", "hydro"]}
            selected={medium}
            onSelect={setMedium}
          />
          <Text style={{ color: C.grey, fontFamily: MONO,
            fontSize: 11, marginTop: 8 }}>
            {MEDIUM_LABEL[medium]}
          </Text>
        </View>

        {/* Skill */}
        <View style={{ backgroundColor: C.card, borderRadius: 8,
          borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 }}>
          <Label style={{ marginBottom: 10 }}>YOUR EXPERIENCE LEVEL</Label>
          <OptionRow
            options={["beginner", "intermediate", "advanced"]}
            selected={skill}
            onSelect={setSkill}
          />
          <Text style={{ color: C.grey, fontFamily: MONO,
            fontSize: 11, marginTop: 8 }}>
            {SKILL_LABEL[skill]}
          </Text>
        </View>

        {/* Training */}
        <View style={{ backgroundColor: C.card, borderRadius: 8,
          borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 }}>
          <Label style={{ marginBottom: 10 }}>TRAINING TECHNIQUE</Label>
          <OptionRow
            options={["none", "lst", "topping", "scrog"]}
            selected={training}
            onSelect={setTraining}
          />
          <Text style={{ color: C.grey, fontFamily: MONO,
            fontSize: 11, marginTop: 8 }}>
            {TRAINING_LABEL[training]}
          </Text>
        </View>

        {/* Light */}
        <View style={{ backgroundColor: C.card, borderRadius: 8,
          borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 }}>
          <Label style={{ marginBottom: 10 }}>LIGHT TYPE</Label>
          <OptionRow
            options={["led", "hps", "cfl"]}
            selected={light}
            onSelect={setLight}
          />
          <Text style={{ color: C.grey, fontFamily: MONO,
            fontSize: 11, marginTop: 8 }}>
            {LIGHT_LABEL[light]}
          </Text>
        </View>

        {/* Breakdown */}
        <View style={{ backgroundColor: C.surface, borderRadius: 8,
          borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 16 }}>
          <Label style={{ marginBottom: 10 }}>HOW WE CALCULATED THIS</Label>
          {[
            { label: "Base yield (average strain)", value: "350–600g/m²" },
            { label: "Grow area", value: `${area.toFixed(2)}m²` },
            { label: "Medium bonus", value: `×${MEDIUM_MULT[medium].toFixed(2)}` },
            { label: "Skill factor", value: `×${SKILL_MULT[skill].toFixed(2)}` },
            { label: "Training bonus", value: `×${TRAINING_MULT[training].toFixed(2)}` },
            { label: "Light efficiency", value: `×${LIGHT_MULT[light].toFixed(2)}` },
            { label: "Plants recommended", value: `${plants}` },
          ].map(({ label, value }, i, arr) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between",
              paddingVertical: 8, borderBottomWidth: i < arr.length - 1 ? 1 : 0,
              borderColor: C.border }}>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 12 }}>
                {label}
              </Text>
              <Text style={{ color: C.white, fontFamily: MONO,
                fontSize: 12, fontWeight: "bold" }}>
                {value}
              </Text>
            </View>
          ))}
        </View>

        {/* Recommended strains for this space */}
        <View style={{ backgroundColor: C.card, borderRadius: 8,
          borderWidth: 1, borderColor: C.border, padding: 14 }}>
          <Label style={{ marginBottom: 10 }}>
            RECOMMENDED STRAINS FOR YOUR SETUP
          </Label>
          {loadingStrains ? (
            <ActivityIndicator color={C.green} />
          ) : strains.length > 0 ? (
            strains.map((s, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between",
                alignItems: "center", paddingVertical: 8,
                borderBottomWidth: i < strains.length - 1 ? 1 : 0,
                borderColor: C.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.white, fontFamily: MONO,
                    fontSize: 13, fontWeight: "bold" }}>
                    {s.name}
                  </Text>
                  <Text style={{ color: C.grey, fontFamily: MONO,
                    fontSize: 10, marginTop: 2 }}>
                    {s.difficulty} · {s.flower_wk_max}wk · {s.yield_max_gm2}g/m²
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: C.red, fontFamily: MONO,
                    fontSize: 12, fontWeight: "bold" }}>
                    {s.thc_max}% THC
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 12 }}>
              No recommendations available
            </Text>
          )}
        </View>

      </ScrollView>
    </View>
  );
}
