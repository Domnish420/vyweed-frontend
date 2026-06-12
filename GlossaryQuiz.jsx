import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  SafeAreaView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GLOSSARY } from "./glossary-data";

const MONO = Platform.select({ ios: "Courier New", android: "monospace" });
const C = {
  bg: "#070a07",
  surface: "#0d120d",
  card: "#111811",
  border: "#1a2a1a",
  green: "#39ff45",
  greenFaint: "#0d3d12",
  greenDim: "#1a7a20",
  amber: "#ffb830",
  red: "#ff3a3a",
  blue: "#30d5ff",
  purple: "#c084fc",
  white: "#e8f0e8",
  grey: "#4a5a4a",
  greyLight: "#8a9a8a",
};

function makeRng(seed) {
  let s = (seed | 0) || 42;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 15), 0xac4e4b97);
    s ^= s >>> 16;
    return (s >>> 0) / 0xffffffff;
  };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isoWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    d.getFullYear() +
    "-W" +
    String(
      1 +
        Math.round(
          ((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
        )
    ).padStart(2, "0")
  );
}

function seedFromStr(str) {
  let n = 0;
  for (let i = 0; i < str.length; i++) n += str.charCodeAt(i);
  return n;
}

function pickQuestions(count, seedStr) {
  const rng = makeRng(seedFromStr(seedStr));
  const indices = GLOSSARY.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const picked = [];
  for (let i = 0; i < indices.length && picked.length < count; i++) {
    const term = GLOSSARY[indices[i]];
    if (term && term.quiz) picked.push(term);
  }
  return picked;
}

function buildOptions(question, rng) {
  const correct = question.quiz.answer;
  const distractors = (question.quiz.distractors || []).slice(0, 3);
  while (distractors.length < 3) {
    distractors.push("Unknown");
  }
  const opts = [correct, ...distractors];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

function getGrade(score, total) {
  const pct = (score / total) * 100;
  if (pct >= 90) return "A";
  if (pct >= 75) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

function gradeColor(grade) {
  if (grade === "A") return C.green;
  if (grade === "B") return C.blue;
  if (grade === "C") return C.amber;
  if (grade === "D") return C.purple;
  return C.red;
}

export default function GlossaryQuiz({ mode, onClose, isPro }) {
  const isDaily = mode === "daily";
  const questionCount = isDaily ? 5 : 20;
  const maxAttempts = isDaily ? 3 : 7;
  const seedStr = isDaily ? todayStr() : isoWeek();
  const storageKey = isDaily
    ? `vyweed_quiz_daily_${todayStr()}`
    : `vyweed_quiz_weekly_${isoWeek()}`;

  const [phase, setPhase] = useState("lobby");
  const [storageData, setStorageData] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState([]);
  const [optionsForQuestion, setOptionsForQuestion] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadStorage = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) {
        setStorageData(JSON.parse(raw));
      } else {
        setStorageData(null);
      }
    } catch (_) {
      setStorageData(null);
    }
    setLoading(false);
  }, [storageKey]);

  useEffect(() => {
    loadStorage();
  }, [loadStorage]);

  const attempts = storageData ? storageData.attempts || 0 : 0;
  const bestScore = storageData ? storageData.bestScore || 0 : 0;
  const daysUsed = storageData ? storageData.daysUsed || [] : [];
  const usedToday = daysUsed.includes(todayStr());

  function isLocked() {
    if (isPro) return false;
    if (isDaily) return attempts >= maxAttempts;
    return attempts >= maxAttempts || usedToday;
  }

  async function recordAttemptStart() {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      const data = raw ? JSON.parse(raw) : { attempts: 0, bestScore: 0 };
      if (!isDaily) {
        data.daysUsed = data.daysUsed || [];
        if (!data.daysUsed.includes(todayStr())) {
          data.daysUsed.push(todayStr());
        }
      }
      data.attempts = (data.attempts || 0) + 1;
      await AsyncStorage.setItem(storageKey, JSON.stringify(data));
      setStorageData(data);
    } catch (_) {}
  }

  async function recordBestScore(finalScore) {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      const data = raw ? JSON.parse(raw) : { attempts: 0, bestScore: 0 };
      if (finalScore > (data.bestScore || 0)) {
        data.bestScore = finalScore;
        await AsyncStorage.setItem(storageKey, JSON.stringify(data));
        setStorageData({ ...data });
      }
    } catch (_) {}
  }

  function startQuiz() {
    const qs = pickQuestions(questionCount, seedStr);
    const rng = makeRng(seedFromStr(seedStr + "-opts"));
    const first = qs[0];
    setQuestions(qs);
    setCurrentIdx(0);
    setScore(0);
    setWrongAnswers([]);
    setSelectedOption(null);
    setAnswered(false);
    setOptionsForQuestion(first ? buildOptions(first, rng) : []);
    recordAttemptStart();
    setPhase("playing");
  }

  function handleOptionPress(opt) {
    if (answered) return;
    const q = questions[currentIdx];
    const correct = q.quiz.answer;
    setSelectedOption(opt);
    setAnswered(true);
    if (opt === correct) {
      setScore((prev) => prev + 1);
    } else {
      setWrongAnswers((prev) => [
        ...prev,
        { term: q.term, question: q.quiz.question, correct, chosen: opt },
      ]);
    }
  }

  function handleNext() {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= questions.length) {
      const finalScore = score + (selectedOption === questions[currentIdx].quiz.answer ? 0 : 0);
      recordBestScore(score);
      setPhase("results");
      return;
    }
    const rng = makeRng(seedFromStr(seedStr + "-opts-" + nextIdx));
    setOptionsForQuestion(buildOptions(questions[nextIdx], rng));
    setCurrentIdx(nextIdx);
    setSelectedOption(null);
    setAnswered(false);
  }

  function optionBg(opt) {
    if (!answered) return C.card;
    const q = questions[currentIdx];
    const correct = q.quiz.answer;
    if (opt === correct) return C.greenFaint;
    if (opt === selectedOption && opt !== correct) return "#3a0d0d";
    return C.card;
  }

  function optionBorder(opt) {
    if (!answered) return C.border;
    const q = questions[currentIdx];
    const correct = q.quiz.answer;
    if (opt === correct) return C.green;
    if (opt === selectedOption && opt !== correct) return C.red;
    return C.border;
  }

  function optionTextColor(opt) {
    if (!answered) return C.white;
    const q = questions[currentIdx];
    const correct = q.quiz.answer;
    if (opt === correct) return C.green;
    if (opt === selectedOption && opt !== correct) return C.red;
    return C.greyLight;
  }

  const optLabels = ["A", "B", "C", "D"];

  if (loading) {
    return (
      <Modal animationType="slide" visible transparent>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 14 }}>Loading...</Text>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal animationType="slide" visible transparent>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        {phase === "lobby" && (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <View style={{ flex: 1, padding: 24 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
                <Text style={{ fontFamily: MONO, fontSize: 11, color: C.greyLight, letterSpacing: 2, textTransform: "uppercase" }}>
                  {isDaily ? "Daily Quiz" : "Weekly Exam"}
                </Text>
                <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
                  <Text style={{ fontFamily: MONO, fontSize: 18, color: C.greyLight }}>x</Text>
                </TouchableOpacity>
              </View>

              <View style={{ alignItems: "center", marginBottom: 40 }}>
                <Text style={{ fontFamily: MONO, fontSize: 32, color: C.green, marginBottom: 8, letterSpacing: 1 }}>
                  {isDaily ? "Daily Quiz" : "Weekly Exam"}
                </Text>
                <Text style={{ fontFamily: MONO, fontSize: 13, color: C.greyLight, textAlign: "center", lineHeight: 20 }}>
                  {isDaily
                    ? "5 questions from the growing glossary.\nNew set every day."
                    : "20 questions across the full glossary.\nOne attempt per day, resets weekly."}
                </Text>
              </View>

              <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 20, marginBottom: 24 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
                  <Text style={{ fontFamily: MONO, fontSize: 12, color: C.greyLight }}>Attempts used</Text>
                  <Text style={{ fontFamily: MONO, fontSize: 12, color: C.white }}>
                    {isPro ? (
                      <Text style={{ color: C.purple }}>Unlimited (Pro)</Text>
                    ) : (
                      `${attempts} / ${maxAttempts}`
                    )}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
                  <Text style={{ fontFamily: MONO, fontSize: 12, color: C.greyLight }}>Best score</Text>
                  <Text style={{ fontFamily: MONO, fontSize: 12, color: C.amber }}>
                    {bestScore > 0 ? `${bestScore} / ${questionCount}` : "--"}
                  </Text>
                </View>
                {!isDaily && !isPro && (
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontFamily: MONO, fontSize: 12, color: C.greyLight }}>Played today</Text>
                    <Text style={{ fontFamily: MONO, fontSize: 12, color: usedToday ? C.red : C.green }}>
                      {usedToday ? "Yes" : "No"}
                    </Text>
                  </View>
                )}
              </View>

              {!isDaily && !isPro && (
                <View style={{ backgroundColor: C.greenFaint, borderWidth: 1, borderColor: C.greenDim, borderRadius: 6, padding: 12, marginBottom: 24 }}>
                  <Text style={{ fontFamily: MONO, fontSize: 11, color: C.green, lineHeight: 17 }}>
                    Weekly exam: one attempt per day, up to 7 per week. Come back tomorrow for another try.
                  </Text>
                </View>
              )}

              {isLocked() ? (
                <View style={{ backgroundColor: "#1a0505", borderWidth: 1, borderColor: C.red, borderRadius: 8, padding: 20, alignItems: "center" }}>
                  <Text style={{ fontFamily: MONO, fontSize: 15, color: C.red, marginBottom: 6 }}>OUT OF TRIES</Text>
                  <Text style={{ fontFamily: MONO, fontSize: 11, color: C.greyLight, textAlign: "center" }}>
                    {isDaily ? "Come back tomorrow for a fresh quiz." : "No more attempts this week."}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={startQuiz}
                  style={{
                    backgroundColor: C.green,
                    borderRadius: 8,
                    paddingVertical: 16,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontFamily: MONO, fontSize: 15, color: C.bg, fontWeight: "bold", letterSpacing: 2 }}>
                    START
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        )}

        {phase === "playing" && questions.length > 0 && (
          <View style={{ flex: 1, padding: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontFamily: MONO, fontSize: 11, color: C.greyLight, letterSpacing: 2 }}>
                {isDaily ? "DAILY QUIZ" : "WEEKLY EXAM"}
              </Text>
              <Text style={{ fontFamily: MONO, fontSize: 13, color: C.amber }}>
                {currentIdx + 1} / {questions.length}
              </Text>
            </View>

            <View style={{ height: 4, backgroundColor: C.surface, borderRadius: 2, marginBottom: 28, overflow: "hidden" }}>
              <View
                style={{
                  height: 4,
                  width: `${((currentIdx + 1) / questions.length) * 100}%`,
                  backgroundColor: C.green,
                  borderRadius: 2,
                }}
              />
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 18, marginBottom: 20 }}>
                <Text style={{ fontFamily: MONO, fontSize: 11, color: C.green, letterSpacing: 2, marginBottom: 8 }}>
                  {questions[currentIdx].term.toUpperCase()}
                </Text>
                <Text style={{ fontFamily: MONO, fontSize: 15, color: C.white, lineHeight: 22 }}>
                  {questions[currentIdx].quiz.question}
                </Text>
              </View>

              {optionsForQuestion.map((opt, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => handleOptionPress(opt)}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    backgroundColor: optionBg(opt),
                    borderWidth: 1,
                    borderColor: optionBorder(opt),
                    borderRadius: 8,
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ fontFamily: MONO, fontSize: 13, color: optionTextColor(opt), marginRight: 10, minWidth: 20 }}>
                    {optLabels[i]}.
                  </Text>
                  <Text style={{ fontFamily: MONO, fontSize: 13, color: optionTextColor(opt), flex: 1, lineHeight: 19 }}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}

              {answered && (
                <View>
                  {questions[currentIdx].quiz.xp && (
                    <View style={{ backgroundColor: C.greenFaint, borderWidth: 1, borderColor: C.greenDim, borderRadius: 8, padding: 14, marginTop: 4, marginBottom: 14 }}>
                      <Text style={{ fontFamily: MONO, fontSize: 11, color: C.green, letterSpacing: 1, marginBottom: 4 }}>XP INSIGHT</Text>
                      <Text style={{ fontFamily: MONO, fontSize: 13, color: C.white, lineHeight: 19 }}>
                        {questions[currentIdx].quiz.xp}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={handleNext}
                    style={{
                      backgroundColor: C.green,
                      borderRadius: 8,
                      paddingVertical: 14,
                      alignItems: "center",
                      marginBottom: 24,
                    }}
                  >
                    <Text style={{ fontFamily: MONO, fontSize: 14, color: C.bg, fontWeight: "bold", letterSpacing: 2 }}>
                      {currentIdx + 1 >= questions.length ? "SEE RESULTS" : "NEXT -->"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {phase === "results" && (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <View style={{ padding: 24 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
                <Text style={{ fontFamily: MONO, fontSize: 11, color: C.greyLight, letterSpacing: 2 }}>
                  RESULTS
                </Text>
              </View>

              <View style={{ alignItems: "center", marginBottom: 32 }}>
                <Text style={{ fontFamily: MONO, fontSize: 56, color: gradeColor(getGrade(score, questions.length)), fontWeight: "bold" }}>
                  {getGrade(score, questions.length)}
                </Text>
                <Text style={{ fontFamily: MONO, fontSize: 22, color: C.white, marginTop: 4 }}>
                  {score} / {questions.length}
                </Text>
                <Text style={{ fontFamily: MONO, fontSize: 13, color: C.greyLight, marginTop: 6 }}>
                  {Math.round((score / questions.length) * 100)}% correct
                </Text>
              </View>

              {wrongAnswers.length === 0 ? (
                <View style={{ backgroundColor: C.greenFaint, borderWidth: 1, borderColor: C.green, borderRadius: 8, padding: 18, alignItems: "center", marginBottom: 24 }}>
                  <Text style={{ fontFamily: MONO, fontSize: 14, color: C.green }}>Perfect score! Great work.</Text>
                </View>
              ) : (
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ fontFamily: MONO, fontSize: 11, color: C.greyLight, letterSpacing: 2, marginBottom: 14 }}>
                    MISSED QUESTIONS ({wrongAnswers.length})
                  </Text>
                  {wrongAnswers.map((w, i) => (
                    <View
                      key={i}
                      style={{
                        backgroundColor: C.surface,
                        borderWidth: 1,
                        borderColor: C.border,
                        borderRadius: 8,
                        padding: 16,
                        marginBottom: 12,
                      }}
                    >
                      <Text style={{ fontFamily: MONO, fontSize: 11, color: C.amber, letterSpacing: 1, marginBottom: 6 }}>
                        {w.term.toUpperCase()}
                      </Text>
                      <Text style={{ fontFamily: MONO, fontSize: 13, color: C.greyLight, lineHeight: 19, marginBottom: 10 }}>
                        {w.question}
                      </Text>
                      <View style={{ flexDirection: "row", marginBottom: 4 }}>
                        <Text style={{ fontFamily: MONO, fontSize: 11, color: C.greyLight, width: 80 }}>Your answer:</Text>
                        <Text style={{ fontFamily: MONO, fontSize: 11, color: C.red, flex: 1 }}>{w.chosen}</Text>
                      </View>
                      <View style={{ flexDirection: "row" }}>
                        <Text style={{ fontFamily: MONO, fontSize: 11, color: C.greyLight, width: 80 }}>Correct:</Text>
                        <Text style={{ fontFamily: MONO, fontSize: 11, color: C.green, flex: 1 }}>{w.correct}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                onPress={onClose}
                style={{
                  borderWidth: 1,
                  borderColor: C.border,
                  borderRadius: 8,
                  paddingVertical: 14,
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontFamily: MONO, fontSize: 14, color: C.white, letterSpacing: 2 }}>CLOSE</Text>
              </TouchableOpacity>

              {!isLocked() && (
                <TouchableOpacity
                  onPress={() => {
                    setPhase("lobby");
                    loadStorage();
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: C.greenDim,
                    borderRadius: 8,
                    paddingVertical: 14,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontFamily: MONO, fontSize: 14, color: C.green, letterSpacing: 2 }}>TRY AGAIN</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
