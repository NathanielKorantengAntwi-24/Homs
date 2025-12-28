import { doc, writeBatch, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export const migrateMenuToFirestore = async (fullMenu) => {
    const batch = writeBatch(db);
    
    // 1. Setup Global Hotel Settings
    const configRef = doc(db, "config", "hotel_settings");
    batch.set(configRef, {
        roomServiceCharge: 30.00,
        currency: 'GH₵',
        hotelName: "Your Hotel Name",
        lastUpdated: serverTimestamp()
    });

    // 2. Setup Menu Items
    Object.keys(fullMenu).forEach(category => {
        fullMenu[category].forEach(item => {
            const itemRef = doc(db, "menu", item.id);
            batch.set(itemRef, {
                ...item,
                category: category,
                isAvailable: true,
                createdAt: serverTimestamp()
            });
        });
    });

    try {
        await batch.commit();
        return { success: true, message: "Migration Successful! Menu is now live." };
    } catch (error) {
        console.error("Migration Error:", error);
        return { success: false, message: error.message };
    }
};