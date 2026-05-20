/**
 * Ships historical parameters over an HTTP connection to your secure backend API route.
 * Keeps your Gemini authentication credentials safely isolated away from public browser views.
 * @param {Array} historyOrders - Customer profile past order arrays.
 * @param {Array} flatMenuItemsList - Active kitchen stock availability list.
 * @returns {Promise<Array>} - Array containing selected string product IDs.
 */
export async function requestPersonalizedMealSuggestions(historyOrders, flatMenuItemsList) {
    if (!historyOrders || historyOrders.length === 0 || !flatMenuItemsList || flatMenuItemsList.length === 0) {
        return [];
    }

    try {
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
        return Array.isArray(recommendedIds) ? recommendedIds : [];
    } catch (error) {
        console.error("Failed to query server-side AI recommendation route:", error);
        return [];
    }
}