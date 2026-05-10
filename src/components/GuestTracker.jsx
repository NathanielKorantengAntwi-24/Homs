import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRealTimeOrders } from '../hooks/useRealTimeOrders';
import { getStatusDetails } from '../utils/statusMapping';
import { cancelOrder } from '../utils/orderActions'; 
import { usePaystackPayment } from 'react-paystack'; 
import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { requestNotificationPermission } from '../config/firebase';
// --- NEW IMPORTS FOR PDF ---
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const GUEST_ID = "G_40201"; 
const RECEPTION_CONTACT = "030 223 4567"; 
const CURRENCY_SYMBOL = 'GH₵'; 

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "pk_test_e99593b32b40dcb8fe1730c2104c926a44fff452"; 

const ACTIVE_STATUSES = [1, 2, 3, 4, 5, 6];
const HISTORY_STATUSES = [0, 7, 8];

// --- SUB-COMPONENT: RECEIPT MODAL ---
const ReceiptModal = ({ order, onClose }) => {
    const [isDownloading, setIsDownloading] = useState(false);

    if (!order) return null;

    // 🔥 DYNAMIC CALCULATION: Ensures the receipt matches current item prices
    const itemsSubtotal = order.items?.reduce((sum, item) => {
        return sum + (item.qty * (item.price || 0));
    }, 0) || 0;

    const serviceCharge = order.financials?.serviceCharge || 0;
    const finalGrandTotal = itemsSubtotal + serviceCharge;

    const downloadPDF = async () => {
        const input = document.getElementById('receipt-content');
        if (!input) return;

        setIsDownloading(true);

        try {
            const options = {
                scale: 3, 
                useCORS: true,
                logging: false,
                backgroundColor: "#ffffff",
                ignoreElements: (element) => element.hasAttribute('data-pdf-ignore')
            };

            const canvas = await html2canvas(input, options);
            const imgData = canvas.toDataURL('image/png');
            
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Receipt_${order.id.slice(-5).toUpperCase()}.pdf`);
        } catch (error) {
            console.error("PDF Generation Error:", error);
            alert("Could not generate PDF. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div style={modalOverlayStyle}>
            <div style={receiptContainerStyle} id="receipt-content">
                <button 
                    onClick={onClose} 
                    style={closeReceiptXStyle} 
                    data-pdf-ignore 
                >✕</button>
                
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #ccc', paddingBottom: '10px', marginBottom: '15px' }}>
                    <h2 style={{ margin: 0 }}>HOMS RECEIPT</h2>
                    <p style={{ fontSize: '0.75rem', color: '#666' }}>Hotel Order Management System</p>
                </div>

                <div style={receiptRowStyle}><strong>Order ID:</strong> <span>#{order.id.slice(-8).toUpperCase()}</span></div>
                <div style={receiptRowStyle}><strong>Date:</strong> <span>{new Date().toLocaleDateString()}</span></div>
                <div style={receiptRowStyle}><strong>Ref:</strong> <span style={{fontSize: '0.7rem', fontFamily: 'monospace'}}>{order.paystackReference || 'N/A'}</span></div>
                
                <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '15px 0' }} />
                
                {/* 1. Item List */}
                {order.items?.map((item, i) => (
                    <div key={i} style={receiptRowStyle}>
                        <span>{item.qty}x {item.name}</span>
                        <span>{CURRENCY_SYMBOL}{(item.qty * (item.price || 0)).toFixed(2)}</span>
                    </div>
                ))}

                {/* 2. Financial Breakdown (Subtotal & Service Charge) */}
                <div style={{ borderTop: '1px dotted #ccc', marginTop: '10px', paddingTop: '10px' }}>
                    <div style={receiptRowStyle}>
                        <span>Subtotal (Items)</span>
                        {/* 🔥 Use live itemsSubtotal instead of stored value */}
                        <span>{CURRENCY_SYMBOL}{itemsSubtotal.toFixed(2)}</span>
                    </div>
                    
                    {serviceCharge > 0 && (
                        <div style={receiptRowStyle}>
                            <span>Service Charge</span>
                            <span>{CURRENCY_SYMBOL}{serviceCharge.toFixed(2)}</span>
                        </div>
                    )}
                </div>

                {/* 3. Grand Total */}
                <div style={{ ...receiptRowStyle, fontWeight: 'bold', fontSize: '1.1rem', marginTop: '5px', paddingTop: '10px', borderTop: '2px solid #333' }}>
                    <span>TOTAL PAID</span>
                    {/* 🔥 Use live finalGrandTotal */}
                    <span>{CURRENCY_SYMBOL}{finalGrandTotal.toFixed(2)}</span>
                </div>

                <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.7rem', color: '#888' }}>
                    <p>Thank you for choosing HOMS</p>
                </div>

                <div 
                    style={{ display: 'flex', gap: '10px', marginTop: '20px' }} 
                    data-pdf-ignore
                >
                    <button 
                        onClick={downloadPDF} 
                        style={printButtonStyle}
                        disabled={isDownloading}
                    >
                        {isDownloading ? "Generating..." : "📩 Download Receipt (PDF)"}
                    </button>
                    <button onClick={onClose} style={closeReceiptButtonStyle}>Close</button>
                </div>
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: PAY BUTTON (React 19 Wrapped Callback) ---
const PayButton = ({ order, email, isProcessing, onWait }) => {
    const config = {
        reference: `HOMS_${order.id.slice(-5)}_${Date.now()}`,
        email: email,
        amount: Math.round((order.financials?.grandTotal || 0) * 100),
        publicKey: PAYSTACK_PUBLIC_KEY,
        currency: "GHS",
        metadata: { orderId: order.id }
    };

    const initializePayment = usePaystackPayment(config);

    return (
        <button 
            style={{...paystackButtonStyle, opacity: isProcessing ? 0.6 : 1}} 
            disabled={isProcessing}
            onClick={() => {
                initializePayment({
                    onSuccess: (ref) => onWait(ref, order.id),
                    onClose: () => console.log("Payment window closed.")
                });
            }}
        >
            {isProcessing ? "Processing..." : "💳 Pay for Order Here"}
        </button>
    );
};

function GuestTracker({ guestId, viewMode, userEmail }) {
    // 1. INITIALIZE BASIC CONSTANTS
    const [isPushLoading, setIsPushLoading] = useState(false);
    const effectiveGuestId = guestId || GUEST_ID;
    const effectiveEmail = userEmail || "guest@hotel.com";

    // 2. INITIALIZE LOCAL STATES
    const [isProcessing, setIsProcessing] = useState(false);
    const [viewingReceipt, setViewingReceipt] = useState(null);
    const [expandedHistoryId, setExpandedHistoryId] = useState(null);
    
    // ⭐ NEW: Settings UI State
    const [showSettings, setShowSettings] = useState(false);
    // Add this near your other states
    const [confirmCancelId, setConfirmCancelId] = useState(null);

    // ⭐ PERSISTENCE: Check localStorage on load, or default to true
     // At the top of GuestTracker.jsx
     const [alertPrefs, setAlertPrefs] = useState(() => {
    const saved = localStorage.getItem('homs_alert_prefs');
    return saved ? JSON.parse(saved) : { voice: true, push: false };
    });

// Auto-save to disk whenever a toggle is flipped
    useEffect(() => {
    localStorage.setItem('homs_alert_prefs', JSON.stringify(alertPrefs));
     }, [alertPrefs]);

    

    // 3. DATA FETCHING
    const fetchActive = viewMode !== 'history' && !!effectiveGuestId;
    const { orders: activeOrders, loading: activeLoading } = useRealTimeOrders(
        'guestId', effectiveGuestId, ACTIVE_STATUSES, fetchActive
    );
    
    const { orders: historyOrders, loading: historyLoading } = useRealTimeOrders(
        'guestId', effectiveGuestId, HISTORY_STATUSES, viewMode !== 'active'
    );

    // 4. MEMORY REFS
    const lastRequestTimeRef = React.useRef(null);
    const lastPricesRef = React.useRef({});
    const isFirstLoadRef = React.useRef(true);

    // --- PAYMENT OBSERVER (Updated with Voice Toggle) ---
    React.useEffect(() => {
        if (activeLoading || !activeOrders) return;

        if (isFirstLoadRef.current) {
            const initialOrder = activeOrders.find(o => o.paymentRequestedAt);
            if (initialOrder) {
                lastRequestTimeRef.current = initialOrder.paymentRequestedAt?.toMillis?.() || 0;
            }
            isFirstLoadRef.current = false;
            return;
        }

        const latestRequestOrder = activeOrders.find(o => o.paymentRequestedAt);
        if (latestRequestOrder && latestRequestOrder.paymentRequestedAt) {
            const requestTime = latestRequestOrder.paymentRequestedAt?.toMillis?.() || 0;

            if (requestTime > (lastRequestTimeRef.current || 0)) {
                // ⭐ VOICE CHECK: Only speak if enabled in settings
                if (alertPrefs.voice) {
                    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
                    const utterance = new SpeechSynthesisUtterance("Please make payment for your order.");
                    const voices = window.speechSynthesis.getVoices();
                    const preferredVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Google'));
                    if (preferredVoice) utterance.voice = preferredVoice;
                    window.speechSynthesis.speak(utterance);
                }
                lastRequestTimeRef.current = requestTime;
            }
        }
    }, [activeOrders, activeLoading, alertPrefs.voice]);

    // --- PRICE OBSERVER (Updated with Voice Toggle) ---
    React.useEffect(() => {
        if (activeLoading || !activeOrders || activeOrders.length === 0) return;

        activeOrders.forEach(order => {
            const currentPriceSnapshot = order.items?.map(i => i.price || 0).join('-') || "";
            const previousPriceSnapshot = lastPricesRef.current[order.id];

            if (previousPriceSnapshot === undefined) {
                lastPricesRef.current[order.id] = currentPriceSnapshot;
                return; 
            }

            if (currentPriceSnapshot !== previousPriceSnapshot) {
                const containsNewPricing = previousPriceSnapshot.split('-').some((prevPStr, idx) => {
                    const prevP = parseFloat(prevPStr);
                    const currP = order.items[idx]?.price || 0;
                    return prevP === 0 && currP > 0;
                });

                // ⭐ VOICE CHECK: Only speak if enabled in settings
                if (containsNewPricing && alertPrefs.voice) {
                    const utterance = new SpeechSynthesisUtterance("Your order price has been updated. Please check the details.");
                    window.speechSynthesis.speak(utterance);
                }
                lastPricesRef.current[order.id] = currentPriceSnapshot;
            }
        });
    }, [activeOrders, activeLoading, alertPrefs.voice]);

    // 5. EVENT HANDLERS
    const toggleHistoryDetails = (orderId) => {
        setExpandedHistoryId(prevId => (prevId === orderId ? null : orderId));
    };


    const handlePaymentSuccess = async (reference, orderId) => {
        setIsProcessing(true);
        try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/910/910-preview.mp3');
            audio.play().catch(() => {});

            const orderRef = doc(db, 'orders', orderId);
            await updateDoc(orderRef, {
                paymentStatus: 'paid',
                paidAt: serverTimestamp(),
                paystackReference: reference.reference
            });

            setIsProcessing(false);
            alert("Payment Verified");
        } catch (e) {
            console.error("❌ Payment Sync Error:", e);
            setIsProcessing(false);
            alert("Database Error: " + e.message);
        }
    };

    const formatTime = (timestampOrDate) => {
        if (!timestampOrDate) return 'N/A';
        let date = timestampOrDate.toDate ? timestampOrDate.toDate() : new Date(timestampOrDate);
        return date.toLocaleString('en-US', { 
            year: 'numeric', month: '2-digit', day: '2-digit', 
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true 
        });
    };
    
    const renderFinancials = (order) => {
    // 1. DYNAMIC CALCULATION: Always calculate from the items list
    const itemsSubtotal = order.items?.reduce((sum, item) => {
        return sum + (item.qty * (item.price || 0));
    }, 0) || 0;

    // 2. EXTRACT CHARGES: Use stored values or defaults
    const serviceCharge = order.financials?.serviceCharge || 0;
    
    // 3. FINAL TOTAL: The math is now locked and accurate
    const calculatedGrandTotal = itemsSubtotal + serviceCharge;

    const isPaid = order.paymentStatus === 'paid';

    return (
        <div style={breakdownCardStyle}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom: '1px solid #ced4da', paddingBottom: '5px', marginBottom: '10px'}}>
                <h4 style={{margin:0}}>Price Breakdown</h4>
                <span style={{
                    fontSize: '0.65rem', padding: '2px 8px', borderRadius: '10px', 
                    backgroundColor: isPaid ? '#e6ffe6' : '#fff5f5', color: isPaid ? '#008000' : '#e74c3c',
                    fontWeight: 'bold', border: `1px solid ${isPaid ? '#008000' : '#e74c3c'}`
                }}>
                    {isPaid ? 'PAID' : 'UNPAID'}
                </span>
            </div>
            
            <ul style={itemizedListStyle}>
                {order.items?.map((item, index) => (
                    <li key={item.id || index} style={itemizedListItemStyle}>
                        <span>{item.qty}x **{item.name}**</span>
                        {item.price === 0 && item.type === 'special' ? (
                            <span style={{ color: '#800080', fontWeight: 'bold' }}>Price TBD</span>
                        ) : (
                            <span>{CURRENCY_SYMBOL}{(item.qty * (item.price || 0)).toFixed(2)}</span>
                        )}
                    </li>
                ))}
            </ul>

            <div style={breakdownSummaryStyle}>
                <div style={breakdownRowStyle}>
                    <span>Subtotal (Items):</span>
                    {/* Use our calculated total here */}
                    <span>{CURRENCY_SYMBOL}{itemsSubtotal.toFixed(2)}</span>
                </div>
                
                {serviceCharge > 0 && (
                    <div style={breakdownRowStyle}>
                        <span>Service Charge:</span>
                        <span>{CURRENCY_SYMBOL}{serviceCharge.toFixed(2)}</span>
                    </div>
                )}
                
                <div style={grandTotalRowStyle}>
                    <strong>GRAND TOTAL:</strong>
                    {/* Use our calculated grand total here */}
                    <strong>{CURRENCY_SYMBOL}{calculatedGrandTotal.toFixed(2)}</strong>
                </div>
            </div>

            {/* Use calculatedGrandTotal to decide if we show the Pay Button */}
            {order.paymentStatus === 'unpaid' && calculatedGrandTotal > 0 && (
                <div style={{marginTop: '15px'}}>
                    <PayButton 
                        order={{...order, financials: { ...order.financials, grandTotal: calculatedGrandTotal }}} 
                        email={effectiveEmail} 
                        isProcessing={isProcessing} 
                        onWait={handlePaymentSuccess} 
                    />
                </div>
            )}

            {isPaid && (
                <button style={receiptButtonStyle} onClick={() => setViewingReceipt(order)}>
                    📄 View & Download Receipt
                </button>
            )}
        </div>
    );
};

    const renderOrderStatus = (order) => {
        const statusDetail = getStatusDetails(order.currentStatus);
        const orderTime = formatTime(order.orderTime);
        
        // 1. FIND CONFIRMATION TIME (Status 2 in history)
        const confirmedEntry = order.statusHistory?.find(entry => entry.status === 2);
        const confirmationTime = confirmedEntry ? formatTime(confirmedEntry.timestamp) : 'Awaiting Confirmation...';

        // 2. FIND SERVER NAME (From current order or status history)
        // We check the top level first, then look for the person who dispatched it (Status 5)
        const serverName = order.serverName || 
                          order.statusHistory?.find(entry => entry.status === 5)?.serverName || 
                          order.statusHistory?.find(entry => entry.status === 6)?.serverName || 
                          "Assigning Server...";

        const displayLocation = order.orderType === 'Dining Hall' ? order.dispatchLocation : order.roomNumber;

        return (
            <div style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: statusDetail.color, padding: '15px', borderRadius: '8px', margin: '15px 0', backgroundColor: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ margin: 0 }}>Order ID: <strong>{order.id.slice(-8).toUpperCase()}</strong></h3>
                    <span style={{ fontSize: '0.8rem', backgroundColor: '#eee', padding: '2px 8px', borderRadius: '4px' }}>{order.orderType}</span>
                </div>
                
                <p>Location/Room: <strong>{displayLocation || order.roomNumber}</strong></p>
                
                <hr style={{ margin: '10px 0', border: '0', borderTop: '1px solid #eee' }}/>
                
                {renderFinancials(order)}

                {order.notes && (
                    <div style={notesContainerStyle}>
                        <strong>Special Request / Allergies:</strong> 
                        <p style={{ margin: '5px 0 0 0', fontStyle: 'italic' }}>{order.notes}</p>
                    </div>
                )}

                <hr style={{ margin: '10px 0', border: '0', borderTop: '1px solid #eee' }}/>
                
                {/* --- RESTORED TIMING & SERVER INFO --- */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.9rem' }}>
                    <p style={{ margin: 0 }}>📅 Ordered: <strong>{orderTime}</strong></p>
                    <p style={{ margin: 0 }}>✅ Confirmed: <strong>{confirmationTime}</strong></p>
                    
                    {order.currentStatus >= 5 && (
                        <p style={{ margin: '5px 0 0 0', padding: '8px', backgroundColor: '#f3e5f5', borderRadius: '4px', borderLeft: '4px solid #8e24aa', fontWeight: 'bold', color: '#4a148c' }}>
                            👤 Delivering Staff: {serverName}
                        </p>
                    )}
                </div>

                <h3 style={{ color: statusDetail.color, marginTop: '15px', borderTop: '1px solid #f0f0f0', paddingTop: '10px' }}>
                    Current Status: {statusDetail.name}
                </h3>
                
                <div style={{ padding: '10px', marginTop: '15px', backgroundColor: '#fffbe0', borderRadius: '4px' }}>
                    <p style={{ margin: '0', fontSize: '0.85rem' }}>Need help? Call Reception: <strong>{RECEPTION_CONTACT}</strong></p>
                </div>

                {order.currentStatus === 1 && (
    <div style={{ marginTop: '15px' }}>
        {confirmCancelId === order.id ? (
            <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                    onClick={() => {
                        cancelOrder(order.id, effectiveGuestId);
                        setConfirmCancelId(null);
                    }} 
                    style={{ ...cancelButtonStyle, marginTop: 0, flex: 2 }}
                >
                    Confirm Cancellation?
                </button>
                <button 
                    onClick={() => setConfirmCancelId(null)} 
                    style={{ ...closeReceiptButtonStyle, flex: 1 }}
                >
                    Keep Order
                </button>
            </div>
        ) : (
            <button 
                onClick={() => setConfirmCancelId(order.id)} 
                style={cancelButtonStyle} 
                disabled={isProcessing}
            >
                ❌ Cancel Order (Before Confirmation)
            </button>
        )}
    </div>
)}
            </div>
        );
    };
    
   // --- ⚙️ SHARED SETTINGS COMPONENT (Add this helper first) ---
  // --- ⚙️ SETTINGS HELPER (Rules of Hooks Compliant) ---
    const renderSettingsToggle = () => (
        <div style={{ position: 'relative', marginBottom: '15px', textAlign: 'right' }}>
            <button onClick={() => setShowSettings(!showSettings)} style={settingsToggleButtonStyle}>
                {showSettings ? '✕ Close' : '⚙️ Alert Settings'}
            </button>
            {showSettings && (
                <div style={settingsDropdownStyle}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
                        Notification Prefs
                    </h4>
                    
                    {/* 🎙️ VOICE ALERTS TOGGLE */}
                    <label style={settingLabelStyle}>
                        <span>Voice Alerts</span>
                        <input 
                            type="checkbox" 
                            checked={alertPrefs.voice} 
                            onChange={() => {
                                const newValue = !alertPrefs.voice;
                                setAlertPrefs(prev => ({ ...prev, voice: newValue }));
                                localStorage.setItem('algrace_voice_pref', newValue);
                            }} 
                        />
                    </label>

                    {/* 📱 PUSH NOTIFICATIONS TOGGLE */}
                    <label style={{ ...settingLabelStyle, opacity: isPushLoading ? 0.5 : 1 }}>
                        <span>Push Notifications</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {isPushLoading && <span style={{ fontSize: '10px', color: '#666' }}>Syncing...</span>}
                            <input 
                                type="checkbox" 
                                disabled={isPushLoading} 
                                checked={alertPrefs.push} 
                                onChange={async () => {
                                    if (isPushLoading) return;

                                    if (!alertPrefs.push) {
                                        const activeOrderId = activeOrders?.[0]?.id;
                                        if (activeOrderId) {
                                            setIsPushLoading(true); // Start Lock
                                            try {
                                                const token = await requestNotificationPermission(activeOrderId);
                                                if (token) {
                                                    setAlertPrefs(prev => ({ ...prev, push: true }));
                                                    localStorage.setItem('algrace_push_pref', 'true');
                                                    alert("🚀 Push Notifications Enabled!");
                                                }
                                            } catch (err) {
                                                console.error("Push Error:", err);
                                            } finally {
                                                setIsPushLoading(false); // End Lock
                                            }
                                        } else {
                                            alert("Please place an order first to enable push alerts.");
                                        }
                                    } else {
                                        setAlertPrefs(prev => ({ ...prev, push: false }));
                                        localStorage.setItem('algrace_push_pref', 'false');
                                    }
                                }} 
                            />
                        </div>
                    </label>
                </div>
            )}
        </div>
    );
    // --- 1. RENDER: ACTIVE ORDERS ---
    if (viewMode === 'active') {
        if (activeLoading) return <div style={pageContainerStyle}>Loading active orders...</div>;
        return (
            <div style={pageContainerStyle}>
                {renderSettingsToggle()} {/* 👈 Logic: Included here */}
                {activeOrders.length === 0 ? (
                    <p style={emptyStateStyle}>No active orders. Place a new order to start tracking!</p>
                ) : (
                    activeOrders.map(order => <div key={order.id}>{renderOrderStatus(order)}</div>)
                )}
                {viewingReceipt && <ReceiptModal order={viewingReceipt} onClose={() => setViewingReceipt(null)} />}
            </div>
        );
    }
    
    // --- 2. RENDER: ORDER HISTORY ---
    if (viewMode === 'history') {
        if (historyLoading) return <div style={pageContainerStyle}>Loading order history...</div>;
        
        return (
            <div style={pageContainerStyle}>
                {/* ❌ REMOVED: renderSettingsToggle() from here */}
                
                {historyOrders.length === 0 ? (
                    <p style={emptyStateStyle}>No order history found.</p>
                ) : (
                    historyOrders.map(order => (
                        <div key={order.id} style={historyCardStyle} onClick={() => toggleHistoryDetails(order.id)}>
                            <div style={historyHeaderStyle}>
                                <div style={historyHeaderRowStyle}>
                                    <span style={{ fontWeight: 'bold' }}>Order #{order.id.slice(-5).toUpperCase()}</span> 
                                    <span style={historyTotalStyle}>Total: {CURRENCY_SYMBOL}{(order.financials?.grandTotal || 0).toFixed(2)}</span>
                                </div>
                                <span style={historyToggleStyle}>{expandedHistoryId === order.id ? '▲ Hide' : '▼ Show'}</span>
                            </div>
                            {expandedHistoryId === order.id && renderFinancials(order)}
                        </div>
                    ))
                )}
                {viewingReceipt && <ReceiptModal order={viewingReceipt} onClose={() => setViewingReceipt(null)} />}
            </div>
        );
    }

    // --- 3. THE SAFETY CATCH ---
    return null;
}

// --- STYLES (Kept Original as requested) ---
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '20px' };
const receiptContainerStyle = { backgroundColor: '#fff', padding: '25px', borderRadius: '12px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', position: 'relative', overflow: 'hidden' };
const receiptRowStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' };
const printButtonStyle = { flex: 1, padding: '10px', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' };
const closeReceiptButtonStyle = { padding: '10px', backgroundColor: '#eee', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer' };
const closeReceiptXStyle = { position: 'absolute', top: '10px', right: '10px', border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' };
const paystackButtonStyle = { width: '100%', padding: '12px', backgroundColor: '#09a5db', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' };
const receiptButtonStyle = { width: '100%', padding: '10px', backgroundColor: '#f8f9fa', color: '#333', border: '1px solid #ddd', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px', fontSize: '0.85rem' };
const emptyStateStyle = { padding: '10px', backgroundColor: '#fff', borderRadius: '6px' };
const breakdownCardStyle = { padding: '10px', border: '1px solid #eee', borderRadius: '4px', marginBottom: '10px', backgroundColor: '#fafafa' };
const breakdownSummaryStyle = { marginTop: '10px', paddingTop: '5px', borderTop: '1px dotted #ced4da', fontSize: '0.95rem' };
const notesContainerStyle = { padding: '10px', backgroundColor: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '4px', marginBottom: '10px' };
const pageContainerStyle = { backgroundColor: '#f0f4f7', margin: '0 auto', boxSizing: 'border-box', padding: '10px' };
const historyCardStyle = { margin: '10px 0', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fff', fontSize: '0.9em', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', cursor: 'pointer' };
const historyHeaderStyle = { display: 'flex', flexDirection: 'column', gap: '4px', paddingBottom: '5px', alignItems: 'flex-start' };
const historyHeaderRowStyle = { display: 'flex', justifyContent: 'space-between', width: '100%' };
const historyTotalStyle = { fontWeight: 'bold', color: '#008000', backgroundColor: '#e6ffe6', padding: '2px 6px', borderRadius: '4px' };
const historyToggleStyle = { marginTop: '5px', fontSize: '0.8em', color: '#007bff' };
const historyDetailStyle = { paddingTop: '5px', borderTop: '1px solid #eee', marginTop: '10px' };
const itemizedListStyle = { listStyle: 'none', padding: '0', margin: '0 0 10px 0', borderBottom: '1px dotted #ced4da', paddingBottom: '5px' };
const itemizedListItemStyle = { display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '0.95em' };
const breakdownRowStyle = { display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#343a40' };
const grandTotalRowStyle = { ...breakdownRowStyle, borderTop: '2px double #343a40', paddingTop: '8px', fontSize: '1.1rem', fontWeight: 'bold' };
const cancelButtonStyle = { padding: '10px 15px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '15px', width: '100%', fontWeight: 'bold' };
// --- 🎨 ALERT SETTINGS STYLES ---

const settingsToggleButtonStyle = {
    background: '#ffffff',
    border: '1px solid #dee2e6',
    borderRadius: '20px',
    padding: '6px 14px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    color: '#495057',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s ease'
};

const settingsDropdownStyle = {
    position: 'absolute',
    top: '40px',
    right: '0',
    backgroundColor: '#ffffff',
    border: '1px solid #dee2e6',
    borderRadius: '12px',
    padding: '15px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    zIndex: 1000,
    width: '210px',
    textAlign: 'left',
    animation: 'fadeIn 0.2s ease-out'
};

const settingLabelStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: '12px 0',
    fontSize: '0.85rem',
    cursor: 'pointer',
    color: '#212529',
    fontWeight: '500'
};

export default GuestTracker;