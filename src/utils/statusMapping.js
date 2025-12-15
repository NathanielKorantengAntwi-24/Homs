// src/utils/statusMapping.js

export const STATUS_MAPPING = {
    // Status 0: Cancelled
    0: { name: "CANCELLED", color: "#DC143C" },        // Crimson Red
    
    // Active Order Statuses
    1: { name: "PENDING", color: "#FFA500" },          // Orange
    2: { name: "CONFIRMED", color: "#3498DB" },        // Blue
    3: { name: "PREPARING", color: "#FFD700" },        // Gold/Yellow
    4: { name: "READY", color: "#008000" },            // Green
    5: { name: "DISPATCHED", color: "#800080" },       // Purple
    6: { name: "DELIVERED", color: "#2E8B57" },        // Sea Green
    
    // History Statuses
    7: { name: "COMPLETED", color: "#778899" },        // Light Slate Grey
    // ✅ FIX: Add Status 8 (CLEARED_ADMIN/ARCHIVED) for full completeness
    8: { name: "ARCHIVED", color: "#4682B4" }          // Steel Blue (or similar grey)
};

export const getStatusDetails = (statusId) => {
    // This helper function correctly handles looking up the status details
    return STATUS_MAPPING[statusId] || { name: "Unknown", color: "#333" };
};