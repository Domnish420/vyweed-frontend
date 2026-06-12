/**
 * VYWEED Strain Browser
 * React Native / Expo — drop into your Expo project
 *
 * Connects to: GET /api/v1/search
 *              GET /api/v1/search/suggest
 *              GET /api/v1/search/strain/:id
 *              GET /api/v1/search/stats
 *              GET /api/v1/search/filters
 *
 * Usage: import VYWEEDStrainBrowser from './VYWEEDStrainBrowser'
 *        Add to your navigator or render directly as a screen
 *
 * Optional prop: onSelectStrain(strain) — called when user taps "Start Grow"
 *                so you can navigate to the grow tracker with that strain pre-filled
 */

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from "react";import {
  View, Text, ScrollView, FlatList, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Animated, Dimensions,
  Platform, StatusBar, Alert,
} from "react-native";
import { cachedFetch, formatCacheAge } from "./cache";
import OfflineBanner from "./OfflineBanner";
import AsyncStorage from "@react-native-async-storage/async-storage";
import StrainComparison from "./StrainComparison";
import YieldCalculator from "./YieldCalculator";
import { useAppMode } from "./AppMode";

const { width: SW, height: SH } = Dimensions.get("window");

// ── Config ────────────────────────────────────────────────────────────────────
import { getApiV1, BACKEND_HEADERS } from "./apiConfig";
const API_BASE = { toString: () => getApiV1() };
// All `${API_BASE}` usages will now call getApiV1() at interpolation time.

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:          "#0a0f0a",
  surface:     "#0f150f",
  card:        "#141a13",
  border:      "#2a3d2e",
  green:       "#4d7358",
  greenDim:    "#3a5c44",
  greenFaint:  "#1a2d1f",
  greenBright: "#6db87f",
  amber:       "#c17a4a",
  red:         "#b85c3a",
  blue:        "#5b9bd5",
  purple:      "#9b7fc7",
  white:       "#e8e4d9",
  grey:        "#4a5a4a",
  greyLight:   "#8a9e8c",
};

const HEADING  = "BebasNeue_400Regular";
const SANS     = "SpaceGrotesk_400Regular";
const SANS_MED = "SpaceGrotesk_500Medium";
const SANS_BOLD = "SpaceGrotesk_700Bold";
const MONO = SANS;

// ── API ───────────────────────────────────────────────────────────────────────
const api = {
  async get(path) {
    const result = await cachedFetch(`${API_BASE}${path}`);
    return result.data;
  },
  async getWithMeta(path) {
    return await cachedFetch(`${API_BASE}${path}`);
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const TYPE_COLOUR = { indica: C.purple, sativa: C.green, hybrid: C.amber };
const TYPE_ICON   = { indica: "◆", sativa: "▲", hybrid: "◈" };
const DIFF_COLOUR = { beginner: C.green, intermediate: C.amber, advanced: C.red };
const DIFF_ICON   = { beginner: "●", intermediate: "●●", advanced: "●●●" };
const EFFECT_ICON = { uplifting: "⬆", balanced: "⟺", sedating: "⬇" };
const EFFECT_COLOUR = { uplifting: C.green, balanced: C.amber, sedating: C.purple };

const TIER_DESC = {
  T1: "Pure landrace", T2: "Foundational classic",
  T3: "Modern staple", T4: "New wave / Auto",
};

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// ── Shared components ─────────────────────────────────────────────────────────
function Label({ children, style }) {
  return (
    <Text style={[{
      color: C.greyLight, fontFamily: HEADING, fontSize: 13,
      letterSpacing: 1,
    }, style]}>
      {children}
    </Text>
  );
}

function Tag({ label, colour, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress} disabled={!onPress} activeOpacity={onPress ? 0.7 : 1}
      style={{
        backgroundColor: `${colour || C.green}22`,
        borderWidth: 1, borderColor: colour || C.green,
        borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3,
      }}
    >
      <Text style={{ color: colour || C.green, fontFamily: SANS_MED, fontSize: 11 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function THCBar({ min, max }) {
  const pct = clamp(((max - 0) / 35) * 100, 0, 100);
  const col = max >= 25 ? C.red : max >= 20 ? C.amber : C.green;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
      <View style={{ flex: 1, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: 4, backgroundColor: col, borderRadius: 2 }} />
      </View>
      <Text style={{ color: col, fontFamily: MONO, fontSize: 11, fontWeight: "bold", width: 52 }}>
        {min}–{max}%
      </Text>
    </View>
  );
}

// ── Terpene knowledge base ────────────────────────────────────────────────────
const TERPENE_INFO = {
  "Myrcene": {
    icon: "🌿",
    colour: "#39ff45",
    aroma: "Earthy, musky, herbal, cloves",
    effect: "Sedating, relaxing, body-heavy",
    found_in: "Mango, hops, lemongrass, thyme",
    boiling_pt: "167°C / 332°F",
    synergy: "Enhances THC absorption — increases blood-brain barrier permeability. The 'couch-lock' terpene.",
    strains: "OG Kush, Blue Dream, Granddaddy Purple, Bubba Kush",
    medical: "Anti-inflammatory, muscle relaxant, mild sedative. Popular for pain and sleep.",
    fun_fact: "Myrcene is the most abundant terpene in most cannabis strains. Eating a mango 45 minutes before consuming cannabis may enhance the high due to myrcene content.",
  },
  "Limonene": {
    icon: "🍋",
    colour: "#ffb830",
    aroma: "Citrus, lemon, orange, fresh",
    effect: "Uplifting, mood-elevating, energetic",
    found_in: "Lemons, oranges, grapefruit, juniper",
    boiling_pt: "176°C / 349°F",
    synergy: "Works with CBD to reduce anxiety. Enhances absorption of other terpenes through skin and mucous membranes.",
    strains: "Super Lemon Haze, Lemon Skunk, Tangie, Clementine",
    medical: "Anti-anxiety, antidepressant, antifungal. Used in aromatherapy for stress relief.",
    fun_fact: "Limonene is used in cleaning products and cosmetics for its fresh scent. It's responsible for the classic 'lemon' cannabis aroma.",
  },
  "Beta-Caryophyllene": {
    icon: "🌶",
    colour: "#ff3a3a",
    aroma: "Spicy, peppery, woody, cloves",
    effect: "Anti-inflammatory, calming without sedation",
    found_in: "Black pepper, cloves, cinnamon, basil",
    boiling_pt: "160°C / 320°F",
    synergy: "The only terpene that directly activates CB2 receptors — acts like a cannabinoid. Reduces inflammation without psychoactive effect.",
    strains: "GSC, Rockstar, Bubba Kush, Sour Diesel",
    medical: "Anti-inflammatory, pain relief, may help with arthritis. Being studied for anxiety and depression.",
    fun_fact: "Beta-Caryophyllene is the only terpene known to interact directly with the endocannabinoid system. It's why black pepper can reduce a THC anxiety episode — sniff or chew black pepper.",
  },
  "Terpinolene": {
    icon: "🌲",
    colour: "#30d5ff",
    aroma: "Fresh, piney, floral, herbaceous, citrus",
    effect: "Uplifting, energetic, creative — least sedating terpene",
    found_in: "Apples, cumin, lilac, tea tree, nutmeg",
    boiling_pt: "186°C / 367°F",
    synergy: "Associated with uplifting sativa effects. Often dominant in Jack Herer and Trainwreck lineages.",
    strains: "Jack Herer, Ghost Train Haze, Chernobyl, Dutch Treat",
    medical: "Antioxidant, mild antibacterial, antifungal. Being researched for cancer cell inhibition.",
    fun_fact: "Terpinolene is rare as a dominant terpene — only about 1 in 10 strains have it as primary. Strains with dominant terpinolene are almost always reported as uplifting.",
  },
  "Linalool": {
    icon: "💜",
    colour: "#c084fc",
    aroma: "Floral, lavender, sweet, spice",
    effect: "Calming, anti-anxiety, slightly sedating",
    found_in: "Lavender, mint, cinnamon, coriander",
    boiling_pt: "198°C / 388°F",
    synergy: "Modulates serotonin receptors. Reduces anxiety caused by THC. Works synergistically with CBD for sleep.",
    strains: "Amnesia Haze, Special Kush, Lavender, Pink Kush",
    medical: "Anti-anxiety, anticonvulsant, antidepressant, sleep aid. Used in aromatherapy.",
    fun_fact: "Linalool is what gives lavender its distinctive scent and relaxing properties. It's been shown to reduce anxiety in mice even when just inhaled as a vapour.",
  },
  "Pinene": {
    icon: "🌲",
    colour: "#39ff45",
    aroma: "Pine, fresh forest, sharp",
    effect: "Alert, memory retention, counteracts THC short-term memory loss",
    found_in: "Pine needles, rosemary, basil, dill, parsley",
    boiling_pt: "155°C / 311°F",
    synergy: "Alpha-pinene inhibits acetylcholinesterase — the enzyme that breaks down memory neurotransmitters. May counteract short-term memory impairment from THC.",
    strains: "Jack Herer, Strawberry Cough, Blue Dream, Island Sweet Skunk",
    medical: "Bronchodilator (opens airways), anti-inflammatory, antibacterial. Used by people with asthma.",
    fun_fact: "Pinene is one of the most common terpenes in nature. Walking through a pine forest exposes you to significant pinene — the 'forest bathing' health benefits may partly come from it.",
  },
  "Ocimene": {
    icon: "🌸",
    colour: "#f9a8d4",
    aroma: "Sweet, herbal, woody, citrus",
    effect: "Uplifting, energetic, antiviral",
    found_in: "Mint, parsley, pepper, basil, orchids",
    boiling_pt: "66°C / 151°F",
    synergy: "Very low boiling point — evaporates quickly. Works with limonene for uplifting effects.",
    strains: "Clementine, Golden Goat, Strawberry Cough, Agent Orange",
    medical: "Antifungal, antiviral, decongestant. Being studied as an antibacterial agent.",
    fun_fact: "Ocimene has such a low boiling point that it may be the first terpene to evaporate when cannabis is improperly stored. This is why poorly stored cannabis loses its sweet aroma first.",
  },
  "Humulene": {
    icon: "🍺",
    colour: "#92400e",
    aroma: "Earthy, woody, hoppy, spicy",
    effect: "Appetite suppressant, anti-inflammatory",
    found_in: "Hops, cloves, basil, coriander",
    boiling_pt: "106°C / 222°F",
    synergy: "Works with beta-caryophyllene for anti-inflammatory effects. The only terpene associated with appetite suppression.",
    strains: "Girl Scout Cookies, Sour Diesel, White Widow, Headband",
    medical: "Anti-inflammatory, antibacterial, appetite suppressant. Researched for tumour suppression.",
    fun_fact: "Humulene is what gives beer its hoppy aroma — hops and cannabis are botanical cousins in the Cannabaceae family. It's the reason some cannabis strains smell like craft beer.",
  },
  "Bisabolol": {
    icon: "🌼",
    colour: "#fde68a",
    aroma: "Floral, sweet, slightly spicy",
    effect: "Calming, anti-irritant, skin healing",
    found_in: "Chamomile, candeia tree",
    boiling_pt: "153°C / 307°F",
    synergy: "Enhances absorption of other compounds through skin. Anti-irritant properties make it popular in skincare.",
    strains: "ACDC, Headband, Pink Kush, Oracle",
    medical: "Anti-inflammatory, antimicrobial, analgesic. Used extensively in cosmetics and skincare.",
    fun_fact: "Bisabolol has been used in cosmetics for centuries. It's the active compound in chamomile that soothes irritated skin.",
  },
  "Caryophyllene Oxide": {
    icon: "🔬",
    colour: "#6b7280",
    aroma: "Woody, dry, waxy",
    effect: "Antifungal, mild relaxation",
    found_in: "Oxidised caryophyllene, lemon balm",
    boiling_pt: "N/A — oxidation product",
    synergy: "The compound drug dogs are trained to detect in cannabis. Formed when beta-caryophyllene oxidises.",
    strains: "Found in aged/dried cannabis across many strains",
    medical: "Antifungal, antioxidant. Being studied for Alzheimer's.",
    fun_fact: "Caryophyllene oxide is the compound that drug-sniffing dogs are actually detecting — not THC. It's more volatile and easier to smell.",
  },
  "Valencene": {
    icon: "🍊",
    colour: "#f97316",
    aroma: "Fresh citrus, orange, grapefruit",
    effect: "Uplifting, energetic",
    found_in: "Valencia oranges, tangerines",
    boiling_pt: "N/A",
    synergy: "Works with limonene for enhanced citrus effects and mood elevation.",
    strains: "Tangie, Agent Orange, Clementine",
    medical: "Anti-inflammatory, insect repellent",
    fun_fact: "Valencene is named after Valencia oranges. It's used as a natural insect repellent and is being studied as an eco-friendly pesticide.",
  },
  "Geraniol": {
    icon: "🌹",
    colour: "#fb7185",
    aroma: "Rose, floral, fruity, sweet",
    effect: "Relaxing, neuroprotective",
    found_in: "Roses, geraniums, lemon, tobacco",
    boiling_pt: "230°C / 446°F",
    synergy: "Neuroprotective properties — being studied for Parkinson's and neuropathy.",
    strains: "Amnesia Haze, Great White Shark, OG Shark",
    medical: "Neuroprotective, antioxidant, antifungal. Used in insect repellents.",
    fun_fact: "Geraniol is one of the primary components in rose oil. Bees produce geraniol as a hive-marking scent to guide other bees back to the hive.",
  },
  "Eucalyptol": {
    icon: "🌿",
    colour: "#34d399",
    aroma: "Minty, cooling, eucalyptus, camphor",
    effect: "Stimulating, alerting, cooling",
    found_in: "Eucalyptus, tea tree, bay leaves, sage",
    boiling_pt: "176°C / 349°F",
    synergy: "Being studied for Alzheimer's — may slow the growth of bacteria associated with the disease.",
    strains: "Super Silver Haze, ACE of Spades, Headband",
    medical: "Anti-inflammatory, antibacterial, pain relief. Active ingredient in mouthwash and cough medicine.",
    fun_fact: "Eucalyptol (also called 1,8-cineole) is the main component of eucalyptus oil. Koalas eat eucalyptus leaves almost exclusively despite their toxicity to most other animals.",
  },
};

// ── Terpene Info Modal ────────────────────────────────────────────────────────
function TerpeneModal({ terpene, onClose }) {
  if (!terpene) return null;
  const info = TERPENE_INFO[terpene];

  return (
    <Modal visible={!!terpene} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          borderTopWidth: 2, borderColor: info?.colour || C.green,
          maxHeight: "88%",
        }}>
          {/* Handle */}
          <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2 }} />
          </View>

          {/* Header */}
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingHorizontal: 16, paddingBottom: 12,
            borderBottomWidth: 1, borderColor: C.border,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 28 }}>{info?.icon || "🧪"}</Text>
              <View>
                <Text style={{ color: info?.colour || C.green, fontFamily: MONO,
                  fontSize: 18, fontWeight: "bold" }}>
                  {terpene}
                </Text>
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11 }}>
                  TERPENE PROFILE
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {info ? (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

              {/* Aroma */}
              <View style={{
                backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.border,
                padding: 12, marginBottom: 10,
              }}>
                <Label style={{ marginBottom: 4 }}>AROMA & FLAVOUR</Label>
                <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, lineHeight: 19 }}>
                  👃 {info.aroma}
                </Text>
              </View>

              {/* Effect */}
              <View style={{
                backgroundColor: `${info.colour}15`, borderRadius: 8,
                borderWidth: 1, borderColor: info.colour,
                padding: 12, marginBottom: 10,
              }}>
                <Label style={{ marginBottom: 4, color: info.colour }}>EFFECT</Label>
                <Text style={{ color: info.colour, fontFamily: MONO,
                  fontSize: 13, lineHeight: 19, fontWeight: "bold" }}>
                  ⚡ {info.effect}
                </Text>
              </View>

              {/* Found in + Boiling point */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                <View style={{
                  flex: 1, backgroundColor: C.surface, borderRadius: 8,
                  borderWidth: 1, borderColor: C.border, padding: 12,
                }}>
                  <Label style={{ marginBottom: 4 }}>FOUND IN</Label>
                  <Text style={{ color: C.white, fontFamily: MONO, fontSize: 12, lineHeight: 18 }}>
                    🌿 {info.found_in}
                  </Text>
                </View>
                <View style={{
                  flex: 1, backgroundColor: C.surface, borderRadius: 8,
                  borderWidth: 1, borderColor: C.border, padding: 12,
                }}>
                  <Label style={{ marginBottom: 4 }}>BOILING POINT</Label>
                  <Text style={{ color: C.blue, fontFamily: MONO,
                    fontSize: 14, fontWeight: "bold", marginTop: 2 }}>
                    {info.boiling_pt}
                  </Text>
                </View>
              </View>

              {/* How it works */}
              <View style={{
                backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.border,
                padding: 12, marginBottom: 10,
              }}>
                <Label style={{ marginBottom: 6 }}>HOW IT WORKS (SYNERGY)</Label>
                <Text style={{ color: C.greyLight, fontFamily: MONO,
                  fontSize: 12, lineHeight: 18 }}>
                  🔬 {info.synergy}
                </Text>
              </View>

              {/* Medical */}
              <View style={{
                backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.border,
                padding: 12, marginBottom: 10,
              }}>
                <Label style={{ marginBottom: 6 }}>MEDICAL USES</Label>
                <Text style={{ color: C.greyLight, fontFamily: MONO,
                  fontSize: 12, lineHeight: 18 }}>
                  💊 {info.medical}
                </Text>
              </View>

              {/* Known strains */}
              <View style={{
                backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.border,
                padding: 12, marginBottom: 10,
              }}>
                <Label style={{ marginBottom: 6 }}>KNOWN FOR</Label>
                <Text style={{ color: C.amber, fontFamily: MONO,
                  fontSize: 12, lineHeight: 18 }}>
                  🌱 {info.strains}
                </Text>
              </View>

              {/* Fun fact */}
              <View style={{
                backgroundColor: C.greenFaint, borderRadius: 8,
                borderWidth: 1, borderColor: C.greenDim,
                padding: 12,
              }}>
                <Label style={{ marginBottom: 6, color: C.greenDim }}>DID YOU KNOW?</Label>
                <Text style={{ color: C.white, fontFamily: MONO,
                  fontSize: 12, lineHeight: 18 }}>
                  💡 {info.fun_fact}
                </Text>
              </View>

            </ScrollView>
          ) : (
            <View style={{ padding: 20, alignItems: "center" }}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 13 }}>
                No detailed info available for {terpene} yet.
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Universal Info Modal ──────────────────────────────────────────────────────
const SCREEN_INFO = {
  browse: {
    title: "STRAIN BROWSER",
    emoji: "🌿",
    what: "This is a library of 5,042 cannabis strains. A strain is a specific variety of cannabis plant — like how there are thousands of varieties of apples, there are thousands of varieties of cannabis, each with different effects, aromas, and growing characteristics.",
    sections: [
      {
        icon: "🔍",
        title: "SEARCH BAR",
        text: "Type any strain name here. As you type, suggestions appear — tap one to go straight to its page. You can search by name, parent genetics, or aroma.",
      },
      {
        icon: "⚙",
        title: "FILTER BUTTON (the gear icon)",
        text: "Tap this to narrow down strains by type (indica/sativa/hybrid), effect (uplifting/balanced/sedating), difficulty, THC strength, terpenes, and more. Active filters show as coloured pills you can tap to remove.",
      },
      {
        icon: "🎯",
        title: "FIND MINE BUTTON",
        text: "Answer 5 simple questions about your experience level, desired effect, available space, and THC preference. The app recommends the best strains for your exact situation.",
      },
      {
        icon: "📊",
        title: "STRAIN CARDS",
        text: "Each card shows: strain name, genetic lineage (its parents), THC range (the psychoactive strength), type, effect, how long it takes to flower, expected yield, and terpenes (the aromatic compounds that shape the effect). Tap any card to see full details.",
      },
      {
        icon: "🧬",
        title: "TIERS EXPLAINED",
        text: "T1 = Pure landraces (ancient original genetics from their homeland). T2 = Foundational classics (the building blocks of modern cannabis). T3 = Modern staples (popular strains from the last 20 years). T4 = New wave and autoflowers (latest genetics, including strains that flower automatically without changing light schedules).",
      },
    ],
    tip: "Start by tapping FIND MINE if you're not sure what you want. If you already know a strain, search it directly.",
  },

  detail: {
    title: "STRAIN DETAIL",
    emoji: "🔬",
    what: "This is the full profile for a single cannabis strain. Think of it like a detailed passport for this specific plant variety — everything you need to know before growing or using it.",
    sections: [
      {
        icon: "💊",
        title: "THC & CBD",
        text: "THC is the main psychoactive compound — the higher the percentage, the stronger the effect. CBD is non-psychoactive and associated with medical benefits. The indica/sativa split bar shows the genetic balance: indica (purple) tends toward body-heavy sedating effects, sativa (green) toward cerebral uplifting effects.",
      },
      {
        icon: "📈",
        title: "GROW STATS",
        text: "Flower time = how many weeks the plant takes to produce buds after switching to 12/12 light (or automatically for T4). Yield = how many grams per square metre you can expect indoors. Height = how tall the plant grows. Difficulty = how much experience and attention it needs.",
      },
      {
        icon: "🧪",
        title: "TERPENES (TAP EACH ONE)",
        text: "Terpenes are aromatic compounds that give cannabis its smell and shape its effect. They're found in all plants — limonene in lemons, myrcene in mangoes, linalool in lavender. TAP any terpene to get its full profile: what it smells like, what it does, where else it's found in nature, and the science behind how it works.",
      },
      {
        icon: "🧬",
        title: "GENETICS (TAP EACH PARENT)",
        text: "Every strain has parent strains — tap any parent name to jump to its page. This lets you trace the genetic family tree. Understanding parents helps predict how a strain will grow and what it will feel like.",
      },
      {
        icon: "🌱",
        title: "START GROW BUTTON",
        text: "Tap this to add this strain to your Grow Tracker. The app will then give you daily guidance specific to this strain throughout its entire life cycle.",
      },
    ],
    tip: "Tap terpenes to understand why a strain smells and feels the way it does. Tap parent strains to trace its genetic history.",
  },

  recommend: {
    title: "STRAIN RECOMMENDER",
    emoji: "🎯",
    what: "This tool asks you 5 questions and finds the strains that best match your situation. It searches all 5,042 strains simultaneously and scores each one against your preferences.",
    sections: [
      {
        icon: "🎓",
        title: "EXPERIENCE LEVEL",
        text: "Beginner = easy to grow, forgiving of mistakes, shorter flower time. Intermediate = some experience needed. Advanced = demanding strains that need precise environmental control but often produce exceptional results.",
      },
      {
        icon: "⚡",
        title: "DESIRED EFFECT",
        text: "Uplifting = energetic, creative, cerebral — better for daytime. Balanced = moderate effect, works well any time. Sedating = relaxing, body-heavy, better for evening and sleep.",
      },
      {
        icon: "💪",
        title: "THC PREFERENCE",
        text: "Low = under 15% THC, milder effect, better for sensitive users or microdosing. Medium = 15-22%, the most common range. High = above 22%, very strong, recommended for experienced users only.",
      },
      {
        icon: "📏",
        title: "MAX HEIGHT",
        text: "How tall can your plant grow? Enter the maximum height in centimetres. This filters out strains that would outgrow your space. 60cm fits a small cabinet. 100cm fits a standard tent. 200cm+ is for large rooms or outdoors.",
      },
      {
        icon: "⏱",
        title: "AUTOFLOWERS",
        text: "Normal (photoperiod) plants need you to manually change the light from 18 hours to 12 hours per day to trigger flowering. Autoflowers flower automatically after a fixed number of weeks regardless of light — much simpler for beginners.",
      },
    ],
    tip: "If you're completely new, choose beginner + auto + medium THC + your available height. You'll get a shortlist of forgiving, fast, manageable strains.",
  },

  grows: {
    title: "MY GROWS",
    emoji: "📊",
    what: "This is your personal grow journal. Every cannabis plant you grow is tracked here from the first day it sprouts to harvest day. The app uses the strain's specific genetic data to give you personalised daily guidance — not generic advice.",
    sections: [
      {
        icon: "🌱",
        title: "STARTING A GROW",
        text: "Tap + NEW GROW, search for your strain, enter the date you planted (or germinated), and choose your growing medium. The app does the rest — calculating stages, timing, and what to do each day.",
      },
      {
        icon: "📋",
        title: "DAILY CHECKLIST",
        text: "Each day the app generates a checklist specific to where your plant is in its life cycle. Day 1 tasks are different from Day 30 tasks. The checklist tells you exactly what to check, adjust, and do.",
      },
      {
        icon: "🌡",
        title: "CHECK-IN",
        text: "Tap CHECK IN to log today's environment: temperature, humidity, pH (the acidity of your water), and EC (the nutrient concentration). The app analyses these readings against ideal targets for your strain and stage, then alerts you if anything is wrong.",
      },
      {
        icon: "🚨",
        title: "ALERTS",
        text: "If your temperature is too high, humidity too low, or pH is off — the app tells you exactly what's wrong, what will happen to your plant if you don't fix it, and precisely how to fix it.",
      },
      {
        icon: "📅",
        title: "HARVEST COUNTDOWN",
        text: "The app calculates your harvest window based on when you started and your strain's genetics. It shows earliest possible harvest, typical harvest, and latest harvest dates. Always confirm harvest timing by examining trichomes (tiny crystals on the buds) under a magnifying loupe.",
      },
    ],
    tip: "Log a check-in every day, even if nothing changes. Consistent data lets the app spot trends before they become problems.",
  },

  vpd: {
    title: "VPD CALCULATOR",
    emoji: "🌡",
    what: "VPD stands for Vapour Pressure Deficit. It measures the difference between how much moisture the air is holding and how much it could hold. Plants use this to regulate how hard they work to transpire (breathe through their leaves). Getting VPD right is one of the most important and most overlooked factors in cannabis cultivation.",
    sections: [
      {
        icon: "📐",
        title: "WHAT THE NUMBER MEANS",
        text: "VPD is measured in kPa (kilopascals). Too low (under 0.4) = air is too humid, plant can't transpire, risk of mould and nutrient lockout. Too high (over 2.0) = air is too dry, plant is stressed and closing stomata to conserve water. The green zone on the bar is your target.",
      },
      {
        icon: "🌡",
        title: "TEMPERATURE",
        text: "This is your air temperature — not the temperature of the plant or the light. Use a thermometer at plant canopy height for the most accurate reading. The app assumes leaf temperature is 2°C cooler than air temperature, which is standard for most indoor grows.",
      },
      {
        icon: "💧",
        title: "HUMIDITY",
        text: "This is relative humidity — the percentage of maximum moisture the air is holding. Measure it with a hygrometer placed at canopy height. Different grow stages need different humidity: seedlings like it high (70%+), late flower needs it low (40-50%) to prevent bud rot.",
      },
      {
        icon: "🌸",
        title: "GROW STAGE",
        text: "Each stage of the plant's life has different VPD targets. Seedlings need gentler conditions. Vegetative plants can handle more range. Flowering plants need tighter control. Late flower plants benefit from lower humidity to increase trichome production and prevent mould.",
      },
      {
        icon: "📊",
        title: "REFERENCE TABLE",
        text: "The table at the bottom shows what humidity you need at different temperatures to hit the ideal VPD for your chosen stage. Your current temperature is highlighted. Use this to quickly dial in your environment without trial and error.",
      },
    ],
    tip: "If your VPD is wrong, fix humidity before fixing temperature — humidity is easier and faster to change with a humidifier or dehumidifier.",
  },

  settings: {
    title: "SETTINGS",
    emoji: "⚙",
    what: "Configure VYWEED to match your setup. These settings are saved to your device and remembered between sessions.",
    sections: [
      {
        icon: "🔗",
        title: "API URL",
        text: "This is the address of the VYWEED backend server. The backend runs on your PC — make sure it's started with start.ps1 and your phone is on the same WiFi. The URL is auto-detected from the Metro server IP.",
      },
      {
        icon: "🧪",
        title: "TEST CONNECTION",
        text: "Tap this to check if the app can reach the backend server. If it fails, make sure the backend (start.ps1) and Ollama are running on your PC, and that your phone is on the same WiFi network.",
      },
      {
        icon: "📏",
        title: "UNITS",
        text: "Metric = grams, centimetres, Celsius. Imperial = ounces, inches, Fahrenheit. This affects how yield, height, and temperature are displayed throughout the app.",
      },
      {
        icon: "🌱",
        title: "DEFAULT MEDIUM",
        text: "Your growing medium is what your plant's roots live in. Soil = the most forgiving, best for beginners, natural buffer for pH. Coco = coconut fibre, faster growth, more control needed. Hydro = roots in water, fastest growth, most technical.",
      },
    ],
    tip: "If the app shows 'connection error' anywhere, come here first and tap TEST CONNECTION to diagnose the problem.",
  },
};

function InfoModal({ screen, onClose }) {
  const info = SCREEN_INFO[screen];
  if (!info) return null;

  return (
    <Modal visible={!!screen} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: C.card,
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          borderTopWidth: 2, borderColor: C.green,
          maxHeight: "92%",
        }}>
          {/* Handle */}
          <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2 }} />
          </View>

          {/* Header */}
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingHorizontal: 16, paddingBottom: 12,
            borderBottomWidth: 1, borderColor: C.border,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 28 }}>{info.emoji}</Text>
              <View>
                <Text style={{ color: C.green, fontFamily: MONO,
                  fontSize: 16, fontWeight: "bold" }}>
                  {info.title}
                </Text>
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
                  HOW TO USE THIS SCREEN
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

            {/* What is this screen */}
            <View style={{
              backgroundColor: C.greenFaint, borderRadius: 8,
              borderWidth: 1, borderColor: C.greenDim,
              padding: 14, marginBottom: 16,
            }}>
              <Label style={{ color: C.greenDim, marginBottom: 6 }}>WHAT IS THIS?</Label>
              <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, lineHeight: 20 }}>
                {info.what}
              </Text>
            </View>

            {/* Sections */}
            {info.sections.map((s, i) => (
              <View key={i} style={{
                backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.border,
                padding: 14, marginBottom: 10,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 18 }}>{s.icon}</Text>
                  <Text style={{ color: C.green, fontFamily: MONO,
                    fontSize: 12, fontWeight: "bold" }}>
                    {s.title}
                  </Text>
                </View>
                <Text style={{ color: C.greyLight, fontFamily: MONO,
                  fontSize: 12, lineHeight: 19 }}>
                  {s.text}
                </Text>
              </View>
            ))}

            {/* Pro tip */}
            <View style={{
              backgroundColor: "#0d1a2a", borderRadius: 8,
              borderWidth: 1, borderColor: C.blue,
              padding: 14,
            }}>
              <Label style={{ color: C.blue, marginBottom: 6 }}>💡 PRO TIP</Label>
              <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, lineHeight: 19 }}>
                {info.tip}
              </Text>
            </View>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Info Button component ─────────────────────────────────────────────────────
function InfoBtn({ onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: C.surface,
        borderWidth: 1, borderColor: C.greenDim,
        alignItems: "center", justifyContent: "center",
      }}>
      <Text style={{ color: C.green, fontFamily: MONO,
        fontSize: 14, fontWeight: "bold" }}>?</Text>
    </TouchableOpacity>
  );
}


// ── Locked Strain Card (virtual mode) ────────────────────────────────────────
function LockedStrainCard({ strain }) {
  const TIER_METALS = { T1: "💎", T2: "🥇", T3: "🥈", T4: "🥉" };
  const TIER_COLS   = { T1: "#b9f2ff", T2: "#ffd700", T3: "#c0c0c0", T4: "#cd7f32" };
  const col = TIER_COLS[strain.tier] || C.grey;
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 8,
      borderWidth: 1, borderColor: C.border,
      borderLeftWidth: 3, borderLeftColor: `${col}44`,
      padding: 12, marginBottom: 8, opacity: 0.7 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: C.white, fontFamily: MONO, fontSize: 15, fontWeight: "bold" }}>
              {strain.name}
            </Text>
            <View style={{ backgroundColor: `${col}22`, borderRadius: 4,
              borderWidth: 1, borderColor: `${col}44`, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: col, fontFamily: MONO, fontSize: 9 }}>
                {TIER_METALS[strain.tier]} {strain.tier}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: 8, gap: 6 }}>
            <View style={{ backgroundColor: C.border, borderRadius: 3, height: 8, width: "75%" }} />
            <View style={{ backgroundColor: C.border, borderRadius: 3, height: 8, width: "50%" }} />
          </View>
        </View>
        <View style={{ alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 20 }}>🔒</Text>
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 8 }}>GROW TO</Text>
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 8 }}>UNLOCK</Text>
        </View>
      </View>
    </View>
  );
}

function StrainCard({ strain, onPress, hasTrophy, compareMode, isInCompare }) {
  const typeCol  = TYPE_COLOUR[strain.type]  || C.amber;
  const diffCol  = DIFF_COLOUR[strain.difficulty] || C.amber;
  const effectCol = EFFECT_COLOUR[strain.effect] || C.amber;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View style={{
        backgroundColor: isInCompare ? `${C.purple}15` : C.card,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: isInCompare ? C.purple : C.border,
        padding: 16, paddingRight: isInCompare ? 16 : 32, marginBottom: 12,
        shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 }, elevation: 3,
      }}>
        {/* Chevron — tap indicator */}
        {!compareMode && (
          <View style={{ position: "absolute", right: 10, top: 0, bottom: 0, justifyContent: "center" }}>
            <Text style={{ color: "rgba(255,255,255,0.2)", fontSize: 20 }}>›</Text>
          </View>
        )}
        {/* Compare mode indicator */}
        {compareMode && (
          <View style={{ position: "absolute", top: 10, right: 10,
            width: 22, height: 22, borderRadius: 11,
            backgroundColor: isInCompare ? C.purple : C.surface,
            borderWidth: 2, borderColor: isInCompare ? C.purple : C.border,
            alignItems: "center", justifyContent: "center" }}>
            {isInCompare && (
              <Text style={{ color: C.white, fontSize: 12, fontWeight: "bold" }}>✓</Text>
            )}
          </View>
        )}
        {/* Row 1: name + tier + type */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 20 }}>
                {strain.name}
              </Text>
              {hasTrophy && (
                <Text style={{ fontSize: 12 }}>🏆</Text>
              )}
            </View>
            <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 11, marginTop: 2 }}>
              {strain.lineage?.slice(0, 48)}{strain.lineage?.length > 48 ? "…" : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <View style={{ flexDirection: "row", gap: 4 }}>
              <Tag label={strain.tier} colour={C.greyLight} />
              <Tag label={`${TYPE_ICON[strain.type]} ${strain.type}`} colour={typeCol} />
            </View>
          </View>
        </View>

        {/* Row 2: THC bar */}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 6 }}>
          <Label>THC</Label>
          <THCBar min={strain.thc_min} max={strain.thc_max} />
        </View>

        {/* Row 3: meta tags */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          <Tag
            label={`${EFFECT_ICON[strain.effect] || ""} ${strain.effect}`}
            colour={effectCol}
          />
          <Tag
            label={`${DIFF_ICON[strain.difficulty] || "●"} ${strain.difficulty}`}
            colour={diffCol}
          />
          <Tag
            label={(() => {
              const min = strain.flower_wk_min;
              const max = strain.flower_wk_max;
              if (min && max && min !== max) return `🌸 ${min}–${max}wk`;
              if (max) return `🌸 ${max}wk`;
              if (min) return `🌸 ${min}wk`;
              return `🌸 ?wk`;
            })()}
            colour={C.blue}
          />
          <Tag label={`📦 ${strain.yield_max_gm2}g/m²`} colour={C.greyLight} />
        </View>

        {/* Row 4: terpenes */}
        {strain.terpenes?.length > 0 && (
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 6 }}>
            🧪 {strain.terpenes.slice(0, 3).join(" · ")}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── COMPONENT: Filter Sheet ───────────────────────────────────────────────────
function FilterSheet({ visible, filters, active, onApply, onClose }) {
  const [local, setLocal] = useState({ ...active });

  useEffect(() => { if (visible) setLocal({ ...active }); }, [visible]);

  const toggle = (key, val) => {
    setLocal(prev => ({
      ...prev,
      [key]: prev[key] === val ? null : val,
    }));
  };

  const clear = () => setLocal({
    tier: null, type: null, effect: null,
    difficulty: null, terpene: null,
    thc_min: null, thc_max: null, auto_only: false, sort: "name",
  });

  const BtnRow = ({ label, options, field, colours = {} }) => (
    <View style={{ marginBottom: 16 }}>
      <Label style={{ marginBottom: 8 }}>{label}</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {options.map(opt => {
          const active = local[field] === opt;
          const col = colours[opt] || C.green;
          return (
            <TouchableOpacity key={opt} onPress={() => toggle(field, opt)}
              style={{
                paddingHorizontal: 12, paddingVertical: 7,
                borderRadius: 6, borderWidth: 1,
                borderColor: active ? col : C.border,
                backgroundColor: active ? `${col}22` : C.surface,
              }}
            >
              <Text style={{ color: active ? col : C.greyLight, fontFamily: MONO, fontSize: 12 }}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const SortRow = () => (
    <View style={{ marginBottom: 16 }}>
      <Label style={{ marginBottom: 8 }}>SORT BY</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {["name","thc","yield","flower_wk","difficulty"].map(s => (
          <TouchableOpacity key={s} onPress={() => setLocal(p => ({ ...p, sort: s }))}
            style={{
              paddingHorizontal: 12, paddingVertical: 7,
              borderRadius: 6, borderWidth: 1,
              borderColor: local.sort === s ? C.green : C.border,
              backgroundColor: local.sort === s ? C.greenFaint : C.surface,
            }}
          >
            <Text style={{
              color: local.sort === s ? C.green : C.greyLight,
              fontFamily: MONO, fontSize: 12,
            }}>
              {s.replace("_"," ").toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const Toggle = ({ label, field }) => (
    <TouchableOpacity
      onPress={() => setLocal(p => ({ ...p, [field]: !p[field] }))}
      style={{
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingVertical: 10, borderBottomWidth: 1, borderColor: C.border, marginBottom: 10,
      }}
    >
      <Label>{label}</Label>
      <View style={{
        width: 44, height: 24, borderRadius: 12,
        backgroundColor: local[field] ? C.greenFaint : C.surface,
        borderWidth: 1, borderColor: local[field] ? C.green : C.border,
        justifyContent: "center", paddingHorizontal: 3,
      }}>
        <View style={{
          width: 18, height: 18, borderRadius: 9,
          backgroundColor: local[field] ? C.green : C.grey,
          alignSelf: local[field] ? "flex-end" : "flex-start",
        }} />
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          borderTopWidth: 1, borderColor: C.border,
          maxHeight: SH * 0.85,
        }}>
          {/* Handle */}
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2 }} />
          </View>

          <View style={{
            flexDirection: "row", justifyContent: "space-between",
            alignItems: "center", paddingHorizontal: 16, paddingBottom: 12,
            borderBottomWidth: 1, borderColor: C.border,
          }}>
            <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 20, letterSpacing: 1 }}>
              FILTERS
            </Text>
            <TouchableOpacity onPress={clear}>
              <Text style={{ color: C.amber, fontFamily: SANS_MED, fontSize: 12 }}>Clear all</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <BtnRow label="TIER" field="tier"
              options={["T1","T2","T3","T4"]}
              colours={{ T1: C.amber, T2: C.purple, T3: C.blue, T4: C.green }} />

            <BtnRow label="TYPE" field="type"
              options={["indica","sativa","hybrid"]}
              colours={TYPE_COLOUR} />

            <BtnRow label="EFFECT" field="effect"
              options={["uplifting","balanced","sedating"]}
              colours={EFFECT_COLOUR} />

            <BtnRow label="DIFFICULTY" field="difficulty"
              options={["beginner","intermediate","advanced"]}
              colours={DIFF_COLOUR} />

            <Toggle label="AUTOFLOWERS ONLY" field="auto_only" />

            <SortRow />

            {/* THC range */}
            <View style={{ marginBottom: 16 }}>
              <Label style={{ marginBottom: 8 }}>THC RANGE</Label>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Label style={{ marginBottom: 4 }}>MIN %</Label>
                  <TextInput
                    style={{
                      backgroundColor: C.surface, borderRadius: 6,
                      borderWidth: 1, borderColor: C.border,
                      color: C.white, fontFamily: MONO,
                      fontSize: 14, padding: 10,
                    }}
                    value={local.thc_min?.toString() || ""}
                    onChangeText={v => setLocal(p => ({ ...p, thc_min: v ? parseInt(v) : null }))}
                    keyboardType="number-pad"
                    placeholder="0" placeholderTextColor={C.grey}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Label style={{ marginBottom: 4 }}>MAX %</Label>
                  <TextInput
                    style={{
                      backgroundColor: C.surface, borderRadius: 6,
                      borderWidth: 1, borderColor: C.border,
                      color: C.white, fontFamily: MONO,
                      fontSize: 14, padding: 10,
                    }}
                    value={local.thc_max?.toString() || ""}
                    onChangeText={v => setLocal(p => ({ ...p, thc_max: v ? parseInt(v) : null }))}
                    keyboardType="number-pad"
                    placeholder="35" placeholderTextColor={C.grey}
                  />
                </View>
              </View>
            </View>

            {/* Popular terpenes */}
            <BtnRow label="TERPENE" field="terpene"
              options={["Myrcene","Limonene","Beta-Caryophyllene","Terpinolene","Linalool","Pinene","Ocimene"]}
              colours={{ Myrcene: C.green, Limonene: C.amber, "Beta-Caryophyllene": C.red,
                Terpinolene: C.blue, Linalool: C.purple, Pinene: C.green, Ocimene: C.amber }} />
          </ScrollView>

          <View style={{ padding: 16, flexDirection: "row", gap: 10 }}>
            <TouchableOpacity onPress={onClose}
              style={{
                flex: 1, borderWidth: 1, borderColor: C.border,
                borderRadius: 6, padding: 12, alignItems: "center",
              }}>
              <Text style={{ color: C.greyLight, fontFamily: SANS_MED, fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { onApply(local); onClose(); }}
              style={{
                flex: 2, backgroundColor: C.greenFaint,
                borderWidth: 1, borderColor: C.green,
                borderRadius: 8, padding: 14, alignItems: "center",
              }}>
              <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 16, letterSpacing: 1 }}>
                APPLY FILTERS
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Strain Info Modal — explains THIS strain specifically ─────────────────────
function StrainInfoModal({ strain, onClose }) {
  const diffCol = DIFF_COLOUR[strain.difficulty] || C.amber;

  // Build difficulty explanation from strain data
  const difficultyReasons = {
    beginner: [
      "Forgiving of beginner mistakes — recovers well from overwatering and minor pH errors",
      "Shorter flower time means less time for things to go wrong",
      "Stable, predictable growth pattern — no surprises",
      strain.is_autoflower
        ? "Autoflowering — no light schedule changes needed, flowers automatically"
        : "Well-behaved structure — doesn't need intensive training",
      "Widely documented — huge community knowledge base if you get stuck",
    ],
    intermediate: [
      "Rewards good environmental control — temperature and humidity matter more",
      "Benefits from training techniques (LST, topping) to maximise yield",
      "More sensitive to pH and nutrient fluctuations than beginner strains",
      strain.flower_wk_max >= 10
        ? `Long flower time (${strain.flower_wk_max} weeks) — more weeks = more that can go wrong`
        : "Moderate flower time — manageable with consistent attention",
      "Worth the extra effort — the results are noticeably better than beginner strains",
    ],
    advanced: [
      "Demanding — requires precise environmental control throughout the grow",
      "Less forgiving of mistakes — problems compound quickly",
      strain.flower_wk_max >= 12
        ? `Very long flower time (${strain.flower_wk_max} weeks) — sustained attention required`
        : "Complex flowering behaviour requiring experienced management",
      "Often landrace or exotic genetics — less commercial breeding for stability",
      "The reward is exceptional — flavour, potency, and character unmatched by easier strains",
    ],
  };

  const reasons = difficultyReasons[strain.difficulty] || difficultyReasons.intermediate;

  // Plant character description built from data
  const typeDesc = {
    I: "indica",
    S: "sativa",
    H: "hybrid",
    "I/H": "indica-dominant hybrid",
    "S/H": "sativa-dominant hybrid",
  }[strain.type] || "hybrid";

  const effectDesc = {
    sedating:  "deeply relaxing and sedating — best for evening use, pain relief, and sleep",
    uplifting: "energetic and uplifting — best for daytime, creativity, and social situations",
    balanced:  "balanced between relaxation and clarity — works well at any time of day",
  }[strain.effect] || "balanced";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          borderTopWidth: 2, borderColor: diffCol, maxHeight: "92%",
        }}>
          {/* Handle */}
          <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2 }} />
          </View>

          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center",
            justifyContent: "space-between", paddingHorizontal: 16,
            paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: diffCol, fontFamily: MONO,
                fontSize: 17, fontWeight: "bold" }}>
                {strain.name}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Text style={{ color: diffCol, fontFamily: MONO, fontSize: 12 }}>
                  {"●".repeat(strain.difficulty === "beginner" ? 1 : strain.difficulty === "intermediate" ? 2 : 3)}
                </Text>
                <Text style={{ color: diffCol, fontFamily: MONO,
                  fontSize: 11, fontWeight: "bold" }}>
                  {strain.difficulty?.toUpperCase()} STRAIN
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

            {/* Plant character */}
            <View style={{ backgroundColor: `${diffCol}15`, borderRadius: 8,
              borderWidth: 1, borderColor: diffCol, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 8 }}>ABOUT THIS PLANT</Text>
              <Text style={{ color: C.white, fontFamily: MONO,
                fontSize: 13, lineHeight: 20 }}>
                {strain.name} is a {typeDesc} that produces {effectDesc} effects.
                {strain.aroma ? ` Its character is defined by ${strain.aroma.toLowerCase()}.` : ""}
                {strain.lineage ? ` Descended from ${strain.lineage}.` : ""}
              </Text>
            </View>

            {/* Key stats at a glance */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {[
                { label: "THC", value: `${strain.thc_min || "?"}–${strain.thc_max || "?"}%`, colour: C.red },
                { label: "FLOWER", value: `${strain.flower_wk_max || "?"}wk`, colour: C.amber },
                { label: "YIELD", value: strain.yield_indoor_max ? `${strain.yield_indoor_max}g/m²` : "varies", colour: C.green },
                { label: "HEIGHT", value: strain.height_indoor_max ? `${strain.height_indoor_max}cm` : "varies", colour: C.blue },
              ].map(({ label, value, colour }) => (
                <View key={label} style={{ flex: 1, backgroundColor: C.surface,
                  borderRadius: 8, borderWidth: 1, borderColor: C.border,
                  padding: 10, alignItems: "center" }}>
                  <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9 }}>{label}</Text>
                  <Text style={{ color: colour, fontFamily: MONO,
                    fontSize: 12, fontWeight: "bold", marginTop: 3 }}>
                    {value}
                  </Text>
                </View>
              ))}
            </View>

            {/* Why this difficulty */}
            <View style={{ backgroundColor: C.surface, borderRadius: 8,
              borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 10 }}>
                WHY {strain.difficulty?.toUpperCase()}?
              </Text>
              {reasons.map((reason, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 10,
                  marginBottom: i < reasons.length - 1 ? 10 : 0 }}>
                  <Text style={{ color: diffCol, fontFamily: MONO,
                    fontSize: 13, marginTop: 1 }}>→</Text>
                  <Text style={{ color: C.white, fontFamily: MONO,
                    fontSize: 12, lineHeight: 19, flex: 1 }}>
                    {reason}
                  </Text>
                </View>
              ))}
            </View>

            {/* Who it's for */}
            <View style={{ backgroundColor: C.greenFaint, borderRadius: 8,
              borderWidth: 1, borderColor: C.greenDim, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: C.greenDim, fontFamily: MONO, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 6 }}>WHO IS THIS STRAIN FOR?</Text>
              <Text style={{ color: C.white, fontFamily: MONO,
                fontSize: 13, lineHeight: 20 }}>
                {strain.difficulty === "beginner"
                  ? `${strain.name} is an excellent choice for your first or second grow. It won't punish you for small mistakes and will still produce satisfying results. Focus on getting your environment right and the plant will do the rest.`
                  : strain.difficulty === "intermediate"
                  ? `${strain.name} is best suited to growers who've completed at least one successful grow. You'll need to pay attention to your environment and feeding but the extra effort is absolutely worth it. This is where growing gets genuinely exciting.`
                  : `${strain.name} is for experienced growers who've mastered the basics and want a serious challenge. It will test your skills but reward you with something exceptional. Don't attempt this as your first grow.`
                }
              </Text>
            </View>

            {/* Terpene character */}
            {strain.terpenes?.length > 0 && (
              <View style={{ backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.border, padding: 14 }}>
                <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                  letterSpacing: 1.5, marginBottom: 8 }}>TERPENE CHARACTER</Text>
                <Text style={{ color: C.greyLight, fontFamily: MONO,
                  fontSize: 12, lineHeight: 19 }}>
                  Dominated by{" "}
                  <Text style={{ color: C.green, fontWeight: "bold" }}>
                    {strain.terpenes.slice(0, 2).join(" and ")}
                  </Text>
                  {strain.terpenes.length > 2
                    ? ` with notes of ${strain.terpenes.slice(2).join(", ")}.`
                    : "."}
                  {" "}Tap any terpene below to learn exactly what it does.
                </Text>
              </View>
            )}

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── SCREEN: Strain Detail ─────────────────────────────────────────────────────
function StrainDetailScreen({ strainId, onBack, onStartGrow, onNavigateToStrain }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTerpene, setSelectedTerpene] = useState(null);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    setLoading(true);
    setData(null);
    api.get(`/search/strain/${strainId}`)
      .then(setData)
      .catch(e => Alert.alert("Error", e.message))
      .finally(() => setLoading(false));
  }, [strainId]);

  if (loading || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.green} />
      </View>
    );
  }

  const typeCol   = TYPE_COLOUR[data.type]      || C.amber;
  const diffCol   = DIFF_COLOUR[data.difficulty] || C.amber;
  const effectCol = EFFECT_COLOUR[data.effect]   || C.amber;

  const InfoRow = ({ label, value, colour }) => (
    <View style={{
      flexDirection: "row", justifyContent: "space-between",
      alignItems: "center", paddingVertical: 10,
      borderBottomWidth: 1, borderColor: C.border,
    }}>
      <Label>{label}</Label>
      <Text style={{ color: colour || C.white, fontFamily: MONO, fontSize: 13, fontWeight: "bold" }}>
        {value}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 8 : 52,
        paddingBottom: 12,
        borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)",
        backgroundColor: "rgba(13,18,13,0.96)",
      }}>
        <TouchableOpacity
          onPress={onBack}
          style={{
            marginBottom: 10,
            alignSelf: "flex-start",
            width: 36, height: 36,
            borderRadius: 18,
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Text style={{ color: C.green, fontFamily: MONO, fontSize: 18, lineHeight: 22 }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 28,
            flex: 1, marginRight: 10, letterSpacing: 1 }}>
            {data.name}
          </Text>
          <InfoBtn onPress={() => setShowInfo(true)} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          <Tag label={data.tier} colour={C.greyLight} />
          <Tag label={`${TYPE_ICON[data.type]} ${data.type}`} colour={typeCol} />
          <Tag label={`${EFFECT_ICON[data.effect] || ""} ${data.effect}`} colour={effectCol} />
          <Tag label={`${DIFF_ICON[data.difficulty] || "●"} ${data.difficulty}`} colour={diffCol} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>

        {/* THC / CBD Hero */}
        <View style={{
          backgroundColor: C.card, borderRadius: 8,
          borderWidth: 1, borderColor: C.border,
          padding: 16, marginBottom: 12,
        }}>
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Label>THC</Label>
              <Text style={{
                color: data.thc_max >= 25 ? C.red : data.thc_max >= 20 ? C.amber : C.greenBright,
                fontFamily: SANS_BOLD, fontSize: 28, marginTop: 4,
              }}>
                {data.thc_max}%
              </Text>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 10 }}>
                range {data.thc_min}–{data.thc_max}%
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: C.border }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Label>CBD</Label>
              <Text style={{ color: C.blue, fontFamily: SANS_BOLD, fontSize: 28, marginTop: 4 }}>
                {data.cbd_max >= 5 ? `${data.cbd_max}%` : "LOW"}
              </Text>
              <Text style={{ color: C.greyLight, fontFamily: SANS, fontSize: 10 }}>
                max {data.cbd_max}%
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: C.border }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Label>INDICA/SATIVA</Label>
              <Text style={{ color: typeCol, fontFamily: MONO, fontSize: 16,
                fontWeight: "bold", marginTop: 4 }}>
                {data.indica_pct}/{data.sativa_pct}
              </Text>
              {/* Mini split bar */}
              <View style={{ flexDirection: "row", height: 6, width: "100%",
                marginTop: 6, borderRadius: 3, overflow: "hidden" }}>
                <View style={{ flex: data.indica_pct, backgroundColor: C.purple }} />
                <View style={{ flex: data.sativa_pct, backgroundColor: C.green }} />
              </View>
            </View>
          </View>
        </View>

        {/* Grow stats */}
        <View style={{
          backgroundColor: C.card, borderRadius: 8,
          borderWidth: 1, borderColor: C.border,
          padding: 16, marginBottom: 12,
        }}>
          <Label style={{ marginBottom: 8 }}>GROW STATS</Label>
          <InfoRow label="FLOWER TIME"
            value={`${data.flower_wk_min}–${data.flower_wk_max} weeks`}
            colour={C.blue} />
          <InfoRow label="INDOOR YIELD"
            value={`${data.yield_min_gm2}–${data.yield_max_gm2} g/m²`}
            colour={C.amber} />
          <InfoRow label="HEIGHT"
            value={`${data.height_min_cm}–${data.height_max_cm} cm`}
            colour={C.greyLight} />
          <InfoRow label="DIFFICULTY"
            value={data.difficulty.toUpperCase()}
            colour={diffCol} />
        </View>

        {/* Aroma */}
        {data.aroma && (
          <View style={{
            backgroundColor: C.card, borderRadius: 8,
            borderWidth: 1, borderColor: C.border,
            padding: 16, marginBottom: 12,
          }}>
            <Label style={{ marginBottom: 8 }}>AROMA & FLAVOUR</Label>
            <Text style={{ color: C.white, fontFamily: MONO, fontSize: 14, lineHeight: 20 }}>
              🌿 {data.aroma}
            </Text>
          </View>
        )}

        {/* Terpenes */}
        {data.terpenes?.length > 0 && (
          <View style={{
            backgroundColor: C.card, borderRadius: 8,
            borderWidth: 1, borderColor: C.border,
            padding: 16, marginBottom: 12,
          }}>
            <Label style={{ marginBottom: 4 }}>TERPENES</Label>
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10,
              marginBottom: 10 }}>TAP TO LEARN MORE</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {data.terpenes.map((t, i) => {
                const info = TERPENE_INFO[t];
                const col = info?.colour || C.green;
                return (
                  <TouchableOpacity key={i} onPress={() => setSelectedTerpene(t)}
                    activeOpacity={0.7}
                    style={{
                      backgroundColor: `${col}10`, borderRadius: 8,
                      borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
                      paddingHorizontal: 12, paddingVertical: 8,
                      flexDirection: "row", alignItems: "center", gap: 6,
                    }}>
                    <Text style={{ fontSize: 14 }}>{info?.icon || "🧪"}</Text>
                    <View>
                      <Text style={{ color: col, fontFamily: MONO,
                        fontSize: 12, fontWeight: "bold" }}>
                        {t}
                      </Text>
                      {info && (
                        <Text style={{ color: "rgba(255,255,255,0.35)", fontFamily: MONO, fontSize: 9 }}>
                          {info.aroma.split(",")[0]}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Terpene info modal */}
        <TerpeneModal
          terpene={selectedTerpene}
          onClose={() => setSelectedTerpene(null)}
        />

        {/* Strain-specific info modal */}
        {showInfo && data && (
          <StrainInfoModal strain={data} onClose={() => setShowInfo(false)} />
        )}

        {/* Lineage / Origin */}
        <View style={{
          backgroundColor: C.card, borderRadius: 8,
          borderWidth: 1, borderColor: C.border,
          padding: 16, marginBottom: 12,
        }}>
          <Label style={{ marginBottom: 10 }}>GENETICS</Label>

          {/* Parse lineage into tappable parent pills */}
          {data.lineage ? (() => {
            // Split on " x ", " X ", " × " keeping the separator visible
            const parents = data.lineage.split(/ x | X | × /);
            return (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {parents.map((parent, i) => (
                  <React.Fragment key={`parent-${i}-${parent.trim()}`}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={async () => {
                        // Search for this parent and navigate if found
                        try {
                          const q = parent.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
                          const data2 = await api.get(`/search/strain/${q}`);
                          if (data2?.id) onNavigateToStrain?.(data2.id);
                        } catch {
                          try {
                            const res = await api.get(`/search/suggest?q=${encodeURIComponent(parent.trim())}&limit=1`);
                            if (res.suggestions?.length > 0) onNavigateToStrain?.(res.suggestions[0].id);
                          } catch {
                            Alert.alert("Not found", `"${parent.trim()}" not in database`);
                          }
                        }
                      }}
                      style={{
                        backgroundColor: C.surface,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: C.amber,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ color: C.amber, fontFamily: MONO, fontSize: 12 }}>
                        🧬 {parent.trim()}
                      </Text>
                    </TouchableOpacity>
                    {i < parents.length - 1 && (
                      <View style={{ justifyContent: "center" }}>
                        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 14 }}>×</Text>
                      </View>
                    )}
                  </React.Fragment>
                ))}
              </View>
            );
          })() : null}

          <Label style={{ marginBottom: 4 }}>ORIGIN</Label>
          <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 12, lineHeight: 18 }}>
            📍 {data.origin}
          </Text>
        </View>

        {/* Start Grow CTA */}
        {onStartGrow && (
          <TouchableOpacity
            onPress={() => onStartGrow(data)}
            activeOpacity={0.8}
            style={{
              backgroundColor: C.greenFaint, borderRadius: 8,
              borderWidth: 1, borderColor: C.green,
              padding: 16, alignItems: "center", marginBottom: 8,
            }}
          >
            <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 18, letterSpacing: 1 }}>
              🌱 START GROW WITH THIS STRAIN
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ── SCREEN: Recommender ───────────────────────────────────────────────────────
function RecommendScreen({ onBack, onSelectStrain }) {
  const [prefs, setPrefs] = useState({
    experience: "beginner",
    effect: "balanced",
    space_cm: "100",
    want_auto: false,
    thc_preference: "medium",
  });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        experience: prefs.experience,
        effect: prefs.effect,
        space_cm: prefs.space_cm || 100,
        want_auto: prefs.want_auto,
        thc_preference: prefs.thc_preference,
        limit: 6,
      }).toString();
      const data = await api.get(`/search/recommend?${q}`);
      setResults(data);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const BtnRow = ({ label, field, options, colours = {} }) => (
    <View style={{ marginBottom: 16 }}>
      <Label style={{ marginBottom: 8 }}>{label}</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {options.map(opt => {
          const active = prefs[field] === opt;
          const col = colours[opt] || C.green;
          return (
            <TouchableOpacity key={opt}
              onPress={() => setPrefs(p => ({ ...p, [field]: opt }))}
              style={{
                paddingHorizontal: 14, paddingVertical: 9,
                borderRadius: 8, borderWidth: 1,
                borderColor: active ? col : C.border,
                backgroundColor: active ? `${col}22` : C.surface,
              }}
            >
              <Text style={{ color: active ? col : C.greyLight,
                fontFamily: MONO, fontSize: 12 }}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 16 : 52,
        paddingBottom: 12,
        borderBottomWidth: 1, borderColor: C.border,
      }}>
        <TouchableOpacity onPress={onBack} style={{ marginRight: 12 }}>
          <Text style={{ color: C.green, fontFamily: MONO, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 22, letterSpacing: 1, flex: 1 }}>
          STRAIN RECOMMENDER
        </Text>
        <InfoBtn onPress={() => setShowInfo(true)} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <BtnRow label="YOUR EXPERIENCE" field="experience"
          options={["beginner","intermediate","advanced"]}
          colours={DIFF_COLOUR} />

        <BtnRow label="DESIRED EFFECT" field="effect"
          options={["uplifting","balanced","sedating"]}
          colours={EFFECT_COLOUR} />

        <BtnRow label="THC STRENGTH" field="thc_preference"
          options={["low","medium","high"]}
          colours={{ low: C.green, medium: C.amber, high: C.red }} />

        <View style={{ marginBottom: 16 }}>
          <Label style={{ marginBottom: 8 }}>MAX PLANT HEIGHT (CM)</Label>
          <TextInput
            style={{
              backgroundColor: C.surface, borderRadius: 6,
              borderWidth: 1, borderColor: C.border,
              color: C.white, fontFamily: MONO, fontSize: 16,
              padding: 12,
            }}
            value={prefs.space_cm}
            onChangeText={v => setPrefs(p => ({ ...p, space_cm: v }))}
            keyboardType="number-pad"
            placeholder="100"
            placeholderTextColor={C.grey}
          />
        </View>

        {/* Auto toggle */}
        <TouchableOpacity
          onPress={() => setPrefs(p => ({ ...p, want_auto: !p.want_auto }))}
          style={{
            flexDirection: "row", alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: C.card, borderRadius: 8,
            borderWidth: 1, borderColor: C.border,
            padding: 14, marginBottom: 20,
          }}
        >
          <View>
            <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13 }}>
              PREFER AUTOFLOWERS
            </Text>
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 2 }}>
              No light schedule needed — easier for beginners
            </Text>
          </View>
          <View style={{
            width: 44, height: 24, borderRadius: 12,
            backgroundColor: prefs.want_auto ? C.greenFaint : C.surface,
            borderWidth: 1, borderColor: prefs.want_auto ? C.green : C.border,
            justifyContent: "center", paddingHorizontal: 3,
          }}>
            <View style={{
              width: 18, height: 18, borderRadius: 9,
              backgroundColor: prefs.want_auto ? C.green : C.grey,
              alignSelf: prefs.want_auto ? "flex-end" : "flex-start",
            }} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={run} activeOpacity={0.8}
          style={{
            backgroundColor: C.greenFaint, borderRadius: 8,
            borderWidth: 1, borderColor: C.green,
            padding: 14, alignItems: "center", marginBottom: 24,
          }}
        >
          {loading
            ? <ActivityIndicator color={C.green} />
            : <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 18, letterSpacing: 1 }}>
                FIND MY STRAIN →
              </Text>
          }
        </TouchableOpacity>

        {/* Results */}
        {results && (
          <>
            <Label style={{ marginBottom: 10 }}>
              TOP {results.count} MATCHES
            </Label>
            {results.recommendations.map((s, i) => (
              <TouchableOpacity key={s.id} onPress={() => onSelectStrain?.(s)} activeOpacity={0.8}>
                <View style={{
                  backgroundColor: C.card, borderRadius: 8,
                  borderWidth: 1, borderColor: i === 0 ? C.green : C.border,
                  borderLeftWidth: i === 0 ? 3 : 1,
                  borderLeftColor: i === 0 ? C.green : C.border,
                  padding: 14, marginBottom: 8,
                  flexDirection: "row", alignItems: "center", gap: 12,
                }}>
                  <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 20, fontWeight: "bold" }}>
                    #{i + 1}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: i === 0 ? C.green : C.white,
                      fontFamily: MONO, fontSize: 14, fontWeight: "bold" }}>
                      {s.name}
                    </Text>
                    <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11, marginTop: 2 }}>
                      THC {s.thc_max}% · {s.flower_wk_max}wk · {s.height_max_cm}cm
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Tag label={s.type} colour={TYPE_COLOUR[s.type]} />
                    <Tag label={s.difficulty} colour={DIFF_COLOUR[s.difficulty]} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
      <InfoModal screen={showInfo ? "recommend" : null} onClose={() => setShowInfo(false)} />
    </View>
  );
}

// ── SCREEN: DB Stats ──────────────────────────────────────────────────────────
function StatsCard({ stats }) {
  if (!stats) return null;
  const rows = [
    ["TOTAL STRAINS", stats.total, C.green],
    ["AUTOFLOWERS",   stats.autoflowers, C.blue],
    ["PHOTOPERIOD",   stats.photoperiod, C.amber],
    ["BEGINNERS",     stats.by_difficulty?.beginner, C.green],
    ["ADVANCED",      stats.by_difficulty?.advanced, C.red],
  ];
  return (
    <View style={{
      backgroundColor: C.card, borderRadius: 8,
      borderWidth: 1, borderColor: C.border,
      padding: 14, marginBottom: 12,
    }}>
      <Label style={{ marginBottom: 10 }}>DATABASE</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {rows.map(([label, val, col]) => (
          <View key={label} style={{
            backgroundColor: C.surface, borderRadius: 6, borderWidth: 1,
            borderColor: C.border, padding: 10, minWidth: (SW - 68) / 3,
            alignItems: "center",
          }}>
            <Text style={{ color: col, fontFamily: MONO, fontSize: 20, fontWeight: "bold" }}>
              {val?.toLocaleString() ?? "—"}
            </Text>
            <Label style={{ marginTop: 2, fontSize: 9 }}>{label}</Label>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── MAIN: Strain Browser ──────────────────────────────────────────────────────
export default function VYWEEDStrainBrowser({ onSelectStrain }) {
  const [screen, setScreen] = useState("browse");
  const [detailId, setDetailId] = useState(null);
  const [detailHistory, setDetailHistory] = useState([]);
  const [showInfo, setShowInfo] = useState(false);
  const [online, setOnline] = useState(true);
  const [cachedAt, setCachedAt] = useState(null);
  const [trophyIds, setTrophyIds] = useState(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [compareSlots, setCompareSlots] = useState([]);
  const { isIRL, isVirtual } = useAppMode(); // max 3 strains

  const toggleCompareMode = () => {
    setCompareMode(prev => !prev);
    setCompareSlots([]);
  };

  const toggleCompareSlot = (strain) => {
    setCompareSlots(prev => {
      const exists = prev.find(s => s.id === strain.id);
      if (exists) return prev.filter(s => s.id !== strain.id);
      if (prev.length >= 3) return prev;
      return [...prev, strain];
    });
  };  // Load trophy IDs — reload every time screen comes into view
  const loadTrophies = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem("vyweed_trophies");
      if (raw) {
        const trophies = JSON.parse(raw);
        setTrophyIds(new Set(trophies.map(t => t.strainId)));
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadTrophies();
    // Refresh every 5 seconds in case user just earned a trophy in the GROW tab
    const interval = setInterval(loadTrophies, 5000);
    return () => clearInterval(interval);
  }, [loadTrophies]);

  const navigateToStrain = (id) => {
    if (detailId) setDetailHistory(h => [...h, detailId]); // push current to stack
    setDetailId(id);
    setScreen("detail");
  };

  const handleDetailBack = () => {
    if (detailHistory.length > 0) {
      const prev = detailHistory[detailHistory.length - 1];
      setDetailHistory(h => h.slice(0, -1));
      setDetailId(prev);
    } else {
      setScreen("browse");
    }
  };

  // Search state
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filters, setFilters] = useState({
    tier: null, type: null, effect: null, difficulty: null,
    terpene: null, thc_min: null, thc_max: null,
    auto_only: false, sort: "name",
  });
  const [showFilters, setShowFilters] = useState(false);

  // Results state
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState(null);

  const PER_PAGE = 20;
  const activeFilterCount = Object.values(filters).filter(
    v => v !== null && v !== false && v !== "name"
  ).length;

  // Load stats once
  useEffect(() => {
    api.get("/search/stats").then(setStats).catch(() => {});
  }, []);

  // Build query string
  const buildQS = useCallback((p = 1) => {
    const params = new URLSearchParams({ page: p, per_page: PER_PAGE, sort: filters.sort });
    if (query.trim()) params.set("q", query.trim());
    if (filters.tier)       params.set("tier", filters.tier);
    if (filters.type)       params.set("type", filters.type);
    if (filters.effect)     params.set("effect", filters.effect);
    if (filters.difficulty) params.set("difficulty", filters.difficulty);
    if (filters.terpene)    params.set("terpene", filters.terpene);
    if (filters.thc_min != null) params.set("thc_min", filters.thc_min);
    if (filters.thc_max != null) params.set("thc_max", filters.thc_max);
    if (filters.auto_only)  params.set("auto_only", true);
    return params.toString();
  }, [query, filters]);

  // Search
  const search = useCallback(async (reset = true) => {
    if (reset) {
      setLoading(true);
      setPage(1);
    } else {
      setLoadingMore(true);
    }
    try {
      const p = reset ? 1 : page + 1;
      const result = await cachedFetch(`${API_BASE}/search?${buildQS(p)}`);
      const data = result.data;
      setOnline(result.online);
      if (!result.online) setCachedAt(result.cachedAt);
      if (reset) {
        setResults(data.results);
      } else {
        setResults(prev => [...prev, ...data.results]);
        setPage(p);
      }
      setTotal(data.total);
    } catch (e) {
      Alert.alert("No data", "Can't reach server and no cached data available.\nMake sure the backend and Ollama are running on your PC.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildQS, page]);

  // Trigger search when query or filters change
  useEffect(() => { search(true); }, [query, filters]);

  // Autocomplete
  const fetchSuggestions = useCallback(async (q) => {
    if (q.length < 2) { setSuggestions([]); return; }
    try {
      const data = await api.get(`/search/suggest?q=${encodeURIComponent(q)}&limit=8`);
      setSuggestions(data.suggestions || []);
      setShowSuggestions(true);
    } catch { setSuggestions([]); }
  }, []);

  const pickSuggestion = (s) => {
    setSuggestions([]);
    setShowSuggestions(false);
    setQuery("");
    setDetailId(s.id);
    setScreen("detail");
  };

  // Sub-screens
  if (screen === "compare") {
    return <StrainComparison
      initialStrains={compareSlots}
      onBack={() => { setScreen("browse"); setCompareSlots([]); }}
    />;
  }

  if (screen === "yield") {
    return <YieldCalculator onBack={() => setScreen("browse")} />;
  }

  if (screen === "detail") {
    return (
      <StrainDetailScreen
        strainId={detailId}
        onBack={handleDetailBack}
        onNavigateToStrain={navigateToStrain}
        onStartGrow={onSelectStrain ? (s) => { onSelectStrain(s); setScreen("browse"); } : null}
      />
    );
  }

  if (screen === "recommend") {
    return (
      <RecommendScreen
        onBack={() => setScreen("browse")}
        onSelectStrain={(s) => navigateToStrain(s.id)}
      />
    );
  }

  // ── Browse screen ─────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 16 : 52,
        paddingBottom: 10,
        borderBottomWidth: 1, borderColor: C.border,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center",
          justifyContent: "space-between", marginBottom: 10 }}>
          <View>
            <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 30, letterSpacing: 3 }}>
              VY<Text style={{ color: C.greenBright }}>WEED</Text>
            </Text>
            <Label style={{ color: C.greenDim }}>STRAIN BROWSER</Label>
          </View>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <InfoBtn onPress={() => setShowInfo(true)} />
            <TouchableOpacity onPress={toggleCompareMode}
              style={{ backgroundColor: compareMode ? `${C.purple}33` : C.surface,
                borderRadius: 6, borderWidth: 1,
                borderColor: compareMode ? C.purple : C.border,
                paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text style={{ color: compareMode ? C.purple : C.greyLight, fontFamily: HEADING, fontSize: 13 }}>
                {compareMode ? `⚖️ ${compareSlots.length}/3` : "⚖️ COMPARE"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScreen("yield")}
              style={{ backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.amber,
                paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text style={{ color: C.amber, fontFamily: HEADING, fontSize: 13 }}>
                📦 YIELD
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScreen("recommend")}
              style={{ backgroundColor: C.greenFaint, borderRadius: 8,
                borderWidth: 1, borderColor: C.green,
                paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 14 }}>
                🎯 FIND MINE
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1, position: "relative" }}>
            <View style={{
              flexDirection: "row", alignItems: "center",
              backgroundColor: C.surface, borderRadius: 8,
              borderWidth: 1, borderColor: query ? C.green : C.border,
              paddingHorizontal: 12,
            }}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 14, marginRight: 8 }}>⌕</Text>
              <TextInput
                style={{ flex: 1, color: C.white, fontFamily: MONO, fontSize: 14,
                  paddingVertical: 11 }}
                value={query}
                onChangeText={(t) => { setQuery(t); fetchSuggestions(t); }}
                onFocus={() => query.length >= 2 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Search 5,042 strains..."
                placeholderTextColor={C.grey}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => { setQuery(""); setSuggestions([]); }}>
                  <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <View style={{
                position: "absolute", top: 46, left: 0, right: 0, zIndex: 100,
                backgroundColor: C.card, borderRadius: 8,
                borderWidth: 1, borderColor: C.border,
                shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 8,
                elevation: 8,
              }}>
                {suggestions.map(s => (
                  <TouchableOpacity key={s.id} onPress={() => pickSuggestion(s)}
                    style={{ padding: 12, borderBottomWidth: 1, borderColor: C.border }}>
                    <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13 }}>
                      {s.name}
                    </Text>
                    <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 2 }}>
                      {s.tier} · {s.type} · {s.thc_max}% THC
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Filter button */}
          <TouchableOpacity
            onPress={() => setShowFilters(true)}
            style={{
              backgroundColor: activeFilterCount > 0 ? C.greenFaint : C.surface,
              borderRadius: 8, borderWidth: 1,
              borderColor: activeFilterCount > 0 ? C.green : C.border,
              paddingHorizontal: 12, alignItems: "center", justifyContent: "center",
              minWidth: 50,
            }}
          >
            <Text style={{ color: activeFilterCount > 0 ? C.green : C.greyLight,
              fontFamily: MONO, fontSize: 16 }}>⚙</Text>
            {activeFilterCount > 0 && (
              <View style={{
                position: "absolute", top: -4, right: -4,
                backgroundColor: C.green, borderRadius: 8,
                width: 16, height: 16, alignItems: "center", justifyContent: "center",
              }}>
                <Text style={{ color: C.bg, fontFamily: MONO,
                  fontSize: 9, fontWeight: "bold" }}>
                  {activeFilterCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Results count + active filter chips */}
        <View style={{ flexDirection: "row", alignItems: "center",
          marginTop: 8, flexWrap: "wrap", gap: 6 }}>
          <Text style={{ color: C.greyLight, fontFamily: HEADING, fontSize: 13 }}>
            {loading ? "SEARCHING..." : `${total.toLocaleString()} STRAINS`}
          </Text>
          {filters.type && <Tag label={filters.type} colour={TYPE_COLOUR[filters.type]}
            onPress={() => setFilters(p => ({ ...p, type: null }))} />}
          {filters.tier && <Tag label={filters.tier} colour={C.greyLight}
            onPress={() => setFilters(p => ({ ...p, tier: null }))} />}
          {filters.effect && <Tag label={filters.effect} colour={EFFECT_COLOUR[filters.effect]}
            onPress={() => setFilters(p => ({ ...p, effect: null }))} />}
          {filters.difficulty && <Tag label={filters.difficulty} colour={DIFF_COLOUR[filters.difficulty]}
            onPress={() => setFilters(p => ({ ...p, difficulty: null }))} />}
          {filters.auto_only && <Tag label="AUTO ONLY" colour={C.blue}
            onPress={() => setFilters(p => ({ ...p, auto_only: false }))} />}
        </View>
      </View>

      {/* Offline banner */}
      <OfflineBanner
        visible={!online}
        cachedAt={cachedAt}
        onRetry={() => search(true)}
      />

      {/* List */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={C.green} size="large" />
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 12, marginTop: 12 }}>
            SEARCHING...
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ListHeaderComponent={!query && activeFilterCount === 0
            ? <StatsCard stats={stats} />
            : null}
          renderItem={({ item }) => {
            const isInCompare = compareSlots.some(s => s.id === item.id);
            const isUnlocked = isIRL || trophyIds.has(item.id);
            return isUnlocked ? (
              <StrainCard
                strain={item}
                onPress={() => compareMode
                  ? toggleCompareSlot(item)
                  : navigateToStrain(item.id)}
                hasTrophy={trophyIds.has(item.id)}
                compareMode={compareMode}
                isInCompare={isInCompare}
              />
            ) : (
              <LockedStrainCard strain={item} />
            );
          }}
          onEndReached={() => {
            if (!loadingMore && results.length < total) search(false);
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore
            ? <ActivityIndicator color={C.green} style={{ marginVertical: 20 }} />
            : results.length < total
              ? <Text style={{ color: C.grey, fontFamily: MONO,
                  fontSize: 11, textAlign: "center", marginVertical: 16 }}>
                  Scroll for more ({total - results.length} remaining)
                </Text>
              : null
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Text style={{ fontSize: 36 }}>🔍</Text>
              <Text style={{ color: C.grey, fontFamily: MONO,
                fontSize: 14, marginTop: 12 }}>
                NO STRAINS FOUND
              </Text>
              <Text style={{ color: C.grey, fontFamily: MONO,
                fontSize: 11, marginTop: 6 }}>
                Try different search terms or clear filters
              </Text>
            </View>
          }
        />
      )}

      {/* Filter sheet */}
      <FilterSheet
        visible={showFilters}
        filters={null}
        active={filters}
        onApply={(f) => setFilters(f)}
        onClose={() => setShowFilters(false)}
      />

      {/* Floating compare tray */}
      {compareMode && compareSlots.length > 0 && (
        <View style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          backgroundColor: C.card, borderTopWidth: 2, borderColor: C.purple,
          padding: 12,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            {compareSlots.map((s, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: `${C.purple}22`,
                borderRadius: 6, borderWidth: 1, borderColor: C.purple,
                padding: 8, alignItems: "center" }}>
                <Text style={{ color: C.purple, fontFamily: MONO,
                  fontSize: 10, fontWeight: "bold", textAlign: "center" }}
                  numberOfLines={1}>
                  {s.name}
                </Text>
              </View>
            ))}
            {compareSlots.length < 3 && (
              <View style={{ flex: 1, backgroundColor: C.surface, borderRadius: 6,
                borderWidth: 1, borderColor: C.border,
                padding: 8, alignItems: "center" }}>
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
                  {3 - compareSlots.length} more
                </Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={toggleCompareMode}
              style={{ flex: 1, backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.border, padding: 12,
                alignItems: "center" }}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 12 }}>
                CANCEL
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setCompareMode(false);
                setScreen("compare");
              }}
              disabled={compareSlots.length < 2}
              style={{ flex: 2, backgroundColor: compareSlots.length >= 2
                ? `${C.purple}33` : C.surface,
                borderRadius: 8, borderWidth: 1,
                borderColor: compareSlots.length >= 2 ? C.purple : C.border,
                padding: 12, alignItems: "center" }}>
              <Text style={{ color: compareSlots.length >= 2 ? C.purple : C.grey,
                fontFamily: MONO, fontSize: 13, fontWeight: "bold" }}>
                ⚖️ COMPARE {compareSlots.length < 2 ? `(need ${2 - compareSlots.length} more)` : "NOW →"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Info modal */}
      <InfoModal screen={showInfo ? "browse" : null} onClose={() => setShowInfo(false)} />
    </View>
  );
}

