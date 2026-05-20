import { doc, updateDoc, arrayUnion, deleteDoc, runTransaction, Timestamp, addDoc, collection, serverTimestamp, setDoc } from 'firebase/firestore'; 
import { db } from '../config/firebase'; 

// --- Helper: Recalculate Financials ---
// 🚀 UPDATED: Now dynamically accepts a custom flat charge from your settings hook!
function recalculateFinancials(items, orderType, customFlatCharge = 0.00) {
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const serviceCharge = (orderType === 'Room Service') ? Number(customFlatCharge) : 0.00;
    const grandTotal = subtotal + serviceCharge;
    const hasUnpricedCustomItems = items.some(item => item.type === 'special' && item.price === 0);
    
    return {
        subtotal: parseFloat(subtotal.toFixed(2)),
        serviceCharge: parseFloat(serviceCharge.toFixed(2)),
        grandTotal: parseFloat(grandTotal.toFixed(2)),
        hasSpecialItems: hasUnpricedCustomItems 
    };
}

function getStatusName(statusId) {
    const names = {
        0: "CANCELLED", 1: "PENDING", 2: "CONFIRMED", 3: "PREPARING",
        4: "READY", 5: "DISPATCHED", 6: "DELIVERED", 7: "COMPLETED",
        8: "ARCHIVED", "-1": "PRICE_UPDATED", 
    };
    return names[statusId] || "Unknown";
}

// --- 🚀 CENTRALIZED ORDER CREATION ENGINE ---
export async function createOrder(rawOrderPayload) {
    try {
        const ordersRef = collection(db, "orders");
        const newOrderDocRef = doc(ordersRef);
        const generatedId = newOrderDocRef.id;

        // 💥 UPDATED: Safely extracts the incoming flat calculation fee passed from the form state!
        const passedServiceCharge = rawOrderPayload.serviceCharge || 0.00;

        // Clean out the loose utility parameter so it doesn't clutter your Firestore document schema root
        const cleanPayloadData = { ...rawOrderPayload };
        delete cleanPayloadData.serviceCharge;

        // Run calculations with the live dashboard value
        const derivedFinancials = recalculateFinancials(
            cleanPayloadData.items, 
            cleanPayloadData.orderType, 
            passedServiceCharge
        );

        const finalPayload = {
            ...cleanPayloadData,
            id: generatedId,
            receiptId: generatedId.slice(-8).toUpperCase(),
            currentStatus: 1, 
            paymentStatus: cleanPayloadData.paymentStatus || 'unpaid',
            financials: derivedFinancials,
            orderTime: serverTimestamp(),
            statusHistory: [
                {
                    status: 1,
                    statusName: getStatusName(1),
                    timestamp: Timestamp.now(),
                    updatedBy: `Guest Session: ${cleanPayloadData.guestId || 'Anonymous'}`,
                    note: "Order initialized via customer platform.",
                }
            ]
        };

        await setDoc(newOrderDocRef, finalPayload);
        return { success: true, orderId: generatedId, receiptId: finalPayload.receiptId };

    } catch (error) {
        console.error("Order Generation Error:", error);
        throw new Error(`Failed to place order: ${error.message}`);
    }
}

// --- KITCHEN BROADCAST WITH 2-DAY TTL ---
export async function broadcastToKitchen(message, sender = "Front Desk") {
    try {
        const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
        const expirationDate = new Date(Date.now() + twoDaysInMs);

        await addDoc(collection(db, 'kitchen_notes'), {
            message,
            sender,
            date: new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString(),
            createdAt: serverTimestamp(),
            expireAt: Timestamp.fromDate(expirationDate) 
        });
        return { success: true };
    } catch (error) {
        console.error("Broadcast failed:", error);
        throw new Error("Failed to send kitchen broadcast.");
    }
}

// --- 1. ATOMIC PRICE UPDATE (Transaction) ---
// 🚀 UPDATED: Front desk updates also pass down through this recalculation loop seamlessly!
export async function updateCustomItemPrices(orderId, updatedItems, orderType, frontDeskUserId, currentSystemCharge = 0.00) {
    const orderRef = doc(db, "orders", orderId);

    try {
        return await runTransaction(db, async (transaction) => {
            const orderDoc = await transaction.get(orderRef);
            if (!orderDoc.exists()) throw new Error("Order not found.");

            const newFinancials = recalculateFinancials(updatedItems, orderType, currentSystemCharge);
            const historyEntry = {
                status: -1,
                statusName: getStatusName(-1),
                timestamp: Timestamp.now(),
                updatedBy: `Front Desk: ${frontDeskUserId}`,
                note: `Prices updated. Total: GH₵${newFinancials.grandTotal}`,
            };

            transaction.update(orderRef, {
                items: updatedItems,
                financials: newFinancials,
                statusHistory: arrayUnion(historyEntry),
            });

            return newFinancials.grandTotal;
        });
    } catch (e) {
        throw new Error(`Price update failed: ${e.message}`);
    }
}

// --- 2. ATOMIC CONFIRMATION (Transaction) ---
export async function confirmOrder(orderId, frontDeskUserId) {
    const orderRef = doc(db, "orders", orderId);

    try {
        await runTransaction(db, async (transaction) => {
            const orderDoc = await transaction.get(orderRef);
            if (!orderDoc.exists()) throw new Error("Order not found.");
            
            const orderData = orderDoc.data();

            if (orderData.currentStatus !== 1) {
                throw new Error(`Cannot confirm. Order is currently ${getStatusName(orderData.currentStatus)}`);
            }

            const hasUnpriced = orderData.items.some(i => i.type === 'special' && i.price <= 0);
            if (hasUnpriced) throw new Error("All special items must be priced before confirmation.");

            const historyEntry = {
                status: 2,
                statusName: getStatusName(2),
                timestamp: Timestamp.now(),
                updatedBy: `Front Desk: ${frontDeskUserId}`,
                note: "Order verified and accepted.",
            };

            transaction.update(orderRef, {
                currentStatus: 2,
                statusHistory: arrayUnion(historyEntry)
            });
        });
    } catch (e) {
        throw new Error(e.message);
    }
}

// --- 3. GENERIC STATUS UPDATE ---
export async function updateOrderStatus(orderId, nextStatus, userId, note = "", extraFields = {}) {
    const orderRef = doc(db, "orders", orderId);
    const historyEntry = {
        status: nextStatus,
        statusName: getStatusName(nextStatus),
        timestamp: Timestamp.now(),
        updatedBy: userId,
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

// --- 4. DISPATCH ORDER ---
export async function dispatchOrder(orderId, serverName, dispatchLocation, userId, sourceRole) {
    return updateOrderStatus(orderId, 5, `${sourceRole}: ${userId}`, 
        `Dispatched by ${serverName} to ${dispatchLocation}.`, 
        { serverName, dispatchLocation }
    );
}

// --- 5. CONFIRM DELIVERY ---
export async function confirmDelivery(orderId, frontDeskUserId) {
    return updateOrderStatus(orderId, 6, `Front Desk: ${frontDeskUserId}`, "Delivery confirmed.");
}

// --- 6. COMPLETE & ARCHIVE ---
export async function markOrderCompleted(orderId, frontDeskUserId) {
    const now = Timestamp.now();
    return updateOrderStatus(orderId, 7, `Front Desk: ${frontDeskUserId}`, "Transaction complete.", {
        isArchived: true,
        archivalDate: now
    });
}

// --- 7. CANCEL ORDER ---
export async function cancelOrder(orderId, userId, reason = "Cancelled by user.") {
    return updateOrderStatus(orderId, 0, userId, reason);
}

// --- 8. PERMANENT DELETE ---
export async function deleteOrderPermanently(orderId) {
    await deleteDoc(doc(db, "orders", orderId));
}