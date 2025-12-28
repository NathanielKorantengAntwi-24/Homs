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
        if (!enabled) {
            setLoading(false);
            return;
        }

        let queryConstraints = [];
        const ordersRef = collection(db, "orders");
        
        const currentStatusArray = statusFilterString 
                                    ? statusFilterString.split(',').map(Number) 
                                    : null;

        if (filterKey && filterValue) {
            queryConstraints.push(where(filterKey, "==", filterValue));
        }

        if (currentStatusArray && currentStatusArray.length > 0) {
            queryConstraints.push(where("currentStatus", "in", currentStatusArray));
        } 
        
        // Ensure standard ordering
        queryConstraints.push(orderBy("orderTime", "desc"));

        const q = query(ordersRef, ...queryConstraints);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersList = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // Robust date parsing
                    orderTime: data.orderTime?.toDate ? data.orderTime.toDate() : (data.orderTime ? new Date(data.orderTime) : new Date()), 
                    archivalDate: data.archivalDate?.toDate ? data.archivalDate.toDate() : data.archivalDate
                };
            });
            setOrders(ordersList);
            setLoading(false); 
        }, (error) => {
            console.error("Firestore Hook Error:", error);
            setLoading(false); 
        });

        return () => unsubscribe();
        
    }, [filterKey, filterValue, statusFilterString, enabled]); 

    return { orders, loading }; 
}