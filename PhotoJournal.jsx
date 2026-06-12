/**
 * PhotoJournal.jsx
 * Photo journal for grow check-ins
 * Attach 1-3 photos per check-in
 * Stored locally via expo-file-system
 * Displayed in grow timeline
 *
 * Install: npx expo install expo-image-picker expo-file-system
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, Image, Modal,
  ScrollView, Alert, Platform, ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";

const HEADING   = "BebasNeue_400Regular";
const SANS      = "SpaceGrotesk_400Regular";
const SANS_MED  = "SpaceGrotesk_500Medium";
const SANS_BOLD = "SpaceGrotesk_700Bold";
const MONO      = SANS;
const PHOTO_DIR = FileSystem.documentDirectory + "vyweed_photos/";
const MAX_PHOTOS = 3;

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

// ── Ensure photo directory exists ─────────────────────────────────────────────
async function ensureDir() {
  const info = await FileSystem.getInfoAsync(PHOTO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
  }
}

// ── Save photo to local storage ───────────────────────────────────────────────
export async function savePhoto(uri, growId, day) {
  await ensureDir();
  const filename = `${growId}_day${day}_${Date.now()}.jpg`;
  const dest = PHOTO_DIR + filename;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return filename;
}

// ── Delete photo ──────────────────────────────────────────────────────────────
export async function deletePhoto(filename) {
  try {
    await FileSystem.deleteAsync(PHOTO_DIR + filename, { idempotent: true });
  } catch {}
}

// ── Get photo URI from filename ───────────────────────────────────────────────
export function getPhotoUri(filename) {
  return PHOTO_DIR + filename;
}

// ── Photo picker ──────────────────────────────────────────────────────────────
export async function pickPhoto(source = "library") {
  // Request permissions
  if (source === "camera") {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access is needed to take photos.");
      return null;
    }
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Photo library access is needed.");
      return null;
    }
  }

  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],
      })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsMultipleSelection: false,
      });

  if (result.canceled) return null;
  return result.assets[0].uri;
}

// ── Photo source picker modal ─────────────────────────────────────────────────
function PhotoSourceModal({ visible, onSelect, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide"
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)",
        justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20,
          borderTopRightRadius: 20, borderTopWidth: 2, borderColor: C.greenBright,
          padding: 20, paddingBottom: 40 }}>
          <Text style={{ color: C.white, fontFamily: HEADING,
            fontSize: 14, letterSpacing: 2, marginBottom: 16,
            textAlign: "center" }}>
            ADD PHOTO
          </Text>
          <TouchableOpacity onPress={() => { onSelect("camera"); onClose(); }}
            style={{ backgroundColor: C.greenFaint, borderRadius: 10,
              borderWidth: 1, borderColor: C.greenBright, padding: 16,
              alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontSize: 28 }}>📷</Text>
            <Text style={{ color: C.greenBright, fontFamily: HEADING,
              fontSize: 14, letterSpacing: 2, marginTop: 6 }}>
              TAKE PHOTO
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { onSelect("library"); onClose(); }}
            style={{ backgroundColor: C.surface, borderRadius: 10,
              borderWidth: 1, borderColor: C.border, padding: 16,
              alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontSize: 28 }}>🖼</Text>
            <Text style={{ color: C.white, fontFamily: HEADING,
              fontSize: 14, letterSpacing: 2, marginTop: 6 }}>
              CHOOSE FROM GALLERY
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}
            style={{ padding: 12, alignItems: "center" }}>
            <Text style={{ color: C.grey, fontFamily: HEADING, fontSize: 13, letterSpacing: 2 }}>
              CANCEL
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Full screen photo viewer ──────────────────────────────────────────────────
function PhotoViewer({ uri, visible, onClose, onDelete }) {
  return (
    <Modal visible={visible} transparent animationType="fade"
      onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000",
        alignItems: "center", justifyContent: "center" }}>
        <TouchableOpacity onPress={onClose}
          style={{ position: "absolute", top: 50, right: 20,
            zIndex: 10, padding: 10 }}>
          <Text style={{ color: "#fff", fontSize: 28 }}>✕</Text>
        </TouchableOpacity>
        {uri && (
          <Image source={{ uri }}
            style={{ width: "100%", height: "80%" }}
            resizeMode="contain"
          />
        )}
        {onDelete && (
          <TouchableOpacity onPress={() => {
            Alert.alert("Delete Photo", "Remove this photo from the journal?",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => {
                  onDelete(); onClose();
                }},
              ]
            );
          }}
            style={{ position: "absolute", bottom: 60,
              backgroundColor: "#3d0000", borderRadius: 8,
              borderWidth: 1, borderColor: C.red,
              paddingHorizontal: 24, paddingVertical: 12 }}>
            <Text style={{ color: C.red, fontFamily: HEADING,
              fontSize: 13, letterSpacing: 2 }}>
              🗑 DELETE PHOTO
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

// ── Photo strip — used in check-in form ──────────────────────────────────────
export function PhotoStrip({ photos, onAdd, onRemove, loading }) {
  const [showSource, setShowSource] = useState(false);
  const [viewerUri, setViewerUri]   = useState(null);
  const [viewerIdx, setViewerIdx]   = useState(null);

  const canAdd = photos.length < MAX_PHOTOS;

  return (
    <View>
      <View style={{ flexDirection: "row", gap: 10, marginVertical: 8 }}>
        {/* Existing photos */}
        {photos.map((uri, i) => (
          <TouchableOpacity key={i} onPress={() => {
            setViewerUri(uri);
            setViewerIdx(i);
          }}>
            <Image source={{ uri }}
              style={{ width: 80, height: 80, borderRadius: 8,
                borderWidth: 2, borderColor: C.greenBright }} />
          </TouchableOpacity>
        ))}

        {/* Add button */}
        {canAdd && (
          <TouchableOpacity onPress={() => setShowSource(true)}
            style={{ width: 80, height: 80, borderRadius: 8,
              borderWidth: 2, borderColor: C.border, borderStyle: "dashed",
              backgroundColor: C.surface, alignItems: "center",
              justifyContent: "center" }}>
            {loading ? (
              <ActivityIndicator color={C.greenBright} />
            ) : (
              <>
                <Text style={{ color: C.greenBright, fontSize: 24 }}>+</Text>
                <Text style={{ color: C.grey, fontFamily: HEADING,
                  fontSize: 8, letterSpacing: 2, marginTop: 2 }}>
                  PHOTO
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
        {photos.length}/{MAX_PHOTOS} photos · tap to view · long press to delete
      </Text>

      <PhotoSourceModal
        visible={showSource}
        onSelect={async (source) => {
          await onAdd(source);
        }}
        onClose={() => setShowSource(false)}
      />

      <PhotoViewer
        uri={viewerUri}
        visible={!!viewerUri}
        onClose={() => { setViewerUri(null); setViewerIdx(null); }}
        onDelete={viewerIdx != null ? () => {
          onRemove(viewerIdx);
          setViewerUri(null);
          setViewerIdx(null);
        } : null}
      />
    </View>
  );
}

// ── Photo timeline row — used in grow timeline ────────────────────────────────
export function PhotoTimelineStrip({ filenames }) {
  const [viewerUri, setViewerUri] = useState(null);

  if (!filenames || filenames.length === 0) return null;

  return (
    <View style={{ marginTop: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, flexDirection: "row" }}>
        {filenames.map((filename, i) => {
          const uri = getPhotoUri(filename);
          return (
            <TouchableOpacity key={i} onPress={() => setViewerUri(uri)}>
              <Image source={{ uri }}
                style={{ width: 64, height: 64, borderRadius: 6,
                  borderWidth: 1, borderColor: C.border }} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <PhotoViewer
        uri={viewerUri}
        visible={!!viewerUri}
        onClose={() => setViewerUri(null)}
      />
    </View>
  );
}

// ── Full photo journal screen for a grow ─────────────────────────────────────
export default function PhotoJournal({ growId, strainName, logs, onBack }) {
  const [viewerUri, setViewerUri] = useState(null);

  // Collect all photos from all logs
  const allPhotos = [];
  (logs || []).forEach(log => {
    if (log.photos?.length > 0) {
      log.photos.forEach(filename => {
        allPhotos.push({
          uri: getPhotoUri(filename),
          day: log.day,
          date: log.date,
          filename,
        });
      });
    }
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 16 : 52,
        paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border }}>
        <TouchableOpacity onPress={onBack} style={{ marginBottom: 8 }}>
          <Text style={{ color: C.greenBright, fontFamily: HEADING, fontSize: 16, letterSpacing: 1.5 }}>
            ← BACK
          </Text>
        </TouchableOpacity>
        <Text style={{ color: C.white, fontFamily: HEADING,
          fontSize: 26, letterSpacing: 1 }}>
          {strainName}
        </Text>
        <Text style={{ color: C.grey, fontFamily: SANS_MED, fontSize: 11, marginTop: 2 }}>
          PHOTO JOURNAL · {allPhotos.length} PHOTO{allPhotos.length !== 1 ? "S" : ""}
        </Text>
      </View>

      {allPhotos.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center",
          justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 48 }}>📷</Text>
          <Text style={{ color: C.greenBright, fontFamily: HEADING,
            fontSize: 22, letterSpacing: 3, marginTop: 16 }}>
            NO PHOTOS YET
          </Text>
          <Text style={{ color: C.greyLight, fontFamily: SANS,
            fontSize: 12, marginTop: 8, textAlign: "center", lineHeight: 18 }}>
            Add photos when you do your daily check-in to build a visual diary of your grow.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {/* Group by day */}
          {Object.entries(
            allPhotos.reduce((groups, photo) => {
              const key = `Day ${photo.day}`;
              if (!groups[key]) groups[key] = { date: photo.date, photos: [] };
              groups[key].photos.push(photo);
              return groups;
            }, {})
          ).reverse().map(([dayLabel, { date, photos }]) => (
            <View key={dayLabel} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center",
                gap: 8, marginBottom: 10 }}>
                <View style={{ backgroundColor: C.greenFaint, borderRadius: 6,
                  borderWidth: 1, borderColor: C.greenDim,
                  paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: C.greenBright, fontFamily: HEADING,
                    fontSize: 12 }}>
                    {dayLabel}
                  </Text>
                </View>
                <Text style={{ color: C.grey, fontFamily: MONO, fontSize: 10 }}>
                  {date}
                </Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {photos.map((photo, i) => (
                  <TouchableOpacity key={i}
                    onPress={() => setViewerUri(photo.uri)}>
                    <Image source={{ uri: photo.uri }}
                      style={{ width: 100, height: 100, borderRadius: 8,
                        borderWidth: 1, borderColor: C.border }} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <PhotoViewer
        uri={viewerUri}
        visible={!!viewerUri}
        onClose={() => setViewerUri(null)}
      />
    </View>
  );
}
