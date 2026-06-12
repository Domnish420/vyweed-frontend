/**
 * OutdoorGuide.jsx
 * Real-time weather + outdoor growing intelligence
 * - expo-location for device GPS + reverse geocoding
 * - Open-Meteo (free, no key) for live conditions + 7-day forecast
 * - Growver weather context saved to AsyncStorage so the AI
 *   knows exactly what's happening outside when you ask it questions
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, StatusBar,
} from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MONO = Platform.select({ ios: "Courier New", android: "monospace" });

const C = {
  bg: "#070a07", surface: "#0d120d", card: "#111811",
  border: "#1a2a1a", green: "#39ff45", greenFaint: "#0d3d12",
  greenDim: "#1a7a20", amber: "#ffb830", red: "#ff3a3a",
  blue: "#30d5ff", purple: "#c084fc", white: "#e8f0e8",
  grey: "#4a5a4a", greyLight: "#8a9a8a",
};

function Label({ children, style }) {
  return (
    <Text style={[{ color: C.greyLight, fontFamily: MONO, fontSize: 10, letterSpacing: 1.5 }, style]}>
      {children}
    </Text>
  );
}

// ── WMO weather code → human description ──────────────────────────────────────
const WMO = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Icy fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Rain showers", 82: "Heavy showers",
  85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm + hail", 99: "Severe thunderstorm",
};

function wmoIcon(code) {
  if (code === 0)               return "☀️";
  if (code <= 3)                return "⛅";
  if (code <= 48)               return "🌫";
  if (code <= 55)               return "🌦";
  if (code <= 67)               return "🌧";
  if (code <= 77)               return "❄️";
  if (code <= 82)               return "🌧";
  if (code <= 86)               return "🌨";
  return "⛈";
}

// ── Season + growing advice ────────────────────────────────────────────────────
function getSeason(month, isNorthern) {
  if (isNorthern) {
    if (month >= 3 && month <= 5)  return "spring";
    if (month >= 6 && month <= 8)  return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
  }
  if (month >= 9 && month <= 11) return "spring";
  if (month >= 12 || month <= 2) return "summer";
  if (month >= 3 && month <= 5)  return "autumn";
  return "winter";
}

function getGrowingAdvice(month, lat, weather) {
  const isNorthern = lat >= 0;
  const temp     = weather?.current?.temperature_2m;
  const feelsLike = weather?.current?.apparent_temperature;
  const humidity = weather?.current?.relative_humidity_2m;
  const wind     = weather?.current?.wind_speed_10m;

  let planting, harvest, risks;

  if (isNorthern) {
    if (month >= 4 && month <= 5) {
      planting = { status: "good", label: "GOOD TIME TO PLANT", colour: C.green,
        desc: "Spring is ideal for starting outdoor plants. Days are getting longer and frost risk is reducing. Transplant after your last frost date." };
    } else if (month === 3) {
      planting = { status: "early", label: "A BIT EARLY", colour: C.amber,
        desc: "March can work in mild climates but overnight frost is still a risk. Start seeds indoors and wait until nights stay consistently above 10°C." };
    } else if (month >= 6 && month <= 7) {
      planting = { status: "late", label: "LATE BUT POSSIBLE", colour: C.amber,
        desc: "June/July planting works well for autoflowers. Photoperiod strains won't have enough veg time before autumn triggers flowering." };
    } else if (month >= 8 && month <= 10) {
      planting = { status: "flowering", label: "PLANTS SHOULD BE FLOWERING", colour: "#ff8c30",
        desc: "August–October is harvest season. If starting now, autoflowers only — they can finish in 10 weeks regardless of light schedule." };
    } else {
      planting = { status: "bad", label: "NOT PLANTING SEASON", colour: C.red,
        desc: "Winter is not suitable for outdoor growing. Use this time to research strains and order seeds for spring." };
    }
    harvest = month >= 9 && month <= 10
      ? { label: "HARVEST SEASON", colour: "#ffd700", desc: "September–October is peak harvest time. Check trichomes daily — cloudy white = peak THC, amber = more sedating." }
      : month === 8
      ? { label: "APPROACHING HARVEST", colour: C.amber, desc: "Late August — early-finishing strains may be ready. Most harvest September–October." }
      : month >= 4 && month <= 7
      ? { label: "GROWING SEASON", colour: C.green, desc: "Plants are building structure and flower sites. Harvest is still weeks or months away." }
      : { label: "OFF SEASON", colour: C.grey, desc: "Plan your spring grow. Order seeds and prep your space now." };
  } else {
    if (month >= 10 && month <= 11) {
      planting = { status: "good", label: "GOOD TIME TO PLANT", colour: C.green,
        desc: "Southern hemisphere spring. Ideal window — days are lengthening and frost risk is dropping." };
    } else if (month >= 3 && month <= 4) {
      planting = { status: "flowering", label: "PLANTS SHOULD BE FLOWERING", colour: "#ff8c30",
        desc: "Southern hemisphere autumn. Photoperiod plants are in flower now. Autoflowers can still complete a cycle." };
    } else if (month >= 5 && month <= 8) {
      planting = { status: "bad", label: "WINTER — NOT PLANTING SEASON", colour: C.red,
        desc: "Southern hemisphere winter. Plan for spring (October onwards)." };
    } else {
      planting = { status: "late", label: "LATE SUMMER — AUTOFLOWERS ONLY", colour: C.amber,
        desc: "Late summer — autoflowers can still complete a cycle before the days shorten." };
    }
    harvest = month >= 3 && month <= 5
      ? { label: "HARVEST SEASON", colour: "#ffd700", desc: "Autumn harvest in the southern hemisphere. Check trichomes daily." }
      : { label: "GROWING SEASON", colour: C.green, desc: "Plants are in growth or planning phase." };
  }

  risks = [];
  if (temp !== undefined) {
    if (temp < 5)  risks.push({ level: "critical", text: "⚠️ Frost risk — temperatures near freezing. Cannabis dies below 0°C. Protect or bring in plants." });
    else if (temp < 10) risks.push({ level: "warning", text: "🌡 Cold stress — below 10°C slows growth and can cause purple discolouration." });
    if (temp > 35) risks.push({ level: "critical", text: "🔥 Extreme heat — above 35°C causes bleaching and terpene loss. Shade and extra water needed." });
    else if (temp > 30) risks.push({ level: "warning", text: "🌡 Heat stress risk — above 30°C causes wilting. Ensure roots stay cool and watered." });
  }
  if (humidity !== undefined) {
    if (humidity > 80) risks.push({ level: "warning", text: "💧 High humidity — serious mould risk in late flower. Ensure airflow between plants." });
    else if (humidity > 65 && month >= 7 && month <= 10 && isNorthern) {
      risks.push({ level: "info", text: "💧 Moderate humidity in harvest season — watch for bud rot on dense colas." });
    }
    if (humidity < 30) risks.push({ level: "info", text: "🏜 Very dry air — increase watering frequency and consider mulching to retain moisture." });
  }
  if (wind !== undefined && wind > 40) {
    risks.push({ level: "warning", text: "💨 Strong winds — stake plants to prevent stem snapping. Wind above 40km/h stresses even established plants." });
  }

  return { planting, harvest, risks };
}

function getDaylightHours(lat, month) {
  const P = Math.asin(0.39795 * Math.cos(0.2163108 + 2 * Math.atan(0.9671396 * Math.tan(0.00860 * (month * 30 - 186)))));
  const h = 24 - (24 / Math.PI) * Math.acos(
    (Math.sin(0.8333 * Math.PI / 180) + Math.sin(lat * Math.PI / 180) * Math.sin(P)) /
    (Math.cos(lat * Math.PI / 180) * Math.cos(P))
  );
  return isNaN(h) ? 12 : Math.round(h * 10) / 10;
}

function windDirection(deg) {
  if (deg === undefined) return "";
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  return dirs[Math.round(deg / 45) % 8];
}

// ── Build the context object saved to AsyncStorage for Growver ─────────────────
function buildGrowverContext({ city, country, lat, lon, weather, daylightHours, season, isNorthern, advice }) {
  const cur = weather?.current || {};
  const daylightZone = daylightHours >= 14 ? "VEGE ZONE" : daylightHours >= 12 ? "TRANSITION" : "FLOWER TRIGGER";
  const riskSummary  = advice.risks.length
    ? advice.risks.map(r => r.text.replace(/^[^\w]+/, "")).join("; ")
    : "none";

  const summary =
    `${Math.round(cur.temperature_2m ?? 0)}°C (feels ${Math.round(cur.apparent_temperature ?? 0)}°C), ` +
    `${cur.relative_humidity_2m ?? "?"}% humidity, ` +
    `${Math.round(cur.wind_speed_10m ?? 0)}km/h wind, ` +
    `UV ${cur.uv_index ?? "N/A"}, ` +
    `${daylightHours}h daylight (${daylightZone}), ` +
    `${season} in ${isNorthern ? "Northern" : "Southern"} hemisphere. ` +
    `${advice.planting.label}. ` +
    `Risks: ${riskSummary}.`;

  return {
    city: city || "Unknown",
    country: country || "",
    lat: Math.round(lat * 10) / 10,
    lon: Math.round(lon * 10) / 10,
    temp:      Math.round(cur.temperature_2m ?? 0),
    feelsLike: Math.round(cur.apparent_temperature ?? 0),
    humidity:  cur.relative_humidity_2m,
    wind:      Math.round(cur.wind_speed_10m ?? 0),
    windDir:   windDirection(cur.wind_direction_10m),
    uv:        cur.uv_index ?? null,
    weatherDesc: WMO[cur.weather_code] || "Unknown",
    daylightHours,
    daylightZone,
    season: season.toUpperCase(),
    hemisphere: isNorthern ? "Northern" : "Southern",
    plantingStatus: advice.planting.label,
    risks: riskSummary,
    summary,
    updatedAt: Date.now(),
  };
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function OutdoorGuide() {
  const [location, setLocation]         = useState(null);
  const [locationName, setLocationName] = useState(null);
  const [weather, setWeather]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [permDenied, setPermDenied]     = useState(false);
  const [growverSynced, setGrowverSynced] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    setPermDenied(false);
    setGrowverSynced(false);

    try {
      // ── 1. Permission ──────────────────────────────────────────────────────
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPermDenied(true);
        setError("Location permission denied.");
        return;
      }

      // ── 2. GPS position ────────────────────────────────────────────────────
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;
      setLocation({ lat: latitude, lon: longitude });

      // ── 3. Reverse geocode for city name ───────────────────────────────────
      let city = null, country = null;
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
        city    = geo?.city || geo?.subregion || geo?.district || null;
        country = geo?.country || null;
        setLocationName(city && country ? `${city}, ${country}` : country || null);
      } catch { /* non-fatal */ }

      // ── 4. Weather from Open-Meteo (free, no key) ──────────────────────────
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,` +
        `wind_speed_10m,wind_direction_10m,precipitation,weather_code,uv_index` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,` +
        `precipitation_probability_max,sunrise,sunset` +
        `&timezone=auto&forecast_days=7`;

      const res  = await fetch(url);
      const data = await res.json();
      setWeather(data);

      // ── 5. Save context for Growver ────────────────────────────────────────
      const month      = new Date().getMonth() + 1;
      const isNorthern = latitude >= 0;
      const season     = getSeason(month, isNorthern);
      const daylightH  = getDaylightHours(latitude, month);
      const advice     = getGrowingAdvice(month, latitude, data);

      const ctx = buildGrowverContext({
        city, country, lat: latitude, lon: longitude,
        weather: data, daylightHours: daylightH,
        season, isNorthern, advice,
      });
      await AsyncStorage.setItem("vyweed_outdoor_weather", JSON.stringify(ctx));
      setGrowverSynced(true);

    } catch (e) {
      setError(e.message || "Could not load weather data");
    } finally {
      setLoading(false);
    }
  };

  const month      = new Date().getMonth() + 1;
  const isNorthern = location ? location.lat >= 0 : true;
  const season     = getSeason(month, isNorthern);
  const advice     = location ? getGrowingAdvice(month, location.lat, weather) : null;
  const daylightH  = location ? getDaylightHours(location.lat, month) : null;

  const SEASON_ICONS = { spring: "🌱", summer: "☀️", autumn: "🍂", winter: "❄️" };
  const SEASON_COLS  = { spring: C.green, summer: C.amber, autumn: "#ff8c30", winter: C.blue };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 52,
        paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border,
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Text style={{ color: C.white, fontFamily: MONO, fontSize: 22, fontWeight: "900", letterSpacing: 2 }}>
              VY<Text style={{ color: C.green }}>WEED</Text>
            </Text>
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>
              OUTDOOR GUIDE
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {growverSynced && (
              <View style={{
                backgroundColor: "#0d3d12", borderRadius: 6, borderWidth: 1, borderColor: C.greenDim,
                paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5,
              }}>
                <Text style={{ fontSize: 12 }}>🤖</Text>
                <Text style={{ color: C.green, fontFamily: MONO, fontSize: 9 }}>GROWVER SYNCED</Text>
              </View>
            )}
            <TouchableOpacity onPress={fetchAll}
              style={{ backgroundColor: C.surface, borderRadius: 6, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: C.green, fontFamily: MONO, fontSize: 11 }}>↻ REFRESH</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Location name + coords */}
        {!loading && !error && location && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
            <Text style={{ fontSize: 12 }}>📍</Text>
            <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11 }}>
              {locationName || `${location.lat.toFixed(2)}°, ${location.lon.toFixed(2)}°`}
            </Text>
            {locationName && (
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9 }}>
                ({location.lat.toFixed(1)}° {isNorthern ? "N" : "S"})
              </Text>
            )}
          </View>
        )}
      </View>

      {/* ── Loading ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
          <ActivityIndicator color={C.green} size="large" />
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 12 }}>
            GETTING YOUR LOCATION...
          </Text>
        </View>

      ) : error ? (
        /* ── Error ──────────────────────────────────────────────────────────── */
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 48 }}>📍</Text>
          <Text style={{ color: C.amber, fontFamily: MONO, fontSize: 14, fontWeight: "bold", marginTop: 16 }}>
            {permDenied ? "LOCATION PERMISSION DENIED" : "LOCATION UNAVAILABLE"}
          </Text>
          <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 12, marginTop: 8, textAlign: "center", lineHeight: 18 }}>
            {permDenied
              ? "Open your device Settings → Apps → VYWEED → Permissions and enable Location, then tap Retry."
              : `${error}\n\nAllow location access to get live outdoor growing conditions for your area.`}
          </Text>
          <TouchableOpacity onPress={fetchAll}
            style={{ marginTop: 20, backgroundColor: C.greenDim, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 }}>
            <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, fontWeight: "bold" }}>
              {permDenied ? "CHECK AGAIN" : "RETRY"}
            </Text>
          </TouchableOpacity>
        </View>

      ) : (
        /* ── Main content ────────────────────────────────────────────────────── */
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>

          {/* ── Current conditions ───────────────────────────────────────────── */}
          {weather?.current && (
            <View style={{ backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 24 }}>{wmoIcon(weather.current.weather_code)}</Text>
                <View>
                  <Label>CURRENT CONDITIONS</Label>
                  <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11, marginTop: 2 }}>
                    {WMO[weather.current.weather_code] || ""}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[
                  { label: "TEMP",     value: `${Math.round(weather.current.temperature_2m)}°C`,          colour: C.red },
                  { label: "FEELS",    value: `${Math.round(weather.current.apparent_temperature)}°C`,    colour: "#ff8c30" },
                  { label: "HUMIDITY", value: `${weather.current.relative_humidity_2m}%`,                  colour: C.blue },
                  { label: "WIND",     value: `${Math.round(weather.current.wind_speed_10m)}km/h ${windDirection(weather.current.wind_direction_10m)}`, colour: C.greyLight },
                  { label: "UV",       value: `${weather.current.uv_index ?? "–"}`,                        colour: C.amber },
                  { label: "DAYLIGHT", value: `${daylightH}h`,                                             colour: C.purple },
                ].map(({ label, value, colour }) => (
                  <View key={label} style={{
                    backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.border,
                    padding: 10, alignItems: "center", minWidth: 72, flex: 1,
                  }}>
                    <Label style={{ fontSize: 8 }}>{label}</Label>
                    <Text style={{ color: colour, fontFamily: MONO, fontSize: 15, fontWeight: "bold", marginTop: 4 }}>
                      {value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── Season + daylight bar ─────────────────────────────────────────── */}
          <View style={{
            backgroundColor: `${SEASON_COLS[season]}15`, borderRadius: 10,
            borderWidth: 1, borderColor: SEASON_COLS[season], padding: 16, marginBottom: 12,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Text style={{ fontSize: 32 }}>{SEASON_ICONS[season]}</Text>
              <View>
                <Text style={{ color: SEASON_COLS[season], fontFamily: MONO, fontSize: 20, fontWeight: "bold" }}>
                  {season.toUpperCase()}
                </Text>
                <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11, marginTop: 2 }}>
                  {isNorthern ? "Northern" : "Southern"} hemisphere · {daylightH}h daylight
                </Text>
              </View>
            </View>

            {daylightH && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9 }}>0h</Text>
                  <Text style={{
                    fontFamily: MONO, fontSize: 11, fontWeight: "bold",
                    color: daylightH >= 14 ? C.green : daylightH >= 12 ? C.amber : C.red,
                  }}>
                    {daylightH}h · {daylightH >= 14 ? "VEGE ZONE" : daylightH >= 12 ? "TRANSITION" : "FLOWER TRIGGER"}
                  </Text>
                  <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9 }}>24h</Text>
                </View>
                <View style={{ height: 8, backgroundColor: C.border, borderRadius: 4, overflow: "hidden" }}>
                  <View style={{ width: `${(daylightH / 24) * 100}%`, height: 8, backgroundColor: SEASON_COLS[season], borderRadius: 4 }} />
                </View>
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10, marginTop: 6 }}>
                  Cannabis flowers when daylight drops below 14h. Below 12h = full flower trigger.
                </Text>
              </>
            )}
          </View>

          {/* ── Planting advice ───────────────────────────────────────────────── */}
          {advice?.planting && (
            <View style={{
              backgroundColor: `${advice.planting.colour}15`, borderRadius: 10,
              borderWidth: 1, borderColor: advice.planting.colour, padding: 16, marginBottom: 12,
            }}>
              <Label style={{ color: advice.planting.colour, marginBottom: 6 }}>PLANTING ADVICE</Label>
              <Text style={{ color: advice.planting.colour, fontFamily: MONO, fontSize: 16, fontWeight: "bold", marginBottom: 8 }}>
                {advice.planting.label}
              </Text>
              <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, lineHeight: 20 }}>
                {advice.planting.desc}
              </Text>
            </View>
          )}

          {/* ── Harvest status ────────────────────────────────────────────────── */}
          {advice?.harvest && (
            <View style={{
              backgroundColor: `${advice.harvest.colour}15`, borderRadius: 10,
              borderWidth: 1, borderColor: advice.harvest.colour, padding: 16, marginBottom: 12,
            }}>
              <Label style={{ color: advice.harvest.colour, marginBottom: 6 }}>HARVEST STATUS</Label>
              <Text style={{ color: advice.harvest.colour, fontFamily: MONO, fontSize: 16, fontWeight: "bold", marginBottom: 8 }}>
                {advice.harvest.label}
              </Text>
              <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, lineHeight: 20 }}>
                {advice.harvest.desc}
              </Text>
            </View>
          )}

          {/* ── Current risks ─────────────────────────────────────────────────── */}
          {advice?.risks?.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Label style={{ marginBottom: 8 }}>CURRENT RISKS</Label>
              {advice.risks.map((risk, i) => (
                <View key={i} style={{
                  backgroundColor: risk.level === "critical" ? "#3d0000" : risk.level === "warning" ? "#2a1a00" : C.surface,
                  borderRadius: 8, borderWidth: 1,
                  borderColor: risk.level === "critical" ? C.red : risk.level === "warning" ? C.amber : C.border,
                  padding: 12, marginBottom: 8,
                }}>
                  <Text style={{
                    fontFamily: MONO, fontSize: 12, lineHeight: 18,
                    color: risk.level === "critical" ? C.red : risk.level === "warning" ? C.amber : C.greyLight,
                  }}>
                    {risk.text}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* ── 7-day forecast ────────────────────────────────────────────────── */}
          {weather?.daily && (
            <View style={{ backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 }}>
              <Label style={{ marginBottom: 10 }}>7-DAY FORECAST</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {weather.daily.temperature_2m_max.map((maxT, i) => {
                    const minT    = weather.daily.temperature_2m_min[i];
                    const date    = new Date(weather.daily.time?.[i] || Date.now() + i * 86400000);
                    const dayName = ["SUN","MON","TUE","WED","THU","FRI","SAT"][date.getDay()];
                    const rain    = weather.daily.precipitation_sum?.[i] || 0;
                    const rainPct = weather.daily.precipitation_probability_max?.[i] || 0;
                    const isCold  = minT < 5;
                    const isHot   = maxT > 32;
                    return (
                      <View key={i} style={{
                        backgroundColor: C.surface, borderRadius: 8, borderWidth: 1,
                        borderColor: isCold ? C.blue : isHot ? C.red : C.border,
                        padding: 10, alignItems: "center", minWidth: 60,
                      }}>
                        <Text style={{ color: i === 0 ? C.green : C.grey, fontFamily: MONO, fontSize: 9 }}>
                          {i === 0 ? "TODAY" : dayName}
                        </Text>
                        <Text style={{ color: C.red, fontFamily: MONO, fontSize: 14, fontWeight: "bold", marginTop: 4 }}>
                          {Math.round(maxT)}°
                        </Text>
                        <Text style={{ color: C.blue, fontFamily: MONO, fontSize: 11 }}>
                          {Math.round(minT)}°
                        </Text>
                        {rainPct > 20 && (
                          <Text style={{ color: C.blue, fontFamily: MONO, fontSize: 9, marginTop: 3 }}>
                            💧{rainPct}%
                          </Text>
                        )}
                        {isCold && <Text style={{ color: C.blue, fontFamily: MONO, fontSize: 9, marginTop: 2 }}>❄️</Text>}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}

          {/* ── Growver callout ───────────────────────────────────────────────── */}
          {growverSynced && (
            <View style={{
              backgroundColor: C.greenFaint, borderRadius: 10, borderWidth: 1, borderColor: C.greenDim,
              padding: 14, marginBottom: 12, flexDirection: "row", alignItems: "flex-start", gap: 10,
            }}>
              <Text style={{ fontSize: 22, marginTop: 2 }}>🤖</Text>
              <View style={{ flex: 1 }}>
                <Label style={{ color: C.greenDim, marginBottom: 4 }}>GROWVER IS WEATHER-AWARE</Label>
                <Text style={{ color: C.white, fontFamily: MONO, fontSize: 12, lineHeight: 18 }}>
                  Tap the Growver button to ask outdoor growing questions — it knows your current conditions, season, daylight hours, and any active risks.
                </Text>
              </View>
            </View>
          )}

          {/* ── Upcoming features callout ─────────────────────────────────────── */}
          <View style={{
            backgroundColor: "#0d0d1a", borderRadius: 10, borderWidth: 1, borderColor: "#3a3a6a",
            padding: 14,
          }}>
            <Label style={{ color: "#8080c0", marginBottom: 6 }}>🚀 COMING SOON</Label>
            <Text style={{ color: "#a0a0d0", fontFamily: MONO, fontSize: 11, lineHeight: 18 }}>
              {"• Outdoor grow sim — grow a strain with real-time weather effects\n" +
               "• Sandbox mode — test different strains against any climate\n" +
               "• Frost alerts + harvest window notifications\n" +
               "• Strain recommendations based on your local climate\n" +
               "• Full subscription tier features"}
            </Text>
          </View>

        </ScrollView>
      )}
    </View>
  );
}
