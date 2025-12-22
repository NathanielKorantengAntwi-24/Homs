// src/hooks/useRealTimeOrders.js
import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore'; 
import { db } from '../config/firebase'; 

export function useRealTimeOrders(filterKey, filterValue, statusFilter = null, enabled = true) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    const statusFilterString = useMemo(() => {
        if (!statusFilter || statusFilter.length === 0) return '';
        return [...statusFilter].sort((a, b) => a - b).join(',');
    }, [statusFilter]);

    useEffect(() => {
        if (!enabled || (filterKey && !filterValue)) {
            setLoading(false);
            return;
        }

        let queryConstraints = [];
        const ordersRef = collection(db, "orders");
        
        const currentStatusArray = statusFilterString 
                                    ? statusFilterString.split(',').map(Number) 
                                    : null;

        // --- 🚀 FIXED QUERY LOGIC ---

        if (filterKey && filterValue) {
            queryConstraints.push(where(filterKey, "==", filterValue));
        }

        if (currentStatusArray && currentStatusArray.length > 0) {
            queryConstraints.push(where("currentStatus", "in", currentStatusArray));
        } 
        // REMOVED THE 1-6 RANGE BLOCK HERE
        // If no filter is provided, we fetch everything and let the component filter it.
        
        queryConstraints.push(orderBy("orderTime", "desc"));

        const q = query(ordersRef, ...queryConstraints);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersList = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    orderTime: data.orderTime?.toDate ? data.orderTime.toDate() : (data.orderTime || new Date()), 
                    archivalDate: data.archivalDate?.toDate ? data.archivalDate.toDate() : data.archivalDate
                };
            });
            setOrders(ordersList);
            setLoading(false); 
        }, (error) => {
            console.error("Firestore Error:", error);
            setLoading(false); 
        });

        return () => unsubscribe();
        
    }, [filterKey, filterValue, statusFilterString, enabled]); 

    return { orders, loading }; 
}