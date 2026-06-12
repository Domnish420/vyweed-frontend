/**
 * GrowTimeline.jsx
 * Visual timeline graph of a grow's environment logs
 * Pure react-native-svg — no Victory Native needed
 *
 * Install: npx expo install react-native-svg
 *
 * Props:
 *   growId     — grow ID string
 *   strainName — display name
 *   onBack     — navigation callback
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Dimensions, Modal, Alert, StatusBar,
} from "react-native";
import Svg, { Line, Polyline, Circle, Rect, Text as SvgText } from "react-native-svg";

const { width: SW } = Dimensions.get("window");
import { getApiV1, BACKEND_HEADERS } from "./apiConfig";
const API_BASE = { toString: () => getApiV1() };

const C = {
  bg:          "#0a0f0a",
  surface:     "#0f150f",
  card:        "#141a13",
  border:      "#2a3d2e",
  green:       "#4d7358",
  greenFaint:  "#1a2d1f",
  greenDim:    "#3a5c44",
  greenBright: "#6db87f",
  amber:       "#c17a4a",
  red:         "#a83030",
  blue:        "#5b9bd5",
  purple:      "#8b6abf",
  white:       "#e8e4d9",
  grey:        "#4a5a4a",
  greyLight:   "#8a9e8c",
};

const HEADING   = "BebasNeue_400Regular";
const SANS      = "SpaceGrotesk_400Regular";
const SANS_MED  = "SpaceGrotesk_500Medium";
const SANS_BOLD = "SpaceGrotesk_700Bold";
const MONO      = SANS;

const SERIES = [
  { key: "temp_day", label: "Temp",     colour: C.red,    unit: "°C",    ideal: [22, 27], min: 15, max: 35 },
  { key: "humidity", label: "Humidity", colour: C.blue,   unit: "%",     ideal: [45, 65], min: 20, max: 90 },
  { key: "ph",       label: "pH",       colour: C.green,  unit: "",      ideal: [6.0, 6.5], min: 5, max: 7.5 },
  { key: "ec",       label: "EC",       colour: C.amber,  unit: "",      ideal: [0.8, 2.0], min: 0, max: 3 },
];

function Label({ children, style }) {
  return (
    <Text style={[{ color: C.greyLight, fontFamily: HEADING, fontSize: 12,
      letterSpacing: 2, textTransform: "uppercase" }, style]}>
      {children}
    </Text>
  );
}

// ── Pure SVG Line Chart ───────────────────────────────────────────────────────
function LineChart({ data, series, width, height = 160 }) {
  const PAD = { top: 12, bottom: 28, left: 38, right: 12 };
  const W = width - PAD.left - PAD.right;
  const H = height - PAD.top - PAD.bottom;

  if (!data || data.length < 2) return null;

  const xMin = Math.min(...data.map(d => d.x));
  const xMax = Math.max(...data.map(d => d.x));
  const yMin = series.min;
  const yMax = series.max;

  const px = x => PAD.left + ((x - xMin) / (xMax - xMin || 1)) * W;
  const py = y => PAD.top + H - ((y - yMin) / (yMax - yMin || 1)) * H;

  const points = data.map(d => `${px(d.x)},${py(d.y)}`).join(" ");

  // Ideal range y positions
  const idealLo = py(series.ideal[0]);
  const idealHi = py(series.ideal[1]);

  // X axis labels — show first, middle, last day
  const xLabels = [data[0], data[Math.floor(data.length / 2)], data[data.length - 1]];

  return (
    <Svg width={width} height={height}>
      {/* Background */}
      <Rect x={0} y={0} width={width} height={height} fill={C.card} />

      {/* Ideal range band */}
      <Rect
        x={PAD.left} y={Math.min(idealHi, idealLo)}
        width={W} height={Math.abs(idealHi - idealLo)}
        fill={series.colour} opacity={0.08}
      />

      {/* Ideal range dashed lines */}
      {[idealLo, idealHi].map((y, i) => (
        <Line key={i} x1={PAD.left} y1={y} x2={PAD.left + W} y2={y}
          stroke={series.colour} strokeWidth={1} strokeDasharray="4,4" opacity={0.4} />
      ))}

      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((t, i) => (
        <Line key={i}
          x1={PAD.left} y1={PAD.top + H * t}
          x2={PAD.left + W} y2={PAD.top + H * t}
          stroke={C.border} strokeWidth={1} />
      ))}

      {/* Y axis */}
      <Line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + H}
        stroke={C.border} strokeWidth={1} />

      {/* X axis */}
      <Line x1={PAD.left} y1={PAD.top + H} x2={PAD.left + W} y2={PAD.top + H}
        stroke={C.border} strokeWidth={1} />

      {/* Y axis labels */}
      {[yMin, (yMin + yMax) / 2, yMax].map((v, i) => (
        <SvgText key={i}
          x={PAD.left - 4}
          y={py(v) + 3}
          fill={C.greyLight} fontSize={8}
          fontFamily={MONO} textAnchor="end">
          {v % 1 === 0 ? v : v.toFixed(1)}
        </SvgText>
      ))}

      {/* X axis labels */}
      {xLabels.map((d, i) => (
        <SvgText key={i}
          x={px(d.x)}
          y={PAD.top + H + 16}
          fill={C.greyLight} fontSize={8}
          fontFamily={MONO} textAnchor="middle">
          D{d.x}
        </SvgText>
      ))}

      {/* Data line */}
      <Polyline points={points} fill="none"
        stroke={series.colour} strokeWidth={2} strokeLinejoin="round" />

      {/* Data dots */}
      {data.map((d, i) => (
        <Circle key={i} cx={px(d.x)} cy={py(d.y)} r={3}
          fill={series.colour} />
      ))}

      {/* Ideal range label */}
      <SvgText
        x={PAD.left + W - 2} y={Math.min(idealHi, idealLo) - 3}
        fill={series.colour} fontSize={7} textAnchor="end" opacity={0.7}>
        ideal {series.ideal[0]}–{series.ideal[1]}{series.unit}
      </SvgText>
    </Svg>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, unit, colour, ideal }) {
  const inRange = ideal && value != null && value >= ideal[0] && value <= ideal[1];
  const statusCol = value == null ? C.grey : inRange ? C.green : C.amber;
  return (
    <View style={{ flex: 1, backgroundColor: C.surface, borderRadius: 8,
      borderWidth: 1, borderColor: C.border, padding: 10, alignItems: "center" }}>
      <Label style={{ fontSize: 8 }}>{label}</Label>
      <Text style={{ color: colour, fontFamily: HEADING,
        fontSize: 20, marginTop: 4 }}>
        {value != null ? `${value}${unit}` : "—"}
      </Text>
      {ideal && value != null && (
        <Text style={{ color: statusCol, fontFamily: MONO, fontSize: 8, marginTop: 2 }}>
          {inRange ? "✓ OK" : "⚠ CHECK"}
        </Text>
      )}
    </View>
  );
}

// ── Log row ───────────────────────────────────────────────────────────────────
function LogRow({ log, onPress }) {
  const hasData = log.temp_day || log.humidity || log.ph || log.ec;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View style={{ backgroundColor: C.card, borderRadius: 6,
        borderWidth: 1, borderColor: C.border, padding: 10, marginBottom: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ backgroundColor: C.greenFaint, borderRadius: 12,
              paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: C.green, fontFamily: HEADING, fontSize: 11 }}>
                Day {log.day}
              </Text>
            </View>
            <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>{log.date}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {log.temp_day != null && <Text style={{ color: C.red, fontFamily: MONO, fontSize: 10 }}>{log.temp_day}°</Text>}
            {log.humidity != null && <Text style={{ color: C.blue, fontFamily: MONO, fontSize: 10 }}>{log.humidity}%</Text>}
            {log.ph != null && <Text style={{ color: C.green, fontFamily: MONO, fontSize: 10 }}>pH{log.ph}</Text>}
            {log.ec != null && <Text style={{ color: C.amber, fontFamily: MONO, fontSize: 10 }}>EC{log.ec}</Text>}
            {!hasData && <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>no readings</Text>}
          </View>
        </View>
        {log.notes && (
          <Text style={{ color: C.greyLight, fontFamily: MONO, fontSize: 10, marginTop: 4 }} numberOfLines={1}>
            📝 {log.notes}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Log detail modal ──────────────────────────────────────────────────────────
function LogDetailModal({ log, onClose }) {
  if (!log) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20,
          borderTopRightRadius: 20, borderTopWidth: 2, borderColor: C.greenBright, paddingBottom: 40 }}>
          <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2 }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between",
            alignItems: "center", paddingHorizontal: 16, paddingBottom: 12,
            borderBottomWidth: 1, borderColor: C.border }}>
            <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 20, letterSpacing: 1 }}>
              DAY {log.day} — {log.date}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ padding: 16 }}>
            {SERIES.map(s => {
              const val = log[s.key];
              if (val == null) return null;
              const inRange = val >= s.ideal[0] && val <= s.ideal[1];
              return (
                <View key={s.key} style={{ flexDirection: "row", justifyContent: "space-between",
                  alignItems: "center", paddingVertical: 12,
                  borderBottomWidth: 1, borderColor: C.border }}>
                  <View>
                    <Text style={{ color: s.colour, fontFamily: SANS_MED, fontSize: 13 }}>
                      {s.label}
                    </Text>
                    <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
                      Ideal: {s.ideal[0]}–{s.ideal[1]}{s.unit}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: s.colour, fontFamily: SANS_MED, fontSize: 22 }}>
                      {val}{s.unit}
                    </Text>
                    <Text style={{ color: inRange ? C.green : C.amber, fontFamily: MONO, fontSize: 10 }}>
                      {inRange ? "✓ IN RANGE" : "⚠ OUT OF RANGE"}
                    </Text>
                  </View>
                </View>
              );
            })}
            {log.notes && (
              <View style={{ marginTop: 12, backgroundColor: C.surface, borderRadius: 8, padding: 12 }}>
                <Label style={{ marginBottom: 4 }}>NOTES</Label>
                <Text style={{ color: C.white, fontFamily: MONO, fontSize: 13, lineHeight: 19 }}>
                  {log.notes}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function GrowTimeline({ growId, strainName, onBack }) {
  const [timeline, setTimeline]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState("chart");
  const [activeSeries, setActiveSeries] = useState(["temp_day", "humidity"]);
  const [selectedLog, setSelectedLog]   = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/tracker/grows/${growId}/timeline`, { headers: BACKEND_HEADERS })
      .then(r => r.json())
      .then(setTimeline)
      .catch(e => Alert.alert("Error", e.message))
      .finally(() => setLoading(false));
  }, [growId]);

  const chartData = useMemo(() => {
    if (!timeline?.logs) return {};
    const data = {};
    SERIES.forEach(s => {
      data[s.key] = timeline.logs
        .filter(l => l[s.key] != null)
        .map(l => ({ x: l.day, y: l[s.key] }));
    });
    return data;
  }, [timeline]);

  const latest = timeline?.logs?.length
    ? timeline.logs[timeline.logs.length - 1]
    : {};

  const toggleSeries = key =>
    setActiveSeries(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.green} size="large" />
        <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 20, letterSpacing: 2, marginTop: 12 }}>
          LOADING TIMELINE...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 52, paddingBottom: 12,
        borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.card }}>
        <TouchableOpacity onPress={onBack} style={{ marginBottom: 8 }}>
          <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 16, letterSpacing: 1.5 }}>← BACK</Text>
        </TouchableOpacity>
        <Text style={{ color: C.white, fontFamily: HEADING, fontSize: 24, letterSpacing: 1 }}>
          {strainName}
        </Text>
        <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 11, marginTop: 2 }}>
          GROW TIMELINE · Day {timeline?.current_day} · {timeline?.log_count} logs
        </Text>
      </View>

      {/* Latest readings */}
      <View style={{ padding: 10, flexDirection: "row", gap: 8,
        borderBottomWidth: 1, borderColor: C.border }}>
        {SERIES.map(s => (
          <StatCard key={s.key} label={s.label}
            value={latest[s.key] ?? null} unit={s.unit}
            colour={s.colour} ideal={s.ideal} />
        ))}
      </View>

      {/* Tab bar */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: C.border }}>
        {[["chart", "📈 CHART"], ["logs", "📋 LOGS"]].map(([tab, label]) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
            style={{ flex: 1, paddingVertical: 12, alignItems: "center",
              borderBottomWidth: 2, borderColor: activeTab === tab ? C.greenBright : "transparent" }}>
            <Text style={{ color: activeTab === tab ? C.greenBright : C.grey, fontFamily: HEADING, fontSize: 14, letterSpacing: 1.5 }}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart tab */}
      {activeTab === "chart" && (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

          {/* Series toggles */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 }}>
            {SERIES.map(s => (
              <TouchableOpacity key={s.key} onPress={() => toggleSeries(s.key)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6,
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
                  borderColor: activeSeries.includes(s.key) ? s.colour : C.border,
                  backgroundColor: activeSeries.includes(s.key) ? `${s.colour}20` : C.surface }}>
                <View style={{ width: 10, height: 10, borderRadius: 5,
                  backgroundColor: activeSeries.includes(s.key) ? s.colour : C.grey }} />
                <Text style={{ color: activeSeries.includes(s.key) ? s.colour : C.grey,
                  fontFamily: MONO, fontSize: 11 }}>
                  {s.label} {s.unit}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Charts */}
          {activeSeries.length > 0 ? (
            activeSeries.map(seriesKey => {
              const s = SERIES.find(s => s.key === seriesKey);
              const data = chartData[seriesKey];
              if (!data || data.length < 2) return (
                <View key={seriesKey} style={{ marginHorizontal: 12, marginBottom: 12,
                  backgroundColor: C.card, borderRadius: 8, borderWidth: 1,
                  borderColor: C.border, padding: 16, alignItems: "center" }}>
                  <Text style={{ color: s.colour, fontFamily: SANS_MED, fontSize: 12 }}>
                    {s.label}
                  </Text>
                  <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 11, marginTop: 6 }}>
                    Need 2+ check-ins to show chart
                  </Text>
                </View>
              );
              return (
                <View key={seriesKey} style={{ marginHorizontal: 12, marginBottom: 12,
                  borderRadius: 8, overflow: "hidden",
                  borderWidth: 1, borderColor: C.border }}>
                  <View style={{ backgroundColor: C.surface, paddingHorizontal: 12,
                    paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.colour }} />
                    <Text style={{ color: s.colour, fontFamily: SANS_MED, fontSize: 11 }}>
                      {s.label} {s.unit && `(${s.unit})`}
                    </Text>
                    <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 9 }}>
                      — ideal {s.ideal[0]}–{s.ideal[1]}{s.unit}
                    </Text>
                  </View>
                  <LineChart
                    data={data}
                    series={s}
                    width={SW - 24}
                    height={180}
                  />
                </View>
              );
            })
          ) : (
            <View style={{ margin: 16, backgroundColor: C.card, borderRadius: 10,
              borderWidth: 1, borderColor: C.border, padding: 30, alignItems: "center" }}>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 12 }}>
                Select a series above to show its chart
              </Text>
            </View>
          )}

          {/* How to read */}
          <View style={{ marginHorizontal: 12, backgroundColor: C.greenFaint,
            borderRadius: 8, borderWidth: 1, borderColor: C.greenDim, padding: 14 }}>
            <Label style={{ color: C.greenDim, marginBottom: 6 }}>HOW TO READ THIS CHART</Label>
            <Text style={{ color: C.white, fontFamily: MONO, fontSize: 12, lineHeight: 18 }}>
              Each dot = one check-in you logged. The solid line connects your readings over time.{"\n\n"}
              The dashed lines show your ideal target range. You want your solid line to stay between the two dashed lines at all times.{"\n\n"}
              The shaded band between the dashed lines is the safe zone.
            </Text>
          </View>

        </ScrollView>
      )}

      {/* Logs tab */}
      {activeTab === "logs" && (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {!timeline?.logs?.length ? (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Text style={{ fontSize: 36 }}>📋</Text>
              <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 20, letterSpacing: 2, marginTop: 12 }}>
                NO LOGS YET
              </Text>
              <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 12, marginTop: 6 }}>
                Start logging daily check-ins to see history here
              </Text>
            </View>
          ) : (
            [...(timeline.logs)].reverse().map((log, i) => (
              <LogRow key={i} log={log} onPress={() => setSelectedLog(log)} />
            ))
          )}
        </ScrollView>
      )}

      <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </View>
  );
}
