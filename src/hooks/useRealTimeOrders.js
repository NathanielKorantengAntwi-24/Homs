import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore'; 
import { db } from '../config/firebase'; 

/**
 * Custom hook for real-time order data fetching with dynamic filtering.
 * This hook is stabilized to prevent listener leaks by relying only on
 * primitive (string/number) dependencies.
 * @param {string | null} filterKey - The field to filter by (e.g., 'guestId').
 * @param {string | null} filterValue - The value for the filter (e.g., 'G_40201').
 * @param {Array<number> | null} statusFilter - An array of status numbers to filter by ('in' query).
 */
export function useRealTimeOrders(filterKey, filterValue, statusFilter = null) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    // CRITICAL FIX: Stabilize the statusFilter array into a string dependency.
    // This prevents React from treating identical arrays as different on every render.
    const statusFilterString = useMemo(() => {
        if (!statusFilter || statusFilter.length === 0) return '';
        return statusFilter.sort((a, b) => a - b).join(',');
    }, [statusFilter]);


    useEffect(() => {
        let queryConstraints = [];
        const ordersRef = collection(db, "orders");
        
        // Convert the string back to an array if needed
        const currentStatusFilter = statusFilterString 
                                    ? statusFilterString.split(',').map(Number) 
                                    : null;
                                    
        const isHistoryQuery = currentStatusFilter && currentStatusFilter.length > 0;

        // 1. Build the Query Constraints:
        
        // A. Filter by Status 
        if (isHistoryQuery) {
            queryConstraints.push(where("currentStatus", "in", currentStatusFilter));
        } else if (!filterKey) {
            // Active Orders Query: Filter by range 1-6.
            queryConstraints.push(where("currentStatus", ">=", 1));
            queryConstraints.push(where("currentStatus", "<=", 6)); 
        }

        // B. Filter by Key/Value (Guest View, etc.)
        if (filterKey && filterValue) {
            queryConstraints.push(where(filterKey, "==", filterValue));
        }

        // C. Ordering (Simplified for Stability)
        // Order by orderTime universally unless status is needed for range/grouping
        queryConstraints.push(orderBy("orderTime", "desc"));
        
        if (!isHistoryQuery && !filterKey) {
             // For Active Dashboard, status ordering is necessary
             queryConstraints.unshift(orderBy("currentStatus", "asc"));
        }
        
        const q = query(ordersRef, ...queryConstraints);

        // 2. Set up the Real-Time Listener (onSnapshot)
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ordersList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                // Ensure conversion to JS Date objects here
                orderTime: doc.data().orderTime?.toDate ? doc.data().orderTime.toDate() : (doc.data().orderTime || new Date()), 
                archivalDate: doc.data().archivalDate?.toDate ? doc.data().archivalDate.toDate() : doc.data().archivalDate
            }));
            setOrders(ordersList);
            setLoading(false); 
        }, (error) => {
            console.error("Firestore listener failed:", error);
            setLoading(false); 
        });

        // 3. Cleanup function: stop listening when component unmounts
        return () => {
            // Check if unsubscribe is a function before calling
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
        
    }, [filterKey, filterValue, statusFilterString]); // ✅ Stabilized dependency list

    return { orders, loading };
}