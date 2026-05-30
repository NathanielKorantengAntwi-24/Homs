const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
// 🔥 HIGH-END ENHANCEMENT: Destructured Type mapping directly from the Node SDK
const { GoogleGenAI, Type } = require("@google/genai");
const admin = require("firebase-admin");

admin.initializeApp();

// Match your project's regional settings
setGlobalOptions({ region: "africa-south1" });

// ============================================================================
// 1. ORDER BACKGROUND PUSH NOTIFICATIONS (Untouched & Safe)
// ============================================================================
exports.onorderupdate = onDocumentUpdated("orders/{orderId}", async (event) => {
    if (!event.data) {
        console.log("No data associated with this event.");
        return null;
    }

    const newData = event.data.after.data();
    const oldData = event.data.before.data();
    const orderId = event.params.orderId;

    const token = newData?.fcmToken;
    if (!token) {
        console.log(`No token found for order ${orderId}. Skipping.`);
        return null;
    }

    const priceChanged = JSON.stringify(newData?.items) !== JSON.stringify(oldData?.items);
    const paymentRequested = !oldData?.paymentRequestedAt && newData?.paymentRequestedAt;

    let messageBody = "";
    if (paymentRequested) {
        messageBody = "Payment has been requested for your order. Tap to view.";
    } else if (priceChanged) {
        if (newData?.items?.length > 0) {
            messageBody = "Your order items have been priced. Check your tracker.";
        }
    }

    if (messageBody) {
        const message = {
            notification: {
                title: 'Algrace Systems Update',
                body: messageBody,
                },
            data: {
                orderId: orderId,
                click_action: "FLUTTER_NOTIFICATION_CLICK"
            },
            token: token,
        };

        try {
            await admin.messaging().send(message);
            console.log(`✅ Notification successfully sent for order: ${orderId}`);
        } catch (error) {
            console.error("❌ Error sending message:", error);
        }
    }

    return null;
});

// ============================================================================
// 2. SECURE CLOUD AI MEAL RECOMMENDATIONS ROUTE (Live Gemini Engine Activated)
// ============================================================================
exports.recommendations = onRequest({ cors: true }, async (req, res) => {
    const origin = req.headers.origin || "*";
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.set('Access-Control-Max-Age', '3600');
        return res.status(204).send('');
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("❌ Missing GEMINI_API_KEY inside backend process variables.");
            return res.status(500).json({ error: "Internal Configuration Misconfiguration" });
        }

        const { historyOrders, menuItems } = req.body;

        if (!menuItems || menuItems.length === 0) {
            console.log("⚠️ Recommendations skipped: Kitchen catalog payload is empty.");
            return res.status(200).json([]);
        }

        const ai = new GoogleGenAI({ apiKey });

        const activeHistory = Array.isArray(historyOrders) && historyOrders.length > 0 
            ? historyOrders 
            : [{ items: ["First-time Discovery Session"], orderType: "Standard" }];

        // 1. Parse past orders safely
        const historySnapshot = activeHistory.map(order => {
            if (!order) return "- Past Order: Empty log record";
            let itemsList = "No specific items specified";
            if (Array.isArray(order.items)) {
                itemsList = order.items.map(i => {
                    if (!i) return 'Unknown Item';
                    if (typeof i === 'string') return i;
                    return `${i.qty || 1}x ${i.name || 'Item'}`;
                }).join(", ");
            }
            return `- Past Order: [${itemsList}] via ${order.orderType || "Standard"}`;
        }).join("\n");

        // 2. Safe mapping with deep fallback lookups
        const menuSnapshot = menuItems.map(item => {
            if (!item) return "ID: unknown | Name: Unnamed | Category: OTHER | Description: Active entry.";
            
            const rawId = item.id || item._id || item.uid;
            const itemId = rawId ? String(rawId) : (item.name ? String(item.name).toLowerCase().replace(/\s+/g, '_') : 'unknown_code');
            
            const itemName = item.name || item.itemName || item.title || 'Unnamed Special';
            const itemCategory = item.category || item.type || 'OTHER';
            
            // 🔥 THE FIX: Dynamic premium culinary fallback replacing the "Active kitchen inventory entry" text
            const itemDesc = item.description || item.desc || `A delicious ${itemCategory.toLowerCase()} selection handcrafted fresh from the Algrace kitchen.`;
            
            return `ID: ${itemId} | Name: ${itemName} | Category: ${itemCategory} | Description: ${itemDesc}`;
        }).join("\n");

        const structuralPrompt = `
You are an elite hospitality digital sommelier and culinary architect for Algrace Systems. Your job is to analyze a guest's recent order history and pick exactly 2 to 3 target menu IDs from the catalog they will love.

GUEST ORDER HISTORY LOG:
${historySnapshot}

AVAILABLE KITCHEN MENU CATALOG:
${menuSnapshot}

CRITICAL CULINARY PAIRING RULES:
1. MATCH LIGHT BEVERAGES INTELLIGENTLY: If the guest recently ordered a light beverage (like tea, coffee, or juice), look closely at the catalog descriptions and categories. If light items, breakfast provisions, bakery items, or snacks (like Bread, Eggs, Toast, Pastries, or Sandwiches) exist in the catalog, you MUST prioritize and select them. 
2. MAIN COURSE FALLBACK POLICY: Only fallback to standalone rice dishes or lighter mains if the catalog completely lacks bakery, breakfast, or snack profiles. Absolutely avoid heavy swallows (like Banku, Fufu) paired with thick traditional soups for tea-drinkers unless no other options exist.
3. INVENTORY FRESHNESS: Evaluate newly added inventory items carefully to see if they fit the guest's context better than historical placeholders.
`;

        console.log("📡 Sending parsed catalog context to Gemini. Total catalog items:", menuItems.length);

        let recommendedIds;

        try {
            // Execute the live computation request
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: structuralPrompt,
                config: { 
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        description: "List of recommended handpicked menu string IDs.",
                        items: {
                            type: Type.STRING
                        }
                    }
                }
            });

            const rawText = response.text ? response.text.trim() : "[]";
            recommendedIds = JSON.parse(rawText);
            console.log("🧠 Gemini response array picked item IDs:", recommendedIds);

        } catch (apiError) {
            // 🔥 AUTOMATIC LOCAL FALLBACK SAFETY NET:
            // Intercepts rate limits (429) or resource exhaustion blocks gracefully during heavy dev run loops.
            if (apiError.status === 429 || String(apiError).includes("429")) {
                console.warn("⚠️ GEMINI QUOTA EXHAUSTED (429). Deploying backend sandbox fallback layer...");
                
                // Extract real database document strings straight from incoming payload metrics
                const rawFallbackIds = menuItems.map(item => item.id || item._id || item.uid).filter(Boolean);
                
                // Keep UI moving seamlessly by suggesting the top items in stock
                recommendedIds = rawFallbackIds.slice(0, 3);
                console.log("🛠️ LOCAL RECOVERY ENGINE GENERATED SANDBOX OVERRIDE:", recommendedIds);
            } else {
                // Throw any true technical runtime syntax or compilation errors outward
                throw apiError;
            }
        }

        return res.status(200).json(Array.isArray(recommendedIds) ? recommendedIds : []);

    } catch (error) {
        console.error("❌ Cloud Function execution pipeline error:", error);
        return res.status(500).json([]);
    }
});