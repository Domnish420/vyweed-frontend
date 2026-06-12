/**
 * SettingsScreen.jsx
 * App settings — API URL, units, about
 * Uses AsyncStorage for persistence (install: npx expo install @react-native-async-storage/async-storage)
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  Switch, Alert, Platform, Linking, Modal,
} from "react-native";
import { clearCache, checkConnection } from "./cache";
import { useAppMode } from "./AppMode";
import { API_V1, setApiBaseUrl } from "./apiConfig";

// Try to import AsyncStorage — gracefully fail if not installed
let AsyncStorage = null;
try { AsyncStorage = require("@react-native-async-storage/async-storage").default; } catch {}

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
  white:      "#e8f0e8",
  grey:       "#4a5a4a",
  greyLight:  "#8a9a8a",
};

const MONO = Platform.select({ ios: "Courier New", android: "monospace" });

const DEFAULTS = {
  api_url:   API_V1,
  units:     "metric",
  medium:    "soil",
  dark_mode: true,          // always true for now, just showing the toggle
};

function Label({ children, style }) {
  return (
    <Text style={[{
      color: C.greyLight, fontFamily: MONO, fontSize: 10,
      letterSpacing: 1.5, textTransform: "uppercase",
    }, style]}>
      {children}
    </Text>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Label style={{ marginBottom: 10, marginLeft: 4 }}>{title}</Label>
      <View style={{
        backgroundColor: C.card, borderRadius: 10,
        borderWidth: 1, borderColor: C.border, overflow: "hidden",
      }}>
        {children}
      </View>
    </View>
  );
}

function SettingRow({ label, sub, right, onPress, last }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap onPress={onPress} activeOpacity={0.7}
      style={{
        flexDirection: "row", alignItems: "center",
        paddingVertical: 14, paddingHorizontal: 14,
        borderBottomWidth: last ? 0 : 1, borderColor: C.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13 }}>{label}</Text>
        {sub && <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 2 }}>{sub}</Text>}
      </View>
      {right}
    </Wrap>
  );
}

function SelectRow({ label, sub, options, value, onChange, last }) {
  return (
    <View style={{
      paddingVertical: 12, paddingHorizontal: 14,
      borderBottomWidth: last ? 0 : 1, borderColor: C.border,
    }}>
      <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, marginBottom: 8 }}>{label}</Text>
      {sub && <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginBottom: 8 }}>{sub}</Text>}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {options.map(opt => (
          <TouchableOpacity key={opt.value} onPress={() => onChange(opt.value)}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: "center",
              borderWidth: 1,
              borderColor: value === opt.value ? C.green : C.border,
              backgroundColor: value === opt.value ? C.greenFaint : C.surface,
            }}>
            <Text style={{
              color: value === opt.value ? C.green : C.greyLight,
              fontFamily: MONO, fontSize: 12,
            }}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const [settings, setSettings] = useState({ ...DEFAULTS });
  const [apiTest, setApiTest]   = useState(null); // null | "ok" | "fail"
  const [testing, setTesting]   = useState(false);
  const [saved, setSaved]       = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const { mode, setMode, isIRL, isPro, setIsPro } = useAppMode();

  // Load saved settings
  useEffect(() => {
    if (!AsyncStorage) return;
    AsyncStorage.getItem("vyweed_settings")
      .then(raw => { if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) }); })
      .catch(() => {});
  }, []);

  const save = async () => {
    if (settings.api_url) setApiBaseUrl(settings.api_url);
    if (AsyncStorage) {
      await AsyncStorage.setItem("vyweed_settings", JSON.stringify(settings)).catch(() => {});
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const update = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  const testConnection = async () => {
    setTesting(true);
    setApiTest(null);
    const ok = await checkConnection(settings.api_url);
    setApiTest(ok ? "ok" : "fail");
    setTesting(false);
  };

  const handleClearCache = async () => {
    Alert.alert(
      "Clear Cache",
      "This removes all offline cached data. The app will need a connection to load data again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: async () => {
          const count = await clearCache();
          Alert.alert("Done", `Cleared ${count} cached items`);
        }},
      ]
    );
  };

  const DB_STATS_URL = `${settings.api_url}/search/stats`;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 16 : 52,
        paddingBottom: 14,
        borderBottomWidth: 1, borderColor: C.border,
        flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
      }}>
        <View>
          <Text style={{ color: C.white, fontFamily: MONO, fontSize: 22,
            fontWeight: "900", letterSpacing: 2 }}>
            VY<Text style={{ color: C.green }}>WEED</Text>
          </Text>
          <Label>SETTINGS</Label>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TouchableOpacity onPress={() => setShowInfo(true)}
            style={{ width: 32, height: 32, borderRadius: 16,
              backgroundColor: C.surface, borderWidth: 1, borderColor: C.greenDim,
              alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: C.green, fontFamily: MONO, fontSize: 14, fontWeight: "bold" }}>?</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={save}
            style={{
              backgroundColor: saved ? C.greenFaint : C.surface,
              borderRadius: 6, borderWidth: 1,
              borderColor: saved ? C.green : C.border,
              paddingHorizontal: 14, paddingVertical: 8,
            }}>
            <Text style={{
              color: saved ? C.green : C.greyLight,
              fontFamily: MONO, fontSize: 12, fontWeight: "bold",
            }}>
              {saved ? "✓ SAVED" : "SAVE"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>

        {/* App Mode Toggle */}
        <View style={{ backgroundColor: C.card, borderRadius: 12,
          borderWidth: 2, borderColor: isIRL ? C.green : C.purple,
          padding: 16, marginBottom: 20 }}>
          <Text style={{ color: C.white, fontFamily: MONO,
            fontSize: 13, fontWeight: "bold", marginBottom: 4 }}>
            {isIRL ? "🌿 IRL GROWER MODE" : "🎮 VIRTUAL MODE"}
          </Text>
          <Text style={{ color: C.greyLight, fontFamily: MONO,
            fontSize: 11, lineHeight: 17, marginBottom: 14 }}>
            {isIRL
              ? "You have full access — strain browser, grow tracker, nutrients, VPD, glossary and outdoor guide are all unlocked."
              : "Virtual mode — collect strain trophies through the grow game. Upgrade to IRL mode to unlock the full grow companion app."}
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => setMode("virtual")}
              style={{ flex: 1, backgroundColor: !isIRL ? `${C.purple}33` : C.surface,
                borderRadius: 8, borderWidth: 2,
                borderColor: !isIRL ? C.purple : C.border,
                padding: 12, alignItems: "center" }}>
              <Text style={{ fontSize: 20 }}>🎮</Text>
              <Text style={{ color: !isIRL ? C.purple : C.greyLight,
                fontFamily: MONO, fontSize: 11, fontWeight: "bold", marginTop: 4 }}>
                VIRTUAL
              </Text>
              <Text style={{ color: !isIRL ? `${C.purple}88` : C.grey,
                fontFamily: MONO, fontSize: 9, marginTop: 2, textAlign: "center" }}>
                Free · Collect trophies
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMode("irl")}
              style={{ flex: 1, backgroundColor: isIRL ? C.greenFaint : C.surface,
                borderRadius: 8, borderWidth: 2,
                borderColor: isIRL ? C.green : C.border,
                padding: 12, alignItems: "center" }}>
              <Text style={{ fontSize: 20 }}>🌿</Text>
              <Text style={{ color: isIRL ? C.green : C.greyLight,
                fontFamily: MONO, fontSize: 11, fontWeight: "bold", marginTop: 4 }}>
                IRL GROWER
              </Text>
              <Text style={{ color: isIRL ? C.greenDim : C.grey,
                fontFamily: MONO, fontSize: 9, marginTop: 2, textAlign: "center" }}>
                Full app · Beta: free
              </Text>
            </TouchableOpacity>
          </View>
          {!isIRL && (
            <Text style={{ color: C.grey, fontFamily: MONO,
              fontSize: 10, marginTop: 10, textAlign: "center" }}>
              During beta both modes are free — subscription required at launch
            </Text>
          )}
        </View>

        {/* MAX / Pro tier toggle (beta test) */}
        <Section title="TIER (BETA)">
          <View style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13 }}>
                  MAX MODE
                </Text>
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 3 }}>
                  {isPro
                    ? "⭐ Active — 8 seeds, 5 re-rolls per grow cycle"
                    : "Free — 4 seeds, 1 re-roll per grow cycle"}
                </Text>
              </View>
              <Switch
                value={isPro}
                onValueChange={setIsPro}
                trackColor={{ false: C.border, true: C.greenDim }}
                thumbColor={isPro ? C.green : C.grey}
              />
            </View>
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 8 }}>
              Toggle for testing — will be locked to subscription at launch
            </Text>
          </View>
        </Section>

        {/* Backend connection */}
        <Section title="BACKEND">
          <View style={{
            paddingVertical: 12, paddingHorizontal: 14,
            borderBottomWidth: 1, borderColor: C.border,
          }}>
            <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, marginBottom: 6 }}>
              API URL
            </Text>
            <TextInput
              style={{
                backgroundColor: C.surface, borderRadius: 6,
                borderWidth: 1, borderColor: C.border,
                color: C.green, fontFamily: MONO, fontSize: 13,
                padding: 10,
              }}
              value={settings.api_url}
              onChangeText={v => update("api_url", v)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 4 }}>
              Termux: http://localhost:8000/api/v1{"\n"}
              LAN: http://192.168.x.x:8000/api/v1
            </Text>
          </View>

          <SettingRow
            label="TEST CONNECTION"
            sub={testing ? "Connecting..." :
              apiTest === "ok" ? "✓ Backend reachable" :
              apiTest === "fail" ? "✗ Could not connect" : "Tap to test"}
            right={
              <TouchableOpacity onPress={testConnection}
                style={{
                  backgroundColor: C.greenFaint, borderRadius: 6,
                  borderWidth: 1, borderColor: C.green,
                  paddingHorizontal: 12, paddingVertical: 7,
                }}>
                <Text style={{ color: C.green, fontFamily: MONO, fontSize: 11 }}>
                  {testing ? "..." : "TEST"}
                </Text>
              </TouchableOpacity>
            }
            last
          />
        </Section>

        {/* Grow preferences */}
        <Section title="GROW PREFERENCES">
          <SelectRow
            label="UNITS"
            options={[
              { label: "METRIC (g, °C)", value: "metric" },
              { label: "IMPERIAL (oz, °F)", value: "imperial" },
            ]}
            value={settings.units}
            onChange={v => update("units", v)}
          />
          <SelectRow
            label="DEFAULT MEDIUM"
            sub="Pre-filled when starting new grows"
            options={[
              { label: "SOIL", value: "soil" },
              { label: "COCO", value: "coco" },
              { label: "HYDRO", value: "hydro" },
            ]}
            value={settings.medium}
            onChange={v => update("medium", v)}
            last
          />
        </Section>

        {/* Notifications */}
        <Section title="NOTIFICATIONS">
          <SettingRow
            label="PLANT READY"
            sub="Alert when your next virtual plant is ready to grow"
            right={
              <Switch value={settings.notif_plant_ready ?? true}
                onValueChange={v => update("notif_plant_ready", v)}
                trackColor={{ true: C.green }} />
            }
          />
          <SettingRow
            label="DAILY GROW REMINDER"
            sub="Morning reminder to check in on your real grow"
            right={
              <Switch value={settings.notif_daily ?? true}
                onValueChange={v => update("notif_daily", v)}
                trackColor={{ true: C.green }} />
            }
          />
          <SettingRow
            label="HARVEST ALERT"
            sub="Notify when your plant enters the harvest window"
            right={
              <Switch value={settings.notif_harvest ?? true}
                onValueChange={v => update("notif_harvest", v)}
                trackColor={{ true: C.green }} />
            }
          />
          <SettingRow
            label="CHECK-IN STREAK"
            sub="Remind you if you haven't logged in 24 hours"
            last
            right={
              <Switch value={settings.notif_streak ?? true}
                onValueChange={v => update("notif_streak", v)}
                trackColor={{ true: C.green }} />
            }
          />
        </Section>

        {/* Offline cache */}
        <Section title="OFFLINE CACHE">
          <SettingRow
            label="CACHED DATA"
            sub="Strain searches and grow reports are saved for offline use"
            right={
              <View style={{ backgroundColor: C.greenFaint, borderRadius: 6,
                borderWidth: 1, borderColor: C.greenDim,
                paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ color: C.green, fontFamily: MONO, fontSize: 11 }}>
                  AUTO
                </Text>
              </View>
            }
          />
          <SettingRow
            label="CLEAR CACHE"
            sub="Remove all cached data — requires connection to reload"
            onPress={handleClearCache}
            right={<Text style={{ color: C.red, fontFamily: MONO, fontSize: 14 }}>🗑</Text>}
            last
          />
        </Section>

        {/* Game data */}
        <Section title="GAME DATA">
          <SettingRow
            label="TROPHIES &amp; TIMER"
            sub="Wipe all collected trophies and clear the wait timer"
            onPress={() => {
              Alert.alert(
                "Wipe Game Data",
                "This will delete ALL your trophies and reset the wait timer. This cannot be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Wipe",
                    style: "destructive",
                    onPress: async () => {
                      if (!AsyncStorage) return;
                      await AsyncStorage.multiRemove([
                        "vyweed_trophies",
                        "vyweed_wait_timer",
                        "vyweed_current_strain",
                      ]).catch(() => {});
                      Alert.alert("Done", "Game data wiped. Start fresh!");
                    },
                  },
                ]
              );
            }}
            right={<Text style={{ color: C.red, fontFamily: MONO, fontSize: 14 }}>🗑</Text>}
            last
          />
        </Section>

        {/* Database */}
        <Section title="DATABASE">
          <SettingRow
            label="STRAIN DATABASE"
            sub="5,042 strains · T1–T4 · All seedbanks"
            right={
              <View style={{
                backgroundColor: C.greenFaint, borderRadius: 6,
                borderWidth: 1, borderColor: C.greenDim,
                paddingHorizontal: 10, paddingVertical: 5,
              }}>
                <Text style={{ color: C.green, fontFamily: MONO, fontSize: 11 }}>
                  LEAFLY PARITY
                </Text>
              </View>
            }
          />
          <SettingRow
            label="VIEW LIVE STATS"
            sub={DB_STATS_URL}
            onPress={() => Linking.openURL(DB_STATS_URL).catch(() => {})}
            right={<Text style={{ color: C.grey, fontFamily: MONO, fontSize: 16 }}>→</Text>}
            last
          />
        </Section>

        {/* About */}
        <Section title="ABOUT">
          <SettingRow label="APP" right={
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 12 }}>VYWEED</Text>
          } />
          <SettingRow label="VERSION" right={
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 12 }}>1.0.0</Text>
          } />
          <SettingRow label="ALGORITHM" right={
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 12 }}>v1 · 5,034 datasets</Text>
          } />
          <SettingRow label="PLATFORM"
            sub="Built on Samsung S22 · Expo Go + PC backend"
            right={
              <Text style={{ color: C.green, fontFamily: MONO, fontSize: 14 }}>📱</Text>
            }
            last
          />
        </Section>

        {/* Legal */}
        <View style={{
          backgroundColor: C.surface, borderRadius: 8,
          borderWidth: 1, borderColor: C.border,
          padding: 12,
        }}>
          <Text style={{
            color: C.grey, fontFamily: MONO, fontSize: 10,
            lineHeight: 16, textAlign: "center",
          }}>
            VYWEED provides cultivation guidance for informational purposes only.
            Check local laws before growing cannabis. For educational use.
          </Text>
        </View>

      </ScrollView>

      {/* Settings Info Modal */}
      <Modal visible={showInfo} transparent animationType="slide" onRequestClose={() => setShowInfo(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20,
            borderTopRightRadius: 20, borderTopWidth: 2, borderColor: C.green, maxHeight: "90%" }}>
            <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2 }} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ fontSize: 28 }}>⚙</Text>
                <View>
                  <Text style={{ color: C.green, fontFamily: MONO, fontSize: 16, fontWeight: "bold" }}>SETTINGS</Text>
                  <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>HOW TO USE THIS SCREEN</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowInfo(false)} style={{ padding: 8 }}>
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 20 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              <View style={{ backgroundColor: C.greenFaint, borderRadius: 8, borderWidth: 1,
                borderColor: C.greenDim, padding: 14, marginBottom: 16 }}>
                <Label style={{ color: C.greenDim, marginBottom: 6 }}>WHAT IS THIS?</Label>
                <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, lineHeight: 20 }}>
                  {"Configure VYWEED to match your setup. These settings are saved to your device and remembered every time you open the app. If something stops working, come here first."}
                </Text>
              </View>
              {[
                { icon: "🔗", title: "API URL", text: "This is the address of the VYWEED backend server running on your PC. The app auto-detects this during development. If auto-detection fails, enter your PC's local IP manually, e.g. http://192.168.1.x:8000/api/v1. If using ngrok, enter the ngrok URL instead." },
                { icon: "🧪", title: "TEST CONNECTION", text: "Tapping this checks if the app can currently reach the backend. Green = connected and working. Red = can't reach it. If it fails: make sure the backend (start.ps1) and Ollama are running on your PC, and your phone is on the same WiFi network." },
                { icon: "📏", title: "UNITS", text: "Metric = grams (g), centimetres (cm), Celsius (°C). This is used worldwide and in all scientific contexts. Imperial = ounces (oz), inches (in), Fahrenheit (°F). This is mainly used in the USA. Choose whichever feels natural to you — the calculations stay the same." },
                { icon: "🌱", title: "DEFAULT MEDIUM", text: "Your growing medium is what your plant's roots live in. Soil = compost/potting mix, the most forgiving, best for beginners, naturally buffers pH mistakes. Coco = coconut husk fibre, faster growth than soil, needs more frequent watering and feeding. Hydro = roots grow in water, fastest growth possible, most technical and unforgiving of mistakes." },
              ].map((s, i) => (
                <View key={i} style={{ backgroundColor: C.surface, borderRadius: 8, borderWidth: 1,
                  borderColor: C.border, padding: 14, marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 18 }}>{s.icon}</Text>
                    <Text style={{ color: C.green, fontFamily: MONO, fontSize: 12, fontWeight: "bold" }}>{s.title}</Text>
                  </View>
                  <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 12, lineHeight: 19 }}>{s.text}</Text>
                </View>
              ))}
              <View style={{ backgroundColor: "#0d1a2a", borderRadius: 8, borderWidth: 1,
                borderColor: C.blue, padding: 14 }}>
                <Label style={{ color: C.blue, marginBottom: 6 }}>💡 PRO TIP</Label>
                <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, lineHeight: 19 }}>
                  {"If the app shows 'connection error' anywhere, come here first and tap TEST CONNECTION. Make sure your PC has ollama serve, start.ps1 (backend), and ngrok http 8000 all running. Then test again."}
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}
