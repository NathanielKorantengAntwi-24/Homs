/**
 * Ships historical parameters over an HTTP connection to your secure backend API route.
 * Keeps your Gemini authentication credentials safely isolated away from public browser views.
 * @param {Array} historyOrders - Customer profile past order arrays.
 * @param {Array} flatMenuItemsList - Active kitchen stock availability list.
 * @returns {Promise<Array>} - Array containing selected string product IDs.
 */
export async function requestPersonalizedMealSuggestions(historyOrders, flatMenuItemsList) {
    if (!historyOrders || historyOrders.length === 0 || !flatMenuItemsList || flatMenuItemsList.length === 0) {
        console.log("⚠️ AI Recommender skipped: History or Menu list is empty.", { historyCount: historyOrders?.length, menuCount: flatMenuItemsList?.length });
        return [];
    }

    try {
        // 🔍 DIAGNOSTIC LOG: Let's see exactly what items are about to leave the browser
        console.log("🚀 OUTBOUND AI PAYLOAD:");
        console.log("👉 Past Orders:", JSON.stringify(historyOrders, null, 2));
        console.log("👉 Catalog Names Sent:", flatMenuItemsList.map(m => m.name));
        console.log("👉 Full Catalog Raw Data:", flatMenuItemsList);

        // Matches the exact folder routing endpoint file path you have set up
        const response = await fetch('/api/recommendations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                historyOrders,
                menuItems: flatMenuItemsList
            })
        });

        if (!response.ok) {
            throw new Error(`Server returned HTTP Error Status: ${response.status}`);
        }

        const recommendedIds = await response.json();
        
        // 🔍 DIAGNOSTIC LOG: Let's see exactly what the backend decided
        console.log("📥 INBOUND AI RESPONSE - Chosen IDs:", recommendedIds);
        
        return Array.isArray(recommendedIds) ? recommendedIds : [];
    } catch (error) {
        console.error("Failed to query server-side AI recommendation route:", error);
        return [];
    }
}