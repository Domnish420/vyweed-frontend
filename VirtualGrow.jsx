/**
 * VirtualGrow.jsx
 * VYWEED Virtual Grow Game — Gardenista edition
 *
 * - Strain of the Day (seeded daily, difficulty-weighted)
 * - Gacha reveal card on each new strain
 * - Day scrubber — swipe right to advance, left to rewind
 * - Shelve to earn a trophy when harvest is reached
 * - Trophy collection with metal tiers
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Animated,
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

const C = {
  bg:         "#0a0f0a",
  surface:    "#0f150f",
  card:       "#141a13",
  border:     "#2a3d2e",
  green:      "#4d7358",
  greenFaint: "#1a2d1f",
  greenDim:   "#3a5c44",
  greenBright:"#6db87f",
  amber:      "#c17a4a",
  red:        "#a83030",
  blue:       "#5b9bd5",
  grey:       "#4a5a4a",
  greyLight:  "#8a9e8c",
  white:      "#e8e4d9",
  purple:     "#8b6abf",
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
  "Seedling":     C.blue,
  "Vegetative":   C.greenBright,
  "Transition":   C.amber,
  "Early Flower": "#c8733a",
  "Mid Flower":   "#c8733a",
  "Late Flower":  C.purple,
  "Final Days":   "#d4a84b",
  "Harvest Ready":"#d4a84b",
};

// ── Metal tiers ────────────────────────────────────────────────────────────────
const METALS = {
  bronze:  { label: "Bronze",  rarity: "Common",    icon: "🥉", colour: "#cd7f32", glow: "#3d2000" },
  silver:  { label: "Silver",  rarity: "Uncommon",  icon: "🥈", colour: "#c0c0c0", glow: "#1a1a2a" },
  gold:    { label: "Gold",    rarity: "Rare",       icon: "🥇", colour: "#ffd700", glow: "#2a1a00" },
  diamond: { label: "Diamond", rarity: "Legendary",  icon: "💎", colour: "#b9f2ff", glow: "#001a2a" },
};

function getMetal(difficulty, tier) {
  if (tier === "T1") return "diamond";
  if (difficulty === "advanced") return "gold";
  if (difficulty === "intermediate") return "silver";
  return "bronze";
}

// ── Seed-based daily strain picker ────────────────────────────────────────────
function getDailyStrain(strains) {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const weights = { T1: 2, T2: 8, T3: 30, T4: 60 };
  const pool = strains.filter(s => weights[s.tier] > 0);
  let hash = seed;
  const rand = () => {
    hash = ((hash << 5) - hash + 7919) & 0x7fffffff;
    return (hash & 0x7fffffff) / 0x7fffffff;
  };
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

// ── Plant visual ───────────────────────────────────────────────────────────────
function PlantVisual({ day, totalDays, stage, strain, isHarvest, anim }) {
  const pct = Math.min(1, day / totalDays);
  const col = STAGE_COLOUR[stage] || C.greenBright;
  const glyph = STAGE_GLYPH[stage] || "🌱";
  const plantSize = Math.min(110, 44 + pct * 72);
  const glowSize = plantSize * 2.6;

  return (
    <Animated.View style={{ alignItems: "center", justifyContent: "center", height: 200, opacity: anim }}>
      {/* Outer glow ring */}
      <View style={{
        position: "absolute",
        width: glowSize, height: glowSize, borderRadius: glowSize / 2,
        backgroundColor: `${col}12`,
        borderWidth: 1, borderColor: `${col}28`,
      }} />
      {/* Inner glow */}
      <View style={{
        position: "absolute",
        width: glowSize * 0.6, height: glowSize * 0.6, borderRadius: glowSize / 2,
        backgroundColor: `${col}1e`,
      }} />
      {/* HUD corner brackets */}
      {[
        { top: 20, left: "50%", marginLeft: -plantSize * 0.7, borderTopWidth: 1, borderLeftWidth: 1 },
        { top: 20, right: "50%", marginRight: -plantSize * 0.7, borderTopWidth: 1, borderRightWidth: 1 },
        { bottom: 20, left: "50%", marginLeft: -plantSize * 0.7, borderBottomWidth: 1, borderLeftWidth: 1 },
        { bottom: 20, right: "50%", marginRight: -plantSize * 0.7, borderBottomWidth: 1, borderRightWidth: 1 },
      ].map((s, i) => (
        <View key={i} style={{
          position: "absolute", width: 16, height: 16,
          borderColor: `${col}60`, ...s,
        }} />
      ))}
      {/* Plant emoji */}
      <Text style={{ fontSize: plantSize, textAlign: "center" }}>{glyph}</Text>
    </Animated.View>
  );
}

// ── Gacha Reveal Card ─────────────────────────────────────────────────────────
function GachaReveal({ strain, metal, onReveal }) {
  const m = METALS[metal];
  const [tapped, setTapped] = useState(false);
  const entranceAnim = useRef(new Animated.Value(0.82)).current;
  const glowAnim     = useRef(new Animated.Value(0)).current;
  const nameAnim     = useRef(new Animated.Value(0)).current;
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const pulseRef     = useRef(null);

  useEffect(() => {
    Animated.spring(entranceAnim, {
      toValue: 1, tension: 55, friction: 9, useNativeDriver: true,
    }).start();
    pulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 950, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 950, useNativeDriver: true }),
      ])
    );
    pulseRef.current.start();
    return () => pulseRef.current?.stop();
  }, []);

  const handleTap = () => {
    if (tapped) return;
    setTapped(true);
    pulseRef.current?.stop();
    Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(nameAnim, { toValue: 1, tension: 65, friction: 8, useNativeDriver: true }),
    ]).start();
    setTimeout(onReveal, 2200);
  };

  const rarityColours = {
    Common:    C.amber,
    Uncommon:  C.greyLight,
    Rare:      "#ffd700",
    Legendary: "#b9f2ff",
  };
  const rarityCol = rarityColours[m.rarity] || m.colour;

  return (
    <View style={{
      flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center",
      paddingHorizontal: 28,
      paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 8 : 48,
    }}>
      {/* Rarity banner */}
      <View style={{ marginBottom: 10, alignItems: "center" }}>
        <Text style={{ color: rarityCol, fontFamily: HEADING, fontSize: 13, letterSpacing: 5 }}>
          STRAIN OF THE DAY
        </Text>
      </View>

      <TouchableOpacity onPress={handleTap} activeOpacity={0.88}>
        <Animated.View style={{
          transform: [{ scale: entranceAnim }],
          width: SW - 56, borderRadius: 18,
          backgroundColor: C.card,
          borderWidth: 1.5, borderColor: `${m.colour}70`,
          paddingVertical: 36, paddingHorizontal: 28,
          alignItems: "center",
          // Elevation glow
          shadowColor: m.colour, shadowOpacity: 0.35, shadowRadius: 24, elevation: 12,
        }}>
          {/* Animated glow overlay on reveal */}
          <Animated.View style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            borderRadius: 17, backgroundColor: `${m.colour}10`, opacity: glowAnim,
          }} />

          {/* Metal icon */}
          <Text style={{ fontSize: 42, marginBottom: 6 }}>{m.icon}</Text>

          {/* Rarity + tier badge */}
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20,
          }}>
            <View style={{
              backgroundColor: `${m.colour}20`, borderRadius: 6,
              borderWidth: 1, borderColor: `${m.colour}60`,
              paddingHorizontal: 10, paddingVertical: 3,
            }}>
              <Text style={{ color: m.colour, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 1.5 }}>
                {m.rarity.toUpperCase()}
              </Text>
            </View>
            <View style={{
              backgroundColor: C.surface, borderRadius: 6,
              borderWidth: 1, borderColor: C.border,
              paddingHorizontal: 8, paddingVertical: 3,
            }}>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 10, letterSpacing: 1 }}>
                {strain?.tier}
              </Text>
            </View>
          </View>

          {!tapped ? (
            <>
              <Text style={{ fontSize: 72, opacity: 0.22, marginVertical: 8 }}>🌿</Text>
              <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 28, letterSpacing: 2, marginTop: 8 }}>
                ??? STRAIN
              </Text>
              <Animated.Text style={{
                opacity: pulseAnim,
                color: m.colour, fontFamily: SANS_MED, fontSize: 12,
                letterSpacing: 2, marginTop: 24,
              }}>
                TAP TO REVEAL
              </Animated.Text>
            </>
          ) : (
            <>
              <Animated.Text style={{
                fontSize: 72, marginVertical: 8,
                opacity: glowAnim,
                transform: [{ scale: nameAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
              }}>🌿</Animated.Text>
              <Animated.Text style={{
                opacity: nameAnim,
                transform: [{ scale: nameAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
                color: m.colour, fontFamily: HEADING, fontSize: 34,
                letterSpacing: 2, textAlign: "center", marginTop: 8,
              }}>
                {strain?.name}
              </Animated.Text>
              <Animated.View style={{ opacity: nameAnim, alignItems: "center", marginTop: 12 }}>
                <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 12, letterSpacing: 0.5, textAlign: "center" }}>
                  {strain?.type === "I" ? "Indica" : strain?.type === "S" ? "Sativa" : "Hybrid"}
                  {strain?.thc_max ? `  ·  ${strain.thc_max}% THC` : ""}
                  {strain?.flower_wk_max ? `  ·  ${strain.flower_wk_max}wk flower` : ""}
                </Text>
                <Text style={{ color: m.colour, fontFamily: SANS_MED, fontSize: 11, marginTop: 8, letterSpacing: 0.5, textAlign: "center", opacity: 0.8 }}>
                  {m.label} trophy available at harvest
                </Text>
              </Animated.View>
            </>
          )}
        </Animated.View>
      </TouchableOpacity>

      {/* Rarity breakdown hint */}
      <View style={{ marginTop: 28, flexDirection: "row", gap: 6, opacity: 0.7 }}>
        {Object.entries(METALS).reverse().map(([key, meta]) => (
          <View key={key} style={{
            backgroundColor: key === metal ? `${meta.colour}20` : C.surface,
            borderRadius: 6, borderWidth: 1,
            borderColor: key === metal ? `${meta.colour}70` : C.border,
            paddingHorizontal: 8, paddingVertical: 4, alignItems: "center",
          }}>
            <Text style={{ fontSize: 12 }}>{meta.icon}</Text>
            <Text style={{ color: key === metal ? meta.colour : C.grey, fontFamily: SANS, fontSize: 8, marginTop: 2 }}>
              {key === "bronze" ? "60%" : key === "silver" ? "30%" : key === "gold" ? "8%" : "2%"}
            </Text>
          </View>
        ))}
      </View>
      <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 8 }}>
        Resets at midnight
      </Text>
    </View>
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
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: "center" }}>
          {/* Glass dome */}
          <View style={{
            width: 200, height: 220, borderRadius: 100,
            backgroundColor: `${m.colour}08`,
            borderWidth: 1.5, borderColor: `${m.colour}50`,
            alignItems: "center", justifyContent: "center",
            marginBottom: -20,
          }}>
            <Text style={{ fontSize: 60, marginBottom: 10 }}>🌿</Text>
            <Animated.View style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: 100, backgroundColor: `${m.colour}0e`, opacity: glowAnim,
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

        <Animated.View style={{ marginTop: 44, opacity: glowAnim, alignItems: "center" }}>
          <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 32, letterSpacing: 4 }}>
            SHELVED
          </Text>
          <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 20 }}>
            {strain.name} has been added{"\n"}to your collection
          </Text>

          <TouchableOpacity onPress={onComplete} style={{
            marginTop: 28, backgroundColor: C.greenFaint,
            borderWidth: 1, borderColor: C.green, borderRadius: 10,
            paddingHorizontal: 36, paddingVertical: 14,
          }}>
            <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 20, letterSpacing: 2 }}>
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
      <View style={{
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 52,
        paddingBottom: 14, borderBottomWidth: 1, borderColor: C.border,
      }}>
        <TouchableOpacity onPress={onBack} style={{ marginBottom: 10 }}>
          <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 20, letterSpacing: 1 }}>← BACK</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 36, letterSpacing: 3 }}>
              VY<Text style={{ color: C.greenBright }}>WEED</Text>
            </Text>
            <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 10, letterSpacing: 2 }}>
              TROPHY COLLECTION
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 44, lineHeight: 44 }}>
              {total}
            </Text>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 2 }}>
              / 5,042 strains
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={{ height: 3, backgroundColor: C.border, borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
          <View style={{
            width: `${(total / 5042) * 100}%`, height: 3,
            backgroundColor: C.green, borderRadius: 2,
          }} />
        </View>
        <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 9, marginTop: 4 }}>
          {(total / 5042 * 100).toFixed(2)}% COMPLETE
        </Text>
      </View>

      {/* Metal breakdown */}
      <View style={{ flexDirection: "row", padding: 12, gap: 8 }}>
        {Object.entries(METALS).reverse().map(([key, m]) => (
          <View key={key} style={{
            flex: 1, backgroundColor: C.card, borderRadius: 10,
            borderWidth: 1, borderColor: `${m.colour}40`,
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

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {total === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Text style={{ fontSize: 48 }}>🏆</Text>
            <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 28, marginTop: 16, letterSpacing: 2 }}>
              NO TROPHIES YET
            </Text>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 13, marginTop: 10, textAlign: "center", lineHeight: 20 }}>
              Complete your first virtual grow{"\n"}to earn your first trophy.
            </Text>
          </View>
        ) : (
          Object.entries(METALS).reverse().map(([key, m]) => {
            const list = byMetal[key];
            if (list.length === 0) return null;
            return (
              <View key={key} style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 16 }}>{m.icon}</Text>
                  <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 20, letterSpacing: 1 }}>
                    {m.rarity.toUpperCase()} — {list.length}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {list.map((trophy, i) => (
                    <View key={i} style={{
                      backgroundColor: C.card, borderRadius: 10,
                      borderWidth: 1, borderColor: `${m.colour}40`,
                      padding: 12, width: (SW - 40) / 2 - 4,
                      alignItems: "center",
                    }}>
                      <Text style={{ fontSize: 26 }}>🌿</Text>
                      <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 14, marginTop: 8, textAlign: "center", letterSpacing: 0.5 }} numberOfLines={2}>
                        {trophy.strainName}
                      </Text>
                      <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 9, marginTop: 4 }}>
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
  const [revealed, setRevealed]     = useState(false);
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
    setRevealed(false);
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
          const todayKey = new Date().toISOString().slice(0, 10);
          const alreadyDone = trophies.some(
            t => t.strainId === daily.id && t.date === todayKey
          );
          setAlreadyShelved(alreadyDone);
          // Skip reveal if already played today
          if (alreadyDone) setRevealed(true);
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
      const dir = gs.dx > 0 ? -1 : 1;
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

    const waitSecs = getWaitSeconds(updated.length);
    await startTimer(updated.length);
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
        <View style={{
          paddingHorizontal: 16,
          paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 52,
          paddingBottom: 14, borderBottomWidth: 1, borderColor: C.border,
        }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <View>
              <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 36, letterSpacing: 3 }}>
                VY<Text style={{ color: C.greenBright }}>WEED</Text>
              </Text>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 10, letterSpacing: 2 }}>
                NEXT PLANT GROWING...
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
            <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 70, letterSpacing: 6, lineHeight: 76 }}>
              {formatSeconds(timerRemaining)}
            </Text>
            <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 12, marginTop: 6, letterSpacing: 1.5 }}>
              UNTIL YOUR NEXT PLANT IS READY
            </Text>
          </View>

          {/* Progress bar */}
          <View style={{ width: "100%", marginBottom: 32 }}>
            <View style={{ height: 4, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" }}>
              <View style={{ width: `${(1 - pct) * 100}%`, height: 4, backgroundColor: C.green, borderRadius: 2 }} />
            </View>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 6, textAlign: "center" }}>
              Trophy #{trophies.length} earned · Next wait: {getWaitFormatted(trophies.length + 1)}
            </Text>
          </View>

          {/* Watch ad */}
          <TouchableOpacity
            onPress={async () => {
              const result = await applyRollingAd();
              if (result) startCountdown(result.newRemaining);
            }}
            style={{
              width: "100%", backgroundColor: "#1a0d00",
              borderRadius: 12, borderWidth: 1, borderColor: C.amber,
              padding: 16, alignItems: "center", marginBottom: 12,
            }}>
            <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 22, letterSpacing: 1 }}>
              📺  WATCH AD — HALVE WAIT
            </Text>
            <Text style={{ color: `${C.amber}80`, fontFamily: SANS, fontSize: 12, marginTop: 3 }}>
              Saves {formatSeconds(Math.floor(timerRemaining / 2))}
            </Text>
          </TouchableOpacity>

          {/* Skip with token */}
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
              borderRadius: 12, borderWidth: 1, borderColor: C.green,
              padding: 16, alignItems: "center", marginBottom: 28,
            }}>
            <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 22, letterSpacing: 1 }}>
              🎟  USE TOKEN — SKIP ENTIRELY
            </Text>
            <Text style={{ color: C.greenDim, fontFamily: SANS, fontSize: 12, marginTop: 3 }}>
              Saves {formatSeconds(timerRemaining)}
            </Text>
          </TouchableOpacity>

          {/* Collection progress */}
          <View style={{
            width: "100%", backgroundColor: C.card,
            borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 18,
          }}>
            <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>
              YOUR COLLECTION
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 42, lineHeight: 42 }}>
                {trophies.length}
              </Text>
              <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 14, alignSelf: "flex-end", marginBottom: 4 }}>
                / 5,042
              </Text>
            </View>
            <View style={{ height: 3, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" }}>
              <View style={{ width: `${(trophies.length / 5042) * 100}%`, height: 3, backgroundColor: C.green, borderRadius: 2 }} />
            </View>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 6 }}>
              {(trophies.length / 5042 * 100).toFixed(2)}% COMPLETE
            </Text>
          </View>

          {/* Wait curve */}
          <View style={{
            width: "100%", backgroundColor: C.surface,
            borderRadius: 10, borderWidth: 1, borderColor: C.border,
            padding: 14, marginTop: 12,
          }}>
            <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>
              WAIT TIME CURVE
            </Text>
            {[1, 50, 100, 250, 500, 920].map(n => (
              <View key={n} style={{
                flexDirection: "row", justifyContent: "space-between",
                paddingVertical: 6, borderBottomWidth: 1, borderColor: C.border,
              }}>
                <Text style={{ color: trophies.length >= n ? C.greenBright : C.grey, fontFamily: SANS, fontSize: 11 }}>
                  Trophy {n}
                </Text>
                <Text style={{ color: trophies.length >= n ? C.greenBright : C.grey, fontFamily: SANS_MED, fontSize: 11 }}>
                  {getWaitFormatted(n)} wait
                </Text>
              </View>
            ))}
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
              <Text style={{ color: C.amber, fontFamily: SANS, fontSize: 11 }}>Trophy 920+</Text>
              <Text style={{ color: C.amber, fontFamily: SANS_MED, fontSize: 11 }}>4h max wait</Text>
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
        <ActivityIndicator color={C.greenBright} size="large" />
        <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 13, marginTop: 14, letterSpacing: 1 }}>
          Selecting today's strain...
        </Text>
      </View>
    );
  }

  // ── Gacha reveal (new strain, not yet revealed this session) ─────────────────
  if (!revealed) {
    return (
      <GachaReveal
        strain={strain}
        metal={metal}
        onReveal={() => setRevealed(true)}
      />
    );
  }

  const m = METALS[metal];
  const progressPct = (day / totalDays) * 100;
  const stageCol = STAGE_COLOUR[description?.stage] || C.greenBright;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 52,
        paddingBottom: 14, borderBottomWidth: 1, borderColor: C.border,
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 36, letterSpacing: 3 }}>
              VY<Text style={{ color: C.greenBright }}>WEED</Text>
            </Text>
            <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 10, letterSpacing: 2 }}>
              {isIRL ? "GROW REFERENCE" : "STRAIN OF THE DAY"}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setScreen("collection")} style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 22 }}>🏆</Text>
            <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 18, lineHeight: 20 }}>
              {trophies.length}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Strain name + rarity */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
          <Text style={{ fontSize: 14 }}>{m.icon}</Text>
          <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 26, flex: 1, letterSpacing: 1 }}>
            {strain.name}
          </Text>
          <View style={{
            backgroundColor: `${m.colour}1a`, borderRadius: 6,
            borderWidth: 1, borderColor: `${m.colour}70`,
            paddingHorizontal: 8, paddingVertical: 3,
          }}>
            <Text style={{ color: m.colour, fontFamily: SANS_MED, fontSize: 9, letterSpacing: 1.5 }}>
              {m.rarity.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Progress bar + day label */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10 }}>DAY 1</Text>
            <Text style={{
              color: description?.isHarvest ? "#d4a84b" : C.greenBright,
              fontFamily: HEADING, fontSize: 20, letterSpacing: 1,
            }}>
              DAY {day} · {description?.stage?.toUpperCase()}
            </Text>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10 }}>DAY {totalDays}</Text>
          </View>
          <View style={{ height: 4, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" }}>
            <View style={{
              width: `${progressPct}%`, height: 4,
              backgroundColor: description?.isHarvest ? "#d4a84b" : C.green,
              borderRadius: 2,
            }} />
          </View>
        </View>

        {/* Plant visual */}
        <View style={{ alignItems: "center", paddingVertical: 12 }} {...panResponder.panHandlers}>
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
          <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 4, letterSpacing: 1 }}>
            SWIPE TO TRAVEL THROUGH TIME
          </Text>
        </View>

        {/* Day nav buttons */}
        <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 16 }}>
          <TouchableOpacity onPress={() => animateDay(-1)} disabled={day <= 1}
            style={{
              flex: 1, backgroundColor: C.surface, borderRadius: 10,
              borderWidth: 1, borderColor: day <= 1 ? C.border : C.greenDim,
              paddingVertical: 14, alignItems: "center",
            }}>
            <Text style={{ color: day <= 1 ? C.grey : C.greyLight, fontFamily: HEADING, fontSize: 18, letterSpacing: 1 }}>
              ← YESTERDAY
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => animateDay(1)} disabled={day >= totalDays}
            style={{
              flex: 1, backgroundColor: day >= totalDays ? C.greenFaint : C.surface,
              borderRadius: 10, borderWidth: 1,
              borderColor: day >= totalDays ? "#d4a84b" : C.greenDim,
              paddingVertical: 14, alignItems: "center",
            }}>
            <Text style={{ color: day >= totalDays ? "#d4a84b" : C.greyLight, fontFamily: HEADING, fontSize: 18, letterSpacing: 1 }}>
              {day >= totalDays ? "HARVEST ✦" : "TOMORROW →"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Day description */}
        {description && (
          <>
            <ScrollView
              style={{ maxHeight: 270, marginHorizontal: 16, marginBottom: 8 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {/* Visual */}
              <View style={{
                backgroundColor: C.card, borderRadius: 10,
                borderWidth: 1, borderColor: C.border,
                borderLeftWidth: 3, borderLeftColor: m.colour,
                padding: 14, marginBottom: 10,
              }}>
                <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>
                  👁  WHAT YOU SEE
                </Text>
                <Text style={{ color: C.white, fontFamily: SANS, fontSize: 13, lineHeight: 21 }}>
                  {description.visual}
                </Text>
              </View>

              {/* Smell */}
              <View style={{ backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 }}>
                <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>
                  👃  WHAT YOU SMELL
                </Text>
                <Text style={{ color: C.purple, fontFamily: SANS, fontSize: 13, lineHeight: 21 }}>
                  {description.smell}
                </Text>
              </View>

              {/* What's happening */}
              <View style={{ backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 }}>
                <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>
                  🌱  WHAT'S HAPPENING
                </Text>
                <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 12, lineHeight: 19 }}>
                  {description.stageDesc}
                </Text>
              </View>

              {/* Grower tip */}
              <View style={{ backgroundColor: C.greenFaint, borderRadius: 10, borderWidth: 1, borderColor: C.greenDim, padding: 14, marginBottom: 6 }}>
                <Text style={{ color: C.greenDim, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>
                  💡  IF THIS WERE REAL
                </Text>
                <Text style={{ color: C.white, fontFamily: SANS, fontSize: 12, lineHeight: 19 }}>
                  {description.tip}
                </Text>
              </View>
            </ScrollView>

            {/* Shelve button */}
            {description.isHarvest && !alreadyShelved && (
              <TouchableOpacity onPress={() => setShowShelve(true)} style={{
                marginHorizontal: 16, marginBottom: 16,
                backgroundColor: `${m.colour}14`, borderRadius: 14,
                borderWidth: 2, borderColor: m.colour,
                padding: 22, alignItems: "center",
              }}>
                <Text style={{ fontSize: 28 }}>🏆</Text>
                <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 30, marginTop: 8, letterSpacing: 3 }}>
                  SHELVE THIS GROW
                </Text>
                <Text style={{ color: `${m.colour}90`, fontFamily: SANS, fontSize: 12, marginTop: 4 }}>
                  Add {strain.name} to your {m.rarity.toLowerCase()} collection
                </Text>
              </TouchableOpacity>
            )}

            {description.isHarvest && alreadyShelved && (
              <View style={{
                marginHorizontal: 16, backgroundColor: C.greenFaint,
                borderRadius: 10, borderWidth: 1, borderColor: C.greenDim,
                padding: 16, alignItems: "center", marginBottom: 16,
              }}>
                <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 18, letterSpacing: 1 }}>
                  ✓ ALREADY IN YOUR COLLECTION
                </Text>
              </View>
            )}

            {/* Strain info */}
            <View style={{
              marginHorizontal: 16, backgroundColor: C.surface,
              borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 16,
            }}>
              <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>
                STRAIN INFO
              </Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {[
                  { l: "THC",    v: `${strain.thc_max}%`,                                                              c: C.red },
                  { l: "TYPE",   v: strain.type === "I" ? "INDICA" : strain.type === "S" ? "SATIVA" : "HYBRID",       c: C.blue },
                  { l: "FLOWER", v: `${strain.flower_wk_max}WK`,                                                       c: C.amber },
                  { l: "TIER",   v: strain.tier,                                                                        c: m.colour },
                ].map(({ l, v, c }) => (
                  <View key={l} style={{
                    backgroundColor: C.card, borderRadius: 8,
                    borderWidth: 1, borderColor: C.border,
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
