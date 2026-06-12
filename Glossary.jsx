/**
 * Glossary.jsx
 * Complete growing glossary — every term explained from scratch.
 * Data lives in glossary-data.js. Quiz/exam logic lives in GlossaryQuiz.jsx.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  Modal, Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GLOSSARY, CATEGORIES } from "./glossary-data";
import GlossaryQuiz from "./GlossaryQuiz";

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

// ── ISO week helper ───────────────────────────────────────────────────────────
function isoWeek() {
  const d = new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return d.getFullYear() + "-W" +
    String(1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7)).padStart(2, "0");
}

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
              <Text style={{ color: col, fontFamily: MONO, fontSize: 20, fontWeight: "bold" }}>
                {term.term}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <View style={{ backgroundColor: `${col}22`, borderRadius: 4,
                  borderWidth: 1, borderColor: col, paddingHorizontal: 8, paddingVertical: 3 }}>
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

            <View style={{ backgroundColor: `${col}15`, borderRadius: 8,
              borderWidth: 1, borderColor: col, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 6 }}>IN PLAIN ENGLISH</Text>
              <Text style={{ color: C.white, fontFamily: MONO, fontSize: 14,
                lineHeight: 21, fontWeight: "bold" }}>
                {term.simple}
              </Text>
            </View>

            <View style={{ backgroundColor: C.surface, borderRadius: 8,
              borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10,
                letterSpacing: 1.5, marginBottom: 6 }}>THE FULL PICTURE</Text>
              <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, lineHeight: 20 }}>
                {term.detail}
              </Text>
            </View>

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
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11, marginTop: 2 }}
            numberOfLines={1}>
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
  const [query, setQuery]           = useState("");
  const [category, setCategory]     = useState("all");
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [quizMode, setQuizMode]     = useState(null);
  const [isPro, setIsPro]           = useState(false);
  const [dailyAttempts, setDailyAttempts]   = useState(0);
  const [weeklyAttempts, setWeeklyAttempts] = useState(0);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [proVal, dailyVal, weeklyVal] = await Promise.all([
        AsyncStorage.getItem("vyweed_is_pro"),
        AsyncStorage.getItem(`vyweed_quiz_daily_${today}`),
        AsyncStorage.getItem(`vyweed_quiz_weekly_${isoWeek()}`),
      ]);
      setIsPro(proVal === "true");
      if (dailyVal)  setDailyAttempts((JSON.parse(dailyVal).attempts)  || 0);
      if (weeklyVal) setWeeklyAttempts((JSON.parse(weeklyVal).attempts) || 0);
    };
    load();
  }, [quizMode]); // re-check counts each time quiz modal closes

  const filtered = useMemo(() => {
    let terms = GLOSSARY;
    if (category !== "all") terms = terms.filter(t => t.category === category);
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

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(t => {
      const letter = t.term[0].toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(t);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const navigateToTerm = termName => {
    const found = GLOSSARY.find(t => t.term.toLowerCase() === termName.toLowerCase());
    if (found) setSelectedTerm(found);
  };

  const dailyLabel  = isPro ? "∞" : `${dailyAttempts}/3`;
  const weeklyLabel = isPro ? "∞" : `${weeklyAttempts}/7`;

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
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10, letterSpacing: 1.5 }}>
              GLOSSARY — {GLOSSARY.length} TERMS
            </Text>
          </View>
          {/* Quiz / Exam chips */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={() => setQuizMode("daily")}
              style={{ backgroundColor: "rgba(255,184,48,0.12)", borderRadius: 8,
                borderWidth: 1, borderColor: C.amber,
                paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: C.amber, fontFamily: MONO, fontSize: 10, fontWeight: "bold" }}>
                QUIZ {dailyLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setQuizMode("weekly")}
              style={{ backgroundColor: "rgba(192,132,252,0.12)", borderRadius: 8,
                borderWidth: 1, borderColor: C.purple,
                paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: C.purple, fontFamily: MONO, fontSize: 10, fontWeight: "bold" }}>
                EXAM {weeklyLabel}
              </Text>
            </TouchableOpacity>
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
            <TouchableOpacity key={cat.key} onPress={() => setCategory(cat.key)}
              style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
                borderWidth: 2, borderColor: isActive ? C.green : "#333",
                backgroundColor: isActive ? C.greenFaint : "#111",
                minWidth: 90, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "bold", textAlign: "center" }}>
                {cat.icon}
              </Text>
              <Text style={{ color: isActive ? C.green : "#aaaaaa",
                fontSize: 10, fontWeight: "bold", textAlign: "center", marginTop: 2 }}>
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

      {/* Alphabetical term list */}
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {filtered.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Text style={{ fontSize: 36 }}>🔍</Text>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 13, marginTop: 12 }}>
                No terms found for "{query}"
              </Text>
            </View>
          ) : (
            grouped.map(([letter, terms]) => (
              <View key={letter}>
                <View style={{ backgroundColor: C.surface, paddingHorizontal: 16,
                  paddingVertical: 6, borderBottomWidth: 1, borderColor: C.border }}>
                  <Text style={{ color: "rgba(195,220,200,0.65)", fontFamily: MONO,
                    fontSize: 13, fontWeight: "bold" }}>
                    {letter}
                  </Text>
                </View>
                <View style={{ backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border }}>
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
        <View pointerEvents="none"
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 48 }}>
          <View style={{ flex: 1, backgroundColor: "rgba(7,10,7,0.55)" }} />
          <View style={{ height: 16, backgroundColor: "rgba(7,10,7,0.75)" }} />
          <View style={{ height: 8, backgroundColor: "rgba(7,10,7,0.92)" }} />
        </View>
      </View>

      {/* Quiz / Exam modal */}
      {quizMode && (
        <GlossaryQuiz
          mode={quizMode}
          isPro={isPro}
          onClose={() => setQuizMode(null)}
        />
      )}

      {/* Term detail modal */}
      <TermModal
        term={selectedTerm}
        onClose={() => setSelectedTerm(null)}
        onNavigate={navigateToTerm}
      />
    </View>
  );
}
