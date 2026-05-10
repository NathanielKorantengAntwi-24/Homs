const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();

// 🌍 Updated to match the region in your error logs for better compatibility
setGlobalOptions({ region: "africa-south1" });

// 🚀 Renamed to lowercase 'onorderupdate' for standard v2 URL paths
exports.onorderupdate = onDocumentUpdated("orders/{orderId}", async (event) => {
    // Safety check for event data
    if (!event.data) {
        console.log("No data associated with this event.");
        return null;
    }

    const newData = event.data.after.data();
    const oldData = event.data.before.data();
    const orderId = event.params.orderId;

    // 1. Safety Check: Does the guest have a Push Token?
    const token = newData?.fcmToken;
    if (!token) {
        console.log(`No token found for order ${orderId}. Skipping.`);
        return null;
    }

    // 2. Detection Logic: Compare items and payment status
    // Using optional chaining ?. to prevent crashes if items are missing
    const priceChanged = JSON.stringify(newData?.items) !== JSON.stringify(oldData?.items);
    const paymentRequested = !oldData?.paymentRequestedAt && newData?.paymentRequestedAt;

    let messageBody = "";
    if (paymentRequested) {
        messageBody = "Payment has been requested for your order. Tap to view.";
    } else if (priceChanged) {
        // Only alert if the new version has items (prevents alerts on deletion)
        if (newData?.items?.length > 0) {
            messageBody = "Your order items have been priced. Check your tracker.";
        }
    }

    // 3. Send the Notification
    if (messageBody) {
        const message = {
            notification: {
                title: 'Algrace Systems Update',
                body: messageBody,
            },
            // Metadata for the phone to handle redirection or background tasks
            data: {
                orderId: orderId,
                click_action: "FLUTTER_NOTIFICATION_CLICK" // Standard for many handlers
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