import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "vyweed_growver_context";

export async function setGrowverContext(screen, data) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ screen, data, updatedAt: Date.now() }));
  } catch {}
}
