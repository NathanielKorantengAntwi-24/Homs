// src/config/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import { getMessaging, getToken } from "firebase/messaging";
import { getStorage } from "firebase/storage"; // 👈 STEP 2: Add this import

const firebaseConfig = {
  apiKey: "AIzaSyDVk-KAlMMSoQxHjVCgJae3YCud87vw2Vo",
  authDomain: "homs-system-d71d5.firebaseapp.com",
  projectId: "homs-system-d71d5",
  storageBucket: "homs-system-d71d5.firebasestorage.app",
  messagingSenderId: "275297500250",
  appId: "1:275297500250:web:31baae3e687bf7905d2c63",
  measurementId: "G-KH1VM9KD9N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Services
export const db = getFirestore(app);
export const messaging = getMessaging(app);
export const storage = getStorage(app); // 👈 STEP 2: Add this export

// --- ⭐ THE HANDSHAKE FUNCTION ---
export const requestNotificationPermission = async (orderId) => {
    // ... (Your existing code stays exactly the same)
    try {
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

            const token = await getToken(messaging, { 
                vapidKey: 'BDP8G7YYKlBFaPkt76CKk1bx6XC_MjzX31tPaem9g5Q_uAkkBV3YHc6jbfkgnDdHwOjfDIyWshhStHIRStm1pQk',
                serviceWorkerRegistration: registration 
            });

            if (token) {
                const orderRef = doc(db, 'orders', orderId);
                await updateDoc(orderRef, {
                    fcmToken: token,
                    notificationsEnabled: true,
                });
                return token;
            }
        }
    } catch (error) {
        console.error("FCM Handshake Error:", error);
        return null;
    }
};