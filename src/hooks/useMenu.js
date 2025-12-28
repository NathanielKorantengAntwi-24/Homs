import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

export function useMenu(onlyAvailable = false) {
    const [menuData, setMenuData] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const menuRef = collection(db, "menu");
        // Optional: If guest view, only show available items. If admin view, show all.
        const q = onlyAvailable ? query(menuRef, where("isAvailable", "==", true)) : menuRef;

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const categorized = {};
            snapshot.docs.forEach(doc => {
                const item = { id: doc.id, ...doc.data() };
                const cat = item.category || "OTHER";
                if (!categorized[cat]) categorized[cat] = [];
                categorized[cat].push(item);
            });
            setMenuData(categorized);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [onlyAvailable]);

    return { menuData, loading };
}