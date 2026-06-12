// RTLGrow.jsx — Real-Time-Like greenhouse grow
// 1 real day = 3 grow days (8 real hours per grow day)

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

const MS_PER_GROW_DAY = (24 * 60 * 60 * 1000) / 3; // 8 real hours
const RTL_STORAGE_KEY = "vyweed_rtl_grow";
const TOTAL_PAGES = 51;

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
  red:         "#a05050",
  blue:        "#5b9bd5",
  grey:        "rgba(232,228,217,0.28)",
  greyLight:   "rgba(232,228,217,0.52)",
  white:       "#e8e4d9",
  lavender:    "#c8b4e8",
};

const METALS = {
  bronze:  { label: "Bronze",  rarity: "Common",    icon: "🥉", colour: "#cd7f32" },
  silver:  { label: "Silver",  rarity: "Uncommon",  icon: "🥈", colour: "#b8c0cc" },
  gold:    { label: "Gold",    rarity: "Rare",       icon: "🥇", colour: "#ffd700" },
  diamond: { label: "Diamond", rarity: "Legendary",  icon: "💎", colour: "#7af6ff" },
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

function getMetal(difficulty, tier) {
  if (tier === "T1") return "diamond";
  if (difficulty === "advanced") return "gold";
  if (difficulty === "intermediate") return "silver";
  return "bronze";
}

function getDayDescription(day, strain) {
  const fw = strain?.flower_wk_max || 9;
  const totalDays = (fw + 4) * 7;

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
    visual = `The plant is STRETCHING — adding ${3 + (stageDay * 0.8 | 0)}cm every couple of days. White hairs (pistils) are beginning to appear at branch nodes. This is the 'pre-flower' — the first sign of femininity.`;
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
        ? "Time to harvest. Press HARVEST NOW to add this plant to your collection."
        : "Flush with plain water now. Check trichomes — harvest when you see the mix of cloudy and amber that suits your preference.";
    }
  }

  return { stage, stageDay, stageDesc, visual, smell, tip, isHarvest: stage === "Harvest Ready" || day >= totalDays };
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

// Weekly reward gacha — better odds than normal gacha (T4: 40%, T1: 15%)
const WEEK_REWARD_WEIGHTS = { T1: 15, T2: 10, T3: 35, T4: 40 };
const TIER_TO_METAL = { T1: "diamond", T2: "gold", T3: "silver", T4: "bronze" };

function rollWeekTier() {
  const total = Object.values(WEEK_REWARD_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [tier, w] of Object.entries(WEEK_REWARD_WEIGHTS)) {
    roll -= w;
    if (roll <= 0) return tier;
  }
  return "T4";
}

// ── Strain Picker Modal ───────────────────────────────────────────────────────
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
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const pickRandom = async () => {
    setSearching(true);
    try {
      const page = Math.floor(Math.random() * TOTAL_PAGES) + 1;
      const r = await cachedFetch(`${API_BASE}/search?per_page=100&page=${page}&sort=name`);
      const strains = r.data?.results || [];
      if (strains.length > 0) {
        onSelect(strains[Math.floor(Math.random() * strains.length)]);
      }
    } catch {} finally {
      setSearching(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: C.bg,
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          borderTopWidth: 2, borderLeftWidth: 1, borderRightWidth: 1,
          borderColor: C.greenDim, maxHeight: "85%",
        }}>
          {/* Header */}
          <View style={{
            paddingHorizontal: 16, paddingVertical: 14,
            borderBottomWidth: 1, borderColor: C.border,
            flexDirection: "row", justifyContent: "space-between", alignItems: "center",
          }}>
            <View>
              <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 24, letterSpacing: 2 }}>
                PICK A STRAIN
              </Text>
              <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 2 }}>
                Search 5,042 strains or go random
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
              alignItems: "center", justifyContent: "center",
            }}>
              <Text style={{ color: C.greyLight, fontSize: 14 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Random button */}
          <TouchableOpacity
            onPress={pickRandom}
            disabled={searching}
            style={{
              margin: 14, marginBottom: 8,
              backgroundColor: C.greenFaint,
              borderRadius: 12, borderWidth: 1, borderColor: C.greenDim,
              padding: 14, alignItems: "center",
            }}>
            <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 20, letterSpacing: 1 }}>
              🎲  RANDOM STRAIN
            </Text>
            <Text style={{ color: C.greenDim, fontFamily: SANS, fontSize: 10, marginTop: 2 }}>
              Surprise me from all 5,042
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginBottom: 8 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginHorizontal: 10 }}>OR SEARCH</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
          </View>

          {/* Search input */}
          <TextInput
            value={query}
            onChangeText={q => { setQuery(q); search(q); }}
            placeholder="Type a strain name..."
            placeholderTextColor={C.grey}
            style={{
              marginHorizontal: 14, marginBottom: 8,
              backgroundColor: C.surface,
              borderRadius: 12, borderWidth: 1, borderColor: C.border,
              color: C.white, fontFamily: SANS, fontSize: 14,
              paddingHorizontal: 14, paddingVertical: 11,
            }}
          />

          {/* Loading */}
          {searching && <ActivityIndicator color={C.green} style={{ marginVertical: 12 }} />}

          {/* Results */}
          <FlatList
            data={results}
            keyExtractor={s => String(s.id)}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
            renderItem={({ item }) => {
              const typeLabel = item.type === "I" ? "Indica" : item.type === "S" ? "Sativa" : "Hybrid";
              const m = METALS[getMetal(item.difficulty, item.tier)];
              return (
                <TouchableOpacity
                  onPress={() => onSelect(item)}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12, borderWidth: 1, borderColor: C.border,
                    padding: 12, marginBottom: 8,
                    flexDirection: "row", alignItems: "center", gap: 12,
                  }}>
                  <Text style={{ fontSize: 22 }}>{m.icon}</Text>
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
            ListEmptyComponent={
              !searching && query.length > 0 ? (
                <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 13, textAlign: "center", marginTop: 20 }}>
                  No results for "{query}"
                </Text>
              ) : null
            }
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
        <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 40, letterSpacing: 4, textAlign: "center" }}>
          HARVESTED
        </Text>
        <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 26, marginTop: 12, textAlign: "center", letterSpacing: 1 }}>
          {strain.name}
        </Text>
        <Text style={{ color: m.colour, fontFamily: SANS, fontSize: 13, marginTop: 6 }}>
          {m.icon} {m.rarity} Trophy Earned
        </Text>
        <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 13, marginTop: 16, textAlign: "center", lineHeight: 20 }}>
          Your real-time grow is complete.{"\n"}Trophy added to your collection.
        </Text>

        <TouchableOpacity
          onPress={onPlantAgain}
          style={{
            marginTop: 32, width: "100%",
            backgroundColor: C.greenFaint,
            borderRadius: 14, borderWidth: 1, borderColor: C.greenDim,
            paddingVertical: 18, alignItems: "center",
          }}>
          <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 24, letterSpacing: 2 }}>
            PLANT AGAIN →
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Weekly reward reveal modal ────────────────────────────────────────────────
function WeekRewardModal({ visible, week, strain, metal, onClose }) {
  if (!visible || !strain) return null;
  const m = METALS[metal] || METALS.bronze;
  const odds = WEEK_REWARD_WEIGHTS[strain.tier] ?? WEEK_REWARD_WEIGHTS.T4;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ color: C.green, fontFamily: SANS_MED, fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>
          WEEK {week} COMPLETE
        </Text>
        <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 34, letterSpacing: 3, textAlign: "center" }}>
          BONUS STRAIN UNLOCKED
        </Text>

        {/* Tier reveal dome */}
        <View style={{
          marginTop: 28, marginBottom: 20,
          width: 180, height: 180, borderRadius: 90,
          backgroundColor: `${m.colour}10`,
          borderWidth: 2, borderColor: `${m.colour}50`,
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontSize: 50 }}>{m.icon}</Text>
          <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 20, letterSpacing: 2, marginTop: 6 }}>
            {m.label.toUpperCase()}
          </Text>
          <Text style={{ color: `${m.colour}80`, fontFamily: SANS, fontSize: 10, marginTop: 2 }}>
            {m.rarity}
          </Text>
        </View>

        <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 26, textAlign: "center", letterSpacing: 1 }}>
          {strain.name}
        </Text>
        <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 11, marginTop: 6 }}>
          {strain.tier} · THC {strain.thc_max}% · {strain.flower_wk_max}wk
        </Text>

        {/* Odds reminder */}
        <View style={{
          marginTop: 20, flexDirection: "row", gap: 6,
          backgroundColor: C.card, borderRadius: 10,
          borderWidth: 1, borderColor: C.border, padding: 12,
        }}>
          {Object.entries(WEEK_REWARD_WEIGHTS).reverse().map(([tier, pct]) => (
            <View key={tier} style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ color: METALS[TIER_TO_METAL[tier]].colour, fontFamily: HEADING, fontSize: 14 }}>
                {pct}%
              </Text>
              <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 8, marginTop: 1 }}>{tier}</Text>
            </View>
          ))}
        </View>

        <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 12, marginTop: 14, textAlign: "center", lineHeight: 18 }}>
          Trophy added to your collection.{"\n"}Keep growing to earn more.
        </Text>

        <TouchableOpacity
          onPress={onClose}
          style={{
            marginTop: 24, width: "100%",
            backgroundColor: C.greenFaint,
            borderRadius: 14, borderWidth: 1, borderColor: C.greenDim,
            paddingVertical: 16, alignItems: "center",
          }}>
          <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 22, letterSpacing: 2 }}>
            BACK TO GROW →
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Main RTLGrow component ────────────────────────────────────────────────────
export default function RTLGrow({ trophies, onAddTrophy, tokens, onEarnToken, onSpendToken }) {
  const [growData, setGrowData]       = useState(null);
  const [loadingGrow, setLoadingGrow] = useState(true);
  const [now, setNow]                 = useState(Date.now());
  const [outdoorWeather, setOutdoorWeather] = useState(null);
  const [showSeedTray, setShowSeedTray]     = useState(false);
  const [pickerVisible, setPickerVisible]           = useState(false);
  const [harvestModalVisible, setHarvestModalVisible] = useState(false);
  const [weekRewardVisible, setWeekRewardVisible]   = useState(false);
  const [weekRewardStrain, setWeekRewardStrain]     = useState(null);
  const [weekRewardMetal, setWeekRewardMetal]       = useState(null);
  const [weekRewardNum, setWeekRewardNum]           = useState(null);
  const [weekRewardLoading, setWeekRewardLoading]   = useState(false);

  // Load persisted grow + outdoor weather on mount
  useEffect(() => {
    AsyncStorage.getItem(RTL_STORAGE_KEY)
      .then(raw => { if (raw) setGrowData(JSON.parse(raw)); })
      .catch(() => {})
      .finally(() => setLoadingGrow(false));
    AsyncStorage.getItem("vyweed_outdoor_weather")
      .then(raw => { if (raw) setOutdoorWeather(JSON.parse(raw)); })
      .catch(() => {});
  }, []);

  // Tick every 60 seconds to update current day + countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Count completed greenhouse grows (for seed tray difficulty matching)
  const growsCompleted = (trophies || []).filter(t => t.source === "greenhouse").length;

  // Derived values
  const totalDays  = growData?.totalDays ?? 91;
  const currentDay = growData ? calcGrowDay(growData.startedAt, totalDays, now) : 1;
  const description = useMemo(() =>
    growData ? getDayDescription(currentDay, growData.strainData) : null,
    [currentDay, growData]
  );
  const metal          = growData ? getMetal(growData.strainData.difficulty, growData.strainData.tier) : "bronze";
  const isHarvest      = description?.isHarvest || currentDay >= totalDays;
  const alreadyHarvested = Boolean(growData?.harvestedAt);
  const msIntoDay      = growData ? (now - growData.startedAt) % MS_PER_GROW_DAY : 0;
  const msToNextDay    = MS_PER_GROW_DAY - msIntoDay;

  // Daily care claim — one token per real calendar day
  const today           = new Date().toISOString().slice(0, 10);
  const canClaimDaily   = Boolean(growData && !growData.harvestedAt && growData.lastDailyClaim !== today);

  // Weekly milestone — every 7 grow days unlocks a bonus strain pull
  const completedWeeks  = Math.floor(currentDay / 7);
  const weeksClaimed    = growData?.weeksClaimed || [];
  const nextUnclaimedWeek = Array.from({ length: completedWeeks }, (_, i) => i + 1)
    .find(w => !weeksClaimed.includes(w));
  const hasWeekReward   = nextUnclaimedWeek !== undefined && !growData?.harvestedAt;

  // Sync Growver context whenever day/stage/weather changes
  useEffect(() => {
    if (!growData || !description) return;
    setGrowverContext("greenhouse", {
      strainName:   growData.strainData.name,
      strainType:   growData.strainData.type,
      tier:         growData.strainData.tier,
      difficulty:   growData.strainData.difficulty,
      thcMax:       growData.strainData.thc_max,
      aroma:        growData.strainData.aroma,
      day:          currentDay,
      totalDays,
      stage:        description.stage,
      stageDesc:    description.stageDesc,
      tip:          description.tip,
      isHarvest,
      rtlMode:      true,
      nextDayIn:    isHarvest ? "harvest ready" : formatCountdown(msToNextDay),
      outdoorTemp:  outdoorWeather?.temp,
      outdoorHumidity: outdoorWeather?.humidity,
      outdoorDesc:  outdoorWeather?.weatherDesc,
      outdoorCity:  outdoorWeather?.city,
    });
  }, [description, currentDay, isHarvest, outdoorWeather]);

  const startGrow = async (strain) => {
    const fw = strain.flower_wk_max || 9;
    const td = (fw + 4) * 7;
    const data = {
      strainData:  strain,
      startedAt:   Date.now(),
      totalDays:   td,
      harvestedAt: null,
    };
    setGrowData(data);
    await AsyncStorage.setItem(RTL_STORAGE_KEY, JSON.stringify(data)).catch(() => {});
    setPickerVisible(false);
  };

  const harvest = async () => {
    if (!growData || alreadyHarvested) return;
    const m = getMetal(growData.strainData.difficulty, growData.strainData.tier);
    await onAddTrophy({
      strainId:   growData.strainData.id,
      strainName: growData.strainData.name,
      tier:       growData.strainData.tier,
      metal:      m,
      date:       new Date().toISOString().slice(0, 10),
      earnedAt:   Date.now(),
      source:     "greenhouse",
    });
    const updated = { ...growData, harvestedAt: Date.now() };
    setGrowData(updated);
    await AsyncStorage.setItem(RTL_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
    setHarvestModalVisible(true);
  };

  const clearAndRestart = async () => {
    setHarvestModalVisible(false);
    setGrowData(null);
    await AsyncStorage.removeItem(RTL_STORAGE_KEY).catch(() => {});
    setPickerVisible(true);
  };

  const claimDaily = async () => {
    if (!canClaimDaily) return;
    const updated = { ...growData, lastDailyClaim: today };
    setGrowData(updated);
    await AsyncStorage.setItem(RTL_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
    await onEarnToken(1);
  };

  const claimWeekReward = async () => {
    if (!hasWeekReward || weekRewardLoading) return;
    setWeekRewardLoading(true);
    try {
      const rolledTier  = rollWeekTier();
      const rolledMetal = TIER_TO_METAL[rolledTier];

      // Fetch random page and pick a strain matching the rolled tier
      const page = Math.floor(Math.random() * TOTAL_PAGES) + 1;
      const r    = await cachedFetch(`${API_BASE}/search?per_page=100&page=${page}&sort=name`);
      const all  = r.data?.results || [];
      const pool = all.filter(s => s.tier === rolledTier);
      const strain = pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : all[Math.floor(Math.random() * all.length)];

      if (!strain) return;

      await onAddTrophy({
        strainId:   strain.id,
        strainName: strain.name,
        tier:       rolledTier,
        metal:      rolledMetal,
        date:       today,
        earnedAt:   Date.now(),
        source:     "greenhouse_weekly",
        weekNumber: nextUnclaimedWeek,
      });

      const updatedWeeks = [...weeksClaimed, nextUnclaimedWeek];
      const updated = { ...growData, weeksClaimed: updatedWeeks };
      setGrowData(updated);
      await AsyncStorage.setItem(RTL_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});

      setWeekRewardStrain(strain);
      setWeekRewardMetal(rolledMetal);
      setWeekRewardNum(nextUnclaimedWeek);
      setWeekRewardVisible(true);
    } catch {} finally {
      setWeekRewardLoading(false);
    }
  };

  const skipDay = async () => {
    if (!growData || isHarvest || alreadyHarvested || tokens < 3 || !onSpendToken) return;
    const ok = await onSpendToken(3);
    if (!ok) return;
    const updated = { ...growData, startedAt: growData.startedAt - MS_PER_GROW_DAY };
    setGrowData(updated);
    await AsyncStorage.setItem(RTL_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  };

  // ── Loading ──
  if (loadingGrow) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.green} size="large" />
      </View>
    );
  }

  // ── No active grow / post-harvest ──
  if (!growData || (alreadyHarvested && !harvestModalVisible)) {
    // Seed tray — replaces strain picker as the primary start-grow flow
    if (showSeedTray) {
      return (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          {/* Manual search modal (escape hatch from seed tray) */}
          <StrainPickerModal
            visible={pickerVisible}
            onClose={() => setPickerVisible(false)}
            onSelect={(strain) => { startGrow(strain); setShowSeedTray(false); }}
          />
          <SeedTray
            trophies={trophies}
            outdoorWeather={outdoorWeather}
            growsCompleted={growsCompleted}
            onSelectStrain={(strain) => { startGrow(strain); setShowSeedTray(false); }}
            onBack={() => setShowSeedTray(false)}
            onSearchAll={() => setPickerVisible(true)}
          />
        </View>
      );
    }

    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 60, marginBottom: 12 }}>🏡</Text>

          {alreadyHarvested ? (
            <>
              <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 30, letterSpacing: 2, textAlign: "center" }}>
                HARVEST COMPLETE
              </Text>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 13, marginTop: 10, textAlign: "center", lineHeight: 20 }}>
                {growData?.strainData?.name} has been added to your collection.{"\n"}Ready for your next grow?
              </Text>
            </>
          ) : (
            <>
              <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 30, letterSpacing: 2, textAlign: "center" }}>
                GREENHOUSE
              </Text>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 13, marginTop: 10, textAlign: "center", lineHeight: 20 }}>
                Seeds matched to your outdoor environment.{"\n"}Growver monitors your plant every step of the way.
              </Text>
            </>
          )}

          <TouchableOpacity
            onPress={() => setShowSeedTray(true)}
            style={{
              marginTop: 28, width: "100%",
              backgroundColor: C.greenFaint,
              borderRadius: 14, borderWidth: 1, borderColor: C.greenDim,
              paddingVertical: 18, alignItems: "center",
            }}>
            <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 22, letterSpacing: 2 }}>
              {alreadyHarvested ? "PICK YOUR NEXT SEED →" : "PICK A SEED →"}
            </Text>
            <Text style={{ color: C.greenDim, fontFamily: SANS, fontSize: 11, marginTop: 4 }}>
              Matched to your {outdoorWeather?.season || "local"} conditions
            </Text>
          </TouchableOpacity>

          {/* Info chips */}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 24, width: "100%" }}>
            {[
              { label: "1 REAL DAY", sub: "= 3 GROW DAYS" },
              { label: "~30 DAYS", sub: "PER 9-WEEK STRAIN" },
            ].map(({ label, sub }) => (
              <View key={label} style={{
                flex: 1, backgroundColor: C.card,
                borderRadius: 12, borderWidth: 1, borderColor: C.border,
                padding: 14, alignItems: "center",
              }}>
                <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 16, letterSpacing: 0.5 }}>{label}</Text>
                <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 9, marginTop: 3 }}>{sub}</Text>
              </View>
            ))}
          </View>

          {/* How it works */}
          <View style={{
            marginTop: 16, width: "100%",
            backgroundColor: C.card, borderRadius: 14,
            borderWidth: 1, borderColor: C.border, padding: 16,
          }}>
            <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>
              HOW IT WORKS
            </Text>
            {[
              "Get seeds matched to your outdoor season and temperature",
              "Your plant advances 3 grow days for every real day",
              "Growver reads your plant's stage and gives live advice",
              "Harvest when ready — earn a trophy you don't already have",
            ].map((step, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
                <Text style={{ color: C.greenDim, fontFamily: HEADING, fontSize: 14, lineHeight: 20 }}>
                  {i + 1}.
                </Text>
                <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 12, lineHeight: 18, flex: 1 }}>
                  {step}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Active grow — seed tray shown over active grow when CHANGE STRAIN tapped ──
  if (showSeedTray) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <StrainPickerModal
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onSelect={(strain) => { startGrow(strain); setShowSeedTray(false); }}
        />
        <SeedTray
          trophies={trophies}
          outdoorWeather={outdoorWeather}
          growsCompleted={growsCompleted}
          onSelectStrain={(strain) => { startGrow(strain); setShowSeedTray(false); }}
          onBack={() => setShowSeedTray(false)}
          onSearchAll={() => setPickerVisible(true)}
        />
      </View>
    );
  }

  // ── Active grow ──
  const m          = METALS[metal];
  const stageCol   = STAGE_COLOUR[description?.stage] || C.green;
  const glyph      = STAGE_GLYPH[description?.stage] || "🌱";
  const progressPct = (currentDay / totalDays) * 100;
  const typeLabel   = growData.strainData.type === "I" ? "INDICA"
                    : growData.strainData.type === "S" ? "SATIVA" : "HYBRID";

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Harvest celebration modal */}
      <WeekRewardModal
        visible={weekRewardVisible}
        week={weekRewardNum}
        strain={weekRewardStrain}
        metal={weekRewardMetal}
        onClose={() => setWeekRewardVisible(false)}
      />

      <HarvestModal
        strain={growData?.strainData}
        metal={metal}
        visible={harvestModalVisible}
        onPlantAgain={clearAndRestart}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>

        {/* ── Strain nameplate ─── */}
        <View style={{
          paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
          borderBottomWidth: 1, borderColor: C.border,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 14 }}>{m.icon}</Text>
            <Text style={{ color: m.colour, fontFamily: HEADING, fontSize: 24, flex: 1, letterSpacing: 1 }}>
              {growData.strainData.name}
            </Text>
            <View style={{
              backgroundColor: `${m.colour}18`,
              borderRadius: 20, borderWidth: 1, borderColor: `${m.colour}60`,
              paddingHorizontal: 8, paddingVertical: 4,
            }}>
              <Text style={{ color: m.colour, fontFamily: SANS_BOLD, fontSize: 8, letterSpacing: 1.5 }}>
                GREENHOUSE
              </Text>
            </View>
            {/* Token count badge */}
            <View style={{
              backgroundColor: "rgba(61,255,160,0.08)",
              borderRadius: 20, borderWidth: 1, borderColor: "rgba(61,255,160,0.30)",
              paddingHorizontal: 8, paddingVertical: 4,
              flexDirection: "row", alignItems: "center", gap: 3,
            }}>
              <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 13 }}>{tokens ?? 0}</Text>
              <Text style={{ fontSize: 11 }}>🎟</Text>
            </View>
          </View>
        </View>

        {/* ── Progress bar + day label ─── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10 }}>DAY 1</Text>
            <Text style={{
              color: isHarvest ? "#ffd700" : C.green,
              fontFamily: HEADING, fontSize: 18, letterSpacing: 1,
              textShadowColor: isHarvest ? "#ffd70060" : `${C.green}60`,
              textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
            }}>
              DAY {currentDay} — {description?.stage?.toUpperCase()}
            </Text>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10 }}>DAY {totalDays}</Text>
          </View>
          <View style={{ height: 3, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" }}>
            <View style={{
              width: `${progressPct}%`, height: 3,
              backgroundColor: isHarvest ? "#ffd700" : C.green,
              borderRadius: 2,
            }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 9 }}>
              {((progressPct)).toFixed(0)}% COMPLETE
            </Text>
            {!isHarvest && (
              <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 9 }}>
                Next grow day in {formatCountdown(msToNextDay)}
              </Text>
            )}
            {isHarvest && (
              <Text style={{ color: "#ffd700", fontFamily: SANS_MED, fontSize: 9 }}>
                HARVEST READY ✦
              </Text>
            )}
          </View>
        </View>

        {/* ── Plant visual ─── */}
        <View style={{ alignItems: "center", paddingVertical: 20 }}>
          <View style={{
            width: 160, height: 160, borderRadius: 80,
            backgroundColor: `${stageCol}0d`,
            borderWidth: 1, borderColor: `${stageCol}22`,
            alignItems: "center", justifyContent: "center",
          }}>
            {/* HUD corners */}
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
            {isHarvest ? "🌿 HARVEST READY" : "🏡 REAL-TIME GROW"}
          </Text>
        </View>

        {/* ── Weekly reward banner ─── */}
        {hasWeekReward && (
          <TouchableOpacity
            onPress={claimWeekReward}
            disabled={weekRewardLoading}
            style={{
              marginHorizontal: 16, marginBottom: 10,
              backgroundColor: "rgba(255,215,0,0.08)",
              borderRadius: 14, borderWidth: 1.5, borderColor: "rgba(255,215,0,0.50)",
              padding: 16, flexDirection: "row", alignItems: "center", gap: 12,
            }}>
            <Text style={{ fontSize: 28 }}>🎁</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#ffd700", fontFamily: HEADING, fontSize: 18, letterSpacing: 1 }}>
                WEEK {nextUnclaimedWeek} REWARD
              </Text>
              <Text style={{ color: "rgba(255,215,0,0.65)", fontFamily: SANS, fontSize: 11, marginTop: 2 }}>
                Bonus strain unlock — T1: 15% · T2: 10% · T3: 35% · T4: 40%
              </Text>
            </View>
            <Text style={{ color: "#ffd700", fontFamily: HEADING, fontSize: 20 }}>
              {weekRewardLoading ? "…" : "ROLL"}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Daily care claim ─── */}
        {canClaimDaily && (
          <TouchableOpacity
            onPress={claimDaily}
            style={{
              marginHorizontal: 16, marginBottom: 10,
              backgroundColor: C.greenFaint,
              borderRadius: 14, borderWidth: 1, borderColor: C.greenDim,
              padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
            }}>
            <Text style={{ fontSize: 24 }}>🌟</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 16, letterSpacing: 1 }}>
                DAILY CARE
              </Text>
              <Text style={{ color: C.greenDim, fontFamily: SANS, fontSize: 11, marginTop: 1 }}>
                You checked in today — claim your token
              </Text>
            </View>
            <View style={{
              backgroundColor: "rgba(61,255,160,0.15)",
              borderRadius: 10, borderWidth: 1, borderColor: C.greenDim,
              paddingHorizontal: 10, paddingVertical: 6,
            }}>
              <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 16 }}>+1 🎟</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Skip day button ─── */}
        {!isHarvest && !alreadyHarvested && tokens >= 3 && (
          <TouchableOpacity
            onPress={skipDay}
            style={{
              marginHorizontal: 16, marginBottom: 10,
              backgroundColor: "rgba(193,122,74,0.08)",
              borderRadius: 14, borderWidth: 1, borderColor: "rgba(193,122,74,0.35)",
              padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
            }}>
            <Text style={{ fontSize: 22 }}>⏩</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 16, letterSpacing: 1 }}>
                SKIP A DAY
              </Text>
              <Text style={{ color: "rgba(193,122,74,0.65)", fontFamily: SANS, fontSize: 11, marginTop: 1 }}>
                Advance plant by 1 grow day — doesn't affect daily token claim
              </Text>
            </View>
            <View style={{
              backgroundColor: "rgba(193,122,74,0.12)",
              borderRadius: 10, borderWidth: 1, borderColor: "rgba(193,122,74,0.40)",
              paddingHorizontal: 10, paddingVertical: 6,
            }}>
              <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 15 }}>3 🎟</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Outdoor conditions card ─── */}
        {outdoorWeather && (
          <View style={{
            marginHorizontal: 16, marginBottom: 10,
            backgroundColor: "rgba(91,155,213,0.06)",
            borderRadius: 14, borderWidth: 1, borderColor: "rgba(91,155,213,0.20)",
            padding: 14,
          }}>
            <Text style={{ color: "rgba(91,155,213,0.70)", fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 8 }}>
              🌤  YOUR OUTDOOR CONDITIONS
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.blue, fontFamily: HEADING, fontSize: 28 }}>
                  {outdoorWeather.temp}°C
                </Text>
                <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 11, marginTop: 2 }}>
                  {outdoorWeather.weatherDesc}
                </Text>
                {outdoorWeather.city ? (
                  <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 2 }}>
                    📍 {outdoorWeather.city}
                  </Text>
                ) : null}
              </View>
              <View style={{ gap: 4 }}>
                {outdoorWeather.humidity !== undefined && (
                  <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 11 }}>
                    💧 {outdoorWeather.humidity}% humidity
                  </Text>
                )}
                {outdoorWeather.wind !== undefined && (
                  <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 11 }}>
                    💨 {outdoorWeather.wind}km/h wind
                  </Text>
                )}
                {outdoorWeather.uv !== undefined && (
                  <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 11 }}>
                    ☀️ UV {outdoorWeather.uv}
                  </Text>
                )}
              </View>
            </View>
            <Text style={{ color: "rgba(91,155,213,0.50)", fontFamily: SANS, fontSize: 10, marginTop: 8 }}>
              Your plant is experiencing these real outdoor conditions
            </Text>
          </View>
        )}

        {/* ── Harvest button ─── */}
        {isHarvest && !alreadyHarvested && (
          <TouchableOpacity
            onPress={harvest}
            style={{
              marginHorizontal: 16, marginBottom: 16,
              backgroundColor: `${m.colour}10`,
              borderRadius: 16, borderWidth: 1.5, borderColor: `${m.colour}70`,
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

        {/* ── Description cards ─── */}
        {description && (
          <View style={{ paddingHorizontal: 16 }}>
            {/* What you see */}
            <View style={{
              backgroundColor: C.card,
              borderRadius: 14, borderWidth: 1, borderColor: C.border,
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

            {/* Smell */}
            <View style={{
              backgroundColor: C.card,
              borderRadius: 14, borderWidth: 1, borderColor: C.border,
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
              backgroundColor: C.card,
              borderRadius: 14, borderWidth: 1, borderColor: C.border,
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
              padding: 14, marginBottom: 10,
            }}>
              <Text style={{ color: C.greenDim, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 6 }}>
                💡  IF THIS WERE REAL
              </Text>
              <Text style={{ color: C.white, fontFamily: SANS, fontSize: 12, lineHeight: 19, opacity: 0.82 }}>
                {description.tip}
              </Text>
            </View>

            {/* Strain info chips */}
            <View style={{
              backgroundColor: C.card,
              borderRadius: 14, borderWidth: 1, borderColor: C.border,
              padding: 16, marginBottom: 10,
            }}>
              <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 10, letterSpacing: 2, marginBottom: 12 }}>
                STRAIN INFO
              </Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {[
                  { l: "THC",    v: `${growData.strainData.thc_max}%`,  c: C.red },
                  { l: "TYPE",   v: typeLabel,                           c: C.blue },
                  { l: "FLOWER", v: `${growData.strainData.flower_wk_max}WK`, c: C.amber },
                  { l: "TIER",   v: growData.strainData.tier,            c: m.colour },
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

            {/* Replace strain */}
            <TouchableOpacity
              onPress={() => setShowSeedTray(true)}
              style={{
                backgroundColor: C.surface,
                borderRadius: 12, borderWidth: 1, borderColor: C.border,
                padding: 14, alignItems: "center",
              }}>
              <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 16, letterSpacing: 1 }}>
                🔄  CHANGE STRAIN
              </Text>
              <Text style={{ color: C.grey, fontFamily: SANS, fontSize: 10, marginTop: 2 }}>
                Abandons current grow
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
