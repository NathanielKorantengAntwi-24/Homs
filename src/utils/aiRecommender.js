/**
 * Ships historical parameters over an HTTP connection to your secure backend API route.
 * Keeps your Gemini authentication credentials safely isolated away from public browser views.
 * @param {Array} historyOrders - Customer profile past order arrays.
 * @param {Array} flatMenuItemsList - Active kitchen stock availability list.
 * @returns {Promise<Array>} - Array containing selected string product IDs.
 */
export async function requestPersonalizedMealSuggestions(historyOrders, flatMenuItemsList) {
    // 🔥 FIXED CRITICAL GUARD: Only reject if the menu catalog data is empty.
    // New guests with 0 past orders must pass through to receive discovery session defaults!
    if (!flatMenuItemsList || flatMenuItemsList.length === 0) {
        console.log("⚠️ AI Recommender skipped: Menu catalog list is empty.", { menuCount: flatMenuItemsList?.length });
        return [];
    }

    // Fallback locally to a clean array format structure if parameter evaluates to undefined/null
    const safeHistory = Array.isArray(historyOrders) ? historyOrders : [];

    // --- ENVIRONMENT-AWARE ROUTING DYNAMICS ---
    // Automatically flips endpoints based on whether working locally or in production
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    const TARGET_URL = isLocalhost
        ? 'http://127.0.0.1:5001/homs-system-d71d5/africa-south1/recommendations' // 🛠️ Local Emulator Port Loop
        : 'https://recommendations-g6v4vdrp6a-bq.a.run.app';                     // 🚀 Live Production Cloud Run Container URL

    try {
        // 🔍 DIAGNOSTIC LOG: Watch payloads exit the client runtime
        console.log(`🚀 OUTBOUND AI PAYLOAD (Targeting: ${isLocalhost ? 'LOCAL EMULATOR' : 'PRODUCTION SERVER'}):`);
        console.log("👉 Past Orders Count Sent:", safeHistory.length);
        console.log("👉 Catalog Names Sent:", flatMenuItemsList.map(m => m.name));

        const response = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                historyOrders: safeHistory,
                menuItems: flatMenuItemsList
            })
        });

        if (!response.ok) {
            throw new Error(`Server returned HTTP Error Status: ${response.status}`);
        }

        const recommendedIds = await response.json();
        
        // 🔍 DIAGNOSTIC LOG: See exactly what data structures returned
        console.log("📥 INBOUND AI RESPONSE - Chosen IDs:", recommendedIds);
        
        return Array.isArray(recommendedIds) ? recommendedIds : [];
    } catch (error) {
        console.error("Failed to query server-side AI recommendation route:", error);
        return [];
    }
}