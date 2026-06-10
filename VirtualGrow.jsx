/**
 * VirtualGrow.jsx
 * VYWEED Virtual Grow Game
 *
 * - Strain of the Day (seeded daily, difficulty-weighted)
 * - Day scrubber — swipe right to advance, left to rewind
 * - Algorithm drives what happens each day
 * - Shelve to earn a trophy when harvest is reached
 * - Trophy collection with metal tiers
 *
 * No API needed for scrubbing — algorithm runs client-side description
 * Strain data fetched once from API
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Animated,
  PanResponder, Modal, Platform, Alert, Dimensions,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getWaitSeconds, startTimer, getTimerState,
  applyRollingAd, skipTimer, clearTimer,
  formatSeconds, getWaitFormatted,
} from "./waitTimer";
import { cachedFetch } from "./cache";
import { useAppMode } from "./AppMode";
import { scheduleWaitTimerNotification } from "./notifications";

const { width: SW } = Dimensions.get("window");
import { API_V1 as API_BASE } from "./apiConfig";
const MONO = Platform.select({ ios: "Courier New", android: "monospace" });

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
  purple:     "#c084fc",
  white:      "#e8f0e8",
  grey:       "#4a5a4a",
  greyLight:  "#8a9a8a",
};

// ── Metal tiers ───────────────────────────────────────────────────────────────
const METALS = {
  bronze:  { label: "Bronze",  icon: "🥉", colour: "#cd7f32", glow: "#3d2000" },
  silver:  { label: "Silver",  icon: "🥈", colour: "#c0c0c0", glow: "#1a1a2a" },
  gold:    { label: "Gold",    icon: "🥇", colour: "#ffd700", glow: "#2a1a00" },
  diamond: { label: "Diamond", icon: "💎", colour: "#b9f2ff", glow: "#001a2a" },
};

function getMetal(difficulty, tier) {
  if (tier === "T1") return "diamond";
  if (difficulty === "advanced") return "gold";
  if (difficulty === "intermediate") return "silver";
  return "bronze";
}

// ── Seed-based daily strain picker ───────────────────────────────────────────
function getDailyStrain(strains) {
  // Seed based on today's date — same strain all day, changes at midnight
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  // Weighted selection: T1 rare (2%), T2 uncommon (8%), T3 common (30%), T4 most common (60%)
  const weights = { T1: 2, T2: 8, T3: 30, T4: 60 };
  const pool = strains.filter(s => weights[s.tier] > 0);
  // Seeded random
  let hash = seed;
  const rand = () => {
    hash = ((hash << 5) - hash + 7919) & 0x7fffffff;
    return (hash & 0x7fffffff) / 0x7fffffff;
  };
  // Pick tier first by weight
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let tierRoll = rand() * totalWeight;
  let chosenTier = "T4";
  for (const [tier, w] of Object.entries(weights)) {
    tierRoll -= w;
    if (tierRoll <= 0) { chosenTier = tier; break; }
  }
  const tierPool = pool.filter(s => s.tier === chosenTier);
  const idx = Math.floor(rand() * tierPool.length);
  return tierPool[idx] || pool[Math.floor(rand() * pool.length)];
}

// ── Day description generator ─────────────────────────────────────────────────
// Generates vivid text for each day without needing the full algorithm
function getDayDescription(day, strain) {
  const fw = strain?.flower_wk_max || 9;
  const totalDays = (fw + 4) * 7; // veg weeks + flower weeks → days
  const pct = day / totalDays;

  // Stage detection
  let stage, stageDay, stageDesc, visual, smell, tip;

  if (day <= 7) {
    stage = "Seedling";
    stageDay = day;
    stageDesc = "Two tiny seed leaves (cotyledons) have emerged. The plant is drawing on stored energy from the seed.";
    visual = day <= 3
      ? "A pale green sprout with two round seed leaves, barely 2cm tall. Stem is almost translucent."
      : "First true serrated cannabis leaves appearing between the seed leaves. The plant is recognisably cannabis now.";
    smell = "No aroma yet — just fresh green plant smell.";
    tip = "Don't water yet — the seed has enough moisture. Leave it alone.";
  } else if (day <= 28) {
    stage = "Vegetative";
    stageDay = day - 7;
    const vDay = stageDay;
    stageDesc = "The plant is building its structure — stems, branches, and fan leaves. All energy goes into growth.";
    visual = vDay <= 7
      ? `A bushy seedling ${8 + vDay * 2}cm tall with ${3 + vDay} sets of serrated leaves. Deep green, healthy looking.`
      : vDay <= 14
      ? `A proper plant now, ${22 + (vDay - 7) * 3}cm tall. Multiple branches visible. Fan leaves the size of your palm.`
      : `${strain?.name} is establishing its full frame — ${45 + (vDay - 14) * 4}cm of lush green growth. Classic cannabis silhouette.`;
    smell = vDay < 10
      ? "Faint grassy green smell when you brush the leaves."
      : "A distinct earthy, slightly sweet smell when leaves are touched. The terpenes are waking up.";
    tip = vDay < 14
      ? "Water when the top 2cm of soil is dry. Don't rush — let the soil breathe."
      : "This is the time to train — LST (bending branches) now creates a wider canopy and more bud sites later.";
  } else if (day <= 42) {
    stage = "Transition";
    stageDay = day - 28;
    stageDesc = "Light has switched to 12/12. The plant knows autumn is coming. It's preparing to flower.";
    visual = `The plant is STRETCHING — adding ${3 + stageDay * 0.8 | 0}cm every couple of days. White hairs (pistils) are beginning to appear at branch nodes. This is the 'pre-flower' — the first sign of femininity.`;
    smell = "The aroma is intensifying. " + (strain?.aroma?.split(",")[0] || "Earthy tones") + " becoming more noticeable.";
    tip = "The stretch can surprise new growers — some strains double in height during this phase. Make sure you have headroom.";
  } else {
    const flowerDay = day - 42;
    const flowerTotal = fw * 7;
    const flowerPct = flowerDay / flowerTotal;

    if (flowerPct < 0.3) {
      stage = "Early Flower";
      stageDay = flowerDay;
      stageDesc = "Bud sites are forming at every node. White hairs are multiplying. The plant's energy is shifting from growth to reproduction.";
      visual = `Small bud clusters are forming all over the plant. The white pistils (hairs) are dense and bright. You can smell the distinct character of ${strain?.name} developing.`;
      smell = `${strain?.aroma?.split(",").slice(0, 2).join(" and ") || "The characteristic aroma"} is now unmistakable when you enter the room.`;
      tip = "Stop high-stress training now. The plant is committed to flowering. Keep defoliation minimal.";
    } else if (flowerPct < 0.6) {
      stage = "Mid Flower";
      stageDay = flowerDay;
      stageDesc = "Buds are swelling rapidly. This is the most dramatic visual phase — you can almost watch it happening in real time.";
      visual = `Dense bud clusters are stacking on every branch. Trichomes are clearly visible — a frosty shimmer covers the buds and nearby leaves. The ${strain?.type === "S" ? "long sativa" : "compact indica"} buds are taking their characteristic shape.`;
      smell = `The smell is now intense. ${strain?.aroma || "Rich, complex terpenes"} — you'd smell it from outside the room.`;
      tip = "Peak feeding time. Keep EC in range, pH perfect. Any deficiency now directly reduces bud size.";
    } else if (flowerPct < 0.85) {
      stage = "Late Flower";
      stageDay = flowerDay;
      stageDesc = "Buds are hardening and fattening for the final push. Trichomes are clouding over — the plant is at peak THC production.";
      visual = `The buds have a thick, crystalline coating. Under a loupe, trichomes appear cloudy white — peak potency. Fan leaves are starting to yellow as the plant redirects all nutrients into the flowers. The plant looks tired but the buds have never looked better.`;
      smell = `Intense, room-filling ${strain?.aroma?.split(",")[0] || "complex"} aroma. The terpenes are at maximum expression right now.`;
      tip = "Start checking trichomes daily with a loupe. When 70% are cloudy, the harvest window is opening.";
    } else if (flowerPct < 0.92) {
      stage = "Late Flower";
      stageDay = flowerDay;
      stageDesc = "Buds are hardening and fattening for the final push. Trichomes are clouding over — the plant is at peak THC production.";
      visual = `The buds have a thick, crystalline coating. Under a loupe, trichomes appear cloudy white — peak potency. Fan leaves are starting to yellow as the plant redirects all nutrients into the flowers. The plant looks tired but the buds have never looked better.`;
      smell = `Intense, room-filling ${strain?.aroma?.split(",")[0] || "complex"} aroma. The terpenes are at maximum expression right now.`;
      tip = "Start checking trichomes daily with a loupe. When 70% are cloudy, the harvest window is opening.";
    } else {
      // Final 8% of flower time AND last day = Harvest Ready
      stage = flowerPct >= 0.98 ? "Harvest Ready" : "Final Days";
      stageDay = flowerDay;
      stageDesc = flowerPct >= 0.98
        ? "The plant has completed its full life cycle. This is the moment."
        : "The plant is completing its life cycle. Trichomes are transitioning from cloudy to amber. The harvest window is open.";
      visual = flowerPct >= 0.98
        ? `${strain?.name} at absolute peak. A perfect specimen. Buds coated in glistening trichomes, colours shifting to their final expression. This plant gave everything it had.`
        : `A stunning mature ${strain?.name}. Buds are dense, frosted solid. Fan leaves are mostly yellow. Amber trichomes are appearing. The plant is ready.`;
      smell = "The most intense aroma of the entire grow. This is what cannabis is supposed to smell like.";
      tip = flowerPct >= 0.98
        ? "Time to harvest. Press SHELVE to add this plant to your collection."
        : "Flush with plain water now. Check trichomes — harvest when you see the mix of cloudy and amber that suits your preference.";
    }
  }

  return { stage, stageDay, stageDesc, visual, smell, tip, isHarvest: stage === "Harvest Ready" || day >= totalDays };
}

// ── Plant visual (abstract art — placeholder until proper art) ────────────────
function PlantVisual({ day, totalDays, stage, strain, isHarvest, anim }) {
  const pct = Math.min(1, day / totalDays);
  const stageColours = {
    "Seedling":     C.blue,
    "Vegetative":   C.green,
    "Transition":   C.amber,
    "Early Flower": "#ff8c30",
    "Mid Flower":   C.red,
    "Late Flower":  C.purple,
    "Final Days":   "#ff00cc",
    "Harvest Ready": "#ffd700",
  };
  const col = stageColours[stage] || C.green;

  // Abstract plant shape — stem + branches + buds as circles
  const height = 20 + pct * 140; // 20px seedling → 160px full plant
  const budCount = stage === "Seedling" ? 0
    : stage === "Vegetative" ? 0
    : stage === "Transition" ? 2
    : Math.min(12, Math.floor(pct * 20));
  const budSize = stage.includes("Flower") || stage === "Final Days" || isHarvest
    ? 8 + pct * 20
    : 4;

  return (
    <Animated.View style={{
      alignItems: "center", justifyContent: "flex-end",
      height: 200, opacity: anim,
    }}>
      {/* Glow behind plant */}
      <View style={{
        position: "absolute", bottom: 0,
        width: 120, height: 120, borderRadius: 60,
        backgroundColor: `${col}10`,
      }} />

      {/* Buds */}
      <View style={{
        position: "absolute", bottom: height * 0.4,
        flexDirection: "row", flexWrap: "wrap",
        width: 100, justifyContent: "center", gap: 4,
      }}>
        {Array.from({ length: budCount }).map((_, i) => (
          <View key={i} style={{
            width: budSize, height: budSize, borderRadius: budSize / 2,
            backgroundColor: col, opacity: 0.6 + (i % 3) * 0.1,
          }} />
        ))}
      </View>

      {/* Stem */}
      <View style={{
        width: 3, height: height, borderRadius: 2,
        backgroundColor: col, opacity: 0.8,
      }} />

      {/* Leaves along stem */}
      {pct > 0.1 && [0.3, 0.5, 0.7].map((pos, i) => (
        <View key={i} style={{
          position: "absolute",
          bottom: height * pos,
          left: "50%",
          marginLeft: i % 2 === 0 ? 2 : -24,
          width: 20, height: 8, borderRadius: 4,
          backgroundColor: C.green,
          opacity: pct > 0.85 ? 0.3 : 0.7,
          transform: [{ rotate: i % 2 === 0 ? "30deg" : "-30deg" }],
        }} />
      ))}

      {/* Trichome sparkle for late flower */}
      {(stage === "Late Flower" || stage === "Final Days" || isHarvest) && (
        <View style={{
          position: "absolute", bottom: height * 0.3,
          width: 80, height: 60, borderRadius: 8,
          borderWidth: 1, borderColor: `${col}44`,
          backgroundColor: `${col}08`,
        }} />
      )}

      {/* Harvest glow */}
      {isHarvest && (
        <View style={{
          position: "absolute", bottom: 0,
          width: 160, height: 160, borderRadius: 80,
          backgroundColor: "#ffd70010",
          borderWidth: 1, borderColor: "#ffd70030",
        }} />
      )}
    </Animated.View>
  );
}

// ── Shelve animation modal ────────────────────────────────────────────────────
function ShelveModal({ strain, metal, visible, onComplete }) {
  const scaleAnim  = useRef(new Animated.Value(0)).current;
  const glowAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    if (!visible) return;
    scaleAnim.setValue(0);
    glowAnim.setValue(0);
    slideAnim.setValue(60);
    Animated.sequence([
      Animated.delay(300),
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 6, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 40, friction: 8, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  if (!strain || !metal) return null;
  const m = METALS[metal];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)",
        alignItems: "center", justifyContent: "center" }}>

        {/* Terrarium case */}
        <Animated.View style={{
          transform: [{ scale: scaleAnim }],
          alignItems: "center",
        }}>
          {/* Glass dome */}
          <View style={{
            width: 200, height: 220,
            borderRadius: 100,
            backgroundColor: `${m.colour}08`,
            borderWidth: 2, borderColor: `${m.colour}44`,
            alignItems: "center", justifyContent: "center",
            marginBottom: -20,
          }}>
            {/* Plant inside */}
            <Text style={{ fontSize: 60, marginBottom: 10 }}>🌿</Text>
            <Animated.View style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: 100,
              backgroundColor: `${m.colour}0a`,
              opacity: glowAnim,
            }} />
          </View>

          {/* Base plaque */}
          <Animated.View style={{
            transform: [{ translateY: slideAnim }],
            backgroundColor: m.colour,
            borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10,
            alignItems: "center", width: 220,
            shadowColor: m.colour, shadowOpacity: 0.8, shadowRadius: 12,
            elevation: 10,
          }}>
            <Text style={{ fontSize: 20 }}>{m.icon}</Text>
            <Text style={{ color: "#000", fontFamily: MONO,
              fontSize: 14, fontWeight: "bold", marginTop: 4 }}>
              {strain.name}
            </Text>
            <Text style={{ color: "#00000088", fontFamily: MONO, fontSize: 10 }}>
              {m.label.toUpperCase()} TROPHY
            </Text>
          </Animated.View>
        </Animated.View>

        <Animated.View style={{ marginTop: 40, opacity: glowAnim, alignItems: "center" }}>
          <Text style={{ color: m.colour, fontFamily: MONO,
            fontSize: 18, fontWeight: "bold", letterSpacing: 2 }}>
            SHELVED
          </Text>
          <Text style={{ color: C.greyLight, fontFamily: MONO,
            fontSize: 12, marginTop: 6, textAlign: "center" }}>
            {strain.name} has been added{"\n"}to your collection
          </Text>

          <TouchableOpacity onPress={onComplete}
            style={{
              marginTop: 24, backgroundColor: C.greenFaint,
              borderWidth: 1, borderColor: C.green, borderRadius: 8,
              paddingHorizontal: 32, paddingVertical: 12,
            }}>
            <Text style={{ color: C.green, fontFamily: MONO,
              fontSize: 14, fontWeight: "bold" }}>
              VIEW COLLECTION →
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Trophy collection screen ──────────────────────────────────────────────────
function TrophyCollection({ trophies, onBack }) {
  const total = trophies.length;
  const byMetal = {
    diamond: trophies.filter(t => t.metal === "diamond"),
    gold:    trophies.filter(t => t.metal === "gold"),
    silver:  trophies.filter(t => t.metal === "silver"),
    bronze:  trophies.filter(t => t.metal === "bronze"),
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 16 : 52,
        paddingBottom: 14, borderBottomWidth: 1, borderColor: C.border }}>
        <TouchableOpacity onPress={onBack} style={{ marginBottom: 8 }}>
          <Text style={{ color: C.green, fontFamily: MONO, fontSize: 14 }}>← BACK</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", justifyContent: "space-between",
          alignItems: "flex-end" }}>
          <View>
            <Text style={{ color: C.white, fontFamily: MONO,
              fontSize: 22, fontWeight: "900", letterSpacing: 2 }}>
              VY<Text style={{ color: C.green }}>WEED</Text>
            </Text>
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
              letterSpacing: 1.5 }}>TROPHY COLLECTION</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: C.green, fontFamily: MONO,
              fontSize: 32, fontWeight: "bold" }}>
              {total}
            </Text>
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
              / 5,042
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={{ height: 4, backgroundColor: C.border,
          borderRadius: 2, marginTop: 10, overflow: "hidden" }}>
          <View style={{
            width: `${(total / 5042) * 100}%`,
            height: 4, backgroundColor: C.green, borderRadius: 2,
          }} />
        </View>
        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9, marginTop: 4 }}>
          {(total / 5042 * 100).toFixed(2)}% COMPLETE
        </Text>
      </View>

      {/* Metal breakdown */}
      <View style={{ flexDirection: "row", padding: 12, gap: 8 }}>
        {Object.entries(METALS).reverse().map(([key, m]) => (
          <View key={key} style={{ flex: 1, backgroundColor: C.card,
            borderRadius: 8, borderWidth: 1, borderColor: `${m.colour}44`,
            padding: 10, alignItems: "center" }}>
            <Text style={{ fontSize: 20 }}>{m.icon}</Text>
            <Text style={{ color: m.colour, fontFamily: MONO,
              fontSize: 18, fontWeight: "bold" }}>
              {byMetal[key].length}
            </Text>
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9 }}>
              {m.label.toUpperCase()}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {total === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Text style={{ fontSize: 48 }}>🏆</Text>
            <Text style={{ color: C.green, fontFamily: MONO,
              fontSize: 16, fontWeight: "bold", marginTop: 16 }}>
              NO TROPHIES YET
            </Text>
            <Text style={{ color: C.grey, fontFamily: MONO,
              fontSize: 12, marginTop: 8, textAlign: "center", lineHeight: 18 }}>
              Complete your first virtual grow{"\n"}to earn your first trophy.
            </Text>
          </View>
        ) : (
          Object.entries(METALS).reverse().map(([key, m]) => {
            const list = byMetal[key];
            if (list.length === 0) return null;
            return (
              <View key={key} style={{ marginBottom: 20 }}>
                <View style={{ flexDirection: "row", alignItems: "center",
                  gap: 8, marginBottom: 10 }}>
                  <Text style={{ fontSize: 18 }}>{m.icon}</Text>
                  <Text style={{ color: m.colour, fontFamily: MONO,
                    fontSize: 13, fontWeight: "bold" }}>
                    {m.label.toUpperCase()} ({list.length})
                  </Text>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {list.map((trophy, i) => (
                    <View key={i} style={{
                      backgroundColor: C.card, borderRadius: 8,
                      borderWidth: 1, borderColor: `${m.colour}44`,
                      padding: 10, width: (SW - 40) / 2 - 4,
                      alignItems: "center",
                    }}>
                      <Text style={{ fontSize: 28 }}>🌿</Text>
                      <Text style={{ color: m.colour, fontFamily: MONO,
                        fontSize: 11, fontWeight: "bold", marginTop: 6,
                        textAlign: "center" }} numberOfLines={2}>
                        {trophy.strainName}
                      </Text>
                      <Text style={{ color: C.grey, fontFamily: MONO,
                        fontSize: 9, marginTop: 4 }}>
                        {trophy.tier} · {new Date(trophy.earnedAt).toLocaleDateString()}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ── Main Virtual Grow Screen ──────────────────────────────────────────────────
export default function VirtualGrow() {
  const [screen, setScreen]         = useState("main");
  const [strain, setStrain]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [day, setDay]               = useState(1);
  const [trophies, setTrophies]     = useState([]);
  const [showShelve, setShowShelve] = useState(false);
  const [alreadyShelved, setAlreadyShelved] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [timerActive, setTimerActive]       = useState(false);
  const timerRef = useRef(null);
  const { isIRL } = useAppMode();
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem("vyweed_trophies")
      .then(raw => { if (raw) setTrophies(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    checkTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const checkTimer = async () => {
    const state = await getTimerState();
    if (state && !state.isComplete) {
      setTimerActive(true);
      startCountdown(state.remaining);
    } else {
      setTimerActive(false);
      if (state?.isComplete) clearTimer();
    }
  };

  const startCountdown = (seconds) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRemaining(seconds);
    timerRef.current = setInterval(() => {
      setTimerRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setTimerActive(false);
          clearTimer();
          loadNextStrain();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const loadNextStrain = () => {
    setLoading(true);
    setDay(1);
    cachedFetch(`${API_BASE}/search?per_page=200&sort=name`)
      .then(result => {
        const strains = result.data?.results || [];
        if (strains.length > 0) {
          const earned = new Set(trophies.map(t => t.strainId));
          const available = strains.filter(s => !earned.has(s.id));
          const pool = available.length > 0 ? available : strains;
          setStrain(getDailyStrain(pool));
          setAlreadyShelved(false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // Load today's strain
  useEffect(() => {
    cachedFetch(`${API_BASE}/search?per_page=100&sort=name`)
      .then(result => {
        const strains = result.data?.results || [];
        if (strains.length > 0) {
          const daily = getDailyStrain(strains);
          setStrain(daily);
          // Check if already shelved today
          const todayKey = new Date().toISOString().slice(0, 10);
          const alreadyDone = trophies.some(
            t => t.strainId === daily.id && t.date === todayKey
          );
          setAlreadyShelved(alreadyDone);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalDays = strain ? (strain.flower_wk_max + 4) * 7 : 90;
  const description = useMemo(() =>
    strain ? getDayDescription(day, strain) : null,
    [day, strain]
  );

  const metal = strain ? getMetal(strain.difficulty, strain.tier) : "bronze";

  // Swipe handler
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 10,
    onPanResponderRelease: (_, gs) => {
      if (Math.abs(gs.dx) < 20) return;
      const dir = gs.dx > 0 ? -1 : 1;  // swipe right = back, left = forward
      animateDay(dir);
    },
  })).current;

  const animateDay = (direction) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0.3, duration: 80, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    setDay(prev => {
      const next = prev + direction;
      return Math.max(1, Math.min(totalDays, next));
    });
  };

  const saveTrophy = async () => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const trophy = {
      strainId:   strain.id,
      strainName: strain.name,
      tier:       strain.tier,
      metal,
      date:       todayKey,
      earnedAt:   Date.now(),
    };
    const updated = [...trophies, trophy];
    setTrophies(updated);
    await AsyncStorage.setItem("vyweed_trophies", JSON.stringify(updated)).catch(() => {});
    setAlreadyShelved(true);

    // Start the wait timer for the next plant
    const waitSecs = getWaitSeconds(updated.length);
    await startTimer(updated.length);

    // Schedule push notification for when timer completes
    await scheduleWaitTimerNotification(waitSecs, "your next strain").catch(() => {});

    setTimerRemaining(waitSecs);
    setTimerActive(true);
    startCountdown(waitSecs);
  };

  // ── Waiting screen ──────────────────────────────────────────────────────────
  if (timerActive && timerRemaining > 0 && !isIRL) {
    const nextWaitFormatted = formatSeconds(getWaitSeconds(trophies.length + 1));
    const pct = timerRemaining / getWaitSeconds(trophies.length);

    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ paddingHorizontal: 16,
          paddingTop: Platform.OS === "android" ? 16 : 52,
          paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between",
            alignItems: "flex-end" }}>
            <View>
              <Text style={{ color: C.white, fontFamily: MONO,
                fontSize: 22, fontWeight: "900", letterSpacing: 2 }}>
                VY<Text style={{ color: C.green }}>WEED</Text>
              </Text>
              <Text style={{ color: C.greyLight, fontFamily: MONO,
                fontSize: 10, letterSpacing: 1.5 }}>NEXT PLANT GROWING...</Text>
            </View>
            <TouchableOpacity onPress={() => setScreen("collection")}
              style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 24 }}>🏆</Text>
              <Text style={{ color: C.amber, fontFamily: MONO,
                fontSize: 10, fontWeight: "bold" }}>
                {trophies.length}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, alignItems: "center" }}>

          {/* Countdown */}
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Text style={{ color: C.green, fontFamily: MONO,
              fontSize: 64, fontWeight: "bold", letterSpacing: 4 }}>
              {formatSeconds(timerRemaining)}
            </Text>
            <Text style={{ color: C.grey, fontFamily: MONO,
              fontSize: 12, marginTop: 8 }}>
              UNTIL YOUR NEXT PLANT IS READY
            </Text>
          </View>

          {/* Progress bar */}
          <View style={{ width: "100%", marginBottom: 32 }}>
            <View style={{ height: 8, backgroundColor: C.border,
              borderRadius: 4, overflow: "hidden" }}>
              <View style={{ width: `${(1 - pct) * 100}%`,
                height: 8, backgroundColor: C.green, borderRadius: 4 }} />
            </View>
            <Text style={{ color: C.grey, fontFamily: MONO,
              fontSize: 10, marginTop: 6, textAlign: "center" }}>
              Trophy #{trophies.length} earned · Next wait: {getWaitFormatted(trophies.length + 1)}
            </Text>
          </View>

          {/* Rolling ad — halves wait */}
          <TouchableOpacity
            onPress={async () => {
              const result = await applyRollingAd();
              if (result) {
                startCountdown(result.newRemaining);
              }
            }}
            style={{ width: "100%", backgroundColor: "#1a0a00",
              borderRadius: 10, borderWidth: 1, borderColor: C.amber,
              padding: 16, alignItems: "center", marginBottom: 12 }}>
            <Text style={{ color: C.amber, fontFamily: MONO,
              fontSize: 14, fontWeight: "bold" }}>
              📺 WATCH AD — HALVE WAIT
            </Text>
            <Text style={{ color: `${C.amber}88`, fontFamily: MONO,
              fontSize: 11, marginTop: 4 }}>
              Saves {formatSeconds(Math.floor(timerRemaining / 2))}
            </Text>
          </TouchableOpacity>

          {/* Skip entirely */}
          <TouchableOpacity
            onPress={async () => {
              await skipTimer();
              setTimerActive(false);
              setTimerRemaining(0);
              if (timerRef.current) clearInterval(timerRef.current);
              loadNextStrain();
            }}
            style={{ width: "100%", backgroundColor: C.greenFaint,
              borderRadius: 10, borderWidth: 1, borderColor: C.green,
              padding: 16, alignItems: "center", marginBottom: 24 }}>
            <Text style={{ color: C.green, fontFamily: MONO,
              fontSize: 14, fontWeight: "bold" }}>
              🎟 USE TOKEN — SKIP ENTIRELY
            </Text>
            <Text style={{ color: C.greenDim, fontFamily: MONO,
              fontSize: 11, marginTop: 4 }}>
              Saves {formatSeconds(timerRemaining)}
            </Text>
          </TouchableOpacity>

          {/* Trophy count + progress */}
          <View style={{ width: "100%", backgroundColor: C.card,
            borderRadius: 10, borderWidth: 1, borderColor: C.border,
            padding: 16 }}>
            <Text style={{ color: C.greyLight, fontFamily: MONO,
              fontSize: 10, letterSpacing: 1.5, marginBottom: 10 }}>
              YOUR COLLECTION
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between",
              marginBottom: 8 }}>
              <Text style={{ color: C.green, fontFamily: MONO,
                fontSize: 28, fontWeight: "bold" }}>
                {trophies.length}
              </Text>
              <Text style={{ color: C.grey, fontFamily: MONO,
                fontSize: 14, alignSelf: "flex-end" }}>
                / 5,042
              </Text>
            </View>
            <View style={{ height: 4, backgroundColor: C.border,
              borderRadius: 2, overflow: "hidden" }}>
              <View style={{ width: `${(trophies.length / 5042) * 100}%`,
                height: 4, backgroundColor: C.green, borderRadius: 2 }} />
            </View>
            <Text style={{ color: C.grey, fontFamily: MONO,
              fontSize: 10, marginTop: 6 }}>
              {(trophies.length / 5042 * 100).toFixed(2)}% COMPLETE
            </Text>
          </View>

          {/* Wait curve info */}
          <View style={{ width: "100%", backgroundColor: C.surface,
            borderRadius: 8, borderWidth: 1, borderColor: C.border,
            padding: 14, marginTop: 12 }}>
            <Text style={{ color: C.greyLight, fontFamily: MONO,
              fontSize: 10, letterSpacing: 1.5, marginBottom: 8 }}>
              WAIT TIME CURVE
            </Text>
            {[
              [1, 50, 100, 250, 500, 920],
            ][0].map(n => (
              <View key={n} style={{ flexDirection: "row",
                justifyContent: "space-between", paddingVertical: 4,
                borderBottomWidth: 1, borderColor: C.border }}>
                <Text style={{ color: trophies.length >= n ? C.green : C.grey,
                  fontFamily: MONO, fontSize: 11 }}>
                  Trophy {n}
                </Text>
                <Text style={{ color: trophies.length >= n ? C.green : C.grey,
                  fontFamily: MONO, fontSize: 11, fontWeight: "bold" }}>
                  {getWaitFormatted(n)} wait
                </Text>
              </View>
            ))}
            <View style={{ flexDirection: "row", justifyContent: "space-between",
              paddingVertical: 4 }}>
              <Text style={{ color: C.amber, fontFamily: MONO, fontSize: 11 }}>
                Trophy 920+
              </Text>
              <Text style={{ color: C.amber, fontFamily: MONO,
                fontSize: 11, fontWeight: "bold" }}>
                4h max wait
              </Text>
            </View>
          </View>

        </ScrollView>
      </View>
    );
  }

  if (screen === "collection") {
    return <TrophyCollection trophies={trophies} onBack={() => setScreen("main")} />;
  }

  if (loading || !strain) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.green} size="large" />
        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 12, marginTop: 12 }}>
          SELECTING TODAY'S STRAIN...
        </Text>
      </View>
    );
  }

  const m = METALS[metal];
  const progressPct = (day / totalDays) * 100;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 16 : 52,
        paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between",
          alignItems: "flex-end" }}>
          <View>
            <Text style={{ color: C.white, fontFamily: MONO,
              fontSize: 22, fontWeight: "900", letterSpacing: 2 }}>
              VY<Text style={{ color: C.green }}>WEED</Text>
            </Text>
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
              letterSpacing: 1.5 }}>{isIRL ? 'GROW REFERENCE' : 'STRAIN OF THE DAY'}</Text>
          </View>
          <TouchableOpacity onPress={() => setScreen("collection")}
            style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 24 }}>🏆</Text>
            <Text style={{ color: C.amber, fontFamily: MONO, fontSize: 10,
              fontWeight: "bold" }}>
              {trophies.length}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Strain name + metal */}
        <View style={{ flexDirection: "row", alignItems: "center",
          gap: 8, marginTop: 8 }}>
          <Text style={{ fontSize: 16 }}>{m.icon}</Text>
          <Text style={{ color: m.colour, fontFamily: MONO,
            fontSize: 18, fontWeight: "bold", flex: 1 }}>
            {strain.name}
          </Text>
          <View style={{ backgroundColor: `${m.colour}22`, borderRadius: 6,
            borderWidth: 1, borderColor: m.colour,
            paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: m.colour, fontFamily: MONO,
              fontSize: 10, fontWeight: "bold" }}>
              {m.label.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Progress bar + day counter */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between",
            marginBottom: 6 }}>
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
              DAY 1
            </Text>
            <Text style={{
              color: description?.isHarvest ? "#ffd700" : C.green,
              fontFamily: MONO, fontSize: 14, fontWeight: "bold",
              textShadowColor: description?.isHarvest ? "#ffd70088" : `${C.green}88`,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 6,
            }}>
              DAY {day} — {description?.stage?.toUpperCase()}
            </Text>
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
              DAY {totalDays}
            </Text>
          </View>
          <View style={{ height: 6, backgroundColor: C.border,
            borderRadius: 3, overflow: "hidden" }}>
            <View style={{
              width: `${progressPct}%`, height: 6,
              backgroundColor: description?.isHarvest ? "#ffd700" : C.green,
              borderRadius: 3,
            }} />
          </View>
        </View>

        {/* Plant visual */}
        <View style={{ alignItems: "center", paddingVertical: 16 }}
          {...panResponder.panHandlers}>
          <Animated.View style={{ opacity: fadeAnim }}>
            <PlantVisual
              day={day}
              totalDays={totalDays}
              stage={description?.stage || "Seedling"}
              strain={strain}
              isHarvest={description?.isHarvest}
              anim={fadeAnim}
            />
          </Animated.View>

          {/* Swipe hint */}
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10,
            marginTop: 8, letterSpacing: 1 }}>
            ← SWIPE LEFT FOR TOMORROW · SWIPE RIGHT FOR YESTERDAY →
          </Text>
        </View>

        {/* Day navigation buttons */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 12 }}>
          <TouchableOpacity onPress={() => animateDay(-1)}
            disabled={day <= 1}
            style={{ flex: 1, backgroundColor: C.surface, borderRadius: 8,
              borderWidth: 1, borderColor: day <= 1 ? C.border : C.green,
              paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ color: day <= 1 ? C.grey : C.green,
              fontFamily: MONO, fontSize: 16, fontWeight: "bold" }}>
              ← YESTERDAY
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => animateDay(1)}
            disabled={day >= totalDays}
            style={{ flex: 1, backgroundColor: day >= totalDays ? C.greenFaint : C.surface,
              borderRadius: 8, borderWidth: 1,
              borderColor: day >= totalDays ? "#ffd700" : C.green,
              paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ color: day >= totalDays ? "#ffd700" : C.green,
              fontFamily: MONO, fontSize: 16, fontWeight: "bold" }}>
              {day >= totalDays ? "HARVEST ★" : "TOMORROW →"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Day description */}
        {description && (
          <>
            <ScrollView
              style={{ maxHeight: 260, marginHorizontal: 16, marginBottom: 6 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {/* Visual description */}
              <View style={{ backgroundColor: C.card,
                borderRadius: 8, borderWidth: 1, borderColor: C.border,
                borderLeftWidth: 3, borderLeftColor: METALS[metal].colour,
                padding: 14, marginBottom: 10 }}>
                <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                  letterSpacing: 1.5, marginBottom: 6 }}>👁 WHAT YOU SEE</Text>
                <Text style={{ color: C.white, fontFamily: MONO,
                  fontSize: 13, lineHeight: 20 }}>
                  {description.visual}
                </Text>
              </View>

              {/* Smell */}
              <View style={{ backgroundColor: C.card,
                borderRadius: 8, borderWidth: 1, borderColor: C.border,
                padding: 14, marginBottom: 10 }}>
                <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                  letterSpacing: 1.5, marginBottom: 6 }}>👃 WHAT YOU SMELL</Text>
                <Text style={{ color: C.purple, fontFamily: MONO,
                  fontSize: 13, lineHeight: 20 }}>
                  {description.smell}
                </Text>
              </View>

              {/* What's happening */}
              <View style={{ backgroundColor: C.card,
                borderRadius: 8, borderWidth: 1, borderColor: C.border,
                padding: 14, marginBottom: 10 }}>
                <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                  letterSpacing: 1.5, marginBottom: 6 }}>🌱 WHAT'S HAPPENING</Text>
                <Text style={{ color: C.greyLight, fontFamily: MONO,
                  fontSize: 12, lineHeight: 19 }}>
                  {description.stageDesc}
                </Text>
              </View>

              {/* Grower tip */}
              <View style={{ backgroundColor: C.greenFaint,
                borderRadius: 8, borderWidth: 1, borderColor: C.greenDim,
                padding: 14, marginBottom: 6 }}>
                <Text style={{ color: C.greenDim, fontFamily: MONO, fontSize: 10,
                  letterSpacing: 1.5, marginBottom: 6 }}>💡 IF THIS WERE REAL</Text>
                <Text style={{ color: C.white, fontFamily: MONO,
                  fontSize: 12, lineHeight: 19 }}>
                  {description.tip}
                </Text>
              </View>
            </ScrollView>

            {/* Shelve button — only at harvest */}
            {description.isHarvest && !alreadyShelved && (
              <TouchableOpacity onPress={() => setShowShelve(true)}
                style={{ marginHorizontal: 16, backgroundColor: `${m.colour}22`,
                  borderRadius: 10, borderWidth: 2, borderColor: m.colour,
                  padding: 18, alignItems: "center", marginBottom: 16 }}>
                <Text style={{ fontSize: 24 }}>🏆</Text>
                <Text style={{ color: m.colour, fontFamily: MONO,
                  fontSize: 18, fontWeight: "bold", marginTop: 6, letterSpacing: 2 }}>
                  SHELVE
                </Text>
                <Text style={{ color: `${m.colour}88`, fontFamily: MONO,
                  fontSize: 11, marginTop: 4 }}>
                  Add {strain.name} to your collection
                </Text>
              </TouchableOpacity>
            )}

            {description.isHarvest && alreadyShelved && (
              <View style={{ marginHorizontal: 16, backgroundColor: C.greenFaint,
                borderRadius: 8, padding: 14, alignItems: "center", marginBottom: 16 }}>
                <Text style={{ color: C.green, fontFamily: MONO,
                  fontSize: 13, fontWeight: "bold" }}>
                  ✓ ALREADY IN YOUR COLLECTION
                </Text>
              </View>
            )}

            {/* Strain info */}
            <View style={{ marginHorizontal: 16, backgroundColor: C.surface,
              borderRadius: 8, borderWidth: 1, borderColor: C.border,
              padding: 14 }}>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 8 }}>STRAIN INFO</Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {[
                  { l: "THC", v: `${strain.thc_max}%`, c: C.red },
                  { l: "TYPE", v: strain.type === "I" ? "INDICA" : strain.type === "S" ? "SATIVA" : "HYBRID", c: C.blue },
                  { l: "FLOWER", v: `${strain.flower_wk_max}WK`, c: C.amber },
                  { l: "TIER", v: strain.tier, c: m.colour },
                ].map(({ l, v, c }) => (
                  <View key={l} style={{ backgroundColor: C.card, borderRadius: 6,
                    borderWidth: 1, borderColor: C.border, padding: 8,
                    alignItems: "center", minWidth: 70 }}>
                    <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9 }}>{l}</Text>
                    <Text style={{ color: c, fontFamily: MONO,
                      fontSize: 13, fontWeight: "bold" }}>{v}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11,
                marginTop: 10, lineHeight: 17 }}>
                {strain.aroma}
              </Text>
            </View>

          </>
        )}
      </ScrollView>

      {/* Shelve animation modal */}
      <ShelveModal
        strain={strain}
        metal={metal}
        visible={showShelve}
        onComplete={() => {
          saveTrophy();
          setShowShelve(false);
          setScreen("collection");
        }}
      />
    </View>
  );
}
