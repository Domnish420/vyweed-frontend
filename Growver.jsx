// Growver.jsx — AI cannabis growing assistant (Ollama chat + Claude Vision analysis)

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, Animated, Alert, Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApiBaseUrl } from "./apiConfig";
const API_BASE_URL = { toString: () => getApiBaseUrl() };

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
function Bubble({ role, content, imageUri }) {
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
        overflow: "hidden",
        borderWidth: 1,
        borderColor: isUser ? C.greenDim : C.border,
      }}>
        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={{ width: 220, height: 165 }}
            resizeMode="cover"
          />
        )}
        {!!content && (
          <Text style={{
            color: isUser ? C.green : C.white,
            fontFamily: MONO,
            fontSize: 13,
            lineHeight: 20,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}>
            {content}
          </Text>
        )}
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
        ASK ME ANYTHING · OR SEND A PLANT PHOTO
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
function StatusDot({ status, visionModel, onPress }) {
  const color = status === "online" ? C.green : status === "offline" ? C.red : C.amber;
  const label = status === "online" ? "ONLINE" : status === "offline" ? "OFFLINE" : "...";
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color, fontFamily: MONO, fontSize: 10, letterSpacing: 0.5 }}>{label}</Text>
      {visionModel && (
        <View style={{
          backgroundColor: C.greenFaint, borderRadius: 4,
          paddingHorizontal: 5, paddingVertical: 1,
          borderWidth: 1, borderColor: C.greenDim,
        }}>
          <Text style={{ color: C.green, fontFamily: MONO, fontSize: 9 }}>👁 VISION</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Growver() {
  const [messages, setMessages]         = useState([]);
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [status, setStatus]             = useState(null);
  const [visionModel, setVisionModel]   = useState(null); // name of available Ollama vision model
  const [model, setModel]               = useState("llama3.2");
  const [pendingImage, setPendingImage] = useState(null); // { uri, base64, mediaType }
  const flatListRef                     = useRef(null);
  const inputRef                        = useRef(null);
  const insets                          = useSafeAreaInsets();

  useEffect(() => { checkStatus(); }, []);

  const checkStatus = useCallback(async () => {
    setStatus(null);
    try {
      const r    = await fetchWithTimeout(`${API_BASE_URL}/api/v1/growver/status`, {}, 6000);
      const data = await r.json();
      setStatus(data.online ? "online" : "offline");
      setVisionModel(data.vision_model || null);
    } catch {
      setStatus("offline");
    }
  }, []);

  const addMsg = (role, content, imageUri) => {
    const msg = { id: uid(), role, content, imageUri };
    setMessages(prev => [...prev, msg]);
    return msg;
  };

  // ── Pick image from camera or library ──────────────────────────────────────
  const pickImageFrom = useCallback(async (source) => {
    let result;
    if (source === "camera") {
      const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (camStatus !== "granted") {
        Alert.alert("Permission needed", "Camera access is required to take plant photos.");
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
      });
    } else {
      const { status: libStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (libStatus !== "granted") {
        Alert.alert("Permission needed", "Photo library access is required.");
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
      });
    }
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setPendingImage({
        uri: asset.uri,
        base64: asset.base64,
        mediaType: asset.mimeType || "image/jpeg",
      });
    }
  }, []);

  const handlePickImage = useCallback(() => {
    Alert.alert("Plant Photo", "Choose source", [
      { text: "📷 Camera", onPress: () => pickImageFrom("camera") },
      { text: "🖼 Gallery", onPress: () => pickImageFrom("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [pickImageFrom]);

  // ── Send message (text, vision, or both) ───────────────────────────────────
  const send = useCallback(async (text) => {
    const trimmed = (text ?? input).trim();
    if ((!trimmed && !pendingImage) || loading) return;
    setInput("");

    const imageToSend = pendingImage;
    setPendingImage(null);

    addMsg("user", trimmed || "", imageToSend?.uri);
    setLoading(true);

    try {
      if (imageToSend) {
        // ── Vision path: send photo to Claude ──────────────────────────────
        const r = await fetchWithTimeout(
          `${API_BASE_URL}/api/v1/growver/analyze`,
          {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              image_base64: imageToSend.base64,
              media_type:   imageToSend.mediaType,
              message:      trimmed || undefined,
              model:        visionModel || "llava",
            }),
          },
          180_000,
        );

        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.detail || `Server error ${r.status}`);
        }

        const data = await r.json();
        addMsg("assistant", data.analysis);
      } else {
        // ── Text path: send message to Ollama ──────────────────────────────
        const history = [...messages, { role: "user", content: trimmed }]
          .slice(-MAX_HISTORY)
          .map(({ role, content }) => ({ role, content }));

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
      }
    } catch (e) {
      const isTimeout = e.name === "AbortError" || e.message?.includes("cancelled") || e.message?.includes("aborted");
      const msg = isTimeout
        ? "Request timed out — llava can take 2-3 min on first load. Try again."
        : e.message ?? "Something went wrong.";
      addMsg("assistant", `⚠️ ${msg}`);
      if (!imageToSend) setStatus("offline");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, model, pendingImage]);

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
          <StatusDot status={status} visionModel={visionModel} onPress={checkStatus} />
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
            renderItem={({ item }) => (
              <Bubble role={item.role} content={item.content} imageUri={item.imageUri} />
            )}
            ListFooterComponent={loading ? <TypingDots /> : null}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            contentContainerStyle={{ paddingVertical: 12 }}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* ── Pending image preview ── */}
        {pendingImage && (
          <View style={{
            flexDirection: "row", alignItems: "center",
            paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4,
            backgroundColor: C.surface,
            borderTopWidth: 1, borderColor: C.border,
          }}>
            <View>
              <Image
                source={{ uri: pendingImage.uri }}
                style={{
                  width: 60, height: 60, borderRadius: 8,
                  borderWidth: 1, borderColor: C.green,
                }}
                resizeMode="cover"
              />
              <TouchableOpacity
                onPress={() => setPendingImage(null)}
                style={{
                  position: "absolute", top: -6, right: -6,
                  width: 18, height: 18, borderRadius: 9,
                  backgroundColor: C.red, alignItems: "center", justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "bold", lineHeight: 12 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11, marginLeft: 12 }}>
              PHOTO ATTACHED · TAP ↑ TO ANALYSE
            </Text>
          </View>
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
          {/* Camera button */}
          <TouchableOpacity
            onPress={handlePickImage}
            disabled={loading}
            activeOpacity={0.75}
            style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: pendingImage ? C.greenDim : C.card,
              borderWidth: 1, borderColor: pendingImage ? C.green : C.border,
              alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Text style={{ fontSize: 20 }}>📷</Text>
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder={pendingImage ? "Add a note or tap ↑ to send…" : "Ask Growver anything…"}
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
            disabled={loading || (!input.trim() && !pendingImage)}
            activeOpacity={0.75}
            style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: (loading || (!input.trim() && !pendingImage)) ? C.grey : C.green,
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
  return fetch(url, {
    ...options,
    signal: controller.signal,
    headers: { 'ngrok-skip-browser-warning': 'true', ...options?.headers },
  }).finally(() => clearTimeout(timer));
}
