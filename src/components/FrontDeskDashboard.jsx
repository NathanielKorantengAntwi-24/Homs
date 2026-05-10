import React, { useState, useEffect, useMemo, useRef } from 'react'; 
import { useRealTimeOrders } from '../hooks/useRealTimeOrders'; 
import { confirmOrder, updateOrderStatus, cancelOrder, updateCustomItemPrices } from '../utils/orderActions'; 
import { getStatusDetails } from '../utils/statusMapping'; 
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const ACTIVE_MONITORING_STATUSES = [1, 2, 3, 4, 5, 6]; 
const CURRENT_FRONT_DESK_ID = "FD_User_A"; 
const CURRENCY_SYMBOL = 'GH₵'; 

const STATUS_BACKUP = {
    1: { label: 'PENDING', color: '#3498db' },
    2: { label: 'CONFIRMED', color: '#2ecc71' },
    3: { label: 'PREPARING', color: '#f1c40f' },
    4: { label: 'READY', color: '#9b59b6' },
    5: { label: 'DELIVERING', color: '#1abc9c' },
    6: { label: 'DELIVERING', color: '#27ae60' } 
};

const formatTimeLong = (timestampOrDate) => {
    if (!timestampOrDate) return 'N/A';
    let date = timestampOrDate.toDate ? timestampOrDate.toDate() : new Date(timestampOrDate); 
    return date.toLocaleString('en-US', { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true 
    });
};

function FrontDeskDashboard() {
    const [activeHubView, setActiveHubView] = useState('operations');
    const { orders: activeData, loading: activeLoading } = useRealTimeOrders(null, null, null);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilterStatus, setActiveFilterStatus] = useState(0); 

    const [sentMessages, setSentMessages] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [msgForm, setMsgForm] = useState({ 
        name: '', 
        date: new Date().toISOString().split('T')[0], 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }), 
        message: '' 
    });

    const [tempPrices, setTempPrices] = useState({});
    const [editingPriceIndex, setEditingPriceIndex] = useState(null); 
    const [expandedOrderId, setExpandedOrderId] = useState(null);

    // --- VOICE & PAYMENT ALERT STATES ---
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const lastPendingCountRef = useRef(0);
    const prevPaidIdsRef = useRef(new Set());
    const [justPaidId, setJustPaidId] = useState(null); 

    useEffect(() => {
        const q = query(collection(db, 'kitchen_notes'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allMsgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSentMessages(allMsgs.filter(m => !m.deletedByFrontDesk));
        });
        return () => unsubscribe();
    }, []);

    // --- PAYMENT NOTIFICATION OBSERVER ---
   // --- UPDATED: PAYMENT NOTIFICATION OBSERVER ---
useEffect(() => {
    if (activeLoading) return;
    
    const currentPaidIds = new Set(activeData.filter(o => o.paymentStatus === 'paid').map(o => o.id));
    const newlyPaidId = [...currentPaidIds].find(id => !prevPaidIdsRef.current.has(id));

    if (newlyPaidId) {
        // 1. Play the Chime
        const chime = new Audio('https://assets.mixkit.co/active_storage/sfx/1017/1017-preview.mp3');
        chime.play().catch(() => {});

        // 2. Add Voice Alert
        if (voiceEnabled) {
            const utterance = new SpeechSynthesisUtterance("A new payment has been received.");
            utterance.rate = 1.0;
            window.speechSynthesis.speak(utterance);
        }

        setJustPaidId(newlyPaidId);
        setTimeout(() => setJustPaidId(null), 5000);
    }
    prevPaidIdsRef.current = currentPaidIds;
}, [activeData, activeLoading, voiceEnabled]); // Added voiceEnabled to dependencies

    // --- VOICE ALERT LOGIC ---
    useEffect(() => {
        if (activeLoading) return;
        const pendingOrders = activeData.filter(o => o.currentStatus === 1);
        const currentCount = pendingOrders.length;
        if (voiceEnabled && currentCount > lastPendingCountRef.current) {
            const utterance = new SpeechSynthesisUtterance("Hello FrontDesk! ,You have received a new order");
            const voices = window.speechSynthesis.getVoices();
            const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Google UK English Female'));
            if (femaleVoice) utterance.voice = femaleVoice;
            utterance.rate = 0.9; utterance.pitch = 1.1; 
            window.speechSynthesis.speak(utterance);
        }
        lastPendingCountRef.current = currentCount;
    }, [activeData, activeLoading, voiceEnabled]);

    const liveOrdersOnly = useMemo(() => {
        return activeData.filter(o => ACTIVE_MONITORING_STATUSES.includes(o.currentStatus));
    }, [activeData]);

    const activeOrdersCount = liveOrdersOnly.length;

    const masterFilteredOrders = useMemo(() => {
        return liveOrdersOnly.filter(o => {
            const s = searchTerm.toLowerCase();
            const location = (o.orderType === 'Dining Hall' ? o.dispatchLocation : o.roomNumber) || "";
            const matchesSearch = o.roomNumber?.toLowerCase().includes(s) || 
                                 location.toLowerCase().includes(s) || 
                                 (o.id || "").toLowerCase().includes(s);
            if (!matchesSearch) return false;
            if (activeFilterStatus === 0) return true;
            if (activeFilterStatus === 5) return (o.currentStatus === 5 || o.currentStatus === 6);
            return o.currentStatus === activeFilterStatus;
        });
    }, [liveOrdersOnly, searchTerm, activeFilterStatus]);

    const handleCancelWithGuard = async (orderId) => {
        if (window.confirm("Are you sure you want to cancel this order? This action cannot be undone.")) {
            try { await cancelOrder(orderId, CURRENT_FRONT_DESK_ID); } catch (e) { alert("Error: " + e.message); }
        }
    };

    const handleSavePrice = async (orderId, itemIndex) => {
    const priceValue = tempPrices[`${orderId}-${itemIndex}`];
    const newPrice = parseFloat(priceValue);
    
    if (isNaN(newPrice) || newPrice < 0) return alert("Please enter a valid price");
    
    const order = activeData.find(o => o.id === orderId);
    if (!order) return;

    // 1. Create the updated items array
    const updatedItems = [...order.items];
    updatedItems[itemIndex] = { ...updatedItems[itemIndex], price: newPrice };

    // 2. 🔥 RECALCULATE TOTALS (The Missing Step)
    const newSubtotal = updatedItems.reduce((sum, item) => {
        return sum + (item.qty * (item.price || 0));
    }, 0);

    const serviceCharge = order.financials?.serviceCharge || 0;
    const newGrandTotal = newSubtotal + serviceCharge;

    try {
        const orderRef = doc(db, 'orders', orderId);
        
        // 3. UPDATE EVERYTHING: Items AND the Financial fields
        await updateDoc(orderRef, {
            items: updatedItems,
            // Use dot notation to update nested fields without overwriting the whole object
            "financials.subtotal": newSubtotal,
            "financials.grandTotal": newGrandTotal,
            priceUpdatedAt: serverTimestamp(),
            lastUpdatedBy: CURRENT_FRONT_DESK_ID
        });

        // 4. Cleanup UI state
        setEditingPriceIndex(null);
        const newTempPrices = { ...tempPrices };
        delete newTempPrices[`${orderId}-${itemIndex}`];
        setTempPrices(newTempPrices);

    } catch (e) { 
        console.error("Price Update Error:", e);
        alert("Error: " + e.message); 
    }
};
    const requestGuestPayment = async (orderId) => {
        try {
            await updateDoc(doc(db, 'orders', orderId), {
                paymentStatus: 'unpaid',
                paymentRequestedAt: serverTimestamp()
            });
        } catch (e) { alert("Error: " + e.message); }
    };

    const handleSendBroadcast = async () => {
        if(!msgForm.name || !msgForm.message) return alert("Name and Message are required");
        const payload = {
            sender: msgForm.name, message: msgForm.message, date: msgForm.date,
            time: msgForm.time, updatedAt: serverTimestamp(), status: 'unread'
        };
        try {
            if (editingId) {
                await updateDoc(doc(db, 'kitchen_notes', editingId), payload);
                setEditingId(null);
            } else {
                await addDoc(collection(db, 'kitchen_notes'), { ...payload, createdAt: serverTimestamp() });
            }
            setMsgForm({ name: msgForm.name, message: '', date: new Date().toISOString().split('T')[0],
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
            });
        } catch (e) { alert("Error: " + e.message); }
    };

    const renderOrderCard = (order) => {
        const details = getStatusDetails(order.currentStatus);
        const label = details?.label || STATUS_BACKUP[order.currentStatus]?.label || "ACTIVE";
        const color = details?.color || STATUS_BACKUP[order.currentStatus]?.color || "#ccc";
        const displayLocation = order.orderType === 'Dining Hall' ? order.dispatchLocation : order.roomNumber;
        const confirmedEntry = order.statusHistory?.find(entry => entry.status === 2);
        const confirmationTime = confirmedEntry ? formatTimeLong(confirmedEntry.timestamp) : 'Not Confirmed';

        const isNewlyPaid = justPaidId === order.id;
        const hasUnpricedItems = order.items.some(i => (i.price || 0) <= 0);
        const pStatus = (order.paymentStatus || 'unpaid').toUpperCase();
        const pColor = order.paymentStatus === 'paid' ? '#2ecc71' : '#e74c3c';

        return (
            <div key={order.id} style={{ 
                ...orderCardStyle, 
                borderTop: `6px solid ${color}`,
                backgroundColor: isNewlyPaid ? '#f0fff4' : '#fff',
                transition: 'all 0.5s ease'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h4 style={{fontSize: '0.75rem', marginBottom: '8px', fontFamily: 'monospace', wordBreak: 'break-all'}}>ID: {order.id}</h4>
                    {isNewlyPaid ? <span style={newlyPaidBadgeStyle}>NEWLY PAID ✅</span> : (order.prepTime && <span style={prepTimeBadgeStyle}>⏱️ {order.prepTime}</span>)}
                </div>
                
                <p style={infoLine}>Status: <strong style={{color}}>{label.toUpperCase()}</strong></p>
                <p style={infoLine}>Loc: <strong>{displayLocation}</strong> | WA: <strong>{order.whatsappNumber || 'N/A'}</strong></p>
                {order.serverName && <p style={infoLine}>Server: <strong>{order.serverName}</strong></p>}
                <p style={infoLine}>Payment: <strong style={{color: pColor}}>{pStatus}</strong></p>
                
                <div style={notesContainerStyle}><strong>Special Request:</strong><p style={{margin: '3px 0 0 0'}}>{order.notes || 'NA'}</p></div>
                
                <div style={financialCardStyle}>
                    <ul style={itemizedListStyle}>
                        {order.items?.map((item, idx) => {
                            const isEditing = editingPriceIndex === `${order.id}-${idx}`;
                            return (
                                <li key={idx} style={{...itemizedListItemStyle, flexDirection: 'column', alignItems: 'flex-start', borderBottom: '1px solid #eee', paddingBottom: '5px'}}>
                                    <div style={{display:'flex', justifyContent:'space-between', width: '100%', alignItems: 'center'}}>
                                        <span>{item.qty}x {item.name}</span>
                                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                            <span style={{color: item.price > 0 ? '#000' : '#e74c3c'}}>{CURRENCY_SYMBOL}{((item.price || 0) * item.qty).toFixed(2)}</span>
                                            {order.currentStatus === 1 && (item.type === 'special' || item.type === 'custom') && !isEditing && (
                                                <button onClick={() => {setEditingPriceIndex(`${order.id}-${idx}`); setTempPrices({...tempPrices, [`${order.id}-${idx}`]: item.price});}} style={editPriceBtnStyle}>Edit Price</button>
                                            )}
                                        </div>
                                    </div>
                                    {isEditing && (
                                        <div style={{display: 'flex', gap: '5px', marginTop: '5px', width: '100%'}}>
                                            <input type="number" style={{flex: 1, fontSize: '0.7rem'}} value={tempPrices[`${order.id}-${idx}`] ?? ''} onChange={(e) => setTempPrices({...tempPrices, [`${order.id}-${idx}`]: e.target.value})} />
                                            <button onClick={() => handleSavePrice(order.id, idx)} style={savePriceBtnStyle}>Save</button>
                                            <button onClick={() => setEditingPriceIndex(null)} style={cancelEditBtnStyle}>X</button>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <div style={grandTotalRowStyle}><strong>TOTAL:</strong><strong>{CURRENCY_SYMBOL}{order.financials?.grandTotal?.toFixed(2)}</strong></div>
                </div>
                
                <p style={{marginTop:'10px', fontSize: '0.75rem'}}>Placed: <strong>{formatTimeLong(order.orderTime)}</strong></p>
                <p style={{marginTop:'2px', fontSize: '0.75rem'}}>Confirmed: <strong>{confirmationTime}</strong></p>

                <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                    {order.currentStatus === 1 && (
                        <button onClick={() => confirmOrder(order.id, CURRENT_FRONT_DESK_ID)} style={{...confirmButtonStyle, opacity: hasUnpricedItems ? 0.5 : 1}} disabled={hasUnpricedItems}>Accept</button>
                    )}
                    {order.currentStatus === 1 && order.paymentStatus === 'pending_price' && !hasUnpricedItems && (
                        <button onClick={() => requestGuestPayment(order.id)} style={{...confirmButtonStyle, backgroundColor: '#3498db'}}>Req Pay</button>
                    )}
                    {order.currentStatus <= 2 && <button onClick={() => handleCancelWithGuard(order.id)} style={cancelFrontDeskButtonStyle}>Cancel</button>}
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: '15px', backgroundColor: '#f4f7f6', minHeight: '100vh' }}>
            <div style={hubNav}>
                <button onClick={() => setActiveHubView('operations')} style={activeHubView === 'operations' ? activeHubBtn : hubBtn}>📋 OPERATIONS</button>
                <button onClick={() => setActiveHubView('history')} style={activeHubView === 'history' ? activeHubBtn : hubBtn}>📜 HISTORY</button>
                <button onClick={() => setActiveHubView('messenger')} style={activeHubView === 'messenger' ? activeHubBtn : hubBtn}>💬 KITCHEN MSG</button>
                <button onClick={() => setVoiceEnabled(!voiceEnabled)} style={{...hubBtn, backgroundColor: voiceEnabled ? '#2ecc71' : '#e74c3c', marginLeft: '10px'}}>{voiceEnabled ? '🔊 Voice On' : '🔇 Voice Off'}</button>
            </div>

            {activeHubView === 'operations' && (
                <>
                    <div style={filterBarContainer}>
                        <div style={statusBtnGroup}>
                            {[{id:0,l:'ALL'},{id:1,l:'PENDING'},{id:2,l:'CONFIRMED'},{id:3,l:'PREPARING'},{id:4,l:'READY'},{id:5,l:'DELIVERING'}].map(tab => (
                                <button key={tab.id} onClick={() => setActiveFilterStatus(tab.id)} style={activeFilterStatus === tab.id ? activeFilterBtn : filterBtn}>{tab.l}</button>
                            ))}
                        </div>
                        <div style={{display:'flex', alignItems:'center', gap: '15px'}}>
                            <div style={activeCounterBadge}>🔥 {activeOrdersCount} Active</div>
                            <input type="text" placeholder="Search by ID or Room..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={searchBar} />
                        </div>
                    </div>
                    <div style={wideGridContainer}>
                        {[1, 2, 3, 4, 5].map(st => (
                            <div key={st} style={columnStyle}>
                                <h3 style={colHeadStyle}>{STATUS_BACKUP[st]?.label || 'DELIVERING'}</h3>
                                {masterFilteredOrders.filter(o => st === 5 ? [5,6].includes(o.currentStatus) : o.currentStatus === st).map(renderOrderCard)}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {activeHubView === 'history' && (
                <div style={{maxWidth: '850px', margin: '0 auto', background: '#fff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)'}}>
                    <h2 style={{borderBottom: '2px solid #f0f0f0', paddingBottom: '15px', marginBottom: '20px'}}>Past Orders</h2>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                        {activeData.filter(o => o.currentStatus === 0 || o.currentStatus >= 7).sort((a,b) => (b.archivalDate || b.orderTime) - (a.archivalDate || a.orderTime)).map(o => {
                            const isExpanded = expandedOrderId === o.id;
                            const displayLoc = o.orderType === 'Dining Hall' ? o.dispatchLocation : o.roomNumber;
                            return (
                                <div key={o.id} style={historyCardStyle} onClick={() => setExpandedOrderId(isExpanded ? null : o.id)}>
                                    <div style={historyHeaderStyle}>
                                        <div style={historyHeaderRowStyle}>
                                            <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
                                                <span style={{ fontWeight: 'bold', fontSize: '0.85rem', fontFamily: 'monospace', color: '#1e293b' }}>FULL ID: {o.id}</span>
                                                <span style={{ fontSize: '0.9rem', color: '#2c3e50', fontWeight: '600' }}>Location: {displayLoc}</span>
                                            </div>
                                            <span style={historyTotalStyle}>{CURRENCY_SYMBOL}{(o.financials?.grandTotal || 0).toFixed(2)}</span>
                                        </div>
                                        <div style={historyHeaderRowStyle}>
                                            <span style={{ fontSize: '0.8em', color: '#6c757d' }}>Finalized: {formatTimeLong(o.archivalDate || o.orderTime)}</span>
                                            <span style={{ color: '#343a40' }}>{o.orderType}</span>
                                        </div>
                                        <span style={historyToggleStyle}>{isExpanded ? '▲ Hide Details' : '▼ View Details'}</span>
                                    </div>
                                    {isExpanded && (
                                        <div style={historyDetailStyle}>
                                            <hr style={{ margin: '10px 0', border: '0', borderTop: '1px solid #eee' }}/>
                                            <div style={breakdownCardStyle}>
                                                <h4 style={{ borderBottom: '1px solid #ced4da', paddingBottom: '5px', fontSize: '0.85rem' }}>Price Breakdown</h4>
                                                <ul style={itemizedListStyle}>
                                                    {o.items?.map((item, idx) => (
                                                        <li key={idx} style={itemizedListItemStyle}>
                                                            <span>{item.qty}x {item.name}</span>
                                                            <span>{CURRENCY_SYMBOL}{((item.price || 0) * item.qty).toFixed(2)}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                                <div style={breakdownSummaryStyle}>
                                                    <div style={breakdownRowStyle}><span>Subtotal:</span><span>{CURRENCY_SYMBOL}{o.financials?.subtotal?.toFixed(2)}</span></div>
                                                    {o.financials?.serviceCharge > 0 && <div style={breakdownRowStyle}><span>Service Charge:</span><span>{CURRENCY_SYMBOL}{o.financials?.serviceCharge?.toFixed(2)}</span></div>}
                                                    <div style={grandTotalRowStyle}><strong>GRAND TOTAL:</strong><strong>{CURRENCY_SYMBOL}{o.financials?.grandTotal?.toFixed(2)}</strong></div>
                                                </div>
                                            </div>
                                            <p style={{ marginTop: '10px', fontSize: '0.85rem' }}>Ordered: {formatTimeLong(o.orderTime)} | Server: {o.serverName || 'N/A'}</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {activeHubView === 'messenger' && (
                <div style={messengerWrapper}>
                    <div style={orderCardStyle}>
                        <h3>{editingId ? "✏️ Edit Broadcast" : "📢 Broadcast to Kitchen"}</h3>
                        <input type="text" placeholder="Name" value={msgForm.name} onChange={e => setMsgForm({...msgForm, name: e.target.value})} style={inputStyle} />
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <input type="date" value={msgForm.date} onChange={e => setMsgForm({...msgForm, date: e.target.value})} style={{...inputStyle, marginBottom: 0, flex: 1}} />
                            <input type="time" value={msgForm.time} onChange={e => setMsgForm({...msgForm, time: e.target.value})} style={{...inputStyle, marginBottom: 0, flex: 1}} />
                        </div>
                        <textarea placeholder="Message..." value={msgForm.message} onChange={e => setMsgForm({...msgForm, message: e.target.value})} style={textAreaStyle} />
                        <div style={{display:'flex', gap:'10px', marginTop:'10px'}}>
                            <button onClick={handleSendBroadcast} style={confirmButtonStyle}>{editingId ? "Update" : "🚀 Send"}</button>
                            {editingId && <button onClick={() => {setEditingId(null); setMsgForm({...msgForm, message:''})}} style={cancelFrontDeskButtonStyle}>Cancel</button>}
                        </div>
                    </div>
                    <div style={{marginTop: '20px'}}>
                        <h4>Broadcast History</h4>
                        {sentMessages.map(m => (
                            <div key={m.id} style={{...orderCardStyle, borderLeft: m.status === 'read' ? '5px solid #2ecc71' : '5px solid #f1c40f'}}>
                                <div style={{display:'flex', justifyContent:'space-between', marginBottom: '5px'}}>
                                    <strong>{m.sender}</strong>
                                    <span style={{fontSize: '0.7rem', fontWeight: 'bold', color: m.status === 'read' ? '#2ecc71' : '#f39c12'}}>{m.status === 'read' ? '✅ READ' : '⏳ UNREAD'}</span>
                                    <small>{m.date} {m.time}</small>
                                </div>
                                <p style={{whiteSpace: 'pre-wrap', margin: '10px 0'}}>{m.message}</p>
                                <div style={{display:'flex', gap: '10px'}}>
                                    <button onClick={() => {setEditingId(m.id); setMsgForm({ name: m.sender, message: m.message, date: m.date, time: m.time })}} style={editActionBtn}>✏️ Edit</button>
                                    <button onClick={async () => {
                                        if(window.confirm("Delete broadcast?")) {
                                            await updateDoc(doc(db, 'kitchen_notes', m.id), { deletedByFrontDesk: true });
                                        }
                                    }} style={delActionBtn}>🗑️ Del</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// STYLES
const newlyPaidBadgeStyle = { backgroundColor: '#2ecc71', color: 'white', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' };
const editPriceBtnStyle = { fontSize: '0.6rem', padding: '2px 4px', cursor: 'pointer', backgroundColor: '#f1c40f', border: 'none', borderRadius: '3px' };
const savePriceBtnStyle = { fontSize: '0.65rem', backgroundColor: '#3498db', color: '#fff', border: 'none', padding: '2px 8px' };
const cancelEditBtnStyle = { fontSize: '0.65rem', backgroundColor: '#999', color: '#fff', border: 'none', padding: '2px 8px' };
const prepTimeBadgeStyle = { backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #ffedd5', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' };
const historyCardStyle = { margin: '10px 0', padding: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fff', fontSize: '0.9em', cursor: 'pointer' };
const historyHeaderStyle = { display: 'flex', flexDirection: 'column', gap: '4px' };
const historyHeaderRowStyle = { display: 'flex', justifyContent: 'space-between', width: '100%' };
const historyTotalStyle = { fontWeight: 'bold', color: '#008000', backgroundColor: '#e6ffe6', padding: '2px 8px', borderRadius: '4px' };
const historyToggleStyle = { marginTop: '5px', fontSize: '0.8em', color: '#007bff' };
const historyDetailStyle = { paddingTop: '5px' };
const breakdownCardStyle = { padding: '10px', border: '1px solid #eee', borderRadius: '4px', marginBottom: '10px', backgroundColor: '#fafafa' };
const breakdownSummaryStyle = { marginTop: '10px', paddingTop: '5px', fontSize: '0.95rem' };
const breakdownRowStyle = { display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#343a40' };
const grandTotalRowStyle = { ...breakdownRowStyle, borderTop: '2px double #343a40', paddingTop: '8px', fontSize: '1rem', fontWeight: 'bold' };
const activeCounterBadge = { backgroundColor: '#e74c3c', color: 'white', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold' };
const wideGridContainer = { display: 'flex', gap: '12px', alignItems: 'flex-start', overflowX: 'auto' };
const columnStyle = { flex: '1', minWidth: '310px', backgroundColor: '#ebedef', padding: '12px', borderRadius: '10px' };
const colHeadStyle = { borderBottom: '2px solid #ccc', paddingBottom: '10px', fontSize: '0.9rem', textAlign: 'center', fontWeight: 'bold' };
const filterBarContainer = { display: 'flex', justifyContent: 'space-between', marginBottom: '15px', padding: '10px', backgroundColor: '#fff', borderRadius: '8px', alignItems: 'center' };
const statusBtnGroup = { display: 'flex', gap: '5px' };
const filterBtn = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' };
const activeFilterBtn = { ...filterBtn, backgroundColor: '#1e293b', color: '#fff' };
const searchBar = { padding: '10px', borderRadius: '6px', border: '1px solid #ddd', width: '250px', fontSize: '0.85rem' };
const hubNav = { display: 'flex', gap: '10px', marginBottom: '15px', justifyContent: 'center' };
const hubBtn = { padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' };
const activeHubBtn = { ...hubBtn, backgroundColor: '#ffc107', color: '#1e293b' };
const orderCardStyle = { margin: '12px 0', padding: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fff' };
const infoLine = { fontSize: '0.85rem', marginBottom: '5px' };
const notesContainerStyle = { padding: '10px', backgroundColor: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '4px', marginBottom: '10px', fontSize: '0.85rem' };
const financialCardStyle = { marginTop: '10px', padding: '12px', backgroundColor: '#fafafa', borderRadius: '6px', border: '1px solid #eee' };
const itemizedListStyle = { listStyle: 'none', padding: '0', margin: '0' };
const itemizedListItemStyle = { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.85rem' };
const confirmButtonStyle = { flex: 1, padding: '10px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' };
const cancelFrontDeskButtonStyle = { padding: '10px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', marginBottom: '10px', boxSizing: 'border-box' };
const textAreaStyle = { width: '100%', height: '80px', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', whiteSpace: 'pre-wrap' };
const messengerWrapper = { maxWidth: '800px', margin: '0 auto' };
const editActionBtn = { background: '#3498db', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' };
const delActionBtn = { background: '#e74c3c', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' };

export default FrontDeskDashboard;