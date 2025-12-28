// src/config/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
const firebaseConfig = {
  apiKey: "AIzaSyDVk-KAlMMSoQxHjVCgJae3YCud87vw2Vo",
  authDomain: "homs-system-d71d5.firebaseapp.com",
  projectId: "homs-system-d71d5",
  storageBucket: "homs-system-d71d5.firebasestorage.app",
  messagingSenderId: "275297500250",
  appId: "1:275297500250:web:31baae3e687bf7905d2c63",
  measurementId: "G-KH1VM9KD9N"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
