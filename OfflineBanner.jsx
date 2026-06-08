/**
 * OfflineBanner.jsx
 * Shows when the app is running from cached data
 * Import and drop into any screen that fetches from the API
 *
 * Usage:
 *   import OfflineBanner from './OfflineBanner'
 *   <OfflineBanner visible={!online} cachedAt={cacheTimestamp} />
 */

import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Platform, TouchableOpacity } from "react-native";

const MONO = Platform.select({ ios: "Courier New", android: "monospace" });

export default function OfflineBanner({ visible, cachedAt, onRetry }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const formatAge = (ts) => {
    if (!ts) return "";
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1)  return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  if (!visible) return null;

  return (
    <Animated.View style={{ opacity: anim }}>
      <View style={{
        backgroundColor: "#1a0a00",
        borderBottomWidth: 1,
        borderColor: "#ffb830",
        paddingVertical: 8,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <Text style={{ fontSize: 14 }}>📵</Text>
          <View>
            <Text style={{ color: "#ffb830", fontFamily: MONO,
              fontSize: 11, fontWeight: "bold" }}>
              OFFLINE — SHOWING CACHED DATA
            </Text>
            {cachedAt && (
              <Text style={{ color: "#4a5a4a", fontFamily: MONO, fontSize: 9 }}>
                Last updated {formatAge(cachedAt)}
              </Text>
            )}
          </View>
        </View>
        {onRetry && (
          <TouchableOpacity onPress={onRetry}
            style={{
              backgroundColor: "#2a1a00",
              borderWidth: 1, borderColor: "#ffb830",
              borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5,
            }}>
            <Text style={{ color: "#ffb830", fontFamily: MONO,
              fontSize: 10, fontWeight: "bold" }}>
              RETRY
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}
