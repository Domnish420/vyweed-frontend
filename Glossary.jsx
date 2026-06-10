/**
 * Glossary.jsx
 * Complete growing glossary — every term explained from scratch
 * Accessible from the tab bar or any screen via the ? button
 *
 * No API needed — fully offline, all data is local
 */

import React, { useState, useMemo } from "react";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  Modal, Platform, FlatList,
} from "react-native";

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

// ── Categories ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: "all",       label: "ALL",       icon: "🌿" },
  { key: "basics",    label: "BASICS",    icon: "🌱" },
  { key: "nutrients", label: "NUTRIENTS", icon: "🧪" },
  { key: "environment", label: "ENVIRONMENT", icon: "🌡" },
  { key: "growing",   label: "GROWING",   icon: "✂️" },
  { key: "harvest",   label: "HARVEST",   icon: "🌾" },
  { key: "equipment", label: "EQUIPMENT", icon: "💡" },
  { key: "genetics",  label: "GENETICS",  icon: "🧬" },
  { key: "problems",  label: "PROBLEMS",  icon: "🚨" },
];

// ── Full glossary ─────────────────────────────────────────────────────────────
const GLOSSARY = [
  // ── BASICS ──────────────────────────────────────────────────────────────────
  {
    term: "Cannabis",
    category: "basics",
    simple: "The plant you're growing. Also called marijuana, weed, herb, or ganja.",
    detail: "Cannabis is a flowering plant that produces buds (flowers) containing cannabinoids like THC and CBD. There are two main species: Cannabis sativa and Cannabis indica, though most modern strains are hybrids of both.",
    related: ["Indica", "Sativa", "Hybrid", "Strain"],
  },
  {
    term: "Strain",
    category: "basics",
    simple: "A specific named variety of cannabis, like a breed of dog.",
    detail: "Just like how a Labrador and a Poodle are both dogs but very different, Gelato and Northern Lights are both cannabis but grow differently, smell differently, and produce different effects. Each strain has unique genetics that determine everything about it.",
    related: ["Genetics", "Indica", "Sativa", "Hybrid"],
  },
  {
    term: "Indica",
    category: "basics",
    simple: "A type of cannabis that grows shorter and tends to produce relaxing, body-heavy effects.",
    detail: "Indica plants originally come from the Hindu Kush mountain range (Afghanistan, Pakistan, India). They grow short and bushy with wide leaves. They flower faster than sativas. Effects are typically relaxing, sedating, and body-focused. Good for evening use, sleep, and pain relief.",
    related: ["Sativa", "Hybrid", "Strain"],
  },
  {
    term: "Sativa",
    category: "basics",
    simple: "A type of cannabis that grows tall and tends to produce energetic, uplifting effects.",
    detail: "Sativa plants originally come from equatorial regions (Colombia, Mexico, Thailand, Africa). They grow tall with narrow leaves and take longer to flower. Effects are typically uplifting, cerebral, and energetic. Good for daytime use, creativity, and social situations.",
    related: ["Indica", "Hybrid", "Strain"],
  },
  {
    term: "Hybrid",
    category: "basics",
    simple: "A cross between indica and sativa genetics. Most modern strains are hybrids.",
    detail: "Almost every commercial strain is a hybrid. Breeders cross indica and sativa plants to get the best of both — the yield and speed of indica with the potency and effects of sativa. A hybrid can be indica-dominant, sativa-dominant, or balanced 50/50.",
    related: ["Indica", "Sativa", "Genetics"],
  },
  {
    term: "Autoflower",
    category: "basics",
    simple: "A type of cannabis that flowers automatically after a fixed number of weeks, no matter how much light it gets.",
    detail: "Normal (photoperiod) cannabis only starts flowering when it gets 12 hours of darkness per day — you have to manually trigger this. Autoflowers contain ruderalis genetics which causes them to flower automatically after 3-5 weeks regardless of light schedule. Great for beginners: faster, smaller, simpler. Ready in 8-12 weeks from seed.",
    related: ["Photoperiod", "Ruderalis", "Light Schedule"],
  },
  {
    term: "Photoperiod",
    category: "basics",
    simple: "A normal cannabis plant that only flowers when given 12 hours of darkness per day.",
    detail: "In nature, cannabis evolved to flower in autumn when days get shorter. Indoor growers trigger flowering by switching the light timer from 18 hours on / 6 hours off (vegetative) to 12 hours on / 12 hours off (flowering). This is called 'the flip'. Photoperiod plants are larger and yield more than autos but take longer.",
    related: ["Autoflower", "Light Schedule", "The Flip", "18/6", "12/12"],
  },
  {
    term: "Seed",
    category: "basics",
    simple: "The starting point — a cannabis seed contains all the genetic information to grow a complete plant.",
    detail: "Seeds come in two types: regular (can be male or female) and feminised (99% female). Only female plants produce buds. Most growers use feminised seeds to avoid having to identify and remove males. Seeds need warmth and moisture to germinate (sprout).",
    related: ["Germination", "Feminised", "Male", "Female"],
  },
  {
    term: "Feminised",
    category: "basics",
    simple: "Seeds that are almost guaranteed to grow into female plants.",
    detail: "Female plants are what you want — they produce the buds. Regular seeds are 50/50 male/female. Breeders use a chemical process to stress a female plant into producing pollen, then use that pollen to fertilise another female. The resulting seeds carry no male genetics — all female. Almost all commercial seeds are feminised.",
    related: ["Seed", "Male", "Female", "Regular Seeds"],
  },
  {
    term: "Germination",
    category: "basics",
    simple: "The process of a seed sprouting — going from a dry seed to a tiny seedling with a root.",
    detail: "Most common method: place seed between two damp paper towels, put in a warm dark place (21-25°C). The seed absorbs water and the taproot emerges — a tiny white root tip. Once the taproot is 1-2cm long, plant it root-down in your medium. Takes 24-72 hours usually.",
    related: ["Seed", "Taproot", "Seedling"],
  },
  {
    term: "Clone",
    category: "basics",
    simple: "A cutting taken from a mother plant and rooted — a genetic copy of the parent.",
    detail: "Cut a branch from a healthy cannabis plant, dip in rooting hormone, and place in a damp medium. Within 1-2 weeks it grows roots and becomes a new plant — genetically identical to its parent. Cloning preserves genetics exactly and skips germination. All clones are female if taken from a female mother.",
    related: ["Mother Plant", "Genetics", "Cutting"],
  },

  // ── NUTRIENTS ───────────────────────────────────────────────────────────────
  {
    term: "NPK",
    category: "nutrients",
    simple: "The three main nutrients every plant needs: Nitrogen, Phosphorus, and Potassium.",
    detail: "N-P-K is shown as three numbers on fertiliser bottles, e.g. '3-1-2'. N (Nitrogen) = green growth, stems, leaves. P (Phosphorus) = roots, energy transfer, flower formation. K (Potassium) = flower density, resin production, immune system, water uptake. Plants need different N-P-K ratios at different life stages.",
    related: ["Nitrogen", "Phosphorus", "Potassium", "Feed Schedule"],
  },
  {
    term: "Nitrogen (N)",
    category: "nutrients",
    simple: "The nutrient that makes plants green and builds plant matter.",
    detail: "Nitrogen is used by the plant to build chlorophyll (the green pigment) and proteins. High N is needed during vegetative growth when the plant is building its structure. Nitrogen deficiency shows as yellowing leaves starting from the bottom. Too much N causes dark green clawing leaves and reduces flower production.",
    related: ["NPK", "Vegetative Stage", "Nutrient Deficiency"],
  },
  {
    term: "Phosphorus (P)",
    category: "nutrients",
    simple: "The nutrient that powers root development and flower production.",
    detail: "Phosphorus is involved in energy transfer within the plant (ATP). High P is needed during flowering. P deficiency shows as purple/dark stems and leaf edges. Too much P at the wrong time can block uptake of other nutrients. PK boosters are phosphorus and potassium supplements added during mid-flower.",
    related: ["NPK", "Flowering Stage", "PK Booster"],
  },
  {
    term: "Potassium (K)",
    category: "nutrients",
    simple: "The nutrient that makes flowers dense, boosts resin, and keeps the plant healthy.",
    detail: "Potassium regulates water movement in the plant, strengthens cell walls, activates enzymes, and drives photosynthesis. High K during flowering = bigger denser buds with more resin. K deficiency shows as brown leaf edges (called 'potassium burn' or tip burn, confusingly similar to nutrient burn).",
    related: ["NPK", "Resin", "Trichomes"],
  },
  {
    term: "CalMag",
    category: "nutrients",
    simple: "A calcium and magnesium supplement — two nutrients that cannabis needs a lot of.",
    detail: "Calcium builds cell walls and helps nutrient uptake. Magnesium is the central atom in chlorophyll — without it the plant can't photosynthesise. CalMag deficiencies are very common, especially in coco and hydro. Shows as yellowing between leaf veins (interveinal chlorosis) or spots on leaves. Add 1ml/L to most feeds.",
    related: ["Nutrient Deficiency", "Coco", "Hydro"],
  },
  {
    term: "EC",
    category: "nutrients",
    simple: "A measure of how much nutrient is dissolved in your water. Like measuring the strength of your plant's food.",
    detail: "EC stands for Electrical Conductivity, measured in mS/cm (millisiemens per centimetre). Pure water = 0 EC. The more nutrients dissolved, the higher the EC. Target ranges: Seedling 0.4-0.6, Veg 0.8-1.6, Flower 1.6-2.2, Flush near 0. Too high EC = nutrient burn (brown tips). Too low = hungry plants (pale, slow growth).",
    related: ["Nutrient Burn", "TDS", "PPM", "Feed Schedule"],
  },
  {
    term: "pH",
    category: "nutrients",
    simple: "A measure of acidity — if pH is wrong, your plant can't absorb nutrients even if they're there.",
    detail: "pH runs from 0 (very acidic) to 14 (very alkaline). 7 is neutral. Cannabis roots absorb different nutrients at different pH levels. Soil: 6.0-6.5. Coco: 5.8-6.2. Hydro: 5.5-6.0. Outside these ranges, specific nutrients 'lock out' — the plant can't absorb them even if they're in the water. This is the most common cause of apparent deficiencies.",
    related: ["pH Lockout", "Nutrient Deficiency", "EC"],
  },
  {
    term: "pH Lockout",
    category: "nutrients",
    simple: "When the wrong pH makes it impossible for the plant to absorb nutrients, even when nutrients are present.",
    detail: "Each nutrient has a specific pH range where roots can absorb it. If pH is too high or low, the plant starves even with a full feed because the nutrients chemically 'lock out'. Symptoms look like deficiencies but adding more nutrients makes it worse. Fix: flush with pH-correct water and adjust feed pH.",
    related: ["pH", "Flushing", "Nutrient Deficiency"],
  },
  {
    term: "Nutrient Burn",
    category: "nutrients",
    simple: "When you've fed too many nutrients and the tips of leaves turn brown.",
    detail: "Nutrient burn (nute burn) is the first sign of overfeeding. Leaf tips turn yellow then brown and curl down. Caused by too high EC/TDS. Fix: water with plain pH'd water for 1-2 sessions. Prevention: always start at half the recommended dose and increase gradually. Beginner tip: most problems are from overfeeding, not underfeeding.",
    related: ["EC", "Nutrient Deficiency", "Flushing"],
  },
  {
    term: "Flushing",
    category: "nutrients",
    simple: "Watering with plain water to wash built-up salts and nutrients out of the growing medium.",
    detail: "Flushing is done in two situations: 1) Pre-harvest — final 1-2 weeks feed only plain pH'd water so the plant uses up stored nutrients, resulting in smoother tasting buds. 2) Problem solving — if EC has built up or pH has locked out, a heavy flush resets the medium. Use 2-3x the pot volume in water.",
    related: ["Harvest", "EC", "pH Lockout"],
  },
  {
    term: "Runoff",
    category: "nutrients",
    simple: "The water that drains out of the bottom of your pot after watering — tells you what's happening inside the medium.",
    detail: "Measuring the EC and pH of your runoff tells you what's actually happening at root level, not just what you're putting in. If you feed pH 6.2 and runoff comes out pH 5.5, your medium is too acidic. If input EC is 1.4 and runoff EC is 2.8, salts have built up and you need to flush.",
    related: ["pH", "EC", "Flushing"],
  },
  {
    term: "PPM",
    category: "nutrients",
    simple: "Parts per million — another way to measure nutrient concentration, like EC but in different units.",
    detail: "PPM (parts per million) is used mainly in the USA. EC is used in Europe. They measure the same thing. Rough conversion: EC × 500 = PPM (500 scale) or EC × 700 = PPM (700 scale). Different meters use different scales — always check which scale your meter uses.",
    related: ["EC", "TDS"],
  },
  {
    term: "Feed Schedule",
    category: "nutrients",
    simple: "A week-by-week plan of what nutrients to give your plant and in what quantities.",
    detail: "Most nutrient brands provide a feed schedule — a chart showing which products to use each week and how much. VYWEED generates one automatically for your strain and medium. Always start at 50-75% of the recommended dose and increase if plants look healthy. Every grow is different — use the schedule as a guide, not a rigid rule.",
    related: ["NPK", "EC", "Nutrient Brand"],
  },

  // ── ENVIRONMENT ──────────────────────────────────────────────────────────────
  {
    term: "VPD",
    category: "environment",
    simple: "Vapour Pressure Deficit — a measurement of how hard your plant is working to breathe.",
    detail: "VPD combines temperature and humidity into a single number that tells you how efficiently your plant is transpiring. Too low VPD (humid air) = plant can't breathe, risk of mould. Too high VPD (dry air) = plant closes stomata to conserve water, growth slows. Ideal range varies by stage. The VPD tab in VYWEED calculates this for you.",
    related: ["Humidity", "Temperature", "Transpiration"],
  },
  {
    term: "Humidity",
    category: "environment",
    simple: "How much water vapour is in the air. Measured as a percentage.",
    detail: "Relative humidity (RH) tells you how full the air is with water. 100% = air is completely saturated. Different stages need different humidity: Seedlings = 65-80%. Veg = 50-70%. Early flower = 50-60%. Late flower = 40-50%. Low humidity in late flower is critical — prevents bud rot (botrytis) which can destroy a whole harvest.",
    related: ["VPD", "Bud Rot", "Dehumidifier"],
  },
  {
    term: "Temperature",
    category: "environment",
    simple: "How hot your grow space is. Cannabis prefers 22-27°C during lights-on.",
    detail: "Ideal temperature ranges: Lights on: 22-27°C (72-80°F). Lights off: no more than 10°C cooler than lights-on (prevents 'temperature shock'). High temps (above 30°C) cause heat stress, bleaching, loose airy buds. Low temps (below 15°C) slow growth dramatically. Roots prefer slightly cooler than air — 18-22°C is ideal for root zone.",
    related: ["VPD", "Heat Stress", "Cold Stress"],
  },
  {
    term: "CO2",
    category: "environment",
    simple: "Carbon dioxide — what plants breathe. More CO2 = faster growth.",
    detail: "Normal air contains about 400ppm CO2. Cannabis uses CO2 for photosynthesis — converting light into energy. At higher light intensities, adding supplemental CO2 (1000-1500ppm) can increase growth by 20-30%. Only useful if light, temperature, and nutrients are already dialed in. Beginners don't need to worry about CO2.",
    related: ["Photosynthesis", "Light Intensity"],
  },
  {
    term: "Light Schedule",
    category: "environment",
    simple: "How many hours of light vs darkness your plant gets each day.",
    detail: "Vegetative: 18 hours light, 6 hours dark (18/6). This keeps photoperiod plants growing without flowering. Flowering: 12 hours light, 12 hours dark (12/12). This triggers photoperiod plants to flower. Autoflowers don't need a schedule change — most growers keep them on 18/6 or even 20/4 for maximum growth.",
    related: ["Autoflower", "Photoperiod", "The Flip", "18/6", "12/12"],
  },
  {
    term: "18/6",
    category: "environment",
    simple: "18 hours of light and 6 hours of dark — the standard vegetative light schedule.",
    detail: "18/6 is the most common light schedule for vegetative growth. The 6 hours of darkness gives the plant a rest period and is believed to improve overall health vs running 24 hours of light. Some autoflower growers use 20/4 for maximum growth speed.",
    related: ["12/12", "Light Schedule", "Vegetative Stage"],
  },
  {
    term: "12/12",
    category: "environment",
    simple: "12 hours of light and 12 hours of dark — the flowering light schedule for photoperiod plants.",
    detail: "Switching to 12/12 triggers photoperiod cannabis to start producing flowers. This mimics autumn when natural days shorten. The 12 hours of uninterrupted darkness is crucial — even a brief light leak during the dark period can re-vegetate the plant or cause hermaphroditism. Autoflowers don't need 12/12.",
    related: ["18/6", "Light Schedule", "The Flip", "Photoperiod"],
  },
  {
    term: "The Flip",
    category: "environment",
    simple: "Switching your lights from 18/6 to 12/12 to trigger flowering.",
    detail: "When growers say 'I flipped last week', they mean they switched the light timer from 18/6 to 12/12 to start the flowering stage. After the flip, the plant goes through 1-2 weeks of 'transition' where it stretches rapidly (the 'stretch') before flowering begins. Most strains double or triple in height during the stretch.",
    related: ["12/12", "Light Schedule", "Flowering Stage", "Stretch"],
  },
  {
    term: "DLI",
    category: "environment",
    simple: "Daily Light Integral — the total amount of light your plant receives in a day.",
    detail: "DLI (mol/m²/day) combines light intensity and duration into a single number. Cannabis needs 20-40 DLI for optimal growth. Measure with a light meter app. Too low DLI = airy underdeveloped buds. Too high DLI = light stress/bleaching. Most LED lights at 30-50cm distance hit the right range with 18/6.",
    related: ["PPFD", "Light Intensity", "PAR"],
  },

  // ── GROWING ──────────────────────────────────────────────────────────────────
  {
    term: "Medium",
    category: "growing",
    simple: "What your plant's roots grow in.",
    detail: "The three main media: Soil = natural, forgiving, buffers pH naturally, good for beginners. Coco = coconut husk fibre, faster growth, more control, needs regular feeding, slightly harder than soil. Hydro = roots in water/air, fastest growth possible, most technical, expensive to set up. Each has different pH and EC targets.",
    related: ["Soil", "Coco", "Hydroponics", "pH", "EC"],
  },
  {
    term: "Soil",
    category: "growing",
    simple: "The most natural growing medium. Compost or potting mix that plant roots grow through.",
    detail: "Soil is the most beginner-friendly medium. Good soil contains compost, perlite, and organic matter. The soil naturally buffers pH and holds moisture. Pre-amended 'super soils' contain enough nutrients for the entire grow without adding extra feeds. Start with a quality cannabis-specific soil like BioBizz Light Mix or Plagron All Mix.",
    related: ["Medium", "Coco", "pH", "Perlite"],
  },
  {
    term: "Coco",
    category: "growing",
    simple: "Coconut husk fibre used as a growing medium. Faster growth than soil but needs more attention.",
    detail: "Coco coir is the fibrous material from coconut husks. It has no nutrients so you feed from the start. It drains well and holds oxygen at the roots — faster growth than soil. pH target is 5.8-6.2. Needs watering/feeding more frequently than soil (daily in large plants). Requires CalMag with every feed as coco naturally binds calcium.",
    related: ["Medium", "Soil", "CalMag", "pH"],
  },
  {
    term: "Hydroponics",
    category: "growing",
    simple: "Growing plants with roots in water or air instead of soil.",
    detail: "Hydroponic systems deliver nutrients directly to roots in water. Types: DWC (roots hang in nutrient solution), NFT (thin film of water over roots), Aeroponics (roots misted). Fastest growth and highest yields possible but expensive to set up, requires precise pH (5.5-6.0) and EC management, and is unforgiving of mistakes. Not for beginners.",
    related: ["Medium", "DWC", "EC", "pH"],
  },
  {
    term: "Perlite",
    category: "growing",
    simple: "White volcanic glass granules mixed into soil to improve drainage and aeration.",
    detail: "Perlite is a lightweight volcanic mineral that doesn't compact and doesn't hold nutrients. Adding 20-30% perlite to soil greatly improves drainage and keeps oxygen in the root zone. More oxygen at roots = faster growth. Also prevents overwatering. Most premium cannabis soils already contain perlite.",
    related: ["Soil", "Drainage", "Root Health"],
  },
  {
    term: "LST",
    category: "growing",
    simple: "Low Stress Training — gently bending and tying branches to create a flat canopy and more bud sites.",
    detail: "LST involves bending the main stem and branches horizontally and tying them down with soft wire or string. This breaks the plant's natural tendency to grow one tall main cola and instead creates multiple equal-height bud sites that all receive light. More bud sites = bigger total yield. Low stress means no cutting — the plant isn't damaged.",
    related: ["Topping", "SCROG", "HST", "Canopy", "Cola"],
  },
  {
    term: "Topping",
    category: "growing",
    simple: "Cutting the very tip of the main stem to create two new main stems instead of one.",
    detail: "When you cut the apical tip (growing tip) of a cannabis plant, the growth energy redirects into the next two side branches, which then become two main colas instead of one. This can be repeated to create 4, 8, or more main colas. Topping stresses the plant temporarily (1 week recovery) but dramatically increases yield. Don't top autos — they don't have time to recover.",
    related: ["LST", "FIM", "Cola", "Canopy"],
  },
  {
    term: "SCROG",
    category: "growing",
    simple: "Screen of Green — using a horizontal net to weave branches through and create an even canopy.",
    detail: "Place a horizontal screen (net with 5x5cm holes) 20-30cm above the plants. As branches grow through the holes, weave them horizontally. This creates a completely flat canopy where every bud receives equal light. Very effective at maximising yield per watt. Best for photoperiod plants in a fixed space.",
    related: ["LST", "Canopy", "Light Penetration"],
  },
  {
    term: "Defoliation",
    category: "growing",
    simple: "Removing leaves from the plant to improve light and airflow to buds.",
    detail: "Strategic removal of large fan leaves that block light to bud sites below. Done at specific times (just before flip, week 3 of flower). Controversial — done right, it increases yield by directing energy to buds and improving airflow (reducing humidity and mould risk). Done wrong, it stresses the plant. Never remove more than 20-30% of leaves at once.",
    related: ["Fan Leaves", "Light Penetration", "Airflow"],
  },
  {
    term: "Lollipopping",
    category: "growing",
    simple: "Removing the lower growth that won't receive enough light to produce good buds.",
    detail: "The lower third of a cannabis plant is in deep shade — any buds that form there will be small, airy, and underdeveloped ('popcorn buds'). Removing this lower growth redirects the plant's energy to the top canopy buds where light is strongest. The resulting shape looks like a lollipop — bare stem with a bushy top.",
    related: ["Defoliation", "Popcorn Buds", "Light Penetration"],
  },
  {
    term: "Transplanting",
    category: "growing",
    simple: "Moving a plant from a smaller pot to a bigger pot.",
    detail: "Plants are started in small pots (0.5-1L) then transplanted as they grow. A good rule: transplant when roots start showing at the drainage holes or the plant looks top-heavy. Final pot size: autos typically end in 5-15L, photoperiods in 15-30L. Bigger pots = bigger plants but slower soil drying. Don't transplant autos — the stress can affect yield.",
    related: ["Root Bound", "Pot Size"],
  },
  {
    term: "Watering",
    category: "growing",
    simple: "Giving your plant water. Overwatering is the most common beginner mistake.",
    detail: "Water when the top 2-3cm of soil is dry. Lift the pot — a light pot needs water, a heavy pot doesn't. Give enough water to see 10-20% runoff from the bottom. In soil, the wet/dry cycle is important — roots grow deeper searching for water. In coco, water daily. Classic beginner mistake: watering too often, keeping roots constantly wet = root rot.",
    related: ["Runoff", "Root Rot", "Overwatering"],
  },

  // ── HARVEST ──────────────────────────────────────────────────────────────────
  {
    term: "Trichomes",
    category: "harvest",
    simple: "Tiny crystal-like structures on buds that contain THC, CBD, and terpenes.",
    detail: "Trichomes are microscopic resin glands that cover cannabis buds and nearby leaves. They look like tiny mushrooms under magnification. They contain most of the plant's cannabinoids and terpenes. Colour changes in trichomes indicate ripeness: Clear = not ready. Cloudy/milky = peak THC. Amber = THC degrading to CBN (more sedating). Most growers harvest when 70-90% cloudy with some amber.",
    related: ["THC", "CBD", "Harvest", "Loupe"],
  },
  {
    term: "Harvest Window",
    category: "harvest",
    simple: "The optimal period to harvest your plant for the best result.",
    detail: "Cannabis doesn't have one exact harvest day — there's a window of 1-3 weeks. Harvesting early (all cloudy trichomes) = more energetic high, less sedating. Harvesting late (more amber) = more sedating, heavier effect. VYWEED gives you an estimated window based on your strain's genetics, but always confirm with a loupe. Trichomes are the most accurate indicator.",
    related: ["Trichomes", "Loupe", "Flushing"],
  },
  {
    term: "Loupe",
    category: "harvest",
    simple: "A small magnifying glass used to examine trichomes at 30-100x magnification.",
    detail: "A jeweller's loupe (60-100x) or digital microscope is essential for checking harvest readiness. At 60x you can clearly see trichome colour. Most budget options cost £5-15 and work fine. Without a loupe you're guessing. Checking trichomes once per week from the last 2 weeks of expected harvest is the correct approach.",
    related: ["Trichomes", "Harvest Window"],
  },
  {
    term: "Drying",
    category: "harvest",
    simple: "The process of removing moisture from harvested buds over 1-2 weeks.",
    detail: "After harvest, hang branches upside down in a cool (18-20°C), dark, well-ventilated space with 50-60% humidity. Drying too fast (warm or very dry conditions) = harsh, grassy-smelling buds. Drying too slow (humid conditions) = mould risk. Buds are ready to cure when the stems snap rather than bend. Takes 7-14 days.",
    related: ["Curing", "Harvest", "Humidity"],
  },
  {
    term: "Curing",
    category: "harvest",
    simple: "Storing dried buds in sealed jars for weeks/months to improve flavour, smoothness, and potency.",
    detail: "Place dried buds in glass mason jars, filled 75% full. Store in cool dark place. Open ('burp') jars for 15 minutes daily for the first 2 weeks to release moisture and exchange air. This slow process breaks down chlorophyll and allows terpenes to develop fully. Minimum cure: 2 weeks. Optimal: 4-8 weeks. Well-cured cannabis can last years without degrading.",
    related: ["Drying", "Terpenes", "Water Activity"],
  },
  {
    term: "Bud",
    category: "harvest",
    simple: "The flower of the cannabis plant — what you're growing the plant to produce.",
    detail: "Buds (also called flowers, nugs, or colas) are the reproductive organs of the female cannabis plant. They develop during the flowering stage and contain the highest concentration of cannabinoids and terpenes. A single large bud at the top of the main stem is called the main cola or apical bud. Smaller buds on side branches are secondary colas.",
    related: ["Cola", "Trichomes", "Flowering Stage"],
  },
  {
    term: "Cola",
    category: "harvest",
    simple: "A cluster of buds growing tightly together on a branch — the main flower structure.",
    detail: "Cola literally means 'tail' in Spanish. The main cola is the largest bud structure at the very top of the plant, also called the apical bud. Training techniques like topping and LST create multiple colas of similar size, which increases total yield. A well-trained plant might have 8-16 similar-sized colas all receiving good light.",
    related: ["Bud", "Topping", "LST"],
  },

  // ── EQUIPMENT ────────────────────────────────────────────────────────────────
  {
    term: "LED",
    category: "equipment",
    simple: "Light Emitting Diode — the most popular type of grow light. Efficient and produces less heat than other types.",
    detail: "Modern quantum board LEDs are the best option for most home growers. They're highly efficient (more light per watt), run cool, last 50,000+ hours, and produce full-spectrum light. Cost more upfront but save money on electricity. Look for lights with Samsung LM301B or LM301H chips from brands like Mars Hydro, Spider Farmer, or HLG. General rule: 40-50 watts per square foot.",
    related: ["HPS", "CMH", "PPFD", "Light Schedule"],
  },
  {
    term: "HPS",
    category: "equipment",
    simple: "High Pressure Sodium — an older type of grow light. Very effective but hot and power-hungry.",
    detail: "HPS has been the industry standard for decades. Very effective, cheap to buy, but uses more electricity, produces significant heat (requiring air conditioning), and needs replacing every year. Being replaced by LEDs in most setups. Still used in large commercial grows. If you have HPS already, it absolutely works — don't let anyone tell you otherwise.",
    related: ["LED", "CMH", "Heat Stress"],
  },
  {
    term: "Carbon Filter",
    category: "equipment",
    simple: "A filter filled with activated carbon that removes cannabis odour from the air.",
    detail: "Carbon filters (also called carbon scrubbers) are cylindrical filters filled with activated carbon that absorbs odour molecules. Connected inline with your extraction fan, they're essential for discrete growing. The filter goes inside the tent, connected to ducting that leads to the fan and out of the space. Replace carbon every 12-18 months or when odour is noticeable.",
    related: ["Extraction Fan", "Odour Control"],
  },
  {
    term: "Extraction Fan",
    category: "equipment",
    simple: "An inline fan that pulls air out of your grow space to control temperature, humidity, and odour.",
    detail: "An inline fan pulls air through a carbon filter and out of the tent, replacing all the air in the tent every 1-3 minutes. This controls: Temperature (removes hot air), Humidity (removes humid air), CO2 (brings fresh air in), Odour (air passes through carbon filter). Size the fan to replace tent volume every 1-2 minutes. Always connect to a speed controller.",
    related: ["Carbon Filter", "Circulation Fan", "Temperature", "Humidity"],
  },
  {
    term: "Grow Tent",
    category: "equipment",
    simple: "A lightproof, reflective tent for growing cannabis indoors.",
    detail: "Grow tents are fabric frames with a highly reflective interior (mylar) that bounce light back onto plants. They're lightproof for 12/12 light schedules and contain smell to some extent. Common sizes: 60x60cm (1-2 plants), 80x80cm (2-4 plants), 120x120cm (4-9 plants). All have hanging bars for lights, fans, and filters, plus ports for ducting.",
    related: ["LED", "Carbon Filter", "Extraction Fan"],
  },
  {
    term: "pH Meter",
    category: "equipment",
    simple: "A device that measures the acidity of your water. Essential kit.",
    detail: "A digital pH meter is non-negotiable for indoor growing. Cheap strips are inaccurate. Get a decent digital pen meter — Apera or BlueLab are reliable brands. Calibrate with pH 4.0 and 7.0 buffer solution weekly. Keep the probe wet/hydrated between uses. A dead or uncalibrated pH meter is the #1 cause of unexplained nutrient problems.",
    related: ["pH", "EC Meter", "Calibration"],
  },
  {
    term: "EC Meter",
    category: "equipment",
    simple: "A device that measures how many nutrients are dissolved in your water.",
    detail: "Also called a TDS meter. Stick the probe in your nutrient solution and it reads EC in mS/cm or PPM. Cheap EC meters work fine — £10-20. Calibrate with 1.413 mS/cm solution. Always measure EC after adjusting pH, and measure runoff EC to check for salt buildup in your medium.",
    related: ["EC", "pH Meter", "Runoff"],
  },
  {
    term: "Hygrometer",
    category: "equipment",
    simple: "A device that measures temperature and humidity — essential for monitoring your grow environment.",
    detail: "A digital thermo-hygrometer shows temperature (°C or °F) and relative humidity (%). Place at canopy height — not on the floor or too close to a fan. Get one with min/max memory so you can see the extremes over the last 24 hours. Some connect to apps for logging. Cost: £5-30. Essential in your grow kit.",
    related: ["Temperature", "Humidity", "VPD"],
  },

  // ── GENETICS ─────────────────────────────────────────────────────────────────
  {
    term: "Genetics",
    category: "genetics",
    simple: "The DNA blueprint of a cannabis plant — determines everything about it.",
    detail: "Genetics determine: Plant size and shape. How long it takes to flower. THC and CBD content. Terpene profile (smell and flavour). Effect. Yield. Disease resistance. Growing difficulty. Good genetics from a reputable breeder are the foundation of a good grow. Even the best growing skills can't overcome poor genetics.",
    related: ["Strain", "Breeder", "Phenotype", "Lineage"],
  },
  {
    term: "Lineage",
    category: "genetics",
    simple: "The family tree of a strain — which strains were used to create it.",
    detail: "Lineage tells you a strain's parents and sometimes grandparents. E.g. Gelato = Thin Mint GSC × Sunset Sherbet. Understanding lineage helps predict a strain's character. If both parents are known for fruity terpenes, the offspring likely will be too. In VYWEED, tap any parent in the genetics section to navigate to that strain's page.",
    related: ["Genetics", "Breeder", "Phenotype"],
  },
  {
    term: "Phenotype",
    category: "genetics",
    simple: "A variation within a strain — two plants from the same seed pack can look and smell different.",
    detail: "Even seeds from the same batch can express different traits — called phenotypic variation. One seed might be taller, another might smell more fruity. This is why experienced growers 'pheno hunt' — growing many seeds of one strain and selecting the best individual plant (the 'keeper') to clone repeatedly. Stable strains have less phenotypic variation.",
    related: ["Genetics", "Clone", "Lineage"],
  },
  {
    term: "THC",
    category: "genetics",
    simple: "Tetrahydrocannabinol — the main psychoactive compound in cannabis. What makes you feel high.",
    detail: "THC is produced in trichomes and binds to CB1 receptors in the brain, producing psychoactive effects. THC percentage in modern strains ranges from 10% (mild) to 30%+ (very strong). Higher THC doesn't always mean better — the combination of cannabinoids and terpenes ('entourage effect') determines the quality of the experience.",
    related: ["CBD", "Terpenes", "Trichomes", "Cannabinoids"],
  },
  {
    term: "CBD",
    category: "genetics",
    simple: "Cannabidiol — a non-psychoactive cannabinoid with medical benefits.",
    detail: "CBD doesn't produce a traditional high but has significant medical applications: anti-anxiety, anti-inflammatory, anticonvulsant, pain relief. High-CBD strains (1:1 CBD:THC ratio or higher) are popular for medical use. CBD also modulates the effects of THC — strains with equal CBD:THC ratios feel less intense than pure high-THC strains.",
    related: ["THC", "Cannabinoids", "Terpenes"],
  },
  {
    term: "Terpenes",
    category: "genetics",
    simple: "Aromatic compounds that give cannabis its smell and shape its effects.",
    detail: "Terpenes are found in all plants — limonene in lemons, myrcene in mangoes, linalool in lavender. Cannabis produces over 100 different terpenes. They interact with cannabinoids to create the 'entourage effect' — modifying and enhancing the effects of THC and CBD. In VYWEED, tap any terpene on a strain page for a full educational profile.",
    related: ["THC", "CBD", "Myrcene", "Limonene", "Entourage Effect"],
  },
  {
    term: "Entourage Effect",
    category: "genetics",
    simple: "How all the compounds in cannabis work together to create effects greater than any single compound alone.",
    detail: "THC alone produces one type of effect. CBD alone produces different effects. But together with terpenes and minor cannabinoids, they interact synergistically to create a more complex, nuanced experience. This is why isolated THC feels different from whole-plant cannabis. Full-spectrum extracts preserve this effect; isolates don't.",
    related: ["THC", "CBD", "Terpenes", "Cannabinoids"],
  },
  {
    term: "Ruderalis",
    category: "genetics",
    simple: "A wild cannabis subspecies from Russia/Siberia that evolved to flower automatically.",
    detail: "Cannabis ruderalis is a small wild cannabis from harsh northern climates. Unlike indica and sativa, it evolved to flower based on age rather than light because reliable long summers don't exist in Siberia. Modern autoflower strains were created by crossing ruderalis with indica/sativa genetics to get automatic flowering combined with quality genetics.",
    related: ["Autoflower", "Indica", "Sativa"],
  },
  {
    term: "Landrace",
    category: "genetics",
    simple: "An ancient, pure cannabis strain that evolved naturally in a specific geographic region.",
    detail: "Landraces are the original cannabis strains — untouched by commercial breeding. They're perfectly adapted to their native environment. Examples: Afghani (Hindu Kush mountains), Durban Poison (South Africa), Thai (Thailand), Colombian Gold (Colombia). They're the genetic foundation from which all modern hybrids were created. T1 strains in VYWEED are pure landraces.",
    related: ["Genetics", "Indica", "Sativa", "Hybrid"],
  },

  // ── PROBLEMS ──────────────────────────────────────────────────────────────────
  {
    term: "Nutrient Deficiency",
    category: "problems",
    simple: "When your plant isn't getting enough of a specific nutrient — shows as visible symptoms on leaves.",
    detail: "Common deficiencies: Nitrogen = yellowing starting from bottom leaves. Calcium = brown spots and spots on new growth. Magnesium = yellowing between leaf veins. Phosphorus = dark purple/red stems and leaves. Iron = yellowing of new growth. Most 'deficiencies' are actually pH lockout — check pH first before adding more nutrients.",
    related: ["pH Lockout", "NPK", "CalMag"],
  },
  {
    term: "Overwatering",
    category: "problems",
    simple: "Watering too often — the most common beginner mistake. Roots need air as well as water.",
    detail: "Overwatering doesn't mean giving too much water at once — it means watering too frequently. Signs: drooping, yellowing lower leaves, slow growth, musty smell. Cannabis roots need oxygen — constantly wet soil suffocates them. Fix: let soil dry between waterings. Lift the pot to feel the weight — only water when it's light.",
    related: ["Root Rot", "Watering", "Drainage"],
  },
  {
    term: "Root Rot",
    category: "problems",
    simple: "When roots turn brown and slimy due to lack of oxygen or harmful bacteria.",
    detail: "Root rot (pythium) is caused by waterlogged conditions, poor drainage, or warm stagnant water. Roots turn from white to brown/grey and slimy. Plant shows wilting, yellowing, slow growth. More common in hydro. Prevention: avoid overwatering, ensure drainage, maintain water temperature below 20°C in hydro. Treatment: beneficial bacteria products like Hydroguard.",
    related: ["Overwatering", "Hydroponics", "Drainage"],
  },
  {
    term: "Bud Rot",
    category: "problems",
    simple: "Mould that grows inside buds during flowering — can destroy a whole harvest quickly.",
    detail: "Botrytis cinerea (grey mould) grows inside dense buds when humidity is too high in late flower. Signs: buds turn grey/brown from the inside, leaves within the bud die, a grey powder may appear. Remove affected buds immediately — it spreads fast. Prevention: keep humidity below 50% in flower, ensure airflow. This is why late flower humidity control is so important.",
    related: ["Humidity", "Mould", "Late Flower"],
  },
  {
    term: "Heat Stress",
    category: "problems",
    simple: "Damage from temperatures being too high — usually above 30°C.",
    detail: "Signs: leaves curl up like tacos, bleaching/whitening near the light source, airy loose buds, stunted growth. Causes: lights too close, poor ventilation, hot climate. Fix: raise light, improve ventilation, add a small fan between light and canopy. LED lights run cooler than HPS and are less likely to cause heat stress.",
    related: ["Temperature", "Light Stress", "LED"],
  },
  {
    term: "Hermaphrodite",
    category: "problems",
    simple: "A female plant that grows male pollen sacs — it can pollinate itself and your whole crop.",
    detail: "Stress can cause a female plant to develop male flowers (bananas or pollen sacs) as a survival mechanism — it tries to pollinate itself before dying. Triggers: light leaks, extreme heat, physical damage, poor genetics. A hermaphrodite will seed your whole crop — seeds in buds reduce quality significantly. Prevention: stable environment, good genetics, check for light leaks.",
    related: ["Light Schedule", "Stress", "Genetics"],
  },
  {
    term: "Spider Mites",
    category: "problems",
    simple: "Tiny pests that live under leaves and suck the life out of your plants.",
    detail: "Spider mites are microscopic arachnids that create fine webbing under leaves and suck plant cells, leaving tiny yellow dots on leaves (stippling). They thrive in hot, dry, dusty conditions. Signs: fine webbing, yellowing leaves with tiny dots. Treatment: Neem oil, predatory mites, spinosad. Prevention: clean environment, correct humidity, inspect new plants before adding to your grow.",
    related: ["Pests", "Neem Oil"],
  },
  {
    term: "Powdery Mildew",
    category: "problems",
    simple: "A fungal disease that appears as white powder on leaves — spreads rapidly in humid conditions.",
    detail: "Powdery mildew (PM) is a white powdery fungus on leaf surfaces. Unlike other moulds it doesn't need wet surfaces — it thrives in high humidity with poor airflow. Spreads via spores in the air. Signs: white powder on upper leaf surfaces. Treatment: diluted hydrogen peroxide, potassium bicarbonate. Prevention: airflow, correct humidity, defoliation to improve air circulation.",
    related: ["Humidity", "Airflow", "Mould"],
  },
  {
    term: "Light Stress",
    category: "problems",
    simple: "Damage caused by too much light intensity — leaves bleach white near the light source.",
    detail: "Too much light causes bleaching (leaves turn white) and can reduce trichome production. Signs: white or pale yellow leaves nearest the light, while lower leaves stay green. Fix: raise the light or dim it. Most LED manufacturers provide recommended hanging heights — start there and adjust based on plant response.",
    related: ["Heat Stress", "LED", "PPFD"],
  },
  {
    term: "Stretch",
    category: "problems",
    simple: "The rapid height increase that happens in the first 2 weeks after switching to 12/12.",
    detail: "When photoperiod plants receive the 12/12 signal, they go through a rapid stretch — some strains double or even triple in height over 2 weeks. Sativas stretch more than indicas. This is normal but can catch new growers by surprise. Account for stretch when planning your grow space — if you flip at 50cm, you might end up with a 100-150cm plant.",
    related: ["The Flip", "Flowering Stage", "Height Management"],
  },
];

// ── Term Detail Modal ─────────────────────────────────────────────────────────
function TermModal({ term, onClose, onNavigate }) {
  if (!term) return null;
  const categoryColours = {
    basics: C.green, nutrients: C.amber, environment: C.blue,
    growing: C.purple, harvest: "#ff8c30", equipment: C.greyLight,
    genetics: C.red, problems: C.red,
  };
  const col = categoryColours[term.category] || C.green;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20,
          borderTopRightRadius: 20, borderTopWidth: 2, borderColor: col, maxHeight: "88%" }}>

          <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2 }} />
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between",
            alignItems: "center", paddingHorizontal: 16, paddingBottom: 12,
            borderBottomWidth: 1, borderColor: C.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: col, fontFamily: MONO,
                fontSize: 20, fontWeight: "bold" }}>
                {term.term}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <View style={{ backgroundColor: `${col}22`, borderRadius: 4,
                  borderWidth: 1, borderColor: col,
                  paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: col, fontFamily: MONO, fontSize: 9, fontWeight: "bold" }}>
                    {term.category.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

            {/* Simple explanation */}
            <View style={{ backgroundColor: `${col}15`, borderRadius: 8,
              borderWidth: 1, borderColor: col, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 6 }}>IN PLAIN ENGLISH</Text>
              <Text style={{ color: C.white, fontFamily: MONO, fontSize: 14,
                lineHeight: 21, fontWeight: "bold" }}>
                {term.simple}
              </Text>
            </View>

            {/* Detailed explanation */}
            <View style={{ backgroundColor: C.surface, borderRadius: 8,
              borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 6 }}>THE FULL PICTURE</Text>
              <Text style={{ color: C.white, fontFamily: MONO,
                fontSize: 13, lineHeight: 20 }}>
                {term.detail}
              </Text>
            </View>

            {/* Related terms */}
            {term.related?.length > 0 && (
              <View style={{ backgroundColor: C.surface, borderRadius: 8,
                borderWidth: 1, borderColor: C.border, padding: 14 }}>
                <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                  letterSpacing: 1.5, marginBottom: 10 }}>SEE ALSO</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {term.related.map((r, i) => (
                    <TouchableOpacity key={i} onPress={() => onNavigate(r)}
                      style={{ backgroundColor: C.greenFaint, borderRadius: 6,
                        borderWidth: 1, borderColor: C.greenDim,
                        paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Text style={{ color: C.green, fontFamily: MONO, fontSize: 12 }}>
                        {r} →
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Term Row ──────────────────────────────────────────────────────────────────
function TermRow({ term, onPress, last }) {
  const categoryColours = {
    basics: C.green, nutrients: C.amber, environment: C.blue,
    growing: C.purple, harvest: "#ff8c30", equipment: C.greyLight,
    genetics: C.red, problems: C.red,
  };
  const col = categoryColours[term.category] || C.green;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={{ flexDirection: "row", alignItems: "center",
        paddingVertical: 12, paddingHorizontal: 16,
        borderBottomWidth: last ? 0 : 1, borderColor: C.border }}>
        <View style={{ width: 8, height: 8, borderRadius: 4,
          backgroundColor: col, marginRight: 16 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.white, fontFamily: MONO, fontSize: 14, fontWeight: "bold" }}>
            {term.term}
          </Text>
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11,
            marginTop: 2 }} numberOfLines={1}>
            {term.simple}
          </Text>
        </View>
        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 16 }}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function Glossary({ onBack }) {
  const [query, setQuery]       = useState("");
  const [category, setCategory] = useState("all");
  const [selectedTerm, setSelectedTerm] = useState(null);

  const filtered = useMemo(() => {
    let terms = GLOSSARY;
    if (category !== "all") {
      terms = terms.filter(t => t.category === category);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      terms = terms.filter(t =>
        t.term.toLowerCase().includes(q) ||
        t.simple.toLowerCase().includes(q) ||
        t.detail.toLowerCase().includes(q)
      );
    }
    return terms.sort((a, b) => a.term.localeCompare(b.term));
  }, [query, category]);

  // Navigate to a related term by name
  const navigateToTerm = (termName) => {
    const found = GLOSSARY.find(t =>
      t.term.toLowerCase() === termName.toLowerCase()
    );
    if (found) setSelectedTerm(found);
  };

  // Group filtered terms by first letter for alphabet sections
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(t => {
      const letter = t.term[0].toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(t);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 16 : 52,
        paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border }}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={{ marginBottom: 8 }}>
            <Text style={{ color: C.green, fontFamily: MONO, fontSize: 14 }}>← BACK</Text>
          </TouchableOpacity>
        )}
        <View style={{ flexDirection: "row", justifyContent: "space-between",
          alignItems: "flex-end" }}>
          <View>
            <Text style={{ color: C.white, fontFamily: MONO,
              fontSize: 22, fontWeight: "900", letterSpacing: 2 }}>
              VY<Text style={{ color: C.green }}>WEED</Text>
            </Text>
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
              letterSpacing: 1.5 }}>
              GLOSSARY — {GLOSSARY.length} TERMS
            </Text>
          </View>
        </View>

        {/* Search */}
        <View style={{ flexDirection: "row", alignItems: "center",
          backgroundColor: C.surface, borderRadius: 8,
          borderWidth: 1, borderColor: query ? C.green : C.border,
          paddingHorizontal: 12, marginTop: 10 }}>
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 14, marginRight: 8 }}>⌕</Text>
          <TextInput
            style={{ flex: 1, color: C.white, fontFamily: MONO,
              fontSize: 14, paddingVertical: 11 }}
            value={query}
            onChangeText={setQuery}
            placeholder="Search terms..."
            placeholderTextColor={C.grey}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 12, gap: 8, flexDirection: "row" }}
        style={{ maxHeight: 80 }}>
        {CATEGORIES.map(cat => {
          const isActive = category === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => setCategory(cat.key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 8,
                borderWidth: 2,
                borderColor: isActive ? "#39ff45" : "#333",
                backgroundColor: isActive ? "#0d3d12" : "#111",
                minWidth: 90,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: "#ffffff",
                  fontSize: 12,
                  fontWeight: "bold",
                  textAlign: "center",
                }}
              >
                {cat.icon}
              </Text>
              <Text
                style={{
                  color: isActive ? "#39ff45" : "#aaaaaa",
                  fontSize: 10,
                  fontWeight: "bold",
                  textAlign: "center",
                  marginTop: 2,
                }}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Results count */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 6,
        borderBottomWidth: 1, borderColor: C.border }}>
        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
          {filtered.length} TERM{filtered.length !== 1 ? "S" : ""}
        </Text>
      </View>

      {/* Term list grouped by letter */}
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {filtered.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Text style={{ fontSize: 36 }}>🔍</Text>
              <Text style={{ color: C.grey, fontFamily: MONO,
                fontSize: 13, marginTop: 12 }}>
                No terms found for "{query}"
              </Text>
            </View>
          ) : (
            grouped.map(([letter, terms]) => (
              <View key={letter}>
                {/* Letter header */}
                <View style={{ backgroundColor: C.surface, paddingHorizontal: 16,
                  paddingVertical: 6, borderBottomWidth: 1, borderColor: C.border }}>
                  <Text style={{ color: "rgba(195,220,200,0.65)", fontFamily: MONO,
                    fontSize: 13, fontWeight: "bold" }}>
                    {letter}
                  </Text>
                </View>
                {/* Terms */}
                <View style={{ backgroundColor: C.card, borderBottomWidth: 1,
                  borderColor: C.border }}>
                  {terms.map((term, i) => (
                    <TermRow
                      key={term.term}
                      term={term}
                      onPress={() => setSelectedTerm(term)}
                      last={i === terms.length - 1}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
        {/* Bottom vignette */}
        <View pointerEvents="none" style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 48 }}>
          <View style={{ flex: 1, backgroundColor: "rgba(7,10,7,0.55)" }} />
          <View style={{ height: 16, backgroundColor: "rgba(7,10,7,0.75)" }} />
          <View style={{ height: 8, backgroundColor: "rgba(7,10,7,0.92)" }} />
        </View>
      </View>

      {/* Term detail modal */}
      <TermModal
        term={selectedTerm}
        onClose={() => setSelectedTerm(null)}
        onNavigate={(termName) => {
          const found = GLOSSARY.find(t =>
            t.term.toLowerCase() === termName.toLowerCase()
          );
          if (found) setSelectedTerm(found);
        }}
      />
    </View>
  );
}
