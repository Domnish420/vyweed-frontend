// Growver.jsx — AI cannabis growing assistant (Ollama-powered)

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, Animated, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE_URL } from "./apiConfig";

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:        "#070a07",
  surface:   "#0d120d",
  card:      "#111811",
  border:    "#1a2a1a",
  green:     "#39ff45",
  greenFaint:"#0d3d12",
  greenDim:  "#1a7a20",
  amber:     "#ffb830",
  red:       "#ff4545",
  grey:      "#4a5a4a",
  greyLight: "#8a9a8a",
  white:     "#e8f0e8",
};
const MONO = Platform.select({ ios: "Courier New", android: "monospace" });

// Only send the last N messages to avoid blowing the model's context window
const MAX_HISTORY = 12;

const SUGGESTIONS = [
  "Why are my leaves yellowing?",
  "Ideal VPD for flowering?",
  "When should I harvest?",
  "How do I fix pH and EC?",
  "Training tips for bigger yields",
  "What does nutrient lockout look like?",
];

let _uid = 0;
const uid = () => String(++_uid);

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = (dot, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.2, duration: 300, useNativeDriver: true }),
          Animated.delay(300),
        ])
      );
    const a1 = anim(dot1, 0);
    const a2 = anim(dot2, 200);
    const a3 = anim(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 14, paddingVertical: 6 }}>
      <View style={{
        width: 28, height: 28, borderRadius: 14, marginRight: 8,
        backgroundColor: C.greenDim, alignItems: "center", justifyContent: "center",
      }}>
        <Text style={{ fontSize: 14 }}>🤖</Text>
      </View>
      <View style={{
        backgroundColor: C.card, borderRadius: 16, borderTopLeftRadius: 4,
        paddingHorizontal: 16, paddingVertical: 12,
        borderWidth: 1, borderColor: C.border,
        flexDirection: "row", alignItems: "center", gap: 5,
      }}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={{
            width: 7, height: 7, borderRadius: 4,
            backgroundColor: C.green, opacity: dot,
          }} />
        ))}
      </View>
    </View>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ role, content }) {
  const isUser = role === "user";
  return (
    <View style={{
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 14,
      paddingVertical: 4,
      justifyContent: isUser ? "flex-end" : "flex-start",
    }}>
      {!isUser && (
        <View style={{
          width: 28, height: 28, borderRadius: 14, marginRight: 8,
          backgroundColor: C.greenDim, alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Text style={{ fontSize: 14 }}>🤖</Text>
        </View>
      )}

      <View style={{
        maxWidth: "78%",
        backgroundColor: isUser ? C.greenFaint : C.card,
        borderRadius: 16,
        borderTopRightRadius: isUser ? 4 : 16,
        borderTopLeftRadius:  isUser ? 16 : 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: isUser ? C.greenDim : C.border,
      }}>
        <Text style={{
          color: isUser ? C.green : C.white,
          fontFamily: MONO,
          fontSize: 13,
          lineHeight: 20,
        }}>
          {content}
        </Text>
      </View>
    </View>
  );
}

// ── Suggestion chips ──────────────────────────────────────────────────────────
function Suggestions({ onSelect }) {
  return (
    <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: 12 }}>
      <Text style={{
        color: C.greyLight, fontFamily: MONO, fontSize: 11,
        textAlign: "center", marginBottom: 16, letterSpacing: 1,
      }}>
        ASK ME ANYTHING ABOUT GROWING
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8, justifyContent: "center" }}>
        {SUGGESTIONS.map(s => (
          <TouchableOpacity
            key={s}
            onPress={() => onSelect(s)}
            style={{
              backgroundColor: C.card,
              borderWidth: 1, borderColor: C.border,
              borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
            }}
          >
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 12 }}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Status dot ────────────────────────────────────────────────────────────────
function StatusDot({ status, onPress }) {
  const color = status === "online" ? C.green : status === "offline" ? C.red : C.amber;
  const label = status === "online" ? "ONLINE" : status === "offline" ? "OFFLINE" : "...";
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color, fontFamily: MONO, fontSize: 10, letterSpacing: 0.5 }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Growver() {
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [status, setStatus]       = useState(null);   // null | "online" | "offline"
  const [model, setModel]         = useState("llama3.2");
  const flatListRef               = useRef(null);
  const inputRef                  = useRef(null);
  const insets                    = useSafeAreaInsets();

  useEffect(() => { checkStatus(); }, []);

  const checkStatus = useCallback(async () => {
    setStatus(null);
    try {
      const r    = await fetchWithTimeout(`${API_BASE_URL}/api/v1/growver/status`, {}, 6000);
      const data = await r.json();
      setStatus(data.online ? "online" : "offline");
      if (data.models?.length) setModel(data.models[0]);
    } catch {
      setStatus("offline");
    }
  }, []);

  const addMsg = (role, content) => {
    const msg = { id: uid(), role, content };
    setMessages(prev => [...prev, msg]);
    return msg;
  };

  const send = useCallback(async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || loading) return;
    setInput("");

    addMsg("user", trimmed);
    setLoading(true);

    // Pass trimmed conversation history so the model has context
    const history = [...messages, { role: "user", content: trimmed }]
      .slice(-MAX_HISTORY)
      .map(({ role, content }) => ({ role, content }));

    try {
      const r = await fetchWithTimeout(
        `${API_BASE_URL}/api/v1/growver/chat`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ messages: history, model }),
        },
        120_000,
      );

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${r.status}`);
      }

      const data = await r.json();
      addMsg("assistant", data.reply);
    } catch (e) {
      const msg = e.name === "AbortError"
        ? "Request timed out. Is Ollama still running?"
        : e.message ?? "Something went wrong.";
      addMsg("assistant", `⚠️ ${msg}`);
      setStatus("offline");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, model]);

  const handleSuggestion = (text) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const clearChat = () => setMessages([]);

  const showEmpty = messages.length === 0 && !loading;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>

      {/* ── Header ── */}
      <View style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 16, paddingBottom: 10,
        backgroundColor: C.surface,
        borderBottomWidth: 1, borderColor: C.border,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontFamily: MONO, color: C.green, fontSize: 18, fontWeight: "bold" }}>
            🤖 GROWVER
          </Text>
          <View style={{
            backgroundColor: C.greenFaint, borderRadius: 4,
            paddingHorizontal: 6, paddingVertical: 2,
          }}>
            <Text style={{ color: C.green, fontFamily: MONO, fontSize: 9 }}>AI</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <StatusDot status={status} onPress={checkStatus} />
          {messages.length > 0 && (
            <TouchableOpacity onPress={clearChat}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11 }}>NEW CHAT</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Offline banner ── */}
      {status === "offline" && (
        <View style={{
          backgroundColor: "#2a0a0a", borderBottomWidth: 1, borderColor: "#5a1a1a",
          paddingHorizontal: 14, paddingVertical: 8,
        }}>
          <Text style={{ color: C.red, fontFamily: MONO, fontSize: 11, textAlign: "center" }}>
            Ollama not detected — run <Text style={{ color: C.amber }}>ollama serve</Text> on your PC
          </Text>
        </View>
      )}

      {/* ── Chat area ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {showEmpty ? (
          <Suggestions onSelect={handleSuggestion} />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={({ item }) => <Bubble role={item.role} content={item.content} />}
            ListFooterComponent={loading ? <TypingDots /> : null}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            contentContainerStyle={{ paddingVertical: 12 }}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* ── Input bar ── */}
        <View style={{
          flexDirection: "row",
          alignItems: "flex-end",
          paddingHorizontal: 12,
          paddingVertical: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          borderTopWidth: 1,
          borderColor: C.border,
          backgroundColor: C.surface,
          gap: 8,
        }}>
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder="Ask Growver anything..."
            placeholderTextColor={C.grey}
            multiline
            maxLength={1000}
            style={{
              flex: 1,
              backgroundColor: C.card,
              color: C.white,
              fontFamily: MONO,
              fontSize: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: C.border,
              maxHeight: 110,
              minHeight: 44,
            }}
            onSubmitEditing={() => send(input)}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={() => send(input)}
            disabled={loading || !input.trim()}
            activeOpacity={0.75}
            style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: loading || !input.trim() ? C.grey : C.green,
              alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Text style={{ fontSize: 20, color: C.bg, marginTop: -2 }}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}
