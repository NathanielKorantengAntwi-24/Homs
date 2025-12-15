// src/config/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// ❌ REMOVED: import { getAuth } from "firebase/auth"; 

// 🔑 PASTE YOUR ACTUAL FIREBASE CONFIGURATION OBJECT HERE
const firebaseConfig = {
  apiKey: "AIzaSyDVk-KAlMMSoQxHjVCgJae3YCud87vw2Vo",
  authDomain: "homs-system-d71d5.firebaseapp.com",
  projectId: "homs-system-d71d5",
  storageBucket: "homs-system-d71d5.firebasestorage.app",
  messagingSenderId: "275297500250",
  appId: "1:275297500250:web:31baae3e687bf7905d2c63",
  measurementId: "G-KH1VM9KD9N"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Export the services needed for HOMS
export const db = getFirestore(app);
// ❌ REMOVED: export const auth = getAuth(app); 

// You will now import 'db' into any component that needs to talk to Firestore.