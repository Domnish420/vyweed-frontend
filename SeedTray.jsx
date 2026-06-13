// SeedTray.jsx — environment-matched seed selection for greenhouse starts
// Filters strains the user already has trophies for, scores remaining by
// season / temperature / difficulty, weighted-random picks 4 (free) or 8 (MAX).
// Re-roll: 1 free / 5 MAX per grow cycle.

import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cachedFetch } from "./cache";
import { setGrowverContext } from "./growverContext";
import { getApiV1 } from "./apiConfig";
import { useAppMode } from "./AppMode";
const API_BASE = { toString: () => getApiV1() };

const HEADING   = "BebasNeue_400Regular";
const SANS      = "SpaceGrotesk_400Regular";
const SANS_MED  = "SpaceGrotesk_500Medium";
const SANS_BOLD = "SpaceGrotesk_700Bold";
const TOTAL_PAGES = 51;
const TRAY_KEY  = "vyweed_seed_tray";

const C = {
  bg:          "#0B0D0C",
  surface:     "rgba(255,255,255,0.04)",
  card:        "rgba(255,255,255,0.03)",
  border:      "rgba(255,255,255,0.08)",
  green:       "#3dffa0",
  greenFaint:  "rgba(61,255,160,0.08)",
  greenDim:    "rgba(61,255,160,0.4)",
  amber:       "#c17a4a",
  red:         "#a05050",
  blue:        "#5b9bd5",
  grey:        "rgba(232,228,217,0.28)",
  greyLight:   "rgba(232,228,217,0.52)",
  white:       "#e8e4d9",
  lavender:    "#c8b4e8",
};

const METALS = {
  bronze:  { label: "Bronze",  icon: "🥉", colour: "#cd7f32" },
  silver:  { label: "Silver",  icon: "🥈", colour: "#b8c0cc" },
  gold:    { label: "Gold",    icon: "🥇", colour: "#ffd700" },
  diamond: { label: "Diamond", icon: "💎", colour: "#7af6ff" },
};

const SEASON_ICON = { spring: "🌸", summer: "☀️", autumn: "🍂", winter: "❄️" };

function getMetal(difficulty, tier) {
  if (tier === "T1") return "diamond";
  if (difficulty === "advanced") return "gold";
  if (difficulty === "intermediate") return "silver";
  return "bronze";
}

// ── Environment match scoring ─────────────────────────────────────────────────
function scoreStrain(strain, weather, growsCompleted) {
  let score = 50;
  const fw     = strain.flower_wk_max || 9;
  const auto   = strain.is_autoflower;
  const season = weather?.season || "summer";
  const temp   = weather?.temp;

  if (season === "spring")  score += 15;
  if (season === "summer")  score += 20;
  if (season === "autumn") {
    if (auto || fw <= 7)  score += 28;
    else if (fw <= 9)     score += 10;
    else if (fw >= 11)    score -= 25;
  }
  if (season === "winter") score -= 200;

  if (auto) score += 8; // autoflowers always versatile

  if (temp !== undefined) {
    if (temp >= 18 && temp <= 26)     score += 15;
    else if (temp >= 12 && temp < 18) score += 5;
    else if (temp < 10)               score -= 20;
    else if (temp > 30)               score -= 10;
  }

  if (growsCompleted === 0 && strain.difficulty === "beginner")        score += 20;
  else if (growsCompleted <= 2 && strain.difficulty === "beginner")    score += 8;
  else if (growsCompleted >= 3 && strain.difficulty === "intermediate") score += 8;
  else if (growsCompleted >= 6 && strain.difficulty === "advanced")    score += 10;

  // Ease beginners in — T1 (legendary) is harder to grow well
  if (growsCompleted < 2) {
    if (strain.tier === "T4") score += 5;
    else if (strain.tier === "T1") score -= 10;
  }

  return Math.max(1, score);
}

function matchGrade(score) {
  if (score >= 85) return { label: "PERFECT MATCH", colour: C.green,   badge: "✦✦✦✦" };
  if (score >= 65) return { label: "GREAT FIT",     colour: "#6db87f", badge: "✦✦✦" };
  if (score >= 45) return { label: "GOOD FIT",      colour: C.amber,   badge: "✦✦" };
  return             { label: "CHALLENGING",         colour: C.red,     badge: "✦" };
}

function weightedSample(pool, count) {
  const selected  = [];
  const available = [...pool];
  while (selected.length < count && available.length > 0) {
    const total = available.reduce((s, x) => s + x._score, 0);
    if (total <= 0) {
      selected.push(available.splice(Math.floor(Math.random() * available.length), 1)[0]);
      continue;
    }
    let r = Math.random() * total;
    for (let i = 0; i < available.length; i++) {
      r -= available[i]._score;
      if (r <= 0) { selected.push(available.splice(i, 1)[0]); break; }
    }
  }
  return selected;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SeedTray({
  trophies,
  outdoorWeather,
  growsCompleted,
  onSelectStrain,
  onBack,
  onSearchAll,
}) {
  const { isPro } = useAppMode();
  const seedCount   = isPro ? 8 : 4;
  const rerollLimit = isPro ? 5 : 1;

  const [seeds, setSeeds]             = useState([]);
  const [rerollsUsed, setRerollsUsed] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [rerolling, setRerolling]     = useState(false);

  const trophyIds = new Set((trophies || []).map(t => t.strainId));

  const fetchAndScore = useCallback(async () => {
    const pageSet = new Set();
    const pool    = [];
    // Fetch 3 random pages — ~300 candidates
    while (pageSet.size < 3) {
      const page = Math.floor(Math.random() * TOTAL_PAGES) + 1;
      if (pageSet.has(page)) continue;
      pageSet.add(page);
      try {
        const r = await cachedFetch(
          `${API_BASE}/search?per_page=100&page=${page}&sort=name`
        );
        for (const s of (r.data?.results || [])) {
          if (!trophyIds.has(s.id)) {
            pool.push({ ...s, _score: scoreStrain(s, outdoorWeather, growsCompleted) });
          }
        }
      } catch {}
    }
    return weightedSample(pool, seedCount);
  }, [trophyIds.size, outdoorWeather, growsCompleted, seedCount]);

  // ── Initial load — use cache if trophies + seed count unchanged ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const raw = await AsyncStorage.getItem(TRAY_KEY).catch(() => null);
        if (raw) {
          const stored = JSON.parse(raw);
          if (
            stored.trophyCount === trophyIds.size &&
            stored.seeds?.length === seedCount
          ) {
            setSeeds(stored.seeds);
            setRerollsUsed(stored.rerollsUsed || 0);
            setLoading(false);
            return;
          }
        }
        const picks = await fetchAndScore();
        setSeeds(picks);
        await AsyncStorage.setItem(TRAY_KEY, JSON.stringify({
          seeds: picks, rerollsUsed: 0,
          trophyCount: trophyIds.size, generatedAt: Date.now(),
        })).catch(() => {});
      } catch {
        setSeeds([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Sync Growver context whenever tray changes ──
  useEffect(() => {
    if (seeds.length === 0) return;
    setGrowverContext("seed_tray", {
      seeds: seeds.map(s => ({
        name: s.name, tier: s.tier,
        type: s.type === "I" ? "Indica" : s.type === "S" ? "Sativa" : "Hybrid",
        flowerWeeks: s.flower_wk_max,
        isAutoflower: s.is_autoflower,
        difficulty: s.difficulty,
        thcMax: s.thc_max,
        matchGrade: matchGrade(s._score).label,
      })),
      season:      outdoorWeather?.season || "unknown",
      temp:        outdoorWeather?.temp,
      humidity:    outdoorWeather?.humidity,
      weatherDesc: outdoorWeather?.weatherDesc,
      rerollsLeft: rerollLimit - rerollsUsed,
    });
  }, [seeds]);

  // ── Re-roll ──
  const doReroll = async () => {
    if (rerollsUsed >= rerollLimit || rerolling || loading) return;
    setRerolling(true);
    const newUsed = rerollsUsed + 1;
    setRerollsUsed(newUsed);
    try {
      const picks = await fetchAndScore();
      setSeeds(picks);
      await AsyncStorage.setItem(TRAY_KEY, JSON.stringify({
        seeds: picks, rerollsUsed: newUsed,
        trophyCount: trophyIds.size, generatedAt: Date.now(),
      })).catch(() => {});
    } catch {} finally {
      setRerolling(false);
    }
  };

  const rerollsLeft = rerollLimit - rerollsUsed;
  const season = outdoorWeather?.season || null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>

      {/* ── Header ── */}
      <View style={{
        paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
        borderBottomWidth: 1, borderColor: C.border,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          {/* Back */}
          <TouchableOpacity onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ color: C.greenDim, fontFamily: HEADING, fontSize: 20 }}>‹</Text>
            <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 11, letterSpacing: 1 }}>
              BACK
            </Text>
          </TouchableOpacity>

          {/* Title */}
          <View style={{ alignItems: "center" }}>
            <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 22, letterSpacing: 2 }}>
              YOUR SEEDS
            </Text>
            {season && (
              <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 9, marginTop: 1 }}>
                {SEASON_ICON[season]} {season.toUpperCase()}
                {outdoorWeather?.temp !== undefined ? ` · ${outdoorWeather.temp}°C` : ""}
                {outdoorWeather?.city ? ` · ${outdoorWeather.city}` : ""}
              </Text>
            )}
          </View>

          {/* Re-roll */}
          <TouchableOpacity
            onPress={doReroll}
            disabled={rerollsLeft <= 0 || rerolling || loading}
            style={{
              backgroundColor: rerollsLeft > 0 ? C.greenFaint : "rgba(255,255,255,0.02)",
              borderRadius: 10, borderWidth: 1,
              borderColor: rerollsLeft > 0 ? C.greenDim : C.border,
              paddingHorizontal: 10, paddingVertical: 6, alignItems: "center",
            }}>
            <Text style={{ color: rerollsLeft > 0 ? C.green : C.grey, fontFamily: HEADING, fontSize: 13 }}>
              {rerolling ? "…" : "🎲 RE-ROLL"}
            </Text>
            <Text style={{
              color: rerollsLeft > 0 ? C.greenDim : C.grey,
              fontFamily: SANS, fontSize: 8, marginTop: 1,
            }}>
              {rerollsLeft} LEFT
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tier badge */}
        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 10 }}>
          <View style={{
            backgroundColor: isPro ? "rgba(200,180,232,0.08)" : C.surface,
            borderRadius: 8, borderWidth: 1,
            borderColor: isPro ? "rgba(200,180,232,0.30)" : C.border,
            paddingHorizontal: 12, paddingVertical: 4,
          }}>
            <Text style={{ color: isPro ? C.lavender : C.greyLight, fontFamily: SANS_MED, fontSize: 10 }}>
              {isPro
                ? `⭐ MAX — ${seedCount} seeds · ${rerollLimit} re-rolls per cycle`
                : `FREE — ${seedCount} seeds · ${rerollLimit} re-roll per cycle`}
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator color={C.green} size="large" />
          <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 12 }}>
            Matching seeds to your environment...
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>

          {/* No location notice */}
          {!outdoorWeather && (
            <View style={{
              backgroundColor: "rgba(193,122,74,0.08)",
              borderRadius: 10, borderWidth: 1, borderColor: "rgba(193,122,74,0.25)",
              padding: 12, marginBottom: 14, flexDirection: "row", gap: 8, alignItems: "center",
            }}>
              <Text style={{ fontSize: 16 }}>📍</Text>
              <Text style={{ flex: 1, color: C.amber, fontFamily: SANS, fontSize: 11, lineHeight: 17 }}>
                Enable location on the Outdoor tab for environment-matched seeds. Showing a general selection for now.
              </Text>
            </View>
          )}

          {/* Growver hint */}
          <View style={{
            backgroundColor: C.greenFaint,
            borderRadius: 10, borderWidth: 1, borderColor: "rgba(61,255,160,0.10)",
            padding: 10, marginBottom: 14, flexDirection: "row", gap: 8, alignItems: "center",
          }}>
            <Text style={{ fontSize: 16 }}>🤖</Text>
            <Text style={{ flex: 1, color: C.greenDim, fontFamily: SANS, fontSize: 11, lineHeight: 17 }}>
              Growver knows these seeds — ask him which suits your setup before you commit.
            </Text>
          </View>

          {/* Seed cards */}
          {seeds.map((strain) => {
            const m    = METALS[getMetal(strain.difficulty, strain.tier)];
            const g    = matchGrade(strain._score);
            const type = strain.type === "I" ? "INDICA"
                       : strain.type === "S" ? "SATIVA" : "HYBRID";
            const typeColour = strain.type === "I" ? C.lavender
                             : strain.type === "S" ? "#6db87f" : C.amber;

            return (
              <TouchableOpacity
                key={strain.id}
                onPress={() => onSelectStrain(strain)}
                activeOpacity={0.75}
                style={{
                  backgroundColor: C.card,
                  borderRadius: 16, borderWidth: 1, borderColor: C.border,
                  borderLeftWidth: 2, borderLeftColor: m.colour,
                  padding: 14, marginBottom: 10,
                }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <Text style={{ fontSize: 26, marginTop: 2 }}>{m.icon}</Text>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.white, fontFamily: SANS_BOLD, fontSize: 15, lineHeight: 20 }}>
                      {strain.name}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
                      {/* Type */}
                      <View style={{
                        backgroundColor: `${typeColour}15`,
                        borderRadius: 6, borderWidth: 1, borderColor: `${typeColour}40`,
                        paddingHorizontal: 6, paddingVertical: 2,
                      }}>
                        <Text style={{ color: typeColour, fontFamily: SANS_MED, fontSize: 9 }}>{type}</Text>
                      </View>
                      {/* Tier */}
                      <View style={{
                        backgroundColor: `${m.colour}12`,
                        borderRadius: 6, borderWidth: 1, borderColor: `${m.colour}40`,
                        paddingHorizontal: 6, paddingVertical: 2,
                      }}>
                        <Text style={{ color: m.colour, fontFamily: SANS_MED, fontSize: 9 }}>{strain.tier}</Text>
                      </View>
                      {/* Flower time */}
                      <View style={{
                        backgroundColor: "rgba(255,255,255,0.02)",
                        borderRadius: 6, borderWidth: 1, borderColor: C.border,
                        paddingHorizontal: 6, paddingVertical: 2,
                      }}>
                        <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 9 }}>
                          {strain.flower_wk_max}wk flower
                        </Text>
                      </View>
                      {/* Auto badge */}
                      {strain.is_autoflower && (
                        <View style={{
                          backgroundColor: "rgba(91,155,213,0.10)",
                          borderRadius: 6, borderWidth: 1, borderColor: "rgba(91,155,213,0.30)",
                          paddingHorizontal: 6, paddingVertical: 2,
                        }}>
                          <Text style={{ color: C.blue, fontFamily: SANS, fontSize: 9 }}>AUTO</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Match grade */}
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text style={{ color: g.colour, fontFamily: SANS_BOLD, fontSize: 9, letterSpacing: 0.5 }}>
                      {g.label}
                    </Text>
                    <Text style={{ color: g.colour, fontSize: 11 }}>{g.badge}</Text>
                  </View>
                </View>

                {/* Bottom row */}
                <View style={{
                  flexDirection: "row", justifyContent: "space-between",
                  marginTop: 10, paddingTop: 8,
                  borderTopWidth: 1, borderColor: C.border,
                }}>
                  <Text style={{ color: "#a05050", fontFamily: SANS, fontSize: 11 }}>
                    THC {strain.thc_max}%
                  </Text>
                  <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 11 }}>
                    {strain.difficulty}
                  </Text>
                  <Text style={{ color: C.greenDim, fontFamily: SANS_MED, fontSize: 11 }}>
                    TAP TO GROW →
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {seeds.length === 0 && !loading && (
            <View style={{ alignItems: "center", paddingTop: 32 }}>
              <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 13, textAlign: "center" }}>
                Couldn't load seeds — check your connection{"\n"}or search manually below.
              </Text>
            </View>
          )}

          {/* Search escape hatch */}
          <TouchableOpacity
            onPress={onSearchAll}
            style={{
              marginTop: 8,
              backgroundColor: C.surface,
              borderRadius: 12, borderWidth: 1, borderColor: C.border,
              padding: 14, alignItems: "center",
            }}>
            <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 15, letterSpacing: 1 }}>
              🔍  SEARCH ALL 5,042 STRAINS
            </Text>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 3 }}>
              Browse the full library manually
            </Text>
          </TouchableOpacity>

        </ScrollView>
      )}
    </View>
  );
}
