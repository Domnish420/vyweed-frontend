// GrowRoom.jsx — Indoor grow room (fully controlled environment)
// Same RTL time mechanic as RTLGrow (1 real day = 3 grow days).
// Separate storage key, indoor-specific descriptions, no outdoor weather dependency.
// Runs simultaneously with greenhouse — both can have active grows at once.

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View, Text, TouchableOpacity, Modal, TextInput,
  ScrollView, FlatList, ActivityIndicator, Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cachedFetch } from "./cache";
import { setGrowverContext } from "./growverContext";
import { API_V1 as API_BASE } from "./apiConfig";
import SeedTray from "./SeedTray";

const { width: SW } = Dimensions.get("window");

const MS_PER_GROW_DAY   = (24 * 60 * 60 * 1000) / 3; // 8 real hours
const GROW_STORAGE_KEY  = "vyweed_growroom";
const TOTAL_PAGES       = 51;

const HEADING   = "BebasNeue_400Regular";
const SANS      = "SpaceGrotesk_400Regular";
const SANS_MED  = "SpaceGrotesk_500Medium";
const SANS_BOLD = "SpaceGrotesk_700Bold";

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
  amberFaint:  "rgba(193,122,74,0.08)",
  amberDim:    "rgba(193,122,74,0.35)",
  red:         "#a05050",
  blue:        "#5b9bd5",
  blueFaint:   "rgba(91,155,213,0.08)",
  blueDim:     "rgba(91,155,213,0.25)",
  purple:      "#c8b4e8",
  purpleFaint: "rgba(200,180,232,0.08)",
  purpleDim:   "rgba(200,180,232,0.30)",
  grey:        "rgba(232,228,217,0.28)",
  greyLight:   "rgba(232,228,217,0.52)",
  white:       "#e8e4d9",
  lavender:    "#c8b4e8",
};

const METALS = {
  bronze:  { label: "Bronze",  rarity: "Common",   icon: "🥉", colour: "#cd7f32" },
  silver:  { label: "Silver",  rarity: "Uncommon", icon: "🥈", colour: "#b8c0cc" },
  gold:    { label: "Gold",    rarity: "Rare",      icon: "🥇", colour: "#ffd700" },
  diamond: { label: "Diamond", rarity: "Legendary", icon: "💎", colour: "#7af6ff" },
};

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

// Ideal environment targets per stage — shown in the controlled conditions card
const INDOOR_TARGETS = {
  "Seedling":     { temp: "22–26°C", rh: "60–70%", light: "18/6", note: "Gentle air circulation, no direct fan blast" },
  "Vegetative":   { temp: "22–28°C", rh: "50–70%", light: "18/6", note: "LST / topping now — build the canopy frame" },
  "Transition":   { temp: "22–26°C", rh: "50–60%", light: "12/12", note: "Check light distance daily during stretch" },
  "Early Flower": { temp: "20–26°C", rh: "45–55%", light: "12/12", note: "Switch to bloom feed — less N, more P/K" },
  "Mid Flower":   { temp: "20–24°C", rh: "40–50%", light: "12/12", note: "Peak feeding — EC 1.8–2.2 in hydro" },
  "Late Flower":  { temp: "18–24°C", rh: "40–50%", light: "12/12", note: "Check trichomes daily with a loupe" },
  "Final Days":   { temp: "18–22°C", rh: "40–45%", light: "12/12", note: "Flush — plain pH water only" },
  "Harvest Ready":{ temp: "18–20°C", rh: "55–60%", light: "off",   note: "Chop, hang dry 10–14 days at 18°C" },
};

const WEEK_REWARD_WEIGHTS = { T1: 15, T2: 10, T3: 35, T4: 40 };
const TIER_TO_METAL       = { T1: "diamond", T2: "gold", T3: "silver", T4: "bronze" };

function getMetal(difficulty, tier) {
  if (tier === "T1") return "diamond";
  if (difficulty === "advanced") return "gold";
  if (difficulty === "intermediate") return "silver";
  return "bronze";
}

function rollWeekTier() {
  const total = Object.values(WEEK_REWARD_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [tier, w] of Object.entries(WEEK_REWARD_WEIGHTS)) {
    roll -= w;
    if (roll <= 0) return tier;
  }
  return "T4";
}

function calcGrowDay(startedAt, totalDays, now = Date.now()) {
  const elapsed = now - startedAt;
  return Math.min(totalDays, Math.max(1, Math.floor(elapsed / MS_PER_GROW_DAY) + 1));
}

function formatCountdown(ms) {
  if (ms <= 0) return "soon";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Indoor-specific stage descriptions ───────────────────────────────────────
function getIndoorDayDescription(day, strain) {
  const fw        = strain?.flower_wk_max || 9;
  const totalDays = (fw + 4) * 7;

  let stage, stageDesc, visual, smell, tip;

  if (day <= 7) {
    stage     = "Seedling";
    stageDesc = "Your seed has germinated and the first set of leaves have broken the surface. Under your grow light the seedling is drawing energy from stored seed reserves.";
    visual    = day <= 3
      ? "A pale green sprout under the light, two round cotyledon leaves catching photons for the first time. The stem is almost translucent. Everything is working."
      : "The first true serrated cannabis leaves are appearing between the seed leaves. The plant is recognisably cannabis now, responding to your 18/6 cycle.";
    smell = "No aroma yet — just the clean smell of damp growing medium.";
    tip   = "Keep the light 45–50cm above the seedling. Don't water until the medium is dry 2cm deep — seedlings drown easily. Less is more at this stage.";

  } else if (day <= 28) {
    stage     = "Vegetative";
    const vDay = day - 7;
    stageDesc = "Under 18 hours of light your plant is building its structure — stems, branches, roots, and fan leaves. Every photon is going into growth.";
    visual    = vDay <= 7
      ? `${8 + vDay * 2}cm of vigorous growth under your lights, the canopy spreading outward. New nodes appearing every day. Healthy dark green leaves.`
      : vDay <= 14
      ? `A proper plant now — ${22 + (vDay - 7) * 3}cm of lush structure. Internodal spacing is tight under good light, which means dense buds later. Fan leaves the size of your palm.`
      : `${strain?.name} has claimed its space. ${45 + (vDay - 14) * 4}cm of tightly-stacked nodes. Your training is shaping a wide, even canopy that will make the most of your light footprint.`;
    smell = vDay < 10
      ? "A faint green, grassy smell when you brush the fan leaves."
      : "A clear earthy-sweet terpene smell when leaves are disturbed. The genetics are asserting themselves.";
    tip   = vDay < 14
      ? "This is the time to top or LST. Bend main branches outward with soft ties — you're building the canopy frame. More tops now = more bud sites at flip."
      : "Check pH every watering (6.0–7.0 soil, 5.5–6.5 hydro). A small pH error now becomes a nutrient lockout next week.";

  } else if (day <= 42) {
    stage     = "Transition";
    const tDay = day - 28;
    stageDesc = "You've flipped to 12/12. The plant detects the light shift and thinks autumn is coming. Growth hormones are redirecting from structure to reproduction.";
    visual    = `The stretch has begun — adding ${3 + (tDay * 0.8 | 0)}cm every couple of days under your lights. White hairs (pistils) are appearing at every branch node. This is pre-flower — the first unmistakable sign of what's coming.`;
    smell = "The terpenes are waking up. " + (strain?.aroma?.split(",")[0] || "A complex earthy note") + " becoming detectable every time you open the tent.";
    tip   = "Check your light distance daily — during the stretch the canopy can move 5–10cm toward the light. Keep 30–40cm clearance. Burnt tips mean your light is too close.";

  } else {
    const flowerDay   = day - 42;
    const flowerTotal = fw * 7;
    const flowerPct   = flowerDay / flowerTotal;

    if (flowerPct < 0.3) {
      stage     = "Early Flower";
      stageDesc = "Bud sites are stacking at every node. Under your lights every photon is going into flower production now. The plant has committed.";
      visual    = `Small bud clusters forming at every node under the canopy. The white pistils are multiplying fast. Under a loupe you can see the first tiny trichomes developing — clear and glass-like, just getting started.`;
      smell     = `${strain?.aroma?.split(",").slice(0, 2).join(" and ") || "The distinct strain character"} fills the tent when you open it. Check your carbon filter is properly sealed.`;
      tip       = "Stop all training — the plant is locked in. Switch to a bloom formula: reduce nitrogen, increase phosphorus and potassium. Defoliate lightly to improve airflow and light penetration.";

    } else if (flowerPct < 0.6) {
      stage     = "Mid Flower";
      stageDesc = "The most dramatic phase of the entire grow. Buds are swelling visibly day by day under your lights. Yield is being made right now.";
      visual    = `Dense bud clusters stacking and swelling. Under your LED the trichomes shimmer — a visible frost building across the flowers and sugar leaves. The ${strain?.type === "S" ? "sativa structure produces long, airy colas reaching for the light" : "indica genetics are packing dense, tight nugs at every node"}.`;
      smell     = `The smell hits you when you enter the room, not just the tent. ${strain?.aroma || "Complex, full-spectrum terpenes"} at full expression. Your carbon filter is earning its keep.`;
      tip       = "Peak feeding time — this is when yield is made or lost. EC 1.8–2.2 (hydro), or feed every second watering (soil). Any deficiency now directly costs you bud weight at harvest.";

    } else if (flowerPct < 0.92) {
      stage     = "Late Flower";
      stageDesc = "The final push. Buds are hardening and fattening. Trichomes are at peak THC production. The light at the end of the tunnel is getting bright.";
      visual    = `A stunning crystalline canopy under your lights. Every surface coated in trichomes — under a loupe they appear milky white, with a few turning amber. Fan leaves yellowing as the plant mines its own nutrients to fuel the final expansion. The plant looks tired. The buds have never looked better.`;
      smell     = `Overpowering. ${strain?.aroma?.split(",")[0] || "Heavy, complex terpenes"} fills every corner when you open the tent. This is the critical phase — depth of smell is depth of terpene profile.`;
      tip       = "Check trichomes daily with a 60× loupe. When 70% are milky/cloudy and 10–20% are amber, you're in the window for a balanced head + body effect. More amber = heavier, more sedative.";

    } else {
      stage     = flowerPct >= 0.98 ? "Harvest Ready" : "Final Days";
      stageDesc = flowerPct >= 0.98
        ? "Maximum ripeness. Everything you've done — every watering, every pH check, every feeding — has led to this moment."
        : "Running the final flush. The plant is shutting down and redirecting every last resource into the flowers.";
      visual    = flowerPct >= 0.98
        ? `${strain?.name} at its absolute peak under your lights. Dense, resin-coated flowers glowing in the spectrum. Trichomes are the perfect mix of milky and amber — exactly what the genetics promised.`
        : `A fully mature ${strain?.name}. Buds solid and frosted, fan leaves mostly yellow. Amber trichomes spreading across the canopy. The plant has given everything it has.`;
      smell = "The heaviest smell of the entire grow. Your carbon filter is working flat out. This is the smell of a grow done right.";
      tip   = flowerPct >= 0.98
        ? "Chop in darkness if possible — trichomes degrade under light. Hang dry at 18–20°C, 55–60% RH for 10–14 days. Patience in drying is as important as patience in growing."
        : "Final flush — plain pH-corrected water only. Check trichomes one more time. A few more amber heads means a heavier, longer effect. Patience here is always rewarded.";
    }
  }

  return {
    stage, stageDesc, visual, smell, tip,
    isHarvest: stage === "Harvest Ready" || day >= totalDays,
  };
}

// ── Strain Picker Modal (manual search fallback) ──────────────────────────────
function StrainPickerModal({ visible, onClose, onSelect }) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef             = useRef(null);

  useEffect(() => {
    if (!visible) { setQuery(""); setResults([]); }
  }, [visible]);

  const search = (q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!q.trim()) { setResults([]); return; }
      setSearching(true);
      try {
        const r = await cachedFetch(`${API_BASE}/search?q=${encodeURIComponent(q.trim())}&per_page=20&sort=name`);
        setResults(r.data?.results || []);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 400);
  };

  const pickRandom = async () => {
    setSearching(true);
    try {
      const page    = Math.floor(Math.random() * TOTAL_PAGES) + 1;
      const r       = await cachedFetch(`${API_BASE}/search?per_page=100&page=${page}&sort=name`);
      const strains = r.data?.results || [];
      if (strains.length > 0) onSelect(strains[Math.floor(Math.random() * strains.length)]);
    } catch {} finally { setSearching(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          borderTopWidth: 2, borderLeftWidth: 1, borderRightWidth: 1,
          borderColor: C.greenDim, maxHeight: "85%",
        }}>
          <View style={{
            paddingHorizontal: 16, paddingVertical: 14,
            borderBottomWidth: 1, borderColor: C.border,
            flexDirection: "row", justifyContent: "space-between", alignItems: "center",
          }}>
            <View>
              <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 24, letterSpacing: 2 }}>PICK A STRAIN</Text>
              <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 2 }}>Search 5,042 strains or go random</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{
              width: 30, height: 30, borderRadius: 15, backgroundColor: C.surface,
              borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center",
            }}>
              <Text style={{ color: C.greyLight, fontSize: 14 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={pickRandom} disabled={searching} style={{
            margin: 14, marginBottom: 8, backgroundColor: C.greenFaint,
            borderRadius: 12, borderWidth: 1, borderColor: C.greenDim,
            padding: 14, alignItems: "center",
          }}>
            <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 20, letterSpacing: 1 }}>🎲  RANDOM STRAIN</Text>
            <Text style={{ color: C.greenDim, fontFamily: SANS, fontSize: 10, marginTop: 2 }}>Surprise me from all 5,042</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginBottom: 8 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginHorizontal: 10 }}>OR SEARCH</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
          </View>

          <TextInput
            value={query} onChangeText={q => { setQuery(q); search(q); }}
            placeholder="Type a strain name..." placeholderTextColor={C.grey}
            style={{
              marginHorizontal: 14, marginBottom: 8, backgroundColor: C.surface,
              borderRadius: 12, borderWidth: 1, borderColor: C.border,
              color: C.white, fontFamily: SANS, fontSize: 14, paddingHorizontal: 14, paddingVertical: 11,
            }}
          />

          {searching && <ActivityIndicator color={C.green} style={{ marginVertical: 12 }} />}

          <FlatList
            data={results} keyExtractor={s => String(s.id)}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
            renderItem={({ item }) => {
              const typeLabel = item.type === "I" ? "Indica" : item.type === "S" ? "Sativa" : "Hybrid";
              const metal     = METALS[getMetal(item.difficulty, item.tier)];
              return (
                <TouchableOpacity onPress={() => onSelect(item)} style={{
                  backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border,
                  padding: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12,
                }}>
                  <Text style={{ fontSize: 22 }}>{metal.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.white, fontFamily: SANS_MED, fontSize: 14 }}>{item.name}</Text>
                    <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 11, marginTop: 3 }}>
                      {item.tier} · {typeLabel} · {item.flower_wk_max}wk · THC {item.thc_max}%
                    </Text>
                  </View>
                  <Text style={{ color: C.greenDim, fontFamily: HEADING, fontSize: 20 }}>›</Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={!searching && query.length > 0
              ? <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 13, textAlign: "center", marginTop: 20 }}>
                  No results for "{query}"
                </Text>
              : null}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Harvest celebration modal ─────────────────────────────────────────────────
function HarvestModal({ strain, metal, visible, onPlantAgain }) {
  if (!strain || !visible) return null;
  const m = METALS[metal] || METALS.bronze;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ fontSize: 64, marginBottom: 8 }}>🏆</Text>
        <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 40, letterSpacing: 4, textAlign: "center" }}>HARVESTED</Text>
        <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 26, marginTop: 12, textAlign: "center", letterSpacing: 1 }}>{strain.name}</Text>
        <Text style={{ color: m.colour, fontFamily: SANS, fontSize: 13, marginTop: 6 }}>{m.icon} {m.rarity} Trophy Earned</Text>
        <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 13, marginTop: 16, textAlign: "center", lineHeight: 20 }}>
          Grow room harvest complete.{"\n"}Trophy added to your collection.
        </Text>
        <TouchableOpacity onPress={onPlantAgain} style={{
          marginTop: 32, width: "100%", backgroundColor: C.greenFaint,
          borderRadius: 14, borderWidth: 1, borderColor: C.greenDim,
          paddingVertical: 18, alignItems: "center",
        }}>
          <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 24, letterSpacing: 2 }}>PLANT AGAIN →</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Weekly reward modal ───────────────────────────────────────────────────────
function WeekRewardModal({ visible, week, strain, metal, onClose }) {
  if (!visible || !strain) return null;
  const m = METALS[metal] || METALS.bronze;
  const odds = WEEK_REWARD_WEIGHTS[strain.tier] ?? WEEK_REWARD_WEIGHTS.T4;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ color: C.green, fontFamily: SANS_MED, fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>WEEK {week} COMPLETE</Text>
        <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 34, letterSpacing: 3, textAlign: "center" }}>BONUS STRAIN UNLOCKED</Text>
        <View style={{
          marginTop: 28, marginBottom: 20, width: 180, height: 180, borderRadius: 90,
          backgroundColor: `${m.colour}10`, borderWidth: 2, borderColor: `${m.colour}50`,
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontSize: 50 }}>{m.icon}</Text>
          <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 20, letterSpacing: 2, marginTop: 6 }}>{m.label.toUpperCase()}</Text>
          <Text style={{ color: `${m.colour}80`, fontFamily: SANS, fontSize: 10, marginTop: 2 }}>{m.rarity}</Text>
        </View>
        <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 26, textAlign: "center", letterSpacing: 1 }}>{strain.name}</Text>
        <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 11, marginTop: 6 }}>
          {strain.tier} · THC {strain.thc_max}% · {strain.flower_wk_max}wk
        </Text>
        <View style={{ marginTop: 20, flexDirection: "row", gap: 6, backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12 }}>
          {Object.entries(WEEK_REWARD_WEIGHTS).reverse().map(([tier, pct]) => (
            <View key={tier} style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ color: METALS[TIER_TO_METAL[tier]].colour, fontFamily: HEADING, fontSize: 14 }}>{pct}%</Text>
              <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 8, marginTop: 1 }}>{tier}</Text>
            </View>
          ))}
        </View>
        <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 12, marginTop: 14, textAlign: "center", lineHeight: 18 }}>
          Trophy added to your collection.{"\n"}Keep growing to earn more.
        </Text>
        <TouchableOpacity onPress={onClose} style={{
          marginTop: 24, width: "100%", backgroundColor: C.greenFaint,
          borderRadius: 14, borderWidth: 1, borderColor: C.greenDim,
          paddingVertical: 16, alignItems: "center",
        }}>
          <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 22, letterSpacing: 2 }}>BACK TO GROW ROOM →</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Main GrowRoom component ───────────────────────────────────────────────────
export default function GrowRoom({ trophies, onAddTrophy, tokens, onEarnToken, onSpendToken }) {
  const [growData, setGrowData]       = useState(null);
  const [loadingGrow, setLoadingGrow] = useState(true);
  const [now, setNow]                 = useState(Date.now());
  const [showSeedTray, setShowSeedTray]     = useState(false);
  const [pickerVisible, setPickerVisible]   = useState(false);
  const [harvestModalVisible, setHarvestModalVisible] = useState(false);
  const [weekRewardVisible, setWeekRewardVisible]     = useState(false);
  const [weekRewardStrain, setWeekRewardStrain]       = useState(null);
  const [weekRewardMetal, setWeekRewardMetal]         = useState(null);
  const [weekRewardNum, setWeekRewardNum]             = useState(null);
  const [weekRewardLoading, setWeekRewardLoading]     = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(GROW_STORAGE_KEY)
      .then(raw => { if (raw) setGrowData(JSON.parse(raw)); })
      .catch(() => {})
      .finally(() => setLoadingGrow(false));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const growsCompleted = (trophies || []).filter(t => t.source === "growroom").length;

  const totalDays    = growData?.totalDays ?? 91;
  const currentDay   = growData ? calcGrowDay(growData.startedAt, totalDays, now) : 1;
  const description  = useMemo(() =>
    growData ? getIndoorDayDescription(currentDay, growData.strainData) : null,
    [currentDay, growData]
  );
  const metal            = growData ? getMetal(growData.strainData.difficulty, growData.strainData.tier) : "bronze";
  const isHarvest        = description?.isHarvest || currentDay >= totalDays;
  const alreadyHarvested = Boolean(growData?.harvestedAt);
  const msIntoDay        = growData ? (now - growData.startedAt) % MS_PER_GROW_DAY : 0;
  const msToNextDay      = MS_PER_GROW_DAY - msIntoDay;

  const today          = new Date().toISOString().slice(0, 10);
  const canClaimDaily  = Boolean(growData && !growData.harvestedAt && growData.lastDailyClaim !== today);
  const completedWeeks = Math.floor(currentDay / 7);
  const weeksClaimed   = growData?.weeksClaimed || [];
  const nextUnclaimedWeek = Array.from({ length: completedWeeks }, (_, i) => i + 1)
    .find(w => !weeksClaimed.includes(w));
  const hasWeekReward  = nextUnclaimedWeek !== undefined && !growData?.harvestedAt;

  // Sync Growver context
  useEffect(() => {
    if (!growData || !description) return;
    setGrowverContext("growroom", {
      strainName: growData.strainData.name,
      strainType: growData.strainData.type,
      tier:       growData.strainData.tier,
      difficulty: growData.strainData.difficulty,
      thcMax:     growData.strainData.thc_max,
      aroma:      growData.strainData.aroma,
      day:        currentDay,
      totalDays,
      stage:      description.stage,
      stageDesc:  description.stageDesc,
      tip:        description.tip,
      isHarvest,
      indoorMode: true,
      nextDayIn:  isHarvest ? "harvest ready" : formatCountdown(msToNextDay),
      targets:    INDOOR_TARGETS[description.stage] || null,
    });
  }, [description, currentDay, isHarvest]);

  const startGrow = async (strain) => {
    const fw = strain.flower_wk_max || 9;
    const td = (fw + 4) * 7;
    const data = { strainData: strain, startedAt: Date.now(), totalDays: td, harvestedAt: null };
    setGrowData(data);
    await AsyncStorage.setItem(GROW_STORAGE_KEY, JSON.stringify(data)).catch(() => {});
    setShowSeedTray(false);
  };

  const harvest = async () => {
    if (!growData || alreadyHarvested) return;
    const m = getMetal(growData.strainData.difficulty, growData.strainData.tier);
    await onAddTrophy({
      strainId:   growData.strainData.id,
      strainName: growData.strainData.name,
      tier:       growData.strainData.tier,
      metal:      m,
      date:       today,
      earnedAt:   Date.now(),
      source:     "growroom",
    });
    const updated = { ...growData, harvestedAt: Date.now() };
    setGrowData(updated);
    await AsyncStorage.setItem(GROW_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
    setHarvestModalVisible(true);
  };

  const clearAndRestart = async () => {
    setHarvestModalVisible(false);
    setGrowData(null);
    await AsyncStorage.removeItem(GROW_STORAGE_KEY).catch(() => {});
    setShowSeedTray(true);
  };

  const claimDaily = async () => {
    if (!canClaimDaily) return;
    const updated = { ...growData, lastDailyClaim: today };
    setGrowData(updated);
    await AsyncStorage.setItem(GROW_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
    await onEarnToken(1);
  };

  const claimWeekReward = async () => {
    if (!hasWeekReward || weekRewardLoading) return;
    setWeekRewardLoading(true);
    try {
      const rolledTier  = rollWeekTier();
      const rolledMetal = TIER_TO_METAL[rolledTier];
      const page        = Math.floor(Math.random() * TOTAL_PAGES) + 1;
      const r           = await cachedFetch(`${API_BASE}/search?per_page=100&page=${page}&sort=name`);
      const all         = r.data?.results || [];
      const pool        = all.filter(s => s.tier === rolledTier);
      const strain      = pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : all[Math.floor(Math.random() * all.length)];
      if (!strain) return;
      await onAddTrophy({
        strainId: strain.id, strainName: strain.name,
        tier: rolledTier, metal: rolledMetal,
        date: today, earnedAt: Date.now(),
        source: "growroom_weekly", weekNumber: nextUnclaimedWeek,
      });
      const updatedWeeks = [...weeksClaimed, nextUnclaimedWeek];
      const updated = { ...growData, weeksClaimed: updatedWeeks };
      setGrowData(updated);
      await AsyncStorage.setItem(GROW_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      setWeekRewardStrain(strain);
      setWeekRewardMetal(rolledMetal);
      setWeekRewardNum(nextUnclaimedWeek);
      setWeekRewardVisible(true);
    } catch {} finally { setWeekRewardLoading(false); }
  };

  const skipDay = async () => {
    if (!growData || isHarvest || alreadyHarvested || tokens < 3 || !onSpendToken) return;
    const ok = await onSpendToken(3);
    if (!ok) return;
    const updated = { ...growData, startedAt: growData.startedAt - MS_PER_GROW_DAY };
    setGrowData(updated);
    await AsyncStorage.setItem(GROW_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  };

  // ── Loading ──
  if (loadingGrow) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.green} size="large" />
      </View>
    );
  }

  // ── Seed tray (shown over welcome or active grow when changing strain) ──
  if (showSeedTray) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StrainPickerModal
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onSelect={(strain) => { startGrow(strain); setPickerVisible(false); }}
        />
        <SeedTray
          trophies={trophies}
          outdoorWeather={null}
          growsCompleted={growsCompleted}
          onSelectStrain={startGrow}
          onBack={() => setShowSeedTray(false)}
          onSearchAll={() => setPickerVisible(true)}
        />
      </View>
    );
  }

  // ── No active grow / post-harvest welcome ──
  if (!growData || (alreadyHarvested && !harvestModalVisible)) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 60, marginBottom: 12 }}>🏠</Text>

          {alreadyHarvested ? (
            <>
              <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 30, letterSpacing: 2, textAlign: "center" }}>
                HARVEST COMPLETE
              </Text>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 13, marginTop: 10, textAlign: "center", lineHeight: 20 }}>
                {growData?.strainData?.name} is drying.{"\n"}Ready to start your next indoor grow?
              </Text>
            </>
          ) : (
            <>
              <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 30, letterSpacing: 2, textAlign: "center" }}>
                GROW ROOM
              </Text>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 13, marginTop: 10, textAlign: "center", lineHeight: 20 }}>
                Fully controlled indoor environment.{"\n"}No seasons. No weather. Pure precision growing.
              </Text>
            </>
          )}

          <TouchableOpacity
            onPress={() => setShowSeedTray(true)}
            style={{
              marginTop: 28, width: "100%",
              backgroundColor: C.purpleFaint,
              borderRadius: 14, borderWidth: 1, borderColor: C.purpleDim,
              paddingVertical: 18, alignItems: "center",
            }}>
            <Text style={{ color: C.purple, fontFamily: HEADING, fontSize: 22, letterSpacing: 2 }}>
              {alreadyHarvested ? "PICK YOUR NEXT SEED →" : "PICK A SEED →"}
            </Text>
            <Text style={{ color: C.purpleDim, fontFamily: SANS, fontSize: 11, marginTop: 4 }}>
              Indoor-ready — any strain, any season
            </Text>
          </TouchableOpacity>

          {/* Info chips */}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 24, width: "100%" }}>
            {[
              { label: "18/6 VEG",  sub: "12/12 FLOWER" },
              { label: "YEAR-ROUND", sub: "NO SEASONS" },
            ].map(({ label, sub }) => (
              <View key={label} style={{
                flex: 1, backgroundColor: C.card,
                borderRadius: 12, borderWidth: 1, borderColor: C.border,
                padding: 14, alignItems: "center",
              }}>
                <Text style={{ color: C.purple, fontFamily: HEADING, fontSize: 16, letterSpacing: 0.5 }}>{label}</Text>
                <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 9, marginTop: 3 }}>{sub}</Text>
              </View>
            ))}
          </View>

          {/* How it works */}
          <View style={{
            marginTop: 16, width: "100%", backgroundColor: C.card,
            borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16,
          }}>
            <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>
              HOW IT WORKS
            </Text>
            {[
              "Pick a seed — any strain grows indoors, year-round",
              "1 real day = 3 grow days — same as the greenhouse",
              "Each stage shows your ideal tent conditions (temp, RH, light)",
              "Growver monitors your grow and gives indoor-specific advice",
            ].map((step, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
                <Text style={{ color: C.purpleDim, fontFamily: HEADING, fontSize: 14, lineHeight: 20 }}>{i + 1}.</Text>
                <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 12, lineHeight: 18, flex: 1 }}>{step}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Active grow ──
  const m          = METALS[metal];
  const stageCol   = STAGE_COLOUR[description?.stage] || C.purple;
  const glyph      = STAGE_GLYPH[description?.stage] || "🌱";
  const progressPct = (currentDay / totalDays) * 100;
  const typeLabel   = growData.strainData.type === "I" ? "INDICA"
                    : growData.strainData.type === "S" ? "SATIVA" : "HYBRID";
  const targets     = INDOOR_TARGETS[description?.stage] || {};

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <WeekRewardModal
        visible={weekRewardVisible} week={weekRewardNum}
        strain={weekRewardStrain} metal={weekRewardMetal}
        onClose={() => setWeekRewardVisible(false)}
      />
      <HarvestModal
        strain={growData?.strainData} metal={metal}
        visible={harvestModalVisible} onPlantAgain={clearAndRestart}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>

        {/* ── Strain nameplate ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 14 }}>{m.icon}</Text>
            <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 24, flex: 1, letterSpacing: 1 }}>
              {growData.strainData.name}
            </Text>
            <View style={{
              backgroundColor: C.purpleFaint, borderRadius: 20,
              borderWidth: 1, borderColor: C.purpleDim,
              paddingHorizontal: 8, paddingVertical: 4,
            }}>
              <Text style={{ color: C.purple, fontFamily: SANS_BOLD, fontSize: 8, letterSpacing: 1.5 }}>
                GROW ROOM
              </Text>
            </View>
            {/* Token badge */}
            <View style={{
              backgroundColor: C.greenFaint, borderRadius: 20,
              borderWidth: 1, borderColor: "rgba(61,255,160,0.30)",
              paddingHorizontal: 8, paddingVertical: 4,
              flexDirection: "row", alignItems: "center", gap: 3,
            }}>
              <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 13 }}>{tokens ?? 0}</Text>
              <Text style={{ fontSize: 11 }}>🎟</Text>
            </View>
          </View>
        </View>

        {/* ── Progress bar ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10 }}>DAY 1</Text>
            <Text style={{
              color: isHarvest ? "#ffd700" : C.purple,
              fontFamily: HEADING, fontSize: 18, letterSpacing: 1,
              textShadowColor: isHarvest ? "#ffd70060" : `${C.purple}60`,
              textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
            }}>
              DAY {currentDay} — {description?.stage?.toUpperCase()}
            </Text>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10 }}>DAY {totalDays}</Text>
          </View>
          <View style={{ height: 3, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" }}>
            <View style={{
              width: `${progressPct}%`, height: 3,
              backgroundColor: isHarvest ? "#ffd700" : C.purple, borderRadius: 2,
            }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 9 }}>{progressPct.toFixed(0)}% COMPLETE</Text>
            {!isHarvest && (
              <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 9 }}>
                Next grow day in {formatCountdown(msToNextDay)}
              </Text>
            )}
            {isHarvest && <Text style={{ color: "#ffd700", fontFamily: SANS_MED, fontSize: 9 }}>HARVEST READY ✦</Text>}
          </View>
        </View>

        {/* ── Plant visual ── */}
        <View style={{ alignItems: "center", paddingVertical: 20 }}>
          <View style={{
            width: 160, height: 160, borderRadius: 80,
            backgroundColor: `${stageCol}0d`, borderWidth: 1, borderColor: `${stageCol}22`,
            alignItems: "center", justifyContent: "center",
          }}>
            {[
              { top: 8,  left: 8,  borderTopWidth: 1,    borderLeftWidth: 1 },
              { top: 8,  right: 8, borderTopWidth: 1,    borderRightWidth: 1 },
              { bottom: 8, left: 8,  borderBottomWidth: 1, borderLeftWidth: 1 },
              { bottom: 8, right: 8, borderBottomWidth: 1, borderRightWidth: 1 },
            ].map((s, i) => (
              <View key={i} style={{ position: "absolute", width: 14, height: 14, borderColor: `${stageCol}50`, ...s }} />
            ))}
            <Text style={{ fontSize: 68 }}>{glyph}</Text>
          </View>
          <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 9, marginTop: 10, letterSpacing: 1.5 }}>
            {isHarvest ? "✂️ HARVEST READY" : "🏠 GROW ROOM · CONTROLLED"}
          </Text>
        </View>

        {/* ── Controlled environment card ── */}
        {description?.stage && (
          <View style={{
            marginHorizontal: 16, marginBottom: 10,
            backgroundColor: C.purpleFaint,
            borderRadius: 14, borderWidth: 1, borderColor: C.purpleDim,
            padding: 14,
          }}>
            <Text style={{ color: C.purpleDim, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>
              🌡  CONTROLLED ENVIRONMENT · {description.stage.toUpperCase()}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[
                { l: "TEMP",  v: targets.temp  || "—" },
                { l: "RH",    v: targets.rh    || "—" },
                { l: "LIGHT", v: targets.light || "—" },
              ].map(({ l, v }) => (
                <View key={l} style={{
                  flex: 1, backgroundColor: "rgba(200,180,232,0.06)",
                  borderRadius: 10, borderWidth: 1, borderColor: C.purpleDim,
                  padding: 10, alignItems: "center",
                }}>
                  <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 9, letterSpacing: 0.5 }}>{l}</Text>
                  <Text style={{ color: C.purple, fontFamily: HEADING, fontSize: 15, marginTop: 3 }}>{v}</Text>
                </View>
              ))}
            </View>
            {targets.note && (
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 11, marginTop: 10, lineHeight: 17 }}>
                💡 {targets.note}
              </Text>
            )}
          </View>
        )}

        {/* ── Weekly reward banner ── */}
        {hasWeekReward && (
          <TouchableOpacity
            onPress={claimWeekReward} disabled={weekRewardLoading}
            style={{
              marginHorizontal: 16, marginBottom: 10,
              backgroundColor: "rgba(255,215,0,0.08)",
              borderRadius: 14, borderWidth: 1.5, borderColor: "rgba(255,215,0,0.50)",
              padding: 16, flexDirection: "row", alignItems: "center", gap: 12,
            }}>
            <Text style={{ fontSize: 28 }}>🎁</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#ffd700", fontFamily: HEADING, fontSize: 18, letterSpacing: 1 }}>WEEK {nextUnclaimedWeek} REWARD</Text>
              <Text style={{ color: "rgba(255,215,0,0.65)", fontFamily: SANS, fontSize: 11, marginTop: 2 }}>
                Bonus strain unlock — T1: 15% · T2: 10% · T3: 35% · T4: 40%
              </Text>
            </View>
            <Text style={{ color: "#ffd700", fontFamily: HEADING, fontSize: 20 }}>
              {weekRewardLoading ? "…" : "ROLL"}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Daily care claim ── */}
        {canClaimDaily && (
          <TouchableOpacity
            onPress={claimDaily}
            style={{
              marginHorizontal: 16, marginBottom: 10,
              backgroundColor: C.greenFaint, borderRadius: 14,
              borderWidth: 1, borderColor: C.greenDim,
              padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
            }}>
            <Text style={{ fontSize: 24 }}>🌟</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 16, letterSpacing: 1 }}>DAILY CARE</Text>
              <Text style={{ color: C.greenDim, fontFamily: SANS, fontSize: 11, marginTop: 1 }}>You checked in today — claim your token</Text>
            </View>
            <View style={{
              backgroundColor: "rgba(61,255,160,0.15)", borderRadius: 10,
              borderWidth: 1, borderColor: C.greenDim, paddingHorizontal: 10, paddingVertical: 6,
            }}>
              <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 16 }}>+1 🎟</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Skip day ── */}
        {!isHarvest && !alreadyHarvested && tokens >= 3 && (
          <TouchableOpacity
            onPress={skipDay}
            style={{
              marginHorizontal: 16, marginBottom: 10,
              backgroundColor: C.amberFaint, borderRadius: 14,
              borderWidth: 1, borderColor: C.amberDim,
              padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
            }}>
            <Text style={{ fontSize: 22 }}>⏩</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 16, letterSpacing: 1 }}>SKIP A DAY</Text>
              <Text style={{ color: C.amberDim, fontFamily: SANS, fontSize: 11, marginTop: 1 }}>
                Advance plant by 1 grow day — doesn't affect daily token claim
              </Text>
            </View>
            <View style={{
              backgroundColor: "rgba(193,122,74,0.12)", borderRadius: 10,
              borderWidth: 1, borderColor: C.amberDim, paddingHorizontal: 10, paddingVertical: 6,
            }}>
              <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 15 }}>3 🎟</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Harvest button ── */}
        {isHarvest && !alreadyHarvested && (
          <TouchableOpacity
            onPress={harvest}
            style={{
              marginHorizontal: 16, marginBottom: 16,
              backgroundColor: `${m.colour}10`, borderRadius: 16,
              borderWidth: 1.5, borderColor: `${m.colour}70`,
              padding: 22, alignItems: "center",
              shadowColor: m.colour, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
            }}>
            <Text style={{ fontSize: 28 }}>🏆</Text>
            <Text style={{
              color: m.colour, fontFamily: HEADING, fontSize: 30, marginTop: 8, letterSpacing: 3,
              textShadowColor: `${m.colour}60`, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10,
            }}>
              HARVEST NOW
            </Text>
            <Text style={{ color: `${m.colour}80`, fontFamily: SANS, fontSize: 12, marginTop: 4 }}>
              Add {growData.strainData.name} to your {m.rarity.toLowerCase()} collection
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Description cards ── */}
        {description && (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={{
              backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border,
              borderLeftWidth: 2, borderLeftColor: m.colour, padding: 14, marginBottom: 10,
            }}>
              <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>👁  WHAT YOU SEE</Text>
              <Text style={{ color: C.white, fontFamily: SANS, fontSize: 13, lineHeight: 21, opacity: 0.88 }}>{description.visual}</Text>
            </View>

            <View style={{
              backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border,
              padding: 14, marginBottom: 10,
            }}>
              <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>👃  WHAT YOU SMELL</Text>
              <Text style={{ color: C.lavender, fontFamily: SANS, fontSize: 13, lineHeight: 21 }}>{description.smell}</Text>
            </View>

            <View style={{
              backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border,
              padding: 14, marginBottom: 10,
            }}>
              <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>🌱  WHAT'S HAPPENING</Text>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 12, lineHeight: 19 }}>{description.stageDesc}</Text>
            </View>

            <View style={{
              backgroundColor: C.purpleFaint, borderRadius: 14,
              borderWidth: 1, borderColor: "rgba(200,180,232,0.12)",
              padding: 14, marginBottom: 10,
            }}>
              <Text style={{ color: C.purpleDim, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>💡  GROWER'S TIP</Text>
              <Text style={{ color: C.white, fontFamily: SANS, fontSize: 12, lineHeight: 19, opacity: 0.82 }}>{description.tip}</Text>
            </View>

            {/* Strain info chips */}
            <View style={{
              backgroundColor: C.card, borderRadius: 14,
              borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 10,
            }}>
              <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>STRAIN INFO</Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {[
                  { l: "THC",    v: `${growData.strainData.thc_max}%`,       c: C.red },
                  { l: "TYPE",   v: typeLabel,                                c: C.blue },
                  { l: "FLOWER", v: `${growData.strainData.flower_wk_max}WK`, c: C.amber },
                  { l: "TIER",   v: growData.strainData.tier,                 c: m.colour },
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
              {growData.strainData.aroma ? (
                <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 11, marginTop: 12, lineHeight: 18 }}>
                  {growData.strainData.aroma}
                </Text>
              ) : null}
            </View>

            {/* Change strain */}
            <TouchableOpacity
              onPress={() => setShowSeedTray(true)}
              style={{
                backgroundColor: C.surface, borderRadius: 12,
                borderWidth: 1, borderColor: C.border, padding: 14, alignItems: "center",
              }}>
              <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 16, letterSpacing: 1 }}>🔄  CHANGE STRAIN</Text>
              <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 2 }}>Abandons current grow</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
