import { initializeApp } from 'firebase/app';
import { getFirestore }  from 'firebase/firestore';
import { getAuth }       from 'firebase/auth';
import Constants         from 'expo-constants';

const {
  firebaseApiKey:            apiKey,
  firebaseAuthDomain:        authDomain,
  firebaseProjectId:         projectId,
  firebaseStorageBucket:     storageBucket,
  firebaseMessagingSenderId: messagingSenderId,
  firebaseAppId:             appId,
} = Constants.expoConfig?.extra ?? {};

const app  = initializeApp({ apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId });
const db   = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
