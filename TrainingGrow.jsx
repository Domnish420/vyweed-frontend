// TrainingGrow.jsx — Full-screen compressed lifecycle tutorial
// Props: { onComplete, mode } where mode = "outdoor" | "indoor" (default "outdoor")

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  SafeAreaView,
} from "react-native";
import PlantRenderer3D from "./PlantRenderer3D";
import { STAGE_CARE_TASKS } from "./DailyCarePanel";

const { width: SW } = Dimensions.get("window");

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

// ── Constants ──────────────────────────────────────────────────────────────────
const TRAINING_STRAIN = {
  id: 9999,
  name: "Practice Plant",
  type: "H",
  tier: "T3",
  flower_wk_max: 9,
  thc_max: 18,
};

const SPEED_OPTIONS = [
  {
    key: "QUICK",
    label: "QUICK",
    duration: "5 min",
    description: "All 8 stages, fast overview",
    secs: 37,
  },
  {
    key: "STANDARD",
    label: "STANDARD",
    duration: "15 min",
    description: "Time to read and absorb each stage",
    secs: 112,
  },
  {
    key: "DETAILED",
    label: "DETAILED",
    duration: "30 min",
    description: "Full immersion — read, check tasks, take notes",
    secs: 225,
  },
];

const TRAINING_STAGES = [
  { name: "Seedling",      day: 4,  totalDays: 91 },
  { name: "Vegetative",    day: 18, totalDays: 91 },
  { name: "Transition",    day: 35, totalDays: 91 },
  { name: "Early Flower",  day: 52, totalDays: 91 },
  { name: "Mid Flower",    day: 62, totalDays: 91 },
  { name: "Late Flower",   day: 77, totalDays: 91 },
  { name: "Final Days",    day: 88, totalDays: 91 },
  { name: "Harvest Ready", day: 91, totalDays: 91 },
];

const STAGE_COLOUR = {
  "Seedling":      "#5b9bd5",
  "Vegetative":    "#3dffa0",
  "Transition":    "#c17a4a",
  "Early Flower":  "#e0834a",
  "Mid Flower":    "#e0834a",
  "Late Flower":   "#c8b4e8",
  "Final Days":    "#ffd700",
  "Harvest Ready": "#ffd700",
};

const STAGE_JOURNALS = {
  "Seedling":
    "Day 4 — Cotyledons open under the light. Soil still moist from germination — held off watering. Light at 48cm, temp 24°C, humidity 65%.\n💡 Key: Less is more. Overwatering kills more seedlings than anything else.",
  "Vegetative":
    "Day 18 — The plant has been exploding since the seed leaves dropped. Three main branches tied outward in LST, creating an open canopy. Watering every 2-3 days when the pot goes light. pH 6.4.\n💡 Key: Training now = yield later. Every branch bent outward becomes a cola.",
  "Transition":
    "Day 35 — Flipped to 12/12 one week ago and the stretch has begun. White hairs at every node — pre-flowers, the first sign of femininity. Switched to bloom feed. The smell when I open the tent is changing.\n💡 Key: Light discipline is everything. One gap in the dark period and she can revert.",
  "Early Flower":
    "Day 52 — Bud sites stacking at every node. First trichomes visible under loupe — clear glass-like structures on the calyxes. I can smell it when I open the tent now. EC 1.6 on feed days.\n💡 Key: Trichomes tell the story. Start checking now, check every day from here.",
  "Mid Flower":
    "Day 62 — The buds are swelling noticeably every morning. The frost shimmer under the LED is genuinely beautiful. EC pushed to 1.9. Carbon filter earning its keep.\n💡 Key: This is where yield is made or lost. Don't skip feedings, don't stress the plant.",
  "Late Flower":
    "Day 77 — Trichomes: 55% milky, 8% amber. Fan leaves yellowing — the plant is mining itself for the final push. Switched to plain pH water. Smell is overpowering.\n💡 Key: Patience here pays off. Every extra day of flush = cleaner, smoother smoke.",
  "Final Days":
    "Day 88 — Trichome read: 68% cloudy, 19% amber. Harvest window is open. Two more flushes. Scissors cleaned. Drying space: 19°C, 58% RH.\n💡 Key: Prepare before you chop. Having everything ready means a calm, deliberate harvest.",
  "Harvest Ready":
    "Day 91 — Done. Two and a half hours to cut, trim, and hang. Every decision I made (and didn't make) is in these flowers now. Hanging at 19°C, 57% RH.\n💡 Key: The grow isn't over at harvest. Drying and curing is where quality is made or destroyed.",
};

const KEY_LEARNINGS = [
  "The first 42 days are setup. What you do in veg defines what you harvest.",
  "Trichomes are your harvest timer — check daily from mid-flower onwards.",
  "Log everything. A grow journal turns one grow into five grows of knowledge.",
  "Patience at every stage — in drying, in curing, in checking trichomes — is what separates good from great.",
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function SpeedButton({ option, onPress }) {
  return (
    <TouchableOpacity
      onPress={() => onPress(option.secs)}
      activeOpacity={0.75}
      style={s.speedBtn}
    >
      <View style={s.speedBtnLeft}>
        <Text style={s.speedBtnLabel}>{option.label}</Text>
        <Text style={s.speedBtnDesc}>{option.description}</Text>
      </View>
      <Text style={s.speedBtnDuration}>{option.duration}</Text>
    </TouchableOpacity>
  );
}

function ReadonlyCheckbox({ checked }) {
  return (
    <View
      style={[
        s.roCheckbox,
        checked && { backgroundColor: C.greenFaint, borderColor: C.greenDim },
      ]}
    >
      {checked && (
        <Text style={{ color: C.green, fontSize: 10, fontFamily: SANS_BOLD }}>
          ✓
        </Text>
      )}
    </View>
  );
}

function JournalCard({ stageName, text, index }) {
  return (
    <View style={s.reviewJournalCard}>
      <View style={s.reviewJournalHeader}>
        <Text style={s.reviewJournalNum}>{index + 1}</Text>
        <Text
          style={[
            s.reviewJournalStage,
            { color: STAGE_COLOUR[stageName] ?? C.white },
          ]}
        >
          {stageName.toUpperCase()}
        </Text>
      </View>
      <Text style={s.reviewJournalText}>{text}</Text>
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function TrainingGrow({ onComplete, mode = "outdoor" }) {
  const [phase, setPhase]           = useState("setup");
  const [speed, setSpeed]           = useState(null);         // secs per stage
  const [stageIdx, setStageIdx]     = useState(0);
  const [timeLeft, setTimeLeft]     = useState(0);
  const [journal, setJournal]       = useState([]);           // accumulated entries
  const [taskChecked, setTaskChecked] = useState({});

  const intervalRef = useRef(null);

  // ── Timer ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "training") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Advance stage
          advanceStage();
          return speed;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, speed, stageIdx]);

  const advanceStage = useCallback(() => {
    setJournal((prevJournal) => {
      const currentStage = TRAINING_STAGES[stageIdx];
      if (!currentStage) return prevJournal;
      const entry = STAGE_JOURNALS[currentStage.name] ?? "";
      const next = [...prevJournal, entry];

      const nextIdx = stageIdx + 1;
      if (nextIdx >= TRAINING_STAGES.length) {
        // Also need to add any remaining stages not yet logged — handled by completing
        setPhase("review");
      } else {
        setStageIdx(nextIdx);
        setTaskChecked({});
      }
      return next;
    });
  }, [stageIdx]);

  const handleSpeedSelect = useCallback((secs) => {
    setSpeed(secs);
    setStageIdx(0);
    setTimeLeft(secs);
    setJournal([]);
    setTaskChecked({});
    setPhase("training");
  }, []);

  const handleNextStage = useCallback(() => {
    // Manually advance — same logic as timer expiry
    const currentStage = TRAINING_STAGES[stageIdx];
    if (!currentStage) return;

    setJournal((prev) => {
      const entry = STAGE_JOURNALS[currentStage.name] ?? "";
      const next = [...prev, entry];
      const nextIdx = stageIdx + 1;
      if (nextIdx >= TRAINING_STAGES.length) {
        setPhase("review");
      } else {
        setStageIdx(nextIdx);
        setTimeLeft(speed);
        setTaskChecked({});
      }
      return next;
    });
  }, [stageIdx, speed]);

  const handleTrainAgain = useCallback(() => {
    setPhase("setup");
    setSpeed(null);
    setStageIdx(0);
    setTimeLeft(0);
    setJournal([]);
    setTaskChecked({});
  }, []);

  const toggleTrainingTask = useCallback((id) => {
    setTaskChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // ── Render: Setup ────────────────────────────────────────────────────────────
  if (phase === "setup") {
    const modeDesc =
      mode === "outdoor"
        ? "Simulates a greenhouse grow — see how your plant responds to real seasons and outdoor conditions."
        : "Simulates a controlled grow room — every variable in your hands.";

    return (
      <SafeAreaView style={s.screen}>
        <ScrollView
          contentContainerStyle={s.setupContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity
            onPress={onComplete}
            activeOpacity={0.7}
            style={s.backBtn}
          >
            <Text style={s.backBtnText}>← Back</Text>
          </TouchableOpacity>

          {/* Title */}
          <Text style={s.setupTitle}>TRAINING GROW</Text>
          <Text style={s.setupSubtitle}>
            Learn the full life cycle in one session
          </Text>

          {/* Mode */}
          <View style={s.modeBadgeRow}>
            <View style={s.modeBadge}>
              <Text style={s.modeBadgeText}>
                {mode === "outdoor" ? "🌿 GREENHOUSE" : "💡 GROW ROOM"}
              </Text>
            </View>
          </View>
          <Text style={s.modeDesc}>{modeDesc}</Text>

          {/* Speed options */}
          <Text style={s.selectSpeedLabel}>SELECT YOUR PACE</Text>
          {SPEED_OPTIONS.map((opt) => (
            <SpeedButton key={opt.key} option={opt} onPress={handleSpeedSelect} 
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Render: Training ─────────────────────────────────────────────────────────
  if (phase === "training") {
    const currentStageDef = TRAINING_STAGES[stageIdx] ?? TRAINING_STAGES[0];
    const stageName       = currentStageDef.name;
    const stageColour     = STAGE_COLOUR[stageName] ?? C.white;
    const journalText     = STAGE_JOURNALS[stageName] ?? "";
    const careTasks       = (STAGE_CARE_TASKS[stageName] ?? []).slice(0, 4);
    const isLastStage     = stageIdx === TRAINING_STAGES.length - 1;

    // Progress: stageIdx/8 + partial timer progress
    const timerFraction   = speed > 0 ? (speed - timeLeft) / speed : 0;
    const overallProgress = (stageIdx + timerFraction) / TRAINING_STAGES.length;
    const progressPct     = Math.min(100, overallProgress * 100);

    return (
      <SafeAreaView style={s.screen}>
        <ScrollView
          contentContainerStyle={s.trainingContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header row */}
          <View style={s.trainingHeader}>
            <Text style={s.trainingHeaderLabel}>
              TRAINING · STAGE {stageIdx + 1}/8
            </Text>
            <Text style={s.timerText}>{timeLeft}s</Text>
          </View>

          {/* Progress bar */}
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progressPct}%` }]} 
          </View>

          {/* Plant renderer */}
          <View style={s.plantWrapper}>
            <PlantRenderer
              width={SW}
              height={260}
              stage={stageName}
              strainType="H"
              tier="T3"
              strainSeed={9999}
              day={currentStageDef.day}
              totalDays={currentStageDef.totalDays}
            
          </View>

          {/* Stage badge */}
          <View style={s.stageBadgeRow}>
            <Text style={[s.stageBadgeName, { color: stageColour }]}>
              {stageName.toUpperCase()}
            </Text>
            <Text style={s.stageBadgeDay}>DAY {currentStageDef.day}</Text>
          </View>

          {/* Journal card */}
          <View style={s.journalCard}>
            <Text style={s.journalCardLabel}>📓 GROW LOG</Text>
            <Text style={s.journalCardText}>{journalText}</Text>
          </View>

          {/* Care guide */}
          <View style={s.careSection}>
            <Text style={s.careSectionLabel}>
              TODAY'S CARE — WHAT A REAL GROWER DOES
            </Text>
            {careTasks.map((task) => {
              const isChecked = !!taskChecked[task.id];
              return (
                <TouchableOpacity
                  key={task.id}
                  onPress={() => toggleTrainingTask(task.id)}
                  activeOpacity={0.7}
                  style={s.careTaskRow}
                >
                  <ReadonlyCheckbox checked={isChecked} 
                  <Text
                    style={[
                      s.careTaskLabel,
                      isChecked && s.careTaskLabelDone,
                    ]}
                  >
                    {task.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Next stage button */}
          <TouchableOpacity
            onPress={handleNextStage}
            activeOpacity={0.75}
            style={s.nextBtn}
          >
            <Text style={s.nextBtnText}>
              {isLastStage ? "COMPLETE TRAINING →" : "NEXT STAGE →"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Render: Review ───────────────────────────────────────────────────────────
  const modeLabel = mode === "outdoor" ? "Greenhouse" : "Grow Room";

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView
        contentContainerStyle={s.reviewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={s.reviewTitle}>GROW COMPLETE</Text>
        <Text style={s.reviewSubtitle}>
          {modeLabel} Training · 8 stages logged
        </Text>

        {/* Final plant */}
        <View style={s.reviewPlantWrapper}>
          <PlantRenderer
            width={200}
            height={200}
            stage="Harvest Ready"
            strainType="H"
            tier="T3"
            strainSeed={9999}
            day={91}
            totalDays={91}
          
        </View>

        {/* Full grow log */}
        <Text style={s.sectionLabel}>FULL GROW LOG</Text>
        {TRAINING_STAGES.map((stageDef, i) => (
          <JournalCard
            key={stageDef.name}
            stageName={stageDef.name}
            text={
              journal[i] ??
              STAGE_JOURNALS[stageDef.name] ??
              ""
            }
            index={i}
          
        ))}

        {/* Key learnings */}
        <Text style={s.sectionLabel}>KEY LEARNINGS</Text>
        <View style={s.learningsCard}>
          {KEY_LEARNINGS.map((point, i) => (
            <View key={i} style={s.learningRow}>
              <Text style={s.learningBullet}>•</Text>
              <Text style={s.learningText}>{point}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          onPress={onComplete}
          activeOpacity={0.75}
          style={s.ctaBtn}
        >
          <Text style={s.ctaBtnText}>START YOUR FIRST REAL GROW →</Text>
        </TouchableOpacity>

        {/* Train Again */}
        <TouchableOpacity
          onPress={handleTrainAgain}
          activeOpacity={0.7}
          style={s.trainAgainBtn}
        >
          <Text style={s.trainAgainBtnText}>TRAIN AGAIN</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── Setup ──────────────────────────────────────────────────────────────────
  setupContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    marginBottom: 20,
  },
  backBtnText: {
    fontFamily: SANS_MED,
    fontSize: 15,
    color: C.greyLight,
  },
  setupTitle: {
    fontFamily: HEADING,
    fontSize: 48,
    color: C.white,
    letterSpacing: 2,
    lineHeight: 52,
  },
  setupSubtitle: {
    fontFamily: SANS,
    fontSize: 15,
    color: C.greyLight,
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 22,
  },
  modeBadgeRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  modeBadge: {
    backgroundColor: C.greenFaint,
    borderWidth: 1,
    borderColor: C.greenDim,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  modeBadgeText: {
    fontFamily: SANS_BOLD,
    fontSize: 12,
    color: C.green,
    letterSpacing: 0.8,
  },
  modeDesc: {
    fontFamily: SANS,
    fontSize: 14,
    color: C.greyLight,
    lineHeight: 22,
    marginBottom: 28,
  },
  selectSpeedLabel: {
    fontFamily: SANS_BOLD,
    fontSize: 12,
    color: C.grey,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  speedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  speedBtnLeft: {
    flex: 1,
    marginRight: 12,
  },
  speedBtnLabel: {
    fontFamily: SANS_BOLD,
    fontSize: 15,
    color: C.white,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  speedBtnDesc: {
    fontFamily: SANS,
    fontSize: 13,
    color: C.grey,
    lineHeight: 18,
  },
  speedBtnDuration: {
    fontFamily: SANS_BOLD,
    fontSize: 14,
    color: C.amber,
  },

  // ── Training ───────────────────────────────────────────────────────────────
  trainingContent: {
    paddingBottom: 40,
  },
  trainingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  trainingHeaderLabel: {
    fontFamily: SANS_BOLD,
    fontSize: 13,
    color: C.greyLight,
    letterSpacing: 0.8,
  },
  timerText: {
    fontFamily: SANS_BOLD,
    fontSize: 15,
    color: C.amber,
    letterSpacing: 0.5,
  },
  progressTrack: {
    marginHorizontal: 20,
    height: 3,
    backgroundColor: C.border,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 4,
  },
  progressFill: {
    height: "100%",
    backgroundColor: C.green,
    borderRadius: 2,
  },
  plantWrapper: {
    marginTop: 8,
    overflow: "hidden",
  },
  stageBadgeRow: {
    alignItems: "center",
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 20,
  },
  stageBadgeName: {
    fontFamily: HEADING,
    fontSize: 36,
    letterSpacing: 2,
    lineHeight: 40,
  },
  stageBadgeDay: {
    fontFamily: SANS,
    fontSize: 13,
    color: C.grey,
    marginTop: 2,
  },

  // Journal card
  journalCard: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: C.surface,
    borderLeftWidth: 3,
    borderLeftColor: C.green,
    borderRadius: 8,
    padding: 14,
  },
  journalCardLabel: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: C.green,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  journalCardText: {
    fontFamily: SANS,
    fontSize: 14,
    color: C.white,
    lineHeight: 22,
  },

  // Care section
  careSection: {
    marginHorizontal: 20,
    marginTop: 18,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 14,
  },
  careSectionLabel: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: C.greyLight,
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  careTaskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
  },
  roCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: C.grey,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: "transparent",
  },
  careTaskLabel: {
    fontFamily: SANS,
    fontSize: 14,
    color: C.white,
    flex: 1,
    lineHeight: 20,
  },
  careTaskLabelDone: {
    textDecorationLine: "line-through",
    color: C.greenDim,
  },

  // Next button
  nextBtn: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: C.green,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  nextBtnText: {
    fontFamily: SANS_BOLD,
    fontSize: 15,
    color: C.bg,
    letterSpacing: 0.5,
  },

  // ── Review ─────────────────────────────────────────────────────────────────
  reviewContent: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 50,
    alignItems: "stretch",
  },
  reviewTitle: {
    fontFamily: HEADING,
    fontSize: 48,
    color: C.green,
    letterSpacing: 2,
    lineHeight: 52,
    textAlign: "center",
  },
  reviewSubtitle: {
    fontFamily: SANS,
    fontSize: 14,
    color: C.greyLight,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 20,
  },
  reviewPlantWrapper: {
    alignItems: "center",
    marginBottom: 24,
  },
  sectionLabel: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: C.grey,
    letterSpacing: 1.5,
    marginBottom: 12,
    marginTop: 8,
  },

  // Review journal cards
  reviewJournalCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },
  reviewJournalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  reviewJournalNum: {
    fontFamily: SANS_BOLD,
    fontSize: 12,
    color: C.grey,
    width: 20,
  },
  reviewJournalStage: {
    fontFamily: HEADING,
    fontSize: 18,
    letterSpacing: 1,
  },
  reviewJournalText: {
    fontFamily: SANS,
    fontSize: 13,
    color: C.greyLight,
    lineHeight: 20,
  },

  // Key learnings
  learningsCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  learningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  learningBullet: {
    fontFamily: SANS_BOLD,
    fontSize: 16,
    color: C.green,
    marginRight: 10,
    lineHeight: 22,
  },
  learningText: {
    fontFamily: SANS,
    fontSize: 14,
    color: C.white,
    flex: 1,
    lineHeight: 22,
  },

  // CTA button
  ctaBtn: {
    backgroundColor: C.green,
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: 12,
  },
  ctaBtnText: {
    fontFamily: SANS_BOLD,
    fontSize: 15,
    color: C.bg,
    letterSpacing: 0.5,
  },

  // Train again
  trainAgainBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  trainAgainBtnText: {
    fontFamily: SANS_MED,
    fontSize: 14,
    color: C.greyLight,
    letterSpacing: 0.5,
  },
});
