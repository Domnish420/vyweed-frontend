// DailyCarePanel.jsx — Collapsible daily care checklist for each grow stage
// Exports: default DailyCarePanel component + named STAGE_CARE_TASKS object

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Design tokens ─────────────────────────────────────────────────────────────
const HEADING   = "BebasNeue_400Regular";
const SANS      = "SpaceGrotesk_400Regular";
const SANS_MED  = "SpaceGrotesk_500Medium";
const SANS_BOLD = "SpaceGrotesk_700Bold";

const C = {
  bg:          "#0B0D0C",
  surface:     "rgba(255,255,255,0.04)",
  card:        "rgba(255,255,255,0.03)",
  border:      "rgba(255,255,255,0.08)",
  green:       "#3dffa0",
  greenFaint:  "rgba(61,255,160,0.08)",
  greenDim:    "rgba(61,255,160,0.4)",
  amber:       "#c17a4a",
  amberFaint:  "rgba(193,122,74,0.08)",
  amberDim:    "rgba(193,122,74,0.35)",
  blue:        "#5b9bd5",
  purple:      "#c8b4e8",
  purpleFaint: "rgba(200,180,232,0.08)",
  purpleDim:   "rgba(200,180,232,0.30)",
  grey:        "rgba(232,228,217,0.28)",
  greyLight:   "rgba(232,228,217,0.52)",
  white:       "#e8e4d9",
  lavender:    "#c8b4e8",
};

// ── Stage care tasks ───────────────────────────────────────────────────────────
export const STAGE_CARE_TASKS = {
  Seedling: [
    {
      id: "seed_moisture",
      label: "Moisture check",
      detail:
        "Seedlings need just the right moisture — not soggy, not bone dry. Lift the pot or press the top cm of soil. If it clings to your finger, hold off watering. Overwatering at this stage drowns roots and invites damping-off.",
    },
    {
      id: "seed_light_dist",
      label: "Light distance 45–50 cm",
      detail:
        "Seedlings are fragile. Keep your light 45–50 cm above the canopy to avoid bleaching or light stress. If you see the seedling stretching tall and spindly, it's reaching for light — bring it closer.",
    },
    {
      id: "seed_temp",
      label: "Temperature 22–26 °C",
      detail:
        "The sweet spot for seedlings is 22–26 °C. Below 20 °C slows metabolism; above 28 °C stresses the plant. High humidity (65–70% RH) helps compensate for a root system that isn't yet fully developed.",
    },
    {
      id: "seed_pest",
      label: "Pest inspection",
      detail:
        "Check under leaves and at soil level for fungus gnats, spider mites, or mould. Seedlings have no defences — a small problem here becomes a big one in veg. Yellow sticky traps near the base catch gnats early.",
    },
  ],

  Vegetative: [
    {
      id: "veg_water",
      label: "Watering / pot-lift check",
      detail:
        "Lift the pot — if it's light, water thoroughly until runoff, then wait. If it still feels heavy, the roots haven't drunk it down yet. The cycle of wet → dry → wet trains roots to grow outward chasing moisture.",
    },
    {
      id: "veg_ph",
      label: "pH 6.0–7.0",
      detail:
        "Soil grows best in the 6.0–7.0 pH window. Outside this range, nutrients lock out even when they're present. Test your runoff — not just your input water — to know what's actually happening at the root zone.",
    },
    {
      id: "veg_training",
      label: "Training / LST opportunity",
      detail:
        "Low Stress Training (LST) now creates extra bud sites. Gently bend main branches outward and secure them with soft ties. The plant responds by pushing growth upward from each bend. Every branch you flatten becomes a future cola.",
    },
    {
      id: "veg_leaves",
      label: "Fan leaf health — deep green = good",
      detail:
        "Healthy veg leaves are a deep, uniform green. Yellowing between veins = magnesium deficiency. Brown tips = nutrient burn or salt buildup. Pale overall = nitrogen deficiency. Take a photo to track changes over 48 hours.",
    },
    {
      id: "veg_airflow",
      label: "Airflow — stems should sway",
      detail:
        "A gentle breeze makes stems thicker and stronger. It also prevents hot-spots and discourages mould. Run a fan so the tops sway slightly — not violently. Stagnant air breeds problems fast, especially at canopy level.",
    },
  ],

  Transition: [
    {
      id: "trans_schedule",
      label: "Confirm 12/12 schedule — zero light leaks",
      detail:
        "The plant detects the dark period by duration. Even a brief light leak — a timer indicator LED, a phone screen — can confuse it and cause hermaphroditism. Seal every gap in your tent or room. Check with your eyes fully dark-adapted.",
    },
    {
      id: "trans_height",
      label: "Measure today's height — stretch can double it",
      detail:
        "Log today's height. Some strains stretch 50–100% during transition. If you're in a tent with limited headroom, now is the time to bend any vertical growth. Record daily so you know when the stretch is slowing.",
    },
    {
      id: "trans_light_adj",
      label: "Adjust light distance daily",
      detail:
        "As the plant stretches, your light distance changes every day. Check and adjust. The goal is keeping the canopy within the manufacturer's recommended range. Too close = bleaching/light burn; too far = airy buds.",
    },
    {
      id: "trans_feed",
      label: "Switch to bloom feed — less N, more P/K",
      detail:
        "Flowering plants need phosphorus (P) and potassium (K) over nitrogen (N). High-N feeds in flower produce leafy, loose buds. Switch to your bloom formula now and taper down N over the next two weeks.",
    },
  ],

  "Early Flower": [
    {
      id: "ef_bud_sites",
      label: "Count bud sites — each one is a future bud",
      detail:
        "Take a moment to count or estimate your bud sites. This is your yield potential locked in. If you want to increase them, you're running out of time — any defoliation or lollipopping should happen in the next few days, not later.",
    },
    {
      id: "ef_feed_log",
      label: "Feed and log it — EC + amount",
      detail:
        "Write down exactly what you feed and the EC of your solution. Building a feed log now means you can troubleshoot later. Target EC 1.4–1.8 for early flower depending on strain. Log the runoff EC too — creeping up means salt buildup.",
    },
    {
      id: "ef_humidity",
      label: "Humidity check — 45–55% RH",
      detail:
        "Drop humidity to the 45–55% RH zone as bud sites form. High humidity (above 60%) at this stage sets the stage for bud rot (Botrytis) later. If your RH is high, increase airflow and check for cold spots where moisture pools.",
    },
    {
      id: "ef_trichomes",
      label: "First trichome check — should be clear glass",
      detail:
        "Use a 30–60x loupe or jeweller's loupe to look at the calyxes. Right now trichomes should look like clear, glass-like stalks with a tiny bulb on top. This is your baseline. Any milky/white trichomes at this stage would be unusual — document what you see.",
    },
  ],

  "Mid Flower": [
    {
      id: "mf_swell",
      label: "Bud swell observation — log what you see",
      detail:
        "This is the phase where buds go from flimsy to substantial. Look at the same bud sites every day and note the change. If buds feel loose and airy, check light intensity and distance. Dense buds = right conditions.",
    },
    {
      id: "mf_feed",
      label: "EC/feed check — peak feeding phase",
      detail:
        "Mid-flower is peak nutrient demand. Push EC slowly toward 1.8–2.2 if your strain can handle it, watching for tip burn (first sign of overfeeding). Don't skip feeds now — this is where yield is made.",
    },
    {
      id: "mf_smell",
      label: "Smell check — log the aroma, it changes weekly",
      detail:
        "The terpene profile is developing right now. Open the tent and take a breath — what do you smell? Write it down. Earthy, citrus, fuel, sweet, floral? The aroma shifts week to week. Your log becomes a reference for future grows.",
    },
    {
      id: "mf_trichomes",
      label: "Trichome check — milky white = almost time",
      detail:
        "Milky/white trichomes mean THC is near its peak. When the majority turn milky, harvest is 1–3 weeks away. A few amber ones (CBN conversion) give a more relaxing effect. Start checking every 2–3 days now.",
    },
    {
      id: "mf_defoliation",
      label: "Strategic defoliation — remove blocks to lower buds",
      detail:
        "Remove large fan leaves that cast shade over developing lower buds. Don't strip the plant — take 10–20% of leaf mass maximum. The goal is light penetration, not leaf removal for its own sake. Only do this if buds are visible but shaded.",
    },
  ],

  "Late Flower": [
    {
      id: "lf_trichome_log",
      label: "Trichome colour log — note milky:amber ratio",
      detail:
        "This is your most important daily task now. Count (or estimate) the ratio of clear : milky : amber trichomes on the calyxes (not sugar leaves — they mature faster). 0% amber = peaky THC. 10–20% amber = balanced. 30%+ amber = heavier, sedative effect.",
    },
    {
      id: "lf_flush",
      label: "Switch to flush water — plain pH water only, no more nutes",
      detail:
        "If you're using synthetic nutrients, begin flushing now. Use plain water pH'd to 6.2–6.8. The plant will mobilise stored nutrients from fan leaves — you'll see them yellow and die off. This is normal and healthy. Log the date you switched.",
    },
    {
      id: "lf_pistils",
      label: "Pistil colour check — 70–90% orange/red = harvest window",
      detail:
        "White pistils = still building. Orange/red/brown pistils = ripening. When 70–90% have coloured, you're in the harvest window. Use this alongside trichome checks — both together give the clearest picture. Pistil colour alone can mislead.",
    },
    {
      id: "lf_lower_buds",
      label: "Check lower buds — often a week behind",
      detail:
        "Lower buds receive less light and typically mature 5–10 days after the tops. If your tops are ready, you may want to harvest in stages — tops first, then let lower buds run another week. Or accept the difference and harvest all at once.",
    },
  ],

  "Final Days": [
    {
      id: "fd_trichome_ratio",
      label: "Final trichome ratio log — most important data point",
      detail:
        "Write down your exact trichome reading today: percentage clear / milky / amber. This is the data point that determines effect profile. Once you harvest, you can't un-harvest. If you're unsure, wait 24 hours and check again. More grows have been harvested too early than too late.",
    },
    {
      id: "fd_flush",
      label: "Plain water flush — hard flush, finish it right",
      detail:
        "Give a full, thorough flush with plain pH water. Use 2–3x the pot volume if growing in soil. This clears residual salt buildup and nutrient residue. Your smoke will be noticeably cleaner and smoother if you finish it right.",
    },
    {
      id: "fd_tools",
      label: "Prep harvest tools — scissors, hanging wire, drying space",
      detail:
        "Clean your scissors (isopropyl alcohol), set up hanging wire or a drying rack, confirm your drying space is at 18–20 °C and 55–60% RH. Having everything ready before you chop means a calm, deliberate harvest rather than a chaotic scramble.",
    },
    {
      id: "fd_darkness",
      label: "Darkness period consideration — 24–48h optional",
      detail:
        "Some growers run 24–48 hours of darkness before harvest, believing it triggers a final terpene push. The science is inconclusive but the practice is widespread. If you try it, note it in your log so you can compare results across grows. Not doing it is also fine.",
    },
  ],

  "Harvest Ready": [
    {
      id: "hr_trichome_decision",
      label: "Make the trichome decision — mostly cloudy + 10–20% amber",
      detail:
        "Mostly milky/cloudy trichomes with 10–20% amber gives a balanced effect — high THC with some CBN for depth. If you want more cerebral/energetic, harvest at 5% amber. If you want heavier/relaxing, let it run to 30% amber. This is your call — trust your data.",
    },
    {
      id: "hr_drying_space",
      label: "Drying space ready — 18–20 °C, 55–60% RH, dark, good airflow",
      detail:
        "Check your drying space right now. Temperature: 18–20 °C. Humidity: 55–60% RH. Airflow: gentle, indirect. Light: dark. A slow, 10–14 day dry at these conditions preserves terpenes far better than a fast 3-day dry. Rushed drying = hay smell.",
    },
    {
      id: "hr_photos",
      label: "Take final photos — document peak",
      detail:
        "Take close-up photos of your best buds before you chop. Under the loupe if you can. From multiple angles. These photos are your grow's record — the trichome coverage, the bud structure, the frost. It won't look like this again until your next grow.",
    },
    {
      id: "hr_harvest",
      label: "Ready to harvest — everything checks out",
      detail:
        "Everything is in order. Tools clean, drying space ready, trichomes at target. When you're ready: cut at the base or stem by stem. Work methodically. Take your time. The grow is complete — what you do in the next two hours determines what ends up in the jar.",
    },
  ],
};

// ── Helper ─────────────────────────────────────────────────────────────────────
function CheckboxIcon({ checked }) {
  return (
    <View
      style={[
        s.checkbox,
        checked && { backgroundColor: C.greenFaint, borderColor: C.greenDim },
      ]}
    >
      {checked && (
        <Text style={{ color: C.green, fontSize: 11, fontFamily: SANS_BOLD }}>
          ✓
        </Text>
      )}
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DailyCarePanel({
  stage,
  storageKey,
  today,
  canClaim,
  onClaim,
}) {
  const tasks = STAGE_CARE_TASKS[stage] ?? [];
  const total = tasks.length;

  const [expanded, setExpanded]     = useState(false);
  const [checked, setChecked]       = useState({});
  const [claimed, setClaimed]       = useState(false);
  const [openTip, setOpenTip]       = useState(null); // task id with open detail

  const storageRef = `${storageKey}_care_${today}`;

  // Load from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageRef);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.checked)  setChecked(data.checked);
          if (data.claimed)  setClaimed(data.claimed);
        }
      } catch (_) {}
    })();
  }, [storageRef]);

  const persist = useCallback(
    async (nextChecked, nextClaimed) => {
      try {
        await AsyncStorage.setItem(
          storageRef,
          JSON.stringify({ checked: nextChecked, claimed: nextClaimed, stage, date: today })
        );
      } catch (_) {}
    },
    [storageRef, stage, today]
  );

  const toggleCheck = useCallback(
    (id) => {
      if (claimed) return;
      setChecked((prev) => {
        const next = { ...prev, [id]: !prev[id] };
        persist(next, false);
        return next;
      });
    },
    [claimed, persist]
  );

  const toggleTip = useCallback((id) => {
    setOpenTip((prev) => (prev === id ? null : id));
  }, []);

  const handleClaim = useCallback(async () => {
    setClaimed(true);
    setExpanded(false);
    await persist(checked, true);
    onClaim?.();
  }, [checked, persist, onClaim]);

  const doneCount = tasks.filter((t) => checked[t.id]).length;
  const allDone   = doneCount === total;
  const claimActive = canClaim && allDone && !claimed;

  // Hidden when there's nothing to do
  if (!canClaim && !claimed) return null;

  // ── Collapsed banner ───────────────────────────────────────────────────────
  if (!expanded) {
    if (claimed) {
      return (
        <TouchableOpacity
          onPress={() => setExpanded(true)}
          activeOpacity={0.75}
          style={s.claimedBanner}
        >
          <Text style={s.claimedBannerText}>
            CARE LOGGED ✓ · {doneCount}/{total} tasks · tap to review
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        onPress={() => setExpanded(true)}
        activeOpacity={0.75}
        style={s.collapsedBanner}
      >
        <View style={s.collapsedLeft}>
          <Text style={s.collapsedTitle}>🌟 DAILY CARE — {stage.toUpperCase()}</Text>
          <Text style={s.collapsedSub}>
            {doneCount}/{total} tasks complete
          </Text>
        </View>
        <Text style={s.chevron}>▼</Text>
      </TouchableOpacity>
    );
  }

  // ── Expanded panel ─────────────────────────────────────────────────────────
  const progressPct = total > 0 ? (doneCount / total) * 100 : 0;

  return (
    <View style={s.panel}>
      {/* Header */}
      <TouchableOpacity
        onPress={() => setExpanded(false)}
        activeOpacity={0.75}
        style={s.panelHeader}
      >
        <Text style={s.panelTitle}>🌟 DAILY CARE — {stage.toUpperCase()}</Text>
        <Text style={s.chevron}>▲</Text>
      </TouchableOpacity>

      {/* Task list */}
      {tasks.map((task) => {
        const isChecked = !!checked[task.id];
        const tipOpen   = openTip === task.id;
        return (
          <View key={task.id}>
            <View style={s.taskRow}>
              {/* Checkbox */}
              <TouchableOpacity
                onPress={() => toggleCheck(task.id)}
                activeOpacity={0.7}
                style={s.checkboxTap}
                disabled={claimed}
              >
                <CheckboxIcon checked={isChecked} />
              </TouchableOpacity>

              {/* Label */}
              <Text
                style={[
                  s.taskLabel,
                  isChecked && s.taskLabelDone,
                ]}
                numberOfLines={2}
              >
                {task.label}
              </Text>

              {/* Info toggle */}
              <TouchableOpacity
                onPress={() => toggleTip(task.id)}
                activeOpacity={0.7}
                style={s.tipBtn}
              >
                <Text style={[s.tipBtnText, tipOpen && { color: C.green }]}>ℹ</Text>
              </TouchableOpacity>
            </View>

            {/* Detail card */}
            {tipOpen && (
              <View style={s.detailCard}>
                <Text style={s.detailText}>{task.detail}</Text>
              </View>
            )}
          </View>
        );
      })}

      {/* Progress bar */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${progressPct}%` }]} />
      </View>
      <Text style={s.progressLabel}>
        {doneCount}/{total} tasks complete
      </Text>

      {/* Claim button */}
      {!claimed ? (
        <TouchableOpacity
          onPress={claimActive ? handleClaim : undefined}
          activeOpacity={claimActive ? 0.75 : 1}
          style={[s.claimBtn, !claimActive && s.claimBtnDisabled]}
        >
          {claimActive ? (
            <Text style={s.claimBtnText}>LOG CARE + CLAIM TOKEN  +1 🎟</Text>
          ) : (
            <Text style={s.claimBtnDisabledText}>
              {total - doneCount} TASK{total - doneCount !== 1 ? "S" : ""} REMAINING
            </Text>
          )}
        </TouchableOpacity>
      ) : (
        <View style={s.claimedInline}>
          <Text style={s.claimedInlineText}>CARE LOGGED ✓</Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Collapsed banners
  collapsedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 6,
  },
  collapsedLeft: {
    flex: 1,
  },
  collapsedTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 13,
    color: C.white,
    letterSpacing: 0.5,
  },
  collapsedSub: {
    fontFamily: SANS,
    fontSize: 12,
    color: C.greyLight,
    marginTop: 2,
  },
  chevron: {
    fontFamily: SANS,
    fontSize: 12,
    color: C.grey,
    marginLeft: 10,
  },

  claimedBanner: {
    backgroundColor: C.greenFaint,
    borderWidth: 1,
    borderColor: C.greenDim,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 6,
    alignItems: "center",
  },
  claimedBannerText: {
    fontFamily: SANS_MED,
    fontSize: 13,
    color: C.green,
    letterSpacing: 0.3,
  },

  // Expanded panel
  panel: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    marginVertical: 6,
    paddingBottom: 14,
    overflow: "hidden",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },
  panelTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 13,
    color: C.white,
    letterSpacing: 0.5,
  },

  // Task rows
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  checkboxTap: {
    padding: 2,
    marginRight: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: C.grey,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  taskLabel: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 14,
    color: C.white,
    lineHeight: 20,
  },
  taskLabelDone: {
    textDecorationLine: "line-through",
    color: C.greenDim,
  },
  tipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tipBtnText: {
    fontFamily: SANS_BOLD,
    fontSize: 16,
    color: C.grey,
  },

  // Detail card
  detailCard: {
    marginHorizontal: 14,
    marginBottom: 8,
    marginTop: 2,
    backgroundColor: C.card,
    borderLeftWidth: 3,
    borderLeftColor: C.green,
    borderRadius: 6,
    padding: 12,
  },
  detailText: {
    fontFamily: SANS,
    fontSize: 13,
    color: C.greyLight,
    lineHeight: 20,
  },

  // Progress
  progressTrack: {
    marginHorizontal: 14,
    marginTop: 10,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: C.green,
    borderRadius: 2,
  },
  progressLabel: {
    fontFamily: SANS,
    fontSize: 11,
    color: C.grey,
    marginTop: 5,
    marginHorizontal: 14,
  },

  // Claim button
  claimBtn: {
    marginHorizontal: 14,
    marginTop: 14,
    backgroundColor: C.green,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
  },
  claimBtnDisabled: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.border,
  },
  claimBtnText: {
    fontFamily: SANS_BOLD,
    fontSize: 14,
    color: C.bg,
    letterSpacing: 0.5,
  },
  claimBtnDisabledText: {
    fontFamily: SANS_MED,
    fontSize: 13,
    color: C.grey,
    letterSpacing: 0.5,
  },

  // Claimed inline
  claimedInline: {
    marginHorizontal: 14,
    marginTop: 14,
    backgroundColor: C.greenFaint,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.greenDim,
  },
  claimedInlineText: {
    fontFamily: SANS_BOLD,
    fontSize: 14,
    color: C.green,
    letterSpacing: 0.5,
  },
});
