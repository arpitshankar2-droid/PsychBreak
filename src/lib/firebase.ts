"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "demo-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "demo-project.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "demo-project.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "12345",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:12345:web:12345",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

/** Only use the local emulator when explicitly enabled (otherwise dev hits cloud Firestore). */
const useFirestoreEmulator =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR === "true";

if (typeof window !== "undefined" && useFirestoreEmulator) {
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  } catch {
    /* emulator already attached (e.g. HMR) */
  }
}

export { app, db };
