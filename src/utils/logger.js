import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export const logSystemEvent = async (type, message, details = {}) => {
    try {
        await addDoc(collection(db, "system_logs"), {
            type, // PERFORMANCE, ERROR, ORDER_EVENT, SYSTEM
            message,
            ...details,
            resolved: false,
            timestamp: serverTimestamp(),
        });
    } catch (e) {
        console.error("Logger Failed:", e);
    }
};