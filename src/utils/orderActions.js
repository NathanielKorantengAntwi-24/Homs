// src/utils/orderActions.js
import { doc, updateDoc, arrayUnion, deleteDoc, getDoc } from 'firebase/firestore'; 
import { db } from '../config/firebase'; 
import { Timestamp } from 'firebase/firestore'; 

// --- Constants for Financial Calculations ---
const ROOM_SERVICE_FLAT_CHARGE = 30.00; 

// --- Helper Function ---
function recalculateFinancials(items, orderType) {
    const subtotal = items.reduce(
        (sum, item) => sum + (item.price * item.qty), 
        0
    );
    const serviceCharge = (orderType === 'Room Service') ? ROOM_SERVICE_FLAT_CHARGE : 0.00;
    const grandTotal = subtotal + serviceCharge;

    const hasUnpricedCustomItems = items.some(item => item.type === 'special' && item.price === 0);
    
    return {
        subtotal: parseFloat(subtotal.toFixed(2)),
        serviceCharge: parseFloat(serviceCharge.toFixed(2)),
        grandTotal: parseFloat(grandTotal.toFixed(2)),
        hasSpecialItems: hasUnpricedCustomItems 
    };
}

// --- Helper Function ---
function getStatusName(statusId) {
    const names = {
        0: "CANCELLED",
        1: "PENDING",
        2: "CONFIRMED",
        3: "PREPARING",
        4: "READY",
        5: "DISPATCHED",
        6: "DELIVERED",
        7: "COMPLETED",
        8: "ARCHIVED", 
        "-1": "PRICE_UPDATED", 
    };
    return names[statusId] || "Unknown";
}


// --- GENERIC STATUS UPDATE (Used primarily by Kitchen for 2->3, 3->4, and Admin for 7->8) ---
export async function updateOrderStatus(orderId, nextStatus, userId, note = "", extraFields = {}) {
    const orderRef = doc(db, "orders", orderId);

    const historyEntry = {
        status: nextStatus,
        statusName: getStatusName(nextStatus),
        timestamp: Timestamp.now(),
        updatedBy: `User: ${userId}`,
        note: note,
    };

    try {
        await updateDoc(orderRef, {
            currentStatus: nextStatus,
            ...extraFields, 
            statusHistory: arrayUnion(historyEntry)
        });
    } catch (error) {
        throw new Error(`Failed to change status to ${nextStatus}.`);
    }
}


// --- 0. GUEST/FRONT DESK: CANCEL (Status X -> 0) ---
export async function cancelOrder(orderId, userId, reason = "Cancelled by user/system.") {
    const nextStatus = 0; 
    const orderRef = doc(db, "orders", orderId);
    const now = Timestamp.now(); 

    const historyEntry = {
        status: nextStatus,
        statusName: getStatusName(nextStatus),
        timestamp: now,
        updatedBy: userId,
        note: reason,
    };

    try {
        await updateDoc(orderRef, {
            currentStatus: nextStatus,
            statusHistory: arrayUnion(historyEntry)
        });
    } catch (error) {
        console.error("Cancellation Error:", error);
        throw new Error("Failed to cancel order.");
    }
}

// 1. FRONT DESK: CONFIRM (Status 1 -> 2)
export async function confirmOrder(orderId, frontDeskUserId) {
    const nextStatus = 2; // CONFIRMED
    const orderRef = doc(db, "orders", orderId);
    const now = Timestamp.now();

    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
        throw new Error(`Order ${orderId} not found.`);
    }
    const order = orderSnap.data();

    if (order.financials?.hasSpecialItems) {
        // We now check if the custom item prices have been saved (price > 0)
        const customItems = order.items.filter(item => item.type === 'special');
        const unpricedItems = customItems.some(item => item.price <= 0);

        if (unpricedItems) {
            throw new Error("Cannot confirm order: All custom items must be priced (GH₵ > 0) and saved.");
        }
    }

    const historyEntry = {
        status: nextStatus,
        statusName: getStatusName(nextStatus),
        timestamp: now,
        updatedBy: `Front Desk: ${frontDeskUserId}`,
        note: "Order verified and accepted.",
    };

    try {
        await updateDoc(orderRef, {
            currentStatus: nextStatus,
            statusHistory: arrayUnion(historyEntry)
        });
    } catch (error) {
        throw new Error("Failed to confirm order.");
    }
}

// 2. KITCHEN: DISPATCH (Status 4 -> 5) - UPDATED TO BE ROLE-AGNOSTIC
export async function dispatchOrder(orderId, serverName, dispatchLocation, userId, sourceRole) {
    const nextStatus = 5; // DISPATCHED
    const orderRef = doc(db, "orders", orderId);
    const now = Timestamp.now();

    const historyEntry = {
        status: nextStatus,
        statusName: getStatusName(nextStatus),
        timestamp: now,
        updatedBy: `${sourceRole}: ${userId}`, // Uses the dynamic sourceRole ("Kitchen")
        note: `Dispatched by ${serverName} to ${dispatchLocation}.`,
    };

    try {
        await updateDoc(orderRef, {
            currentStatus: nextStatus,
            serverName: serverName, 
            dispatchLocation: dispatchLocation, 
            statusHistory: arrayUnion(historyEntry)
        });
    } catch (error) {
        throw new Error("Failed to dispatch order.");
    }
}


// 3. FRONT DESK: CONFIRM DELIVERY (Status 5 -> 6)
export async function confirmDelivery(orderId, frontDeskUserId) {
    const nextStatus = 6; // DELIVERED
    const orderRef = doc(db, "orders", orderId);

    const historyEntry = {
        status: nextStatus,
        statusName: getStatusName(nextStatus),
        timestamp: Timestamp.now(),
        updatedBy: `Front Desk: ${frontDeskUserId}`,
        note: "Delivery confirmed by service staff.",
    };

    try {
        await updateDoc(orderRef, {
            currentStatus: nextStatus,
            statusHistory: arrayUnion(historyEntry)
        });
    } catch (error) {
        throw new Error("Failed to confirm delivery.");
    }
}

// 4. FRONT DESK: COMPLETE/ARCHIVE (Status 6 or 5 -> 7)
export async function markOrderCompleted(orderId, frontDeskUserId) {
    const nextStatus = 7; // COMPLETED
    const orderRef = doc(db, "orders", orderId);
    const now = Timestamp.now();

    const historyEntry = {
        status: nextStatus,
        statusName: getStatusName(nextStatus),
        timestamp: now,
        updatedBy: `Front Desk: ${frontDeskUserId}`,
        note: "Transaction complete and moved to final history.",
    };

    try {
        await updateDoc(orderRef, {
            currentStatus: nextStatus,
            statusHistory: arrayUnion(historyEntry),
            isArchived: true, 
            archivalDate: now 
        });
    } catch (error) {
        throw new Error("Failed to complete and archive order.");
    }
}

// 5. FRONT DESK: PRICE CUSTOM ORDERS
export async function updateCustomItemPrices(orderId, updatedItems, orderType, frontDeskUserId) {
    const orderRef = doc(db, "orders", orderId);
    const now = Timestamp.now();
    
    const newFinancials = recalculateFinancials(updatedItems, orderType);

    const historyEntry = {
        status: -1, 
        statusName: getStatusName(-1),
        timestamp: now,
        updatedBy: `Front Desk: ${frontDeskUserId}`,
        note: `Custom item prices set/updated. New Grand Total: GH₵${newFinancials.grandTotal}`,
    };

    try {
        await updateDoc(orderRef, {
            items: updatedItems, 
            financials: newFinancials, 
            statusHistory: arrayUnion(historyEntry),
        });
        return newFinancials.grandTotal;
    } catch (error) {
        console.error("Error updating custom item prices:", error);
        throw new Error("Failed to update custom item prices.");
    }
}

// 6. ARCHIVAL/ADMIN: Permanently delete an order
export async function deleteOrderPermanently(orderId) {
    if (!orderId) {
        throw new Error("Order ID is required for permanent deletion.");
    }

    const orderRef = doc(db, "orders", orderId);

    try {
        await deleteDoc(orderRef);
        console.log(`Order ${orderId} permanently deleted.`);
    } catch (error) {
        console.error("Error deleting order permanently:", error);
        throw new Error("Failed to permanently delete order due to a database error.");
    }
}