import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRealTimeOrders } from '../hooks/useRealTimeOrders';
import { getStatusDetails } from '../utils/statusMapping';
import { cancelOrder } from '../utils/orderActions'; 
import { usePaystackPayment } from 'react-paystack'; 
import { doc, updateDoc, serverTimestamp, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { requestNotificationPermission } from '../config/firebase';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const GUEST_ID = "G_40201"; 
const RECEPTION_CONTACT = "030 223 4567"; 
const CURRENCY_SYMBOL = 'GH₵'; 

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "pk_test_e99593b32b40dcb8fe1730c2104c926a44fff452"; 

const ACTIVE_STATUSES = [1, 2, 3, 4, 5, 6];
const HISTORY_STATUSES = [0, 7, 8];

// --- RESPONSIVE HELPER STYLESHEET ---
const ResponsiveTrackerStyles = () => (
    <style>{`
        @media (max-width: 768px) {
            .responsive-page-container {
                padding: 10px 0 !important;
                background-color: #FFFFFF !important;
            }
            .responsive-tracker-card {
                max-width: 100% !important;
                border-radius: 0 !important;
                border-left: none !important;
                border-right: none !important;
                box-shadow: none !important;
                padding: 24px 16px !important;
                margin-bottom: 12px !important;
            }
            .responsive-breakdown-card {
                padding: 16px !important;
                border-radius: 12px !important;
            }
            .responsive-settings-container {
                padding-right: 16px !important;
            }
        }
    `}</style>
);

// --- SUB-COMPONENT: RECEIPT MODAL (Branded Update) ---
const ReceiptModal = ({ order, onClose, hotelName, logoUrl }) => { 
    const [isDownloading, setIsDownloading] = useState(false);

    if (!order) return null;

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
                <button onClick={onClose} style={closeReceiptXStyle} data-pdf-ignore>✕</button>
                
                {/* 🏷️ DYNAMIC BRANDING HEADER */}
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #EAE8E1', paddingBottom: '16px', marginBottom: '20px' }}>
                    {logoUrl ? (
                        <img 
                            src={logoUrl} 
                            alt={`${hotelName} Logo`} 
                            crossOrigin="anonymous" 
                            style={{ 
                                maxHeight: '55px', 
                                width: 'auto', 
                                marginBottom: '12px', 
                                objectFit: 'contain',
                                display: 'inline-block',
                                filter: 'contrast(1.15) brightness(0.95) drop-shadow(0px 1px 2px rgba(44, 44, 41, 0.08))',
                                imageRendering: 'crisp-edges'
                            }} 
                        />
                    ) : (
                        <div style={{ fontSize: '2rem', marginBottom: '6px' }}>🏨</div>
                    )}
                    <h2 style={{ margin: 0, color: '#2C2C29', fontSize: '1.25rem', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase' }}>
                        {hotelName} RECEIPT
                    </h2>
                    <p style={{ fontSize: '0.7rem', color: '#A09F9A', marginTop: '4px', letterSpacing: '0.5px' }}>
                        HOMS
                    </p>
                </div>

                <div style={receiptRowStyle}><strong>Order ID:</strong> <span style={{ fontWeight: '600' }}>#{order.id.slice(-8).toUpperCase()}</span></div>
                <div style={receiptRowStyle}><strong>Date:</strong> <span style={{ fontWeight: '600' }}>{new Date().toLocaleDateString()}</span></div>
                <div style={receiptRowStyle}><strong>Ref:</strong> <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#666660' }}>{order.paystackReference || 'N/A'}</span></div>
                
                <hr style={{ border: 'none', borderTop: '1px solid #EAE8E1', margin: '18px 0' }} />
                
                {order.items?.map((item, i) => (
                    <div key={i} style={receiptRowStyle}>
                        <span>{item.qty}x {item.name}</span>
                        <span style={{ fontWeight: '600' }}>{CURRENCY_SYMBOL}{(item.qty * (item.price || 0)).toFixed(2)}</span>
                    </div>
                ))}

                <div style={{ borderTop: '1px dotted #D8D6D0', marginTop: '14px', paddingTop: '14px' }}>
                    <div style={receiptRowStyle}>
                        <span style={{ color: '#666660' }}>Subtotal (Items)</span>
                        <span style={{ fontWeight: '600' }}>{CURRENCY_SYMBOL}{itemsSubtotal.toFixed(2)}</span>
                    </div>
                    
                    {serviceCharge > 0 && (
                        <div style={receiptRowStyle}>
                            <span style={{ color: '#666660' }}>Service Charge</span>
                            <span style={{ fontWeight: '600' }}>{CURRENCY_SYMBOL}{serviceCharge.toFixed(2)}</span>
                        </div>
                    )}
                </div>

                <div style={{ ...receiptRowStyle, fontWeight: '900', fontSize: '1.2rem', marginTop: '12px', paddingTop: '16px', borderTop: '2px solid #2C2C29', color: '#2C2C29' }}>
                    <span>TOTAL PAID</span>
                    <span>{CURRENCY_SYMBOL}{finalGrandTotal.toFixed(2)}</span>
                </div>

                <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.75rem', color: '#A09F9A' }}>
                    <p>Thank you for choosing us</p>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }} data-pdf-ignore>
                    <button onClick={downloadPDF} style={printButtonStyle} disabled={isDownloading}>
                        {isDownloading ? "Generating..." : "📩 Download Receipt (PDF)"}
                    </button>
                    <button onClick={onClose} style={closeReceiptButtonStyle}>Close</button>
                </div>
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: PAY BUTTON ---
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
    const [receptionContact, setReceptionContact] = useState('030 223 4567'); 
    const [hotelName, setHotelName] = useState('HOMS');
    const [logoUrl, setLogoUrl] = useState(null); 
    const [cachedLogoBase64, setCachedLogoBase64] = useState(null); 
    const [isPushLoading, setIsPushLoading] = useState(false);
    
    const effectiveGuestId = guestId || GUEST_ID;
    const effectiveEmail = userEmail || "guest@hotel.com";
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [viewingReceipt, setViewingReceipt] = useState(null);
    const [expandedHistoryId, setExpandedHistoryId] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [confirmCancelId, setConfirmCancelId] = useState(null);

    const [alertPrefs, setAlertPrefs] = useState(() => {
        const saved = localStorage.getItem('homs_alert_prefs');
        return saved ? JSON.parse(saved) : { voice: true, push: false };
    });

    useEffect(() => {
        localStorage.setItem('homs_alert_prefs', JSON.stringify(alertPrefs));
    }, [alertPrefs]);

    const convertImgToBase64 = useCallback((url) => {
        if (!url) return;
        if (logoUrl === url && cachedLogoBase64) return;

        const img = new Image();
        img.crossOrigin = 'anonymous'; 
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth * 2;
            canvas.height = img.naturalHeight * 2;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                const base64Data = canvas.toDataURL('image/png', 1.0); 
                setCachedLogoBase64(base64Data);
            }
        };
        img.src = url;
    }, [logoUrl, cachedLogoBase64]);

    useEffect(() => {
        const unsubConfig = onSnapshot(doc(db, 'config', 'hotel_settings'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.receptionContact) setReceptionContact(data.receptionContact);
                if (data.hotelName) setHotelName(data.hotelName); 
                
                if (data.logoUrl && data.logoUrl !== logoUrl) {
                    setLogoUrl(data.logoUrl);
                    convertImgToBase64(data.logoUrl); 
                }
            }
        });
        return () => unsubConfig();
    }, [logoUrl, convertImgToBase64]);

    const fetchActive = viewMode !== 'history' && !!effectiveGuestId;
    const { orders: activeOrders, loading: activeLoading } = useRealTimeOrders(
        'guestId', effectiveGuestId, ACTIVE_STATUSES, fetchActive
    );
    
    const { orders: historyOrders, loading: historyLoading } = useRealTimeOrders(
        'guestId', effectiveGuestId, HISTORY_STATUSES, viewMode !== 'active'
    );

    const lastRequestTimeRef = useRef(null);
    const lastPricesRef = useRef({});
    const isFirstLoadRef = useRef(true);

    useEffect(() => {
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

    useEffect(() => {
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

                if (containsNewPricing && alertPrefs.voice) {
                    const utterance = new SpeechSynthesisUtterance("Your order price has been updated. Please check the details.");
                    window.speechSynthesis.speak(utterance);
                }
                lastPricesRef.current[order.id] = currentPriceSnapshot;
            }
        });
    }, [activeOrders, activeLoading, alertPrefs.voice]);

    const toggleHistoryDetails = (orderId) => {
        setExpandedHistoryId(prevId => (prevId === orderId ? null : orderId));
    };

    // --- 🚀 NEW: DATA DELETION HANDLERS ---
    const handleDeleteSingleHistory = async (e, orderId, receiptCode) => {
        e.stopPropagation(); 
        
        if (window.confirm(`Are you sure you want to remove Order #${receiptCode} from your view history permanently?`)) {
            try {
                const orderRef = doc(db, 'orders', orderId);
                await deleteDoc(orderRef); 
                alert("Order history item removed successfully.");
            } catch (error) {
                console.error("Single delete failed:", error);
                alert("Failed to delete history item: " + error.message);
            }
        }
    };

    const handleClearAllHistory = async () => {
        if (historyOrders.length === 0) return;
        
        const message = `⚠️ WARNING: This will permanently wipe all ${historyOrders.length} history items from your portal view. This action cannot be undone.\n\nDo you wish to proceed?`;
        
        if (window.confirm(message)) {
            try {
                const deletePromises = historyOrders.map(order => {
                    const orderRef = doc(db, 'orders', order.id);
                    return deleteDoc(orderRef);
                });
                
                await Promise.all(deletePromises);
                alert("All history logs cleared successfully!");
            } catch (error) {
                console.error("Bulk history clear failed:", error);
                alert("Failed to clear complete history: " + error.message);
            }
        }
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
        const itemsSubtotal = order.items?.reduce((sum, item) => {
            return sum + (item.qty * (item.price || 0));
        }, 0) || 0;

        const serviceCharge = order.financials?.serviceCharge || 0;
        const calculatedGrandTotal = itemsSubtotal + serviceCharge;
        const isPaid = order.paymentStatus === 'paid';

        return (
            <div className="responsive-breakdown-card" style={breakdownCardStyle}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom: '1px solid #EAE8E1', paddingBottom: '10px', marginBottom: '14px' }}>
                    <h4 style={{ margin:0, color: '#333330', fontSize: '0.95rem', fontWeight: '700' }}>Price Breakdown</h4>
                    <span style={{
                        fontSize: '0.7rem', padding: '4px 10px', borderRadius: '20px', 
                        backgroundColor: isPaid ? '#E8F5E9' : '#FFFDF5', color: isPaid ? '#2E7D32' : '#D4AF37',
                        fontWeight: '800', border: `1px solid ${isPaid ? '#A5D6A7' : '#F3E5AB'}`
                    }}>
                        {isPaid ? 'PAID' : 'UNPAID'}
                    </span>
                </div>
                
                <ul style={itemizedListStyle}>
                    {order.items?.map((item, index) => (
                        <li key={item.id || index} style={itemizedListItemStyle}>
                            <span>{item.qty}x <strong style={{ color: '#333330' }}>{item.name}</strong></span>
                            {item.price === 0 && item.type === 'special' ? (
                                <span style={{ color: '#8E24AA', fontWeight: '800' }}>Price TBD</span>
                            ) : (
                                <span style={{ fontWeight: '600' }}>{CURRENCY_SYMBOL}{(item.qty * (item.price || 0)).toFixed(2)}</span>
                            )}
                        </li>
                    ))}
                </ul>

                <div style={breakdownSummaryStyle}>
                    <div style={breakdownRowStyle}>
                        <span>Subtotal (Items):</span>
                        <span style={{ fontWeight: '600', color: '#333330' }}>{CURRENCY_SYMBOL}{itemsSubtotal.toFixed(2)}</span>
                    </div>
                    
                    {serviceCharge > 0 && (
                        <div style={breakdownRowStyle}>
                            <span>Service Charge:</span>
                            <span style={{ fontWeight: '600', color: '#333330' }}>{CURRENCY_SYMBOL}{serviceCharge.toFixed(2)}</span>
                        </div>
                    )}
                    
                    <div style={grandTotalRowStyle}>
                        <strong>GRAND TOTAL:</strong>
                        <strong>{CURRENCY_SYMBOL}{calculatedGrandTotal.toFixed(2)}</strong>
                    </div>
                </div>

                {order.paymentStatus === 'unpaid' && calculatedGrandTotal > 0 && (
                    <div style={{ marginTop: '16px' }}>
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
        
        const confirmedEntry = order.statusHistory?.find(entry => entry.status === 2);
        const confirmationTime = confirmedEntry ? formatTime(confirmedEntry.timestamp) : 'Awaiting Confirmation...';

        const serverName = order.serverName || 
                          order.statusHistory?.find(entry => entry.status === 5)?.serverName || 
                          order.statusHistory?.find(entry => entry.status === 6)?.serverName || 
                          "Assigning Server...";

        const displayLocation = order.orderType === 'Dining Hall' ? order.dispatchLocation : order.roomNumber;

        return (
            <div className="responsive-tracker-card" style={{ ...orderCardStyle, borderTop: `6px solid ${statusDetail.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ margin: 0, color: '#333330', fontSize: '0.95rem', fontWeight: '800' }}>
                    Order ID: <strong style={{ color: '#2C2C29', fontWeight: '900' }}>{order.id.slice(-8).toUpperCase()}</strong>
                    </h3>
                    <span style={typeBadgeStyle}>{order.orderType}</span>
                </div>
                
                <p style={{ margin: '10px 0 0 0', color: '#666660', fontSize: '0.95rem' }}>
                    Going to: <strong style={{ color: '#333330' }}>{displayLocation || order.roomNumber}</strong>
                </p>
                
                <hr style={dividerStyle}/>
                
                {renderFinancials(order)}

                {order.notes && (
                    <div style={notesContainerStyle}>
                        <strong style={{ color: '#856404', fontSize: '0.9rem' }}>Special Request / Allergies:</strong> 
                        <p style={{ margin: '4px 0 0 0', fontStyle: 'italic', color: '#666660', fontSize: '0.9rem' }}>{order.notes}</p>
                    </div>
                )}

                <hr style={dividerStyle}/>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', color: '#666660' }}>
                    <p style={{ margin: 0 }}>📅 Ordered: <strong style={{ color: '#333330' }}>{orderTime}</strong></p>
                    <p style={{ margin: 0 }}>✅ Confirmed: <strong style={{ color: '#333330' }}>{confirmationTime}</strong></p>
                    
                    {order.currentStatus >= 5 && (
                        <div style={{ 
                            marginTop: '8px', 
                            padding: '12px', 
                            backgroundColor: '#FCFAF2', 
                            borderRadius: '12px', 
                            borderLeft: '4px solid #D4AF37',
                            border: '1px solid #F3EDE0' 
                        }}>
                            <span style={{ fontWeight: '700', color: '#856404', fontSize: '0.9rem' }}>
                                👤 Delivering Staff: {serverName}
                            </span>
                        </div>
                    )}
                </div>

                <h3 style={{ 
                    color: statusDetail.color, 
                    marginTop: '24px', 
                    borderTop: '1px solid #EAE8E1', 
                    paddingTop: '16px',
                    textAlign: 'center',
                    fontSize: '1.15rem',
                    fontWeight: '800'
                }}>
                    Current Status: {statusDetail.name}
                </h3>
                
                <div style={{ padding: '12px', marginTop: '16px', backgroundColor: '#FDFDFB', border: '1px solid #EAE8E1', borderRadius: '12px', textAlign: 'center' }}>
                    <p style={{ margin: '0', fontSize: '0.85rem', color: '#666660' }}>
                        Need help? Call Reception: <strong style={{ color: '#333330' }}>{receptionContact}</strong>
                    </p>
                </div>

                {order.currentStatus === 1 && (
                    <div style={{ marginTop: '20px' }}>
                        {confirmCancelId === order.id ? (
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button 
                                    onClick={() => {
                                        cancelOrder(order.id, effectiveGuestId);
                                        setConfirmCancelId(null);
                                    }} 
                                    style={{ ...cancelButtonStyle, marginTop: 0, flex: 2, backgroundColor: '#FFF5F5' }}
                                >
                                    Confirm Cancellation?
                                </button>
                                <button 
                                    onClick={() => setConfirmCancelId(null)} 
                                    style={{ ...closeReceiptButtonStyle, flex: 1, borderRadius: '12px' }}
                                >
                                    Keep Order
                                </button>
                            </div>
                        ) : (
                            <button onClick={() => setConfirmCancelId(order.id)} style={cancelButtonStyle} disabled={isProcessing}>
                                ❌ Cancel Order (Before Confirmation)
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };
    
    const renderSettingsToggle = () => (
        <div className="responsive-settings-container" style={{ position: 'relative', marginBottom: '24px', width: '100%', maxWidth: '680px', textAlign: 'right' }}>
            <button onClick={() => setShowSettings(!showSettings)} style={settingsToggleButtonStyle}>
                {showSettings ? '✕ Close' : '⚙️ Alert Settings'}
            </button>
            {showSettings && (
                <div style={settingsDropdownStyle}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#333330', borderBottom: '1px solid #EAE8E1', paddingBottom: '8px', fontWeight: '700' }}>
                        Notification Prefs
                    </h4>
                    
                    <label style={settingLabelStyle}>
                        <span>Voice Alerts</span>
                        <input type="checkbox" checked={alertPrefs.voice} onChange={() => setAlertPrefs(prev => ({ ...prev, voice: !alertPrefs.voice }))} />
                    </label>

                    <label style={{ ...settingLabelStyle, opacity: isPushLoading ? 0.5 : 1 }}>
                        <span>Push Notifications</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {isPushLoading && <span style={{ fontSize: '10px', color: '#888883' }}>Syncing...</span>}
                            <input 
                                type="checkbox" 
                                disabled={isPushLoading} 
                                checked={alertPrefs.push} 
                                onChange={async () => {
                                    if (isPushLoading) return;
                                    if (!alertPrefs.push) {
                                        const activeOrderId = activeOrders?.[0]?.id;
                                        if (activeOrderId) {
                                            setIsPushLoading(true); 
                                            try {
                                                const token = await requestNotificationPermission(activeOrderId);
                                                if (token) {
                                                    setAlertPrefs(prev => ({ ...prev, push: true }));
                                                    alert("🚀 Push Notifications Enabled!");
                                                }
                                            } catch (err) {
                                                console.error("Push Error:", err);
                                            } finally {
                                                setIsPushLoading(false); 
                                            }
                                        } else {
                                            alert("Please place an order first to enable push alerts.");
                                        }
                                    } else {
                                        setAlertPrefs(prev => ({ ...prev, push: false }));
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
            <div className="responsive-page-container" style={pageContainerStyle}>
                <ResponsiveTrackerStyles />
                {renderSettingsToggle()}
                {activeOrders.length === 0 ? (
                    <p style={emptyStateStyle}>No active orders. Place a new order to start tracking!</p>
                ) : (
                    activeOrders.map(order => <div key={order.id} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>{renderOrderStatus(order)}</div>)
                )}
                {viewingReceipt && (
                    <ReceiptModal 
                        order={viewingReceipt} 
                        onClose={() => setViewingReceipt(null)} 
                        hotelName={hotelName} 
                        logoUrl={logoUrl} 
                    />
                )}
            </div>
        );
    }
    
    // --- 2. RENDER: ORDER HISTORY ---
  if (viewMode === 'history') {
        if (historyLoading) return <div style={pageContainerStyle}>Loading luxury history ledger...</div>;
        return (
            <div className="responsive-page-container" style={{ ...pageContainerStyle, padding: '24px 16px' }}>
                <ResponsiveTrackerStyles />
                
                {/* 🗑️ PREMIUM GLOBAL UTILITY CONTROL BLOCK */}
                {historyOrders.length > 0 && (
                    <div style={{ width: '100%', maxWidth: '640px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #EAE8E1', paddingBottom: '12px' }}>
                        <div style={{ textAlign: 'left' }}>
                            <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '800', color: '#121212', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Past Transactions</h4>
                            <span style={{ fontSize: '0.75rem', color: '#787873', fontWeight: '500' }}>Reviewing {historyOrders.length} historical statements</span>
                        </div>
                        <button 
                            onClick={handleClearAllHistory}
                            style={{
                                padding: '10px 16px',
                                backgroundColor: '#FFF5F5',
                                color: '#E53E3E',
                                border: '1px solid #FED7D7',
                                borderRadius: '12px',
                                fontSize: '0.8rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                            }}
                        >
                            💥 Clear All Logs
                        </button>
                    </div>
                )}

                {historyOrders.length === 0 ? (
                    <p style={emptyStateStyle}>No historical transaction fingerprints captured yet.</p>
                ) : (
                    <div style={{ width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {historyOrders.map(order => {
                            // 🗓️ Parse temporal components dynamically
                            const rawDate = order.orderTime?.toDate ? order.orderTime.toDate() : new Date(order.orderTime);
                            const formattedDate = rawDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            const formattedTime = rawDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

                            const serverName = order.serverName || "N/A";
                            const receiptCode = order.receiptId || order.id.slice(-8).toUpperCase();
                            
                            // 🎨 Dynamically determine state pill token color palettes
                            const isCancelled = order.currentStatus === 0;
                            const statusLabel = isCancelled ? "Cancelled" : "Completed";
                            const badgeBg = isCancelled ? '#FFF5F5' : '#E6F4EA';
                            const badgeColor = isCancelled ? '#C53030' : '#137333';
                            const badgeBorder = isCancelled ? '#FEB7B7' : '#A3E2B8';

                            return (
                                <div 
                                    key={order.id} 
                                    className="responsive-tracker-card" 
                                    style={{
                                        ...historyCardStyle,
                                        borderRadius: '20px',
                                        padding: '20px',
                                        backgroundColor: '#FFFFFF',
                                        border: expandedHistoryId === order.id ? '1px solid #121212' : '1px solid #EAE8E1',
                                        boxShadow: expandedHistoryId === order.id ? '0 12px 30px rgba(0,0,0,0.06)' : '0 4px 12px rgba(0,0,0,0.015)',
                                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }} 
                                    onClick={() => toggleHistoryDetails(order.id)}
                                >
                                    <div style={historyHeaderStyle}>
                                        
                                        {/* TOP CONTROL LINE ROW */}
                                        <div style={historyHeaderRowStyle}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                {/* Premium Token Code Pill */}
                                                <span style={{ 
                                                    fontWeight: '900', 
                                                    color: '#121212', 
                                                    fontSize: '0.9rem', 
                                                    letterSpacing: '1px',
                                                    fontFamily: 'monospace',
                                                    padding: '4px 10px',
                                                    borderRadius: '8px',
                                                    backgroundColor: '#F4F3EE',
                                                    border: '1px solid #E2E0D5'
                                                }}>
                                                    #{receiptCode}
                                                </span>
                                                {/* Core Status Label Token */}
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: '800',
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    backgroundColor: badgeBg,
                                                    color: badgeColor,
                                                    border: `1px solid ${badgeBorder}`,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.3px'
                                                }}>
                                                    {statusLabel}
                                                </span>
                                            </div>
                                            
                                            {/* Grand Total Value Tag */}
                                            <span style={{ 
                                                fontWeight: '900', 
                                                color: '#1A5235', 
                                                fontSize: '1.1rem',
                                                fontFamily: "'Inter', sans-serif"
                                            }}>
                                                {CURRENCY_SYMBOL}{(order.financials?.grandTotal || 0).toFixed(2)}
                                            </span>
                                        </div>
                                        
                                        {/* TEMPORAL METADATA TIMELINE LINE */}
                                        <div style={{ display: 'flex', gap: '14px', fontSize: '0.8rem', color: '#787873', marginTop: '10px', fontWeight: '500', alignItems: 'center' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>📅 {formattedDate}</span>
                                            <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#D8D6D0' }} />
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>⏱️ {formattedTime}</span>
                                        </div>

                                        {/* INTERACTIVE CONTROLS BOTTOM SUB-BAR */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginTop: '14px', borderTop: '1px solid #F4F3EE', paddingTop: '12px' }}>
                                            <span style={{ 
                                                fontSize: '0.8rem', 
                                                color: expandedHistoryId === order.id ? '#121212' : '#787873', 
                                                fontWeight: '800', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '4px' 
                                            }}>
                                                {expandedHistoryId === order.id ? '▲ Collapse Receipt Details' : '▼ Expand Folio Breakdown'}
                                            </span>
                                            
                                            {/* Elegant Destructive Wipe Log Token Button */}
                                            <button
                                                onClick={(e) => handleDeleteSingleHistory(e, order.id, receiptCode)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#A0A09A',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer',
                                                    padding: '6px 12px',
                                                    borderRadius: '8px',
                                                    transition: 'all 0.2s ease',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                                onMouseEnter={(e) => { e.target.style.color = '#E53E3E'; e.target.style.backgroundColor = '#FFF5F5'; }}
                                                onMouseLeave={(e) => { e.target.style.color = '#A0A09A'; e.target.style.backgroundColor = 'transparent'; }}
                                            >
                                                🗑️ Wipe Log
                                            </button>
                                        </div>
                                    </div>

                                    {/* EXPANDED INTERFACE AREA CONTENT BLOCK */}
                                    {expandedHistoryId === order.id && (
                                        <div style={{ marginTop: '16px', animation: 'fadeIn 0.25s ease-out', borderTop: '1px dashed #D8D6D0', paddingTop: '16px' }} onClick={(e) => e.stopPropagation()}>
                                            
                                            {/* LUXURY METADATA PROFILE LEAD LEDGER CHIP GRID CONTAINER */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', padding: '12px 14px', backgroundColor: '#FBFBF9', borderRadius: '14px', border: '1px solid #EAE8E1' }}>
                                                <div>
                                                    <span style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: '800', color: '#A09F9A', letterSpacing: '0.8px', marginBottom: '2px' }}>Timestamp</span>
                                                    <strong style={{ color: '#2C2C29', fontSize: '0.85rem', fontWeight: '700' }}>{formattedDate} • {formattedTime}</strong>
                                                </div>
                                                <div>
                                                    <span style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: '800', color: '#A09F9A', letterSpacing: '0.8px', marginBottom: '2px' }}>Delivering Attendant</span>
                                                    <strong style={{ color: serverName !== 'N/A' ? '#0047AB' : '#2C2C29', fontSize: '0.85rem', fontWeight: '700' }}>
                                                        {serverName !== 'N/A' ? `👤 ${serverName}` : '🛎️ Front Desk Despatch'}
                                                    </strong>
                                                </div>
                                            </div>

                                            {/* Core Pricing Calculations Wrapper */}
                                            {renderFinancials(order)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                
                {viewingReceipt && (
                    <ReceiptModal 
                        order={viewingReceipt} 
                        onClose={() => setViewingReceipt(null)} 
                        hotelName={hotelName} 
                        logoUrl={logoUrl} 
                    />
                )}
            </div>
        );
    }

    return null;
}

// --- MASTER STYLES ---
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20, 20, 19, 0.75)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '20px' };
const receiptContainerStyle = { backgroundColor: '#FFFFFF', padding: '32px', borderRadius: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 25px 50px rgba(12, 12, 10, 0.12)', border: '1px solid #EAE8E1', position: 'relative', overflow: 'hidden', boxSizing: 'border-box' };
const receiptRowStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.9rem', color: '#333330' };
const printButtonStyle = { flex: 1, padding: '14px', backgroundColor: '#2C2C29', color: '#FFFFFF', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', transition: 'background 0.2s ease', fontSize: '0.9rem' };
const closeReceiptButtonStyle = { padding: '14px', backgroundColor: '#F4F3EE', color: '#4A4A45', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '700', transition: 'background 0.2s ease', fontSize: '0.9rem' };
const closeReceiptXStyle = { position: 'absolute', top: '20px', right: '20px', border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#A09F9A' };

const pageContainerStyle = { backgroundColor: '#FAF9F5', boxSizing: 'border-box', padding: '20px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#333330', fontFamily: "'Inter', sans-serif" };
const orderCardStyle = { width: '100%', maxWidth: '680px', backgroundColor: '#FFFFFF', padding: '32px', borderRadius: '24px', marginBottom: '24px', boxShadow: '0 10px 40px rgba(20, 20, 18, 0.04)', border: '1px solid #EAE8E1', boxSizing: 'border-box', animation: 'fadeSlideUp 0.5s ease-out' };
const breakdownCardStyle = { padding: '22px', backgroundColor: '#FDFDFB', borderRadius: '16px', marginBottom: '16px', border: '1px solid #EAE8E1', boxSizing: 'border-box' };
const paystackButtonStyle = { width: '100%', padding: '16px', backgroundColor: '#2C2C29', color: '#FFFFFF', border: 'none', borderRadius: '14px', fontWeight: '800', cursor: 'pointer', fontSize: '1rem', marginTop: '8px', boxShadow: '0 6px 20px rgba(44, 44, 41, 0.12)', transition: 'all 0.2s ease' };
const receiptButtonStyle = { width: '100%', padding: '14px', backgroundColor: '#F4F3EE', color: '#2C2C29', border: '1px solid #EAE8E1', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', marginTop: '16px', fontSize: '0.85rem', transition: 'all 0.2s ease' };
const cancelButtonStyle = { padding: '14px', backgroundColor: 'transparent', color: '#C94A4A', border: '1px solid #EEDCDD', borderRadius: '12px', cursor: 'pointer', marginTop: '16px', width: '100%', fontWeight: '700', fontSize: '0.85rem', transition: 'all 0.2s ease' };
const notesContainerStyle = { padding: '14px 16px', backgroundColor: '#FCFAF2', borderLeft: '4px solid #D4AF37', border: '1px solid #F3EDE0', borderRadius: '12px', marginBottom: '14px', boxSizing: 'border-box' };
const historyCardStyle = { width: '100%', boxSizing: 'border-box', padding: '24px', borderRadius: '20px', backgroundColor: '#FFFFFF', border: '1px solid #EAE8E1', boxShadow: '0 4px 20px rgba(20, 20, 18, 0.03)', cursor: 'pointer', transition: 'all 0.2s ease' };
const historyHeaderStyle = { display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' };
const historyHeaderRowStyle = { display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' };
const historyTotalStyle = { fontWeight: '800', color: '#2E7D32', backgroundColor: '#E8F5E9', padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', border: '1px solid #C8E6C9' };
const historyToggleStyle = { fontSize: '0.8rem', color: '#787873', fontWeight: '700', marginTop: '2px' };
const itemizedListStyle = { listStyle: 'none', padding: '0', margin: '0 0 16px 0', borderBottom: '1px solid #EAE8E1', paddingBottom: '12px' };
const itemizedListItemStyle = { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.95rem', color: '#666660' };
const breakdownSummaryStyle = { marginTop: '12px', paddingTop: '4px', fontSize: '0.95rem' };
const breakdownRowStyle = { display: 'flex', justifyContent: 'space-between', padding: '5px 0', color: '#666660' };
const grandTotalRowStyle = { display: 'flex', justifyContent: 'space-between', marginTop: '12px', borderTop: '2px solid #2C2C29', paddingTop: '14px', fontSize: '1.15rem', fontWeight: '900', color: '#2C2C29' };
const emptyStateStyle = { padding: '40px 20px', textAlign: 'center', color: '#888883', fontSize: '0.95rem', backgroundColor: '#FFFFFF', borderRadius: '24px', border: '1px solid #EAE8E1', width: '100%', maxWidth: '680px', boxShadow: '0 4px 20px rgba(20,20,18,0.02)', boxSizing: 'border-box' };
const typeBadgeStyle = { fontSize: '0.75rem', backgroundColor: '#F4F3EE', padding: '5px 12px', borderRadius: '20px', fontWeight: '800', color: '#555550', letterSpacing: '0.5px', textTransform: 'uppercase' };
const dividerStyle = { margin: '22px 0', border: '0', borderTop: '1px solid #EAE8E1' };
const settingsToggleButtonStyle = { background: '#FFFFFF', border: '1px solid #EAE8E1', borderRadius: '20px', padding: '8px 16px', fontSize: '0.85rem', fontWeight: '700', color: '#4A4A45', cursor: 'pointer', boxShadow: '0 4px 12px rgba(20, 20, 18, 0.03)', display: 'inline-flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s ease' };
const settingsDropdownStyle = { position: 'absolute', top: '48px', right: '0', backgroundColor: '#FFFFFF', border: '1px solid #EAE8E1', borderRadius: '18px', padding: '20px', boxShadow: '0 12px 40px rgba(20, 20, 18, 0.08)', zIndex: 1000, width: '230px', textAlign: 'left', animation: 'fadeIn 0.2s ease-out', boxSizing: 'border-box' };
const settingLabelStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0', fontSize: '0.85rem', cursor: 'pointer', color: '#555550', fontWeight: '600' };

export default GuestTracker;