/**
 * VirtualGrow.jsx
 * VYWEED Virtual Grow Game
 *
 * - Strain of the Day (seeded daily, difficulty-weighted)
 * - Day scrubber — swipe to advance/rewind through the life cycle
 * - Glassmorphic gacha aesthetic
 * - Shelve to earn a trophy when harvest is reached
 * - Trophy collection with metal tiers
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, Animated,
  PanResponder, Modal, Platform, Alert, Dimensions, StatusBar,
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

const HEADING   = "BebasNeue_400Regular";
const SANS      = "SpaceGrotesk_400Regular";
const SANS_MED  = "SpaceGrotesk_500Medium";
const SANS_BOLD = "SpaceGrotesk_700Bold";
const MONO      = SANS;

// ── Glassmorphic dark palette ─────────────────────────────────────────────────
const C = {
  bg:          "#0B0D0C",
  surface:     "rgba(255,255,255,0.04)",
  card:        "rgba(255,255,255,0.03)",
  border:      "rgba(255,255,255,0.08)",
  borderFaint: "rgba(255,255,255,0.05)",
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

// ── Stage glyphs + colours ─────────────────────────────────────────────────────
const STAGE_GLYPH = {
  "Seedling":     "🌱",
  "Vegetative":   "🌿",
  "Transition":   "🌸",
  "Early Flower": "🌸",
  "Mid Flower":   "💐",
  "Late Flower":  "💐",
  "Final Days":   "✂️",
  "Harvest Ready":"✂️",
};

const STAGE_COLOUR = {
  "Seedling":     "#5b9bd5",
  "Vegetative":   "#3dffa0",
  "Transition":   "#c17a4a",
  "Early Flower": "#e0834a",
  "Mid Flower":   "#e0834a",
  "Late Flower":  "#c8b4e8",
  "Final Days":   "#ffd700",
  "Harvest Ready":"#ffd700",
};

// ── Metal tiers ────────────────────────────────────────────────────────────────
const METALS = {
  bronze:  { label: "Bronze",  rarity: "Common",    icon: "🥉", colour: "#cd7f32" },
  silver:  { label: "Silver",  rarity: "Uncommon",  icon: "🥈", colour: "#b8c0cc" },
  gold:    { label: "Gold",    rarity: "Rare",       icon: "🥇", colour: "#ffd700" },
  diamond: { label: "Diamond", rarity: "Legendary",  icon: "💎", colour: "#7af6ff" },
};

function getMetal(difficulty, tier) {
  if (tier === "T1") return "diamond";
  if (difficulty === "advanced") return "gold";
  if (difficulty === "intermediate") return "silver";
  return "bronze";
}

// ── Gacha strain pull — weighted random, new result every time ────────────────
function getRandomStrain(strains) {
  const weights = { T1: 2, T2: 8, T3: 30, T4: 60 };
  const pool = strains.filter(s => weights[s.tier] > 0);
  if (!pool.length) return strains[0];
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let tierRoll = Math.random() * totalWeight;
  let chosenTier = "T4";
  for (const [tier, w] of Object.entries(weights)) {
    tierRoll -= w;
    if (tierRoll <= 0) { chosenTier = tier; break; }
  }
  const tierPool = pool.filter(s => s.tier === chosenTier);
  if (!tierPool.length) return pool[Math.floor(Math.random() * pool.length)];
  return tierPool[Math.floor(Math.random() * tierPool.length)];
}

// ── Day description generator ──────────────────────────────────────────────────
function getDayDescription(day, strain) {
  const fw = strain?.flower_wk_max || 9;
  const totalDays = (fw + 4) * 7;
  const pct = day / totalDays;

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
    } else if (flowerPct < 0.92) {
      stage = "Late Flower";
      stageDay = flowerDay;
      stageDesc = "Buds are hardening and fattening for the final push. Trichomes are clouding over — the plant is at peak THC production.";
      visual = `The buds have a thick, crystalline coating. Under a loupe, trichomes appear cloudy white — peak potency. Fan leaves are starting to yellow as the plant redirects all nutrients into the flowers. The plant looks tired but the buds have never looked better.`;
      smell = `Intense, room-filling ${strain?.aroma?.split(",")[0] || "complex"} aroma. The terpenes are at maximum expression right now.`;
      tip = "Start checking trichomes daily with a loupe. When 70% are cloudy, the harvest window is opening.";
    } else {
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

// ── Inline timer hero (replaces plant visual while waiting for next pull) ─────
function TimerHero({ remaining, totalWait, onSkipAd, onSkipToken }) {
  const pct     = Math.max(0, 1 - remaining / Math.max(totalWait, 1));
  const glowCol = C.amber;

  return (
    <View style={{ alignItems: "center", justifyContent: "center", height: 240 }}>
      {/* Outer glow ring */}
      <View style={{
        position: "absolute",
        width: 220, height: 220, borderRadius: 110,
        backgroundColor: `${glowCol}08`,
        borderWidth: 1, borderColor: `${glowCol}22`,
      }} />
      <View style={{
        position: "absolute",
        width: 140, height: 140, borderRadius: 70,
        backgroundColor: `${glowCol}12`,
      }} />

      {/* HUD corners */}
      {[
        { top: 14, left: SW * 0.18, borderTopWidth: 1, borderLeftWidth: 1 },
        { top: 14, right: SW * 0.18, borderTopWidth: 1, borderRightWidth: 1 },
        { bottom: 14, left: SW * 0.18, borderBottomWidth: 1, borderLeftWidth: 1 },
        { bottom: 14, right: SW * 0.18, borderBottomWidth: 1, borderRightWidth: 1 },
      ].map((s, i) => (
        <View key={i} style={{ position: "absolute", width: 18, height: 18, borderColor: `${glowCol}50`, ...s }} />
      ))}

      {/* Progress arc — thin bar underneath countdown */}
      <View style={{
        width: 180, height: 3, backgroundColor: C.border,
        borderRadius: 2, overflow: "hidden", position: "absolute", bottom: 38,
      }}>
        <View style={{ width: `${pct * 100}%`, height: 3, backgroundColor: glowCol, borderRadius: 2 }} />
      </View>

      {/* Countdown */}
      <Text style={{
        color: glowCol, fontFamily: HEADING, fontSize: 52, letterSpacing: 4, lineHeight: 54,
        textShadowColor: `${glowCol}70`, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 16,
      }}>
        {formatSeconds(remaining)}
      </Text>
      <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 10, marginTop: 6, letterSpacing: 2 }}>
        UNTIL NEXT PULL
      </Text>

      {/* Skip buttons — sit inside the hero */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
        <TouchableOpacity onPress={onSkipAd} style={{
          backgroundColor: "rgba(193,122,74,0.12)",
          borderRadius: 10, borderWidth: 1, borderColor: `${C.amber}70`,
          paddingHorizontal: 16, paddingVertical: 10, alignItems: "center",
        }}>
          <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 16, letterSpacing: 1 }}>📺 AD SKIP</Text>
          <Text style={{ color: `${C.amber}80`, fontFamily: SANS, fontSize: 9, marginTop: 1 }}>30s unskippable</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onSkipToken} style={{
          backgroundColor: C.greenFaint,
          borderRadius: 10, borderWidth: 1, borderColor: C.greenDim,
          paddingHorizontal: 16, paddingVertical: 10, alignItems: "center",
        }}>
          <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 16, letterSpacing: 1 }}>🎟 TOKEN</Text>
          <Text style={{ color: C.greenDim, fontFamily: SANS, fontSize: 9, marginTop: 1 }}>skip entirely</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Plant visual (stage glyph + glow rings + HUD brackets) ───────────────────
function PlantVisual({ day, totalDays, stage, strain, isHarvest, anim }) {
  const pct = Math.min(1, day / totalDays);
  const col = STAGE_COLOUR[stage] || C.green;
  const glyph = STAGE_GLYPH[stage] || "🌱";
  const plantSize = Math.min(120, 44 + pct * 82);
  const glowSize  = plantSize * 2.8;

  return (
    <Animated.View style={{ alignItems: "center", justifyContent: "center", height: 240, opacity: anim }}>
      {/* Outer glow ring */}
      <View style={{
        position: "absolute",
        width: glowSize, height: glowSize, borderRadius: glowSize / 2,
        backgroundColor: `${col}0d`,
        borderWidth: 1, borderColor: `${col}22`,
      }} />
      {/* Inner glow */}
      <View style={{
        position: "absolute",
        width: glowSize * 0.58, height: glowSize * 0.58, borderRadius: glowSize / 2,
        backgroundColor: `${col}18`,
      }} />
      {/* HUD corners */}
      {[
        { top: 14,  left: SW * 0.18,  borderTopWidth: 1,    borderLeftWidth: 1 },
        { top: 14,  right: SW * 0.18, borderTopWidth: 1,    borderRightWidth: 1 },
        { bottom: 14, left: SW * 0.18,  borderBottomWidth: 1, borderLeftWidth: 1 },
        { bottom: 14, right: SW * 0.18, borderBottomWidth: 1, borderRightWidth: 1 },
      ].map((s, i) => (
        <View key={i} style={{ position: "absolute", width: 18, height: 18, borderColor: `${col}50`, ...s }} />
      ))}
      {/* Plant emoji */}
      <Text style={{ fontSize: plantSize, textAlign: "center" }}>{glyph}</Text>
    </Animated.View>
  );
}

// ── Shelve animation modal ────────────────────────────────────────────────────
function ShelveModal({ strain, metal, visible, onComplete, onSkipAd }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    if (!visible) return;
    scaleAnim.setValue(0);
    glowAnim.setValue(0);
    slideAnim.setValue(60);
    Animated.sequence([
      Animated.delay(300),
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 6, useNativeDriver: true }),
      Animated.timing(glowAnim,  { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 40, friction: 8, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  if (!strain || !metal) return null;
  const m = METALS[metal];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: "center" }}>
          {/* Glass dome */}
          <View style={{
            width: 200, height: 220, borderRadius: 100,
            backgroundColor: `${m.colour}08`,
            borderWidth: 1.5, borderColor: `${m.colour}44`,
            alignItems: "center", justifyContent: "center", marginBottom: -20,
          }}>
            <Text style={{ fontSize: 60, marginBottom: 10 }}>🌿</Text>
            <Animated.View style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: 100, backgroundColor: `${m.colour}0c`, opacity: glowAnim,
            }} />
          </View>

          {/* Base plaque */}
          <Animated.View style={{
            transform: [{ translateY: slideAnim }],
            backgroundColor: m.colour,
            borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12,
            alignItems: "center", width: 220,
            shadowColor: m.colour, shadowOpacity: 0.7, shadowRadius: 16, elevation: 12,
          }}>
            <Text style={{ fontSize: 22 }}>{m.icon}</Text>
            <Text style={{ color: "#000", fontFamily: HEADING, fontSize: 20, marginTop: 4, letterSpacing: 1 }}>
              {strain.name}
            </Text>
            <Text style={{ color: "#00000066", fontFamily: SANS, fontSize: 10 }}>
              {m.rarity.toUpperCase()} TROPHY
            </Text>
          </Animated.View>
        </Animated.View>

        <Animated.View style={{ marginTop: 44, opacity: glowAnim, alignItems: "center", paddingHorizontal: 24 }}>
          <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 32, letterSpacing: 4 }}>
            SHELVED
          </Text>
          <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 20 }}>
            {strain.name} has been added{"\n"}to your collection
          </Text>

          {/* Primary — skip the wait right now with an ad */}
          <TouchableOpacity onPress={onSkipAd} style={{
            marginTop: 24, width: 280,
            backgroundColor: "rgba(193,122,74,0.12)",
            borderWidth: 1.5, borderColor: `${C.amber}90`, borderRadius: 12,
            paddingVertical: 16, alignItems: "center",
          }}>
            <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 22, letterSpacing: 1 }}>
              📺  SKIP WAIT WITH AD
            </Text>
            <Text style={{ color: `${C.amber}70`, fontFamily: SANS, fontSize: 11, marginTop: 3 }}>
              Watch 30s · unlock your next strain now
            </Text>
          </TouchableOpacity>

          {/* Secondary — start the timer and wait */}
          <TouchableOpacity onPress={onComplete} style={{
            marginTop: 10, width: 280,
            backgroundColor: "rgba(255,255,255,0.03)",
            borderWidth: 1, borderColor: C.border, borderRadius: 12,
            paddingVertical: 14, alignItems: "center",
          }}>
            <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 18, letterSpacing: 1 }}>
              START TIMER →
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Trophy collection screen ──────────────────────────────────────────────────
function TrophyCollection({ trophies, onBack }) {
  const total    = trophies.length;
  const cellSize = Math.floor((SW - 40 - 8) / 2);  // 2-column, 1:1 cells

  const byMetal = {
    diamond: trophies.filter(t => t.metal === "diamond"),
    gold:    trophies.filter(t => t.metal === "gold"),
    silver:  trophies.filter(t => t.metal === "silver"),
    bronze:  trophies.filter(t => t.metal === "bronze"),
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 52,
        paddingBottom: 14, borderBottomWidth: 1, borderColor: C.border,
      }}>
        <TouchableOpacity onPress={onBack} style={{ marginBottom: 10 }}>
          <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 20, letterSpacing: 1 }}>← BACK</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 36, letterSpacing: 3 }}>
              VY<Text style={{ color: C.green }}>WEED</Text>
            </Text>
            <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 10, letterSpacing: 2 }}>
              TROPHY COLLECTION
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 44, lineHeight: 44 }}>
              {total}
            </Text>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 2 }}>
              / 5,042 strains
            </Text>
          </View>
        </View>
        <View style={{ height: 2, backgroundColor: C.border, borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
          <View style={{ width: `${(total / 5042) * 100}%`, height: 2, backgroundColor: C.green, borderRadius: 2 }} />
        </View>
        <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 9, marginTop: 5 }}>
          {(total / 5042 * 100).toFixed(2)}% COMPLETE
        </Text>
      </View>

      {/* Metal breakdown */}
      <View style={{ flexDirection: "row", padding: 12, gap: 8 }}>
        {Object.entries(METALS).reverse().map(([key, m]) => (
          <View key={key} style={{
            flex: 1, backgroundColor: C.card, borderRadius: 12,
            borderWidth: 1, borderColor: `${m.colour}30`,
            padding: 10, alignItems: "center",
          }}>
            <Text style={{ fontSize: 18 }}>{m.icon}</Text>
            <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 26, lineHeight: 28 }}>
              {byMetal[key].length}
            </Text>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 8, letterSpacing: 0.5, marginTop: 1 }}>
              {m.rarity.toUpperCase()}
            </Text>
          </View>
        ))}
      </View>

      {total === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 48 }}>🏆</Text>
          <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 28, marginTop: 16, letterSpacing: 2 }}>
            NO TROPHIES YET
          </Text>
          <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 13, marginTop: 10, textAlign: "center", lineHeight: 20 }}>
            Complete your first virtual grow{"\n"}to earn your first trophy.
          </Text>
        </View>
      ) : (
        <FlatList
          data={trophies}
          keyExtractor={(_, i) => String(i)}
          numColumns={2}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
          renderItem={({ item }) => {
            const m = METALS[item.metal] || METALS.bronze;
            return (
              <View style={{
                width: cellSize, height: cellSize,
                backgroundColor: "rgba(255,255,255,0.02)",
                borderRadius: 12, borderWidth: 1, borderColor: `${m.colour}30`,
                alignItems: "center", justifyContent: "center",
              }}>
                <Text style={{ fontSize: 36 }}>🌿</Text>
                <Text style={{ fontSize: 14 }}>{m.icon}</Text>
                <Text style={{
                  color: m.colour, fontFamily: HEADING, fontSize: 13,
                  marginTop: 6, textAlign: "center", letterSpacing: 0.5, paddingHorizontal: 6,
                }} numberOfLines={2}>
                  {item.strainName}
                </Text>
                <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 8, marginTop: 3 }}>
                  {item.tier} · {new Date(item.earnedAt).toLocaleDateString()}
                </Text>
              </View>
            );
          }}
        />
      )}
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
  const timerRef      = useRef(null);
  const strainsPoolRef = useRef([]);   // holds loaded strains for instant re-rolls
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
    const pool = strainsPoolRef.current;
    if (!pool.length) return;
    setDay(1);
    setStrain(getRandomStrain(pool));
    setAlreadyShelved(false);
  };

  // Load strain pool once on mount, then keep it in memory for instant re-rolls
  useEffect(() => {
    cachedFetch(`${API_BASE}/search?per_page=200&sort=name`)
      .then(result => {
        const strains = result.data?.results || [];
        if (strains.length > 0) {
          strainsPoolRef.current = strains;
          const pulled = getRandomStrain(strains);
          setStrain(pulled);
          setAlreadyShelved(trophies.some(t => t.strainId === pulled.id));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalDays  = strain ? (strain.flower_wk_max + 4) * 7 : 90;
  const description = useMemo(() =>
    strain ? getDayDescription(day, strain) : null,
    [day, strain]
  );
  const metal = strain ? getMetal(strain.difficulty, strain.tier) : "bronze";

  // Swipe handler
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  (_, gs) => Math.abs(gs.dx) > 10,
    onPanResponderRelease: (_, gs) => {
      if (Math.abs(gs.dx) < 20) return;
      const dir = gs.dx > 0 ? -1 : 1;
      animateDay(dir);
    },
  })).current;

  const animateDay = (direction) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0.3, duration: 80,  useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1,   duration: 150, useNativeDriver: true }),
    ]).start();
    setDay(prev => Math.max(1, Math.min(totalDays, prev + direction)));
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

    const waitSecs = getWaitSeconds(updated.length);
    await startTimer(updated.length);
    await scheduleWaitTimerNotification(waitSecs, "your next strain").catch(() => {});

    setTimerRemaining(waitSecs);
    setTimerActive(true);
    startCountdown(waitSecs);
  };

  // ── Waiting screen (full-screen fallback — only when strain pool not loaded) ──
  if (timerActive && timerRemaining > 0 && !isIRL && !strain) {
    const pct = timerRemaining / getWaitSeconds(trophies.length);

    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{
          paddingHorizontal: 16,
          paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 52,
          paddingBottom: 14, borderBottomWidth: 1, borderColor: C.border,
        }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <View>
              <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 36, letterSpacing: 3 }}>
                VY<Text style={{ color: C.green }}>WEED</Text>
              </Text>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 10, letterSpacing: 2 }}>
                NEXT PULL LOADING...
              </Text>
            </View>
            <TouchableOpacity onPress={() => setScreen("collection")} style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 22 }}>🏆</Text>
              <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 18, lineHeight: 20 }}>
                {trophies.length}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, alignItems: "center" }}>
          {/* Big countdown */}
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Text style={{
              color: C.green, fontFamily: HEADING, fontSize: 68, letterSpacing: 6, lineHeight: 74,
              textShadowColor: `${C.green}60`, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18,
            }}>
              {formatSeconds(timerRemaining)}
            </Text>
            <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 11, marginTop: 6, letterSpacing: 2 }}>
              UNTIL YOUR NEXT STRAIN IS READY
            </Text>
          </View>

          {/* Progress bar */}
          <View style={{ width: "100%", marginBottom: 32 }}>
            <View style={{ height: 3, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" }}>
              <View style={{ width: `${(1 - pct) * 100}%`, height: 3, backgroundColor: C.green, borderRadius: 2 }} />
            </View>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 6, textAlign: "center" }}>
              Trophy #{trophies.length} earned · Next wait: {getWaitFormatted(trophies.length + 1)}
            </Text>
          </View>

          {/* Watch ad — full skip */}
          <TouchableOpacity
            onPress={async () => {
              await skipTimer();
              setTimerActive(false);
              setTimerRemaining(0);
              if (timerRef.current) clearInterval(timerRef.current);
              loadNextStrain();
            }}
            style={{
              width: "100%", backgroundColor: "rgba(193,122,74,0.1)",
              borderRadius: 14, borderWidth: 1, borderColor: `${C.amber}80`,
              padding: 18, alignItems: "center", marginBottom: 12,
            }}>
            <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 22, letterSpacing: 1 }}>
              📺  WATCH AD (30s) — SKIP WAIT
            </Text>
            <Text style={{ color: `${C.amber}80`, fontFamily: SANS, fontSize: 12, marginTop: 3 }}>
              Skip {formatSeconds(timerRemaining)} · unskippable ad
            </Text>
          </TouchableOpacity>

          {/* Token skip */}
          <TouchableOpacity
            onPress={async () => {
              await skipTimer();
              setTimerActive(false);
              setTimerRemaining(0);
              if (timerRef.current) clearInterval(timerRef.current);
              loadNextStrain();
            }}
            style={{
              width: "100%", backgroundColor: C.greenFaint,
              borderRadius: 14, borderWidth: 1, borderColor: C.greenDim,
              padding: 18, alignItems: "center", marginBottom: 28,
            }}>
            <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 22, letterSpacing: 1 }}>
              🎟  USE TOKEN — SKIP ENTIRELY
            </Text>
            <Text style={{ color: C.greenDim, fontFamily: SANS, fontSize: 12, marginTop: 3 }}>
              Saves {formatSeconds(timerRemaining)}
            </Text>
          </TouchableOpacity>

          {/* Collection stats */}
          <View style={{
            width: "100%", backgroundColor: C.card,
            borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 18,
          }}>
            <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>
              YOUR COLLECTION
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{
                color: C.green, fontFamily: HEADING, fontSize: 44, lineHeight: 44,
                textShadowColor: `${C.green}50`, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10,
              }}>
                {trophies.length}
              </Text>
              <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 14, alignSelf: "flex-end", marginBottom: 4 }}>
                / 5,042
              </Text>
            </View>
            <View style={{ height: 2, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" }}>
              <View style={{ width: `${(trophies.length / 5042) * 100}%`, height: 2, backgroundColor: C.green }} />
            </View>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 6 }}>
              {(trophies.length / 5042 * 100).toFixed(2)}% COMPLETE
            </Text>
          </View>

          {/* Wait curve */}
          <View style={{
            width: "100%", backgroundColor: C.card,
            borderRadius: 14, borderWidth: 1, borderColor: C.border,
            padding: 16, marginTop: 12,
          }}>
            <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>
              WAIT TIME CURVE
            </Text>
            {[
              { n: "1–4",   label: "First 4 strains", wait: "5 min" },
              { n: "5",     label: "5th strain",       wait: getWaitFormatted(5) },
              { n: "50",    label: "50th strain",      wait: getWaitFormatted(50) },
              { n: "100",   label: "100th strain",     wait: getWaitFormatted(100) },
              { n: "500",   label: "500th strain",     wait: getWaitFormatted(500) },
              { n: "1414+", label: "Max wait",         wait: "4h" },
            ].map(({ n, label, wait }) => (
              <View key={n} style={{
                flexDirection: "row", justifyContent: "space-between",
                paddingVertical: 7, borderBottomWidth: 1, borderColor: C.borderFaint,
              }}>
                <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 11 }}>{label}</Text>
                <Text style={{ color: C.green, fontFamily: SANS_MED, fontSize: 11 }}>{wait}</Text>
              </View>
            ))}
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
        <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 13, marginTop: 14, letterSpacing: 1 }}>
          Rolling your next strain...
        </Text>
      </View>
    );
  }

  const m           = METALS[metal];
  const progressPct = (day / totalDays) * 100;
  const stageCol    = STAGE_COLOUR[description?.stage] || C.green;
  const isHarvest   = description?.isHarvest;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 52,
        paddingBottom: 14, borderBottomWidth: 1, borderColor: C.border,
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 36, letterSpacing: 3 }}>
              VY<Text style={{ color: C.green }}>WEED</Text>
            </Text>
            <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 10, letterSpacing: 2 }}>
              {isIRL ? "GROW REFERENCE" : timerActive && timerRemaining > 0 ? "NEXT PULL LOADING..." : "GACHA GROW"}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setScreen("collection")} style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 22 }}>🏆</Text>
            <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 18, lineHeight: 20 }}>
              {trophies.length}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Strain name + metallic tier badge */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
          <Text style={{ fontSize: 14 }}>{m.icon}</Text>
          <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 26, flex: 1, letterSpacing: 1 }}>
            {strain.name}
          </Text>
          {/* Metallic capsule badge */}
          <View style={{
            backgroundColor: `${m.colour}18`,
            borderRadius: 20,
            borderWidth: 1, borderColor: `${m.colour}60`,
            paddingHorizontal: 12, paddingVertical: 4,
          }}>
            <Text style={{ color: m.colour, fontFamily: SANS_BOLD, fontSize: 10, letterSpacing: 1.5 }}>
              {m.label.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Progress bar + day milestone badge ─────────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10 }}>DAY 1</Text>
            {/* Neon-glow milestone badge */}
            <Text style={{
              color: isHarvest ? "#ffd700" : C.green,
              fontFamily: HEADING, fontSize: 20, letterSpacing: 1,
              textShadowColor: isHarvest ? "#ffd70080" : `${C.green}70`,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 10,
            }}>
              DAY {day} — {description?.stage?.toUpperCase()}
            </Text>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10 }}>DAY {totalDays}</Text>
          </View>
          <View style={{ height: 3, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" }}>
            <View style={{
              width: `${progressPct}%`, height: 3,
              backgroundColor: isHarvest ? "#ffd700" : C.green,
              borderRadius: 2,
              shadowColor: isHarvest ? "#ffd700" : C.green,
              shadowOpacity: 0.8, shadowRadius: 4,
            }} />
          </View>
        </View>

        {/* ── Central plant viewport OR inline timer hero ─────────────────── */}
        {timerActive && timerRemaining > 0 ? (
          <TimerHero
            remaining={timerRemaining}
            totalWait={getWaitSeconds(trophies.length)}
            onSkipAd={async () => {
              await skipTimer();
              setTimerActive(false);
              setTimerRemaining(0);
              if (timerRef.current) clearInterval(timerRef.current);
              loadNextStrain();
            }}
            onSkipToken={async () => {
              await skipTimer();
              setTimerActive(false);
              setTimerRemaining(0);
              if (timerRef.current) clearInterval(timerRef.current);
              loadNextStrain();
            }}
          />
        ) : (
          <View style={{ alignItems: "center", paddingVertical: 4 }} {...panResponder.panHandlers}>
            <Animated.View style={{ opacity: fadeAnim }}>
              <PlantVisual
                day={day}
                totalDays={totalDays}
                stage={description?.stage || "Seedling"}
                strain={strain}
                isHarvest={isHarvest}
                anim={fadeAnim}
              />
            </Animated.View>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 2, letterSpacing: 1 }}>
              SWIPE TO TRAVEL THROUGH TIME
            </Text>
          </View>
        )}

        {/* ── Glass nav buttons (hidden while timer is active) ─────────────── */}
        {!(timerActive && timerRemaining > 0) && (
          <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 16, marginTop: 8 }}>
            <TouchableOpacity onPress={() => animateDay(-1)} disabled={day <= 1}
              style={{
                flex: 1,
                backgroundColor: day <= 1 ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.03)",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: day <= 1 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)",
                paddingVertical: 15, alignItems: "center",
              }}>
              <Text style={{
                color: day <= 1 ? "rgba(255,255,255,0.2)" : C.green,
                fontFamily: HEADING, fontSize: 18, letterSpacing: 1,
              }}>
                ← YESTERDAY
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => animateDay(1)} disabled={day >= totalDays}
              style={{
                flex: 1,
                backgroundColor: day >= totalDays ? "rgba(255,215,0,0.06)" : "rgba(255,255,255,0.03)",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: day >= totalDays ? "rgba(255,215,0,0.35)" : "rgba(255,255,255,0.08)",
                paddingVertical: 15, alignItems: "center",
              }}>
              <Text style={{
                color: day >= totalDays ? "#ffd700" : C.green,
                fontFamily: HEADING, fontSize: 18, letterSpacing: 1,
              }}>
                {day >= totalDays ? "HARVEST ✦" : "TOMORROW →"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Glassmorphic info trays ─────────────────────────────────────── */}
        {description && (
          <>
            <ScrollView
              style={{ maxHeight: 270, marginHorizontal: 16, marginBottom: 10 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {/* What you see */}
              <View style={{
                backgroundColor: "rgba(255,255,255,0.03)",
                borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
                borderLeftWidth: 2, borderLeftColor: m.colour,
                padding: 14, marginBottom: 10,
              }}>
                <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>
                  👁  WHAT YOU SEE
                </Text>
                <Text style={{ color: C.white, fontFamily: SANS, fontSize: 13, lineHeight: 21, opacity: 0.88 }}>
                  {description.visual}
                </Text>
              </View>

              {/* What you smell — pale lavender per spec */}
              <View style={{
                backgroundColor: "rgba(255,255,255,0.03)",
                borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
                padding: 14, marginBottom: 10,
              }}>
                <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>
                  👃  WHAT YOU SMELL
                </Text>
                <Text style={{ color: C.lavender, fontFamily: SANS, fontSize: 13, lineHeight: 21 }}>
                  {description.smell}
                </Text>
              </View>

              {/* What's happening */}
              <View style={{
                backgroundColor: "rgba(255,255,255,0.03)",
                borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
                padding: 14, marginBottom: 10,
              }}>
                <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>
                  🌱  WHAT'S HAPPENING
                </Text>
                <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 12, lineHeight: 19 }}>
                  {description.stageDesc}
                </Text>
              </View>

              {/* Grower tip */}
              <View style={{
                backgroundColor: C.greenFaint,
                borderRadius: 14, borderWidth: 1, borderColor: "rgba(61,255,160,0.12)",
                padding: 14, marginBottom: 6,
              }}>
                <Text style={{ color: C.greenDim, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>
                  💡  IF THIS WERE REAL
                </Text>
                <Text style={{ color: C.white, fontFamily: SANS, fontSize: 12, lineHeight: 19, opacity: 0.82 }}>
                  {description.tip}
                </Text>
              </View>
            </ScrollView>

            {/* Shelve button */}
            {isHarvest && !alreadyShelved && (
              <TouchableOpacity onPress={() => setShowShelve(true)} style={{
                marginHorizontal: 16, marginBottom: 16,
                backgroundColor: `${m.colour}10`,
                borderRadius: 16, borderWidth: 1.5, borderColor: `${m.colour}70`,
                padding: 22, alignItems: "center",
                shadowColor: m.colour, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8,
              }}>
                <Text style={{ fontSize: 28 }}>🏆</Text>
                <Text style={{
                  color: m.colour, fontFamily: HEADING, fontSize: 30, marginTop: 8, letterSpacing: 3,
                  textShadowColor: `${m.colour}70`, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10,
                }}>
                  SHELVE THIS GROW
                </Text>
                <Text style={{ color: `${m.colour}80`, fontFamily: SANS, fontSize: 12, marginTop: 4 }}>
                  Add {strain.name} to your {m.rarity.toLowerCase()} collection
                </Text>
              </TouchableOpacity>
            )}

            {isHarvest && alreadyShelved && (
              <View style={{
                marginHorizontal: 16, backgroundColor: C.greenFaint,
                borderRadius: 12, borderWidth: 1, borderColor: "rgba(61,255,160,0.2)",
                padding: 16, alignItems: "center", marginBottom: 16,
              }}>
                <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 18, letterSpacing: 1 }}>
                  ✓ ALREADY IN YOUR COLLECTION
                </Text>
              </View>
            )}

            {/* Strain info chips */}
            <View style={{
              marginHorizontal: 16,
              backgroundColor: "rgba(255,255,255,0.03)",
              borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
              padding: 16,
            }}>
              <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>
                STRAIN INFO
              </Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {[
                  { l: "THC",    v: `${strain.thc_max}%`,
                    c: C.red },
                  { l: "TYPE",   v: strain.type === "I" ? "INDICA" : strain.type === "S" ? "SATIVA" : "HYBRID",
                    c: C.blue },
                  { l: "FLOWER", v: `${strain.flower_wk_max}WK`,
                    c: C.amber },
                  { l: "TIER",   v: strain.tier,
                    c: m.colour },
                ].map(({ l, v, c }) => (
                  <View key={l} style={{
                    backgroundColor: "rgba(255,255,255,0.02)",
                    borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
                    padding: 10, alignItems: "center", minWidth: 72,
                  }}>
                    <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 9, letterSpacing: 0.5 }}>{l}</Text>
                    <Text style={{ color: c, fontFamily: HEADING, fontSize: 18, marginTop: 2 }}>{v}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 11, marginTop: 12, lineHeight: 18 }}>
                {strain.aroma}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Shelve modal */}
      <ShelveModal
        strain={strain}
        metal={metal}
        visible={showShelve}
        onComplete={async () => {
          await saveTrophy();   // saves trophy + starts timer → timerActive=true
          setShowShelve(false); // modal closes, waiting screen appears automatically
        }}
        onSkipAd={async () => {
          await saveTrophy();   // save trophy first
          await skipTimer();    // immediately clear the timer with the ad
          setTimerActive(false);
          setTimerRemaining(0);
          if (timerRef.current) clearInterval(timerRef.current);
          setShowShelve(false);
          loadNextStrain();     // load next strain right away
        }}
      />
    </View>
  );
}
