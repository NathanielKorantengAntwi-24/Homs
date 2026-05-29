import { GoogleGenAI } from "@google/genai";

// 🔐 Initializes the client directly using your secure Vite environment variable
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

export async function requestPersonalizedMealSuggestions(historyOrders, flatMenuItemsList) {
    // Prevent empty or uninitialized states from firing API calls
    if (!historyOrders || historyOrders.length === 0 || !flatMenuItemsList || flatMenuItemsList.length === 0) {
        return [];
    }

    try {
        // Diagnostic log inside your browser dev console
        console.log("📥 Client executing Gemini payload. History entries:", historyOrders.length, "Menu records:", flatMenuItemsList.length);

        // 1. Compile order historical logs cleanly
        const historySnapshot = historyOrders.map(order => {
            let itemsList = "No items specified";
            if (Array.isArray(order.items)) {
                itemsList = order.items.map(i => {
                    if (typeof i === 'string') return i;
                    if (i && typeof i === 'object') return `${i.qty || 1}x ${i.name || 'Item'}`;
                    return 'Unknown Item';
                }).join(", ");
            }
            const type = order.orderType || "Standard";
            return `- Past Order Snapshot: [${itemsList}] via ${type}`;
        }).join("\n");

        // 2. Bulletproof Menu Snapshot parsing mapping fallbacks
        const menuSnapshot = flatMenuItemsList.map(item => {
            const itemId = item.id || item._id || (item.name ? item.name.toLowerCase().replace(/\s+/g, '_') : 'unknown_code');
            const itemName = item.name || item.itemName || 'Unnamed Special';
            const itemCategory = item.category || 'OTHER';
            const itemDesc = item.description || item.desc || 'Active kitchen inventory entry.';
            
            return `ID: ${itemId} | Name: ${itemName} | Category: ${itemCategory} | Description: ${itemDesc}`;
        }).join("\n");

        // 3. Construct prompt constraint parameters explicitly
        const structuralPrompt = `
You are an elite, Michelin-star hospitality digital sommelier for Algrace Systems. Analyze the guest's past order metrics context and recommend exactly 2 to 3 target meal IDs from the catalog they will love.

GUEST ORDER HISTORY LOG:
${historySnapshot}

AVAILABLE KITCHEN MENU CATALOG:
${menuSnapshot}

CRITICAL RULES:
1. Pair choices intelligently based on flavor pairing profiles.
2. Only select string IDs that exist verbatim inside the AVAILABLE KITCHEN MENU CATALOG list blocks.
3. Output your response strictly as a valid JSON array containing only the matching string IDs of your selections. Do not return markdown wrapping strings or conversational filler text.

EXPECTED OUTPUT FORMAT:
["id_1", "id_2"]`;

        // 4. Fire compute query pipelines directly to Gemini via the client SDK
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: structuralPrompt,
            config: {
                responseMimeType: "application/json"
            }
        });

        // 5. Clean parse resolution streams safely
        const rawResponseText = response.text ? response.text.trim() : "[]";
        
        let sanitizedJson = rawResponseText;
        if (sanitizedJson.startsWith("```")) {
            sanitizedJson = sanitizedJson.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        }

        const recommendedIds = JSON.parse(sanitizedJson);
        console.log("🎯 Compiled Recommendation ID map on client instance:", recommendedIds);

        return recommendedIds;

    } catch (error) {
        console.error("❌ Client-side AI Recommendation processing error:", error);
        return [];
    }
}