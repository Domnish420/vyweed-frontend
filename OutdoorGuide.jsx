/**
 * OutdoorGuide.jsx
 * Weather + season integration for outdoor growers
 * Uses device location + Open-Meteo (free, no API key needed)
 * Tells you: is it the right time to plant? When to harvest?
 * What are the current risks?
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Alert,
} from "react-native";

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
    <Text style={[{ color: C.greyLight, fontFamily: MONO,
      fontSize: 10, letterSpacing: 1.5 }, style]}>
      {children}
    </Text>
  );
}

// ── Season logic ──────────────────────────────────────────────────────────────
function getSeason(month, isNorthern) {
  // Month is 1-12
  if (isNorthern) {
    if (month >= 3 && month <= 5)  return "spring";
    if (month >= 6 && month <= 8)  return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
  } else {
    // Southern hemisphere — reversed
    if (month >= 9 && month <= 11) return "spring";
    if (month >= 12 || month <= 2) return "summer";
    if (month >= 3 && month <= 5)  return "autumn";
    return "winter";
  }
}

function getGrowingAdvice(month, season, lat, weather) {
  const isNorthern = lat >= 0;
  const temp = weather?.current?.temperature_2m;
  const humidity = weather?.current?.relative_humidity_2m;
  const windspeed = weather?.current?.wind_speed_10m;

  let planting, harvest, risks, tip;

  if (isNorthern) {
    // Northern hemisphere growing calendar
    if (month >= 4 && month <= 5) {
      planting = { status: "good", label: "GOOD TIME TO PLANT",
        colour: C.green,
        desc: "Spring is ideal for starting outdoor plants. Days are getting longer, risk of frost reducing. Start seeds indoors now and transplant after last frost." };
    } else if (month === 3) {
      planting = { status: "early", label: "A BIT EARLY",
        colour: C.amber,
        desc: "March can work in mild climates but frost risk is still present. Start seeds indoors and wait until nights stay above 10°C consistently." };
    } else if (month >= 6 && month <= 7) {
      planting = { status: "late", label: "LATE BUT POSSIBLE",
        colour: C.amber,
        desc: "June/July planting is late but works with autoflowers. Photoperiod strains won't have enough veg time before autumn triggers flowering." };
    } else if (month >= 8 && month <= 10) {
      planting = { status: "flowering", label: "PLANTS SHOULD BE FLOWERING",
        colour: "#ff8c30",
        desc: "August-October is harvest season in the northern hemisphere. If you're planting now, autoflowers only — they can finish in 10 weeks." };
    } else {
      planting = { status: "bad", label: "NOT PLANTING SEASON",
        colour: C.red,
        desc: "Winter months are not suitable for outdoor growing. Plan for spring — start seeds indoors in March." };
    }

    // Harvest window
    if (month >= 9 && month <= 10) {
      harvest = { label: "HARVEST SEASON", colour: "#ffd700",
        desc: "September-October is peak harvest time for northern hemisphere outdoor grows. Check trichomes daily." };
    } else if (month === 8) {
      harvest = { label: "APPROACHING HARVEST", colour: C.amber,
        desc: "Late August — early finishing strains may be ready. Most strains harvest September-October." };
    } else if (month >= 4 && month <= 7) {
      harvest = { label: "GROWING SEASON", colour: C.green,
        desc: "Plants are in growth phase. Harvest is months away." };
    } else {
      harvest = { label: "OFF SEASON", colour: C.grey,
        desc: "Not harvest season. Plan your spring grow." };
    }

    risks = [];
    if (temp !== undefined) {
      if (temp < 5)  risks.push({ level: "critical", text: "⚠️ Frost risk — temperatures near or below freezing. Cannabis dies below 0°C." });
      if (temp < 10) risks.push({ level: "warning",  text: "🌡 Cold stress risk — below 10°C slows growth significantly and can cause purple discolouration." });
      if (temp > 32) risks.push({ level: "warning",  text: "🔥 Heat stress risk — above 32°C causes wilting, bleaching, and reduced terpene production." });
    }
    if (humidity !== undefined) {
      if (humidity > 80) risks.push({ level: "warning", text: "💧 High humidity — mould risk if plants are in late flower. Ensure airflow." });
      if (humidity < 30) risks.push({ level: "info",    text: "🏜 Very dry air — increase watering frequency and consider mulching." });
    }
    if (windspeed !== undefined && windspeed > 40) {
      risks.push({ level: "warning", text: "💨 Strong winds — stake your plants to prevent stem damage." });
    }

    tip = month >= 4 && month <= 7
      ? "Outdoor photoperiod plants will veg until late summer then flower as days shorten naturally. No light schedule management needed."
      : month >= 8 && month <= 10
      ? "Check trichomes under a 60x loupe — cloudy white = peak THC, amber = more sedating. Harvest before first frost."
      : "Use the winter months to research strains, set up your grow space, and order seeds for spring.";

  } else {
    // Southern hemisphere — similar logic but reversed months
    if (month >= 10 && month <= 11) {
      planting = { status: "good", label: "GOOD TIME TO PLANT", colour: C.green,
        desc: "Spring in the southern hemisphere. Ideal planting window — days getting longer, frost risk reducing." };
    } else if (month >= 3 && month <= 4) {
      planting = { status: "flowering", label: "PLANTS SHOULD BE FLOWERING", colour: "#ff8c30",
        desc: "Autumn in the southern hemisphere. Photoperiod plants are in flower. Autoflowers still possible." };
    } else if (month >= 5 && month <= 8) {
      planting = { status: "bad", label: "WINTER — NOT PLANTING SEASON", colour: C.red,
        desc: "Southern hemisphere winter. Plan for spring (October onwards)." };
    } else {
      planting = { status: "late", label: "LATE SUMMER — AUTOFLOWERS ONLY", colour: C.amber,
        desc: "Late summer — autoflowers can still complete a cycle before autumn." };
    }
    harvest = month >= 3 && month <= 5
      ? { label: "HARVEST SEASON", colour: "#ffd700", desc: "Autumn harvest in the southern hemisphere. Check trichomes daily." }
      : { label: "GROWING SEASON", colour: C.green, desc: "Plants are growing or planning phase." };
    risks = [];
    tip = "Southern hemisphere growers follow the same principles but reversed — plant in spring (October), harvest in autumn (March-May).";
  }

  return { planting, harvest, risks, tip };
}

// ── Sunrise/sunset estimator ──────────────────────────────────────────────────
function getDaylightHours(lat, month) {
  // Simplified daylight calculation
  const P = Math.asin(0.39795 * Math.cos(0.2163108 + 2 * Math.atan(0.9671396 * Math.tan(0.00860 * (month * 30 - 186)))));
  const hours = 24 - (24 / Math.PI) * Math.acos(
    (Math.sin(0.8333 * Math.PI / 180) + Math.sin(lat * Math.PI / 180) * Math.sin(P)) /
    (Math.cos(lat * Math.PI / 180) * Math.cos(P))
  );
  return isNaN(hours) ? 12 : Math.round(hours * 10) / 10;
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function OutdoorGuide({ onBack }) {
  const [location, setLocation] = useState(null);
  const [weather, setWeather]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    getLocationAndWeather();
  }, []);

  const getLocationAndWeather = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get location
      const geo = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000, maximumAge: 300000,
        });
      });

      const { latitude, longitude } = geo.coords;
      setLocation({ lat: latitude, lon: longitude });

      // Fetch weather from Open-Meteo (free, no API key)
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&daily=sunrise,sunset,precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`;

      const res = await fetch(weatherUrl);
      const data = await res.json();
      setWeather(data);

    } catch (e) {
      setError(e.message || "Could not get location");
    } finally {
      setLoading(false);
    }
  };

  const month = new Date().getMonth() + 1;
  const isNorthern = location ? location.lat >= 0 : true;
  const season = getSeason(month, isNorthern);
  const advice = location ? getGrowingAdvice(month, season, location.lat, weather) : null;
  const daylightHours = location ? getDaylightHours(location.lat, month) : null;

  const SEASON_ICONS = { spring: "🌱", summer: "☀️", autumn: "🍂", winter: "❄️" };
  const SEASON_COLS  = { spring: C.green, summer: C.amber, autumn: "#ff8c30", winter: C.blue };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 16 : 52,
        paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border }}>
        <TouchableOpacity onPress={onBack} style={{ marginBottom: 8 }}>
          <Text style={{ color: C.green, fontFamily: MONO, fontSize: 14 }}>← BACK</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", justifyContent: "space-between",
          alignItems: "flex-end" }}>
          <View>
            <Text style={{ color: C.white, fontFamily: MONO,
              fontSize: 20, fontWeight: "bold" }}>
              OUTDOOR GUIDE
            </Text>
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11, marginTop: 2 }}>
              Season + weather advice for outdoor grows
            </Text>
          </View>
          <TouchableOpacity onPress={getLocationAndWeather}
            style={{ backgroundColor: C.surface, borderRadius: 6,
              borderWidth: 1, borderColor: C.border,
              paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ color: C.green, fontFamily: MONO, fontSize: 11 }}>↻ REFRESH</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={C.green} size="large" />
          <Text style={{ color: C.grey, fontFamily: MONO,
            fontSize: 12, marginTop: 12 }}>
            GETTING YOUR LOCATION...
          </Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center",
          padding: 32 }}>
          <Text style={{ fontSize: 48 }}>📍</Text>
          <Text style={{ color: C.red, fontFamily: MONO,
            fontSize: 14, fontWeight: "bold", marginTop: 16 }}>
            LOCATION UNAVAILABLE
          </Text>
          <Text style={{ color: C.grey, fontFamily: MONO,
            fontSize: 12, marginTop: 8, textAlign: "center", lineHeight: 18 }}>
            {error}{"\n\n"}Allow location access to get outdoor growing advice for your area.
          </Text>
          <TouchableOpacity onPress={getLocationAndWeather}
            style={{ marginTop: 20, backgroundColor: C.greenFaint,
              borderRadius: 8, borderWidth: 1, borderColor: C.green,
              paddingHorizontal: 24, paddingVertical: 12 }}>
            <Text style={{ color: C.green, fontFamily: MONO, fontSize: 13 }}>
              TRY AGAIN
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

          {/* Current conditions */}
          {weather?.current && (
            <View style={{ backgroundColor: C.card, borderRadius: 10,
              borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 12 }}>
              <Label style={{ marginBottom: 10 }}>CURRENT CONDITIONS</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {[
                  { label: "TEMP", value: `${weather.current.temperature_2m}°C`, colour: C.red },
                  { label: "HUMIDITY", value: `${weather.current.relative_humidity_2m}%`, colour: C.blue },
                  { label: "WIND", value: `${weather.current.wind_speed_10m}km/h`, colour: C.greyLight },
                  { label: "DAYLIGHT", value: `${daylightHours}h`, colour: C.amber },
                ].map(({ label, value, colour }) => (
                  <View key={label} style={{ backgroundColor: C.surface, borderRadius: 8,
                    borderWidth: 1, borderColor: C.border, padding: 12,
                    alignItems: "center", minWidth: 70, flex: 1 }}>
                    <Label style={{ fontSize: 8 }}>{label}</Label>
                    <Text style={{ color: colour, fontFamily: MONO,
                      fontSize: 18, fontWeight: "bold", marginTop: 4 }}>
                      {value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Season */}
          <View style={{ backgroundColor: `${SEASON_COLS[season]}15`, borderRadius: 10,
            borderWidth: 1, borderColor: SEASON_COLS[season],
            padding: 16, marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 32 }}>{SEASON_ICONS[season]}</Text>
              <View>
                <Text style={{ color: SEASON_COLS[season], fontFamily: MONO,
                  fontSize: 20, fontWeight: "bold" }}>
                  {season.toUpperCase()}
                </Text>
                <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 11 }}>
                  {isNorthern ? "Northern" : "Southern"} hemisphere ·{" "}
                  {daylightHours}h daylight
                </Text>
              </View>
            </View>
            {daylightHours && (
              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between",
                  marginBottom: 4 }}>
                  <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
                    0h
                  </Text>
                  <Text style={{ color: daylightHours >= 14 ? C.green
                    : daylightHours >= 12 ? C.amber : C.red,
                    fontFamily: MONO, fontSize: 11, fontWeight: "bold" }}>
                    {daylightHours}h daylight
                    {daylightHours >= 14 ? " — VEGE ZONE"
                      : daylightHours >= 12 ? " — TRANSITION"
                      : " — FLOWER TRIGGER"}
                  </Text>
                  <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>24h</Text>
                </View>
                <View style={{ height: 8, backgroundColor: C.border,
                  borderRadius: 4, overflow: "hidden" }}>
                  <View style={{ width: `${(daylightHours / 24) * 100}%`,
                    height: 8, backgroundColor: SEASON_COLS[season], borderRadius: 4 }} />
                </View>
                <Text style={{ color: C.grey, fontFamily: MONO,
                  fontSize: 10, marginTop: 6 }}>
                  Cannabis flowers when daylight drops below 14h. &lt;12h = full flower trigger.
                </Text>
              </View>
            )}
          </View>

          {/* Planting advice */}
          {advice?.planting && (
            <View style={{ backgroundColor: `${advice.planting.colour}15`, borderRadius: 10,
              borderWidth: 1, borderColor: advice.planting.colour,
              padding: 16, marginBottom: 12 }}>
              <Label style={{ color: advice.planting.colour, marginBottom: 6 }}>
                PLANTING ADVICE
              </Label>
              <Text style={{ color: advice.planting.colour, fontFamily: MONO,
                fontSize: 16, fontWeight: "bold", marginBottom: 8 }}>
                {advice.planting.label}
              </Text>
              <Text style={{ color: C.white, fontFamily: MONO,
                fontSize: 13, lineHeight: 20 }}>
                {advice.planting.desc}
              </Text>
            </View>
          )}

          {/* Harvest advice */}
          {advice?.harvest && (
            <View style={{ backgroundColor: `${advice.harvest.colour}15`, borderRadius: 10,
              borderWidth: 1, borderColor: advice.harvest.colour,
              padding: 16, marginBottom: 12 }}>
              <Label style={{ color: advice.harvest.colour, marginBottom: 6 }}>
                HARVEST STATUS
              </Label>
              <Text style={{ color: advice.harvest.colour, fontFamily: MONO,
                fontSize: 16, fontWeight: "bold", marginBottom: 8 }}>
                {advice.harvest.label}
              </Text>
              <Text style={{ color: C.white, fontFamily: MONO,
                fontSize: 13, lineHeight: 20 }}>
                {advice.harvest.desc}
              </Text>
            </View>
          )}

          {/* Risks */}
          {advice?.risks?.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Label style={{ marginBottom: 8 }}>CURRENT RISKS</Label>
              {advice.risks.map((risk, i) => (
                <View key={i} style={{ backgroundColor: risk.level === "critical" ? "#3d0000"
                  : risk.level === "warning" ? "#2a1a00" : C.surface,
                  borderRadius: 8, borderWidth: 1,
                  borderColor: risk.level === "critical" ? C.red
                    : risk.level === "warning" ? C.amber : C.border,
                  padding: 12, marginBottom: 8 }}>
                  <Text style={{ color: risk.level === "critical" ? C.red
                    : risk.level === "warning" ? C.amber : C.greyLight,
                    fontFamily: MONO, fontSize: 12, lineHeight: 18 }}>
                    {risk.text}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* 7-day forecast mini */}
          {weather?.daily && (
            <View style={{ backgroundColor: C.card, borderRadius: 10,
              borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 }}>
              <Label style={{ marginBottom: 10 }}>7-DAY FORECAST</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {weather.daily.temperature_2m_max.map((maxTemp, i) => {
                    const minTemp = weather.daily.temperature_2m_min[i];
                    const date = new Date(weather.daily.time?.[i] || Date.now() + i * 86400000);
                    const day = ["SUN","MON","TUE","WED","THU","FRI","SAT"][date.getDay()];
                    const rain = weather.daily.precipitation_sum?.[i] || 0;
                    const isCold = minTemp < 5;
                    const isHot  = maxTemp > 32;
                    return (
                      <View key={i} style={{ backgroundColor: C.surface, borderRadius: 8,
                        borderWidth: 1, borderColor: isCold ? C.blue : isHot ? C.red : C.border,
                        padding: 10, alignItems: "center", minWidth: 56 }}>
                        <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9 }}>
                          {day}
                        </Text>
                        <Text style={{ color: C.red, fontFamily: MONO,
                          fontSize: 13, fontWeight: "bold", marginTop: 4 }}>
                          {Math.round(maxTemp)}°
                        </Text>
                        <Text style={{ color: C.blue, fontFamily: MONO, fontSize: 11 }}>
                          {Math.round(minTemp)}°
                        </Text>
                        {rain > 0 && (
                          <Text style={{ color: C.blue, fontFamily: MONO, fontSize: 9, marginTop: 2 }}>
                            💧{rain.toFixed(0)}mm
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Tip */}
          {advice?.tip && (
            <View style={{ backgroundColor: C.greenFaint, borderRadius: 8,
              borderWidth: 1, borderColor: C.greenDim, padding: 14 }}>
              <Label style={{ color: C.greenDim, marginBottom: 6 }}>💡 SEASONAL TIP</Label>
              <Text style={{ color: C.white, fontFamily: MONO,
                fontSize: 13, lineHeight: 20 }}>
                {advice.tip}
              </Text>
            </View>
          )}

        </ScrollView>
      )}
    </View>
  );
}
