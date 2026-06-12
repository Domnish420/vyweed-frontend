/**
 * NutrientSchedule.jsx
 * Week-by-week nutrient feed chart for a strain
 * Supports BioBizz, Canna, Plagron, General Hydroponics + generic NPK
 *
 * Props:
 *   strainId     — strain slug e.g. "gelato"
 *   strainName   — display name
 *   flowerWeeks  — from strain data
 *   medium       — soil | coco | hydro
 *   onBack       — navigation callback
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, Platform, Alert, StatusBar,
} from "react-native";

import { getApiV1, BACKEND_HEADERS } from "./apiConfig";
const API_BASE = { toString: () => getApiV1() };

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
  purple:      "#8b6abf",
  white:       "#e8e4d9",
  grey:        "#4a5a4a",
  greyLight:   "#8a9e8c",
};

const HEADING   = "BebasNeue_400Regular";
const SANS      = "SpaceGrotesk_400Regular";
const SANS_MED  = "SpaceGrotesk_500Medium";
const SANS_BOLD = "SpaceGrotesk_700Bold";
const MONO      = SANS;

const STAGE_COLOURS = {
  "Seedling":            "#5b9bd5",
  "Early Vegetative":    "#6db87f",
  "Late Vegetative":     "#6db87f",
  "Transition (Flip)":   "#c17a4a",
  "Early Flower":        "#c17a4a",
  "Mid Flower":          "#b35a30",
  "Late Flower":         "#a83030",
  "Flush (Pre-Harvest)": "#8b6abf",
};

const BRANDS = [
  { key: "generic", label: "Generic NPK", icon: "🧬" },
  { key: "biobizz", label: "BioBizz",     icon: "🌿" },
  { key: "canna",   label: "Canna",       icon: "🔵" },
  { key: "plagron", label: "Plagron",     icon: "🟡" },
  { key: "gh",      label: "GH Flora",    icon: "🇺🇸" },
];

function Label({ children, style }) {
  return (
    <Text style={[{ color: C.greyLight, fontFamily: HEADING, fontSize: 12,
      letterSpacing: 2, textTransform: "uppercase" }, style]}>
      {children}
    </Text>
  );
}

// ── NPK Bar visualiser ────────────────────────────────────────────────────────
function NPKBar({ label, value, colour, max = 10 }) {
  const pct = (value / max) * 100;
  return (
    <View style={{ marginBottom: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
        <Text style={{ color: colour, fontFamily: SANS_MED, fontSize: 11 }}>
          {label}
        </Text>
        <Text style={{ color: colour, fontFamily: MONO, fontSize: 11 }}>
          {value}/10
        </Text>
      </View>
      <View style={{ height: 8, backgroundColor: C.border, borderRadius: 4, overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: 8, backgroundColor: colour, borderRadius: 4 }} />
      </View>
    </View>
  );
}

// ── Week Card ─────────────────────────────────────────────────────────────────
function WeekCard({ week, brand, onPress, currentWeek }) {
  const stageCol = STAGE_COLOURS[week.stage] || C.green;
  const isCurrent = week.week === currentWeek;

  const products = brand === "generic"
    ? null
    : week.brands?.[brand]?.products;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View style={{
        backgroundColor: isCurrent ? C.greenFaint : C.card,
        borderRadius: 8,
        borderWidth: isCurrent ? 2 : 1,
        borderColor: isCurrent ? C.greenBright : C.border,
        borderLeftWidth: 4, borderLeftColor: stageCol,
        padding: 14, marginBottom: 8,
      }}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between",
          alignItems: "center", marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{
              backgroundColor: stageCol, borderRadius: 16,
              width: 32, height: 32, alignItems: "center", justifyContent: "center",
            }}>
              <Text style={{ color: C.bg, fontFamily: SANS_MED,
                fontSize: 12 }}>
                W{week.week}
              </Text>
            </View>
            <View>
              <Text style={{ color: C.white, fontFamily: SANS_MED,
                fontSize: 13 }}>
                {week.stage}
              </Text>
              {isCurrent && (
                <Text style={{ color: C.greenBright, fontFamily: MONO, fontSize: 9 }}>
                  ◉ CURRENT WEEK
                </Text>
              )}
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: C.amber, fontFamily: SANS_MED, fontSize: 12 }}>
              EC {week.ec_min}–{week.ec_max}
            </Text>
            <Text style={{ color: C.blue, fontFamily: MONO, fontSize: 11 }}>
              pH {week.ph_min}–{week.ph_max}
            </Text>
          </View>
        </View>

        {/* Generic NPK bars */}
        {brand === "generic" && (
          <View style={{ marginBottom: 8 }}>
            <NPKBar label="N (Nitrogen)"   value={week.npk.n} colour={C.greenBright} />
            <NPKBar label="P (Phosphorus)" value={week.npk.p} colour={C.amber} />
            <NPKBar label="K (Potassium)"  value={week.npk.k} colour={C.red} />
          </View>
        )}

        {/* Brand products */}
        {products && (
          <View style={{ marginBottom: 8 }}>
            {Object.entries(products).map(([product, dose], i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between",
                paddingVertical: 4, borderBottomWidth: i < Object.keys(products).length - 1 ? 1 : 0,
                borderColor: C.border }}>
                <Text style={{ color: C.greyLight, fontFamily: MONO,
                  fontSize: 11, flex: 1 }}>
                  {product}
                </Text>
                <Text style={{ color: dose === "0" || dose.includes("PLAIN") ? C.grey : C.greenBright,
                  fontFamily: SANS_MED, fontSize: 11 }}>
                  {dose}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
          Tap for full notes →
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Week Detail Modal ─────────────────────────────────────────────────────────
function WeekDetailModal({ week, brand, onClose }) {
  if (!week) return null;
  const stageCol = STAGE_COLOURS[week.stage] || C.green;
  const products = brand === "generic" ? null : week.brands?.[brand]?.products;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20,
          borderTopRightRadius: 20, borderTopWidth: 2, borderColor: stageCol,
          maxHeight: "88%" }}>
          <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2 }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between",
            alignItems: "center", paddingHorizontal: 16, paddingBottom: 12,
            borderBottomWidth: 1, borderColor: C.border }}>
            <View>
              <Text style={{ color: stageCol, fontFamily: HEADING,
                fontSize: 26, letterSpacing: 1.5 }}>
                WEEK {week.week} — {week.stage.toUpperCase()}
              </Text>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
                EC {week.ec_min}–{week.ec_max} · pH {week.ph_min}–{week.ph_max}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

            {/* What's happening explanation */}
            <View style={{ backgroundColor: C.greenFaint, borderRadius: 8,
              borderWidth: 1, borderColor: C.greenDim, padding: 14, marginBottom: 12 }}>
              <Label style={{ color: C.greenDim, marginBottom: 6 }}>WHAT'S HAPPENING THIS WEEK</Label>
              <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, lineHeight: 20 }}>
                {week.notes}
              </Text>
            </View>

            {/* NPK breakdown */}
            <View style={{ backgroundColor: C.surface, borderRadius: 8,
              borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 }}>
              <Label style={{ marginBottom: 10 }}>NPK RATIO</Label>
              <NPKBar label="N — NITROGEN (growth, green, structure)"
                value={week.npk.n} colour={C.greenBright} />
              <NPKBar label="P — PHOSPHORUS (roots, energy, flowering)"
                value={week.npk.p} colour={C.amber} />
              <NPKBar label="K — POTASSIUM (flower density, resin, immune)"
                value={week.npk.k} colour={C.red} />
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11,
                marginTop: 8, lineHeight: 17 }}>
                N, P, and K are the three main nutrients every plant needs. Like a human needing protein, carbs, and fat — plants need different ratios at different life stages.
              </Text>
            </View>

            {/* EC & pH explained */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
              <View style={{ flex: 1, backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.border, padding: 12 }}>
                <Label style={{ marginBottom: 6 }}>EC TARGET</Label>
                <Text style={{ color: C.amber, fontFamily: HEADING,
                  fontSize: 32 }}>
                  {week.ec_min}–{week.ec_max}
                </Text>
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 4 }}>
                  mS/cm — measures nutrient concentration. Too high = burns. Too low = hungry.
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.border, padding: 12 }}>
                <Label style={{ marginBottom: 6 }}>pH TARGET</Label>
                <Text style={{ color: C.blue, fontFamily: HEADING,
                  fontSize: 32 }}>
                  {week.ph_min}–{week.ph_max}
                </Text>
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 4 }}>
                  Measures acidity. Outside this range nutrients lock out — plant starves even if fed.
                </Text>
              </View>
            </View>

            {/* Brand products */}
            {products && (
              <View style={{ backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 }}>
                <Label style={{ marginBottom: 10 }}>
                  {week.brands[brand]?.name} — THIS WEEK
                </Label>
                {Object.entries(products).map(([product, dose], i) => (
                  <View key={i} style={{ flexDirection: "row", justifyContent: "space-between",
                    alignItems: "center", paddingVertical: 8,
                    borderBottomWidth: i < Object.keys(products).length - 1 ? 1 : 0,
                    borderColor: C.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13 }}>
                        {product}
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: dose === "0" || dose.includes("PLAIN") ? C.surface : C.greenFaint,
                      borderRadius: 4, borderWidth: 1,
                      borderColor: dose === "0" || dose.includes("PLAIN") ? C.border : C.greenBright,
                      paddingHorizontal: 10, paddingVertical: 4,
                    }}>
                      <Text style={{ color: dose === "0" || dose.includes("PLAIN") ? C.grey : C.greenBright,
                        fontFamily: SANS_MED, fontSize: 12 }}>
                        {dose}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Additives */}
            <View style={{ backgroundColor: C.surface, borderRadius: 8,
              borderWidth: 1, borderColor: C.border, padding: 14 }}>
              <Label style={{ marginBottom: 8 }}>ADDITIVES & NOTES</Label>
              {week.additives.map((a, i) => (
                <Text key={i} style={{ color: C.white, fontFamily: MONO,
                  fontSize: 12, lineHeight: 19, marginBottom: 4 }}>
                  → {a}
                </Text>
              ))}
            </View>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function NutrientSchedule({ strainId, strainName, flowerWeeks, medium, onBack }) {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [brand, setBrand]       = useState("generic");
  const [brandInfo, setBrandInfo] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [showBrandInfo, setShowBrandInfo] = useState(false);

  // Estimate current grow week from start — if passed in use it, else null
  const currentWeek = null;

  useEffect(() => {
    fetch(`${API_BASE}/nutrients/${strainId}?medium=${medium}&flower_weeks=${flowerWeeks}`, { headers: BACKEND_HEADERS })
      .then(r => r.json())
      .then(data => {
        setSchedule(data);
        setBrandInfo(data.brands_available);
      })      .catch(e => Alert.alert("Error", e.message))
      .finally(() => setLoading(false));
  }, [strainId, medium, flowerWeeks]);

  const currentBrandInfo = brandInfo?.find(b => b.key === brand);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.green} size="large" />
        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 12, marginTop: 12 }}>
          BUILDING SCHEDULE...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 52,
        paddingBottom: 12,
        borderBottomWidth: 1, borderColor: C.border,
        backgroundColor: C.card,
      }}>
        <TouchableOpacity onPress={onBack} style={{ marginBottom: 8 }}>
          <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 16, letterSpacing: 1.5 }}>← BACK</Text>
        </TouchableOpacity>
        <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 24, letterSpacing: 1 }}>
          {strainName}
        </Text>
        <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 11, marginTop: 2 }}>
          NUTRIENT SCHEDULE · {medium.toUpperCase()} · {flowerWeeks}wk flower · {schedule?.total_weeks} weeks total
        </Text>
      </View>

      {/* Brand selector */}
      <View style={{ borderBottomWidth: 1, borderColor: C.border }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ padding: 10, gap: 8, flexDirection: "row" }}>
          {BRANDS.map(b => (
            <TouchableOpacity key={b.key} onPress={() => setBrand(b.key)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8,
                borderRadius: 8, borderWidth: 1,
                borderColor: brand === b.key ? C.greenBright : C.border,
                backgroundColor: brand === b.key ? C.greenFaint : C.surface,
                flexDirection: "row", alignItems: "center", gap: 6,
              }}>
              <Text style={{ fontSize: 14 }}>{b.icon}</Text>
              <Text style={{ color: brand === b.key ? C.greenBright : C.greyLight,
                fontFamily: brand === b.key ? SANS_MED : MONO, fontSize: 11 }}>
                {b.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Brand info banner */}
      {brand !== "generic" && currentBrandInfo && (
        <TouchableOpacity onPress={() => setShowBrandInfo(true)}
          style={{
            backgroundColor: C.greenFaint, borderBottomWidth: 1, borderColor: C.greenDim,
            padding: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.green, fontFamily: SANS_MED, fontSize: 11 }}>
              {currentBrandInfo.name} — {currentBrandInfo.type.toUpperCase()}
            </Text>
            <Text style={{ color: C.greenDim, fontFamily: MONO, fontSize: 10 }} numberOfLines={1}>
              {currentBrandInfo.description}
            </Text>
          </View>
          <Text style={{ color: C.green, fontFamily: MONO, fontSize: 12 }}>ℹ →</Text>
        </TouchableOpacity>
      )}

      {/* Schedule list */}
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {schedule?.schedule?.map(week => (
          <WeekCard
            key={week.week}
            week={week}
            brand={brand}
            currentWeek={currentWeek}
            onPress={() => setSelectedWeek(week)}
          />
        ))}
      </ScrollView>

      {/* Week detail modal */}
      {selectedWeek && (
        <WeekDetailModal
          week={selectedWeek}
          brand={brand}
          onClose={() => setSelectedWeek(null)}
        />
      )}

      {/* Brand info modal */}
      {showBrandInfo && currentBrandInfo && (
        <Modal visible transparent animationType="slide"
          onRequestClose={() => setShowBrandInfo(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20,
              borderTopRightRadius: 20, borderTopWidth: 2, borderColor: C.green, maxHeight: "80%" }}>
              <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
                <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2 }} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between",
                alignItems: "center", paddingHorizontal: 16, paddingBottom: 12,
                borderBottomWidth: 1, borderColor: C.border }}>
                <Text style={{ color: C.green, fontFamily: HEADING,
                  fontSize: 20, letterSpacing: 1 }}>
                  {currentBrandInfo.name}
                </Text>
                <TouchableOpacity onPress={() => setShowBrandInfo(false)}>
                  <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 20 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                {[
                  { label: "TYPE", value: currentBrandInfo.type.toUpperCase() },
                  { label: "ABOUT", value: currentBrandInfo.description },
                  { label: "EC NOTE", value: currentBrandInfo.ec_note },
                  { label: "pH NOTE", value: currentBrandInfo.ph_note },
                ].map((row, i) => (
                  <View key={i} style={{ backgroundColor: C.surface, borderRadius: 8,
                    borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 10 }}>
                    <Label style={{ marginBottom: 6 }}>{row.label}</Label>
                    <Text style={{ color: C.white, fontFamily: MONO,
                      fontSize: 13, lineHeight: 19 }}>
                      {row.value}
                    </Text>
                  </View>
                ))}
                <View style={{ backgroundColor: C.greenFaint, borderRadius: 8,
                  borderWidth: 1, borderColor: C.greenDim, padding: 14 }}>
                  <Label style={{ color: C.greenDim, marginBottom: 6 }}>💡 BEGINNER TIP</Label>
                  <Text style={{ color: C.white, fontFamily: MONO,
                    fontSize: 13, lineHeight: 19 }}>
                    {currentBrandInfo.beginner_tip}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
