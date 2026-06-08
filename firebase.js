// firebase.js
// VYWEED Firebase configuration — React Native / Expo
//
// SETUP (one time):
//   npx expo install firebase
//
// Then paste YOUR config values from:
//   Firebase Console → Project Settings → General → Your apps → Web app
//
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth }      from "firebase/auth";

// ⬇ REPLACE these with your actual values from Firebase Console
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

// ── Init ──────────────────────────────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };

// ── Example usage (future auth screen) ───────────────────────────────────────
//
// import { db } from './firebase'
// import { collection, getDocs } from 'firebase/firestore'
//
// const grows = await getDocs(collection(db, 'grows'))
// grows.forEach(doc => console.log(doc.id, doc.data()))
