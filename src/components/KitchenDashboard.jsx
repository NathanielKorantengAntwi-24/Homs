import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useRealTimeOrders } from '../hooks/useRealTimeOrders'; 
import { updateOrderStatus, dispatchOrder } from '../utils/orderActions'; 
import { getStatusDetails } from '../utils/statusMapping'; 
import { doc, updateDoc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { logSystemEvent } from '../utils/logger';

// INTEGRATED: FrontDeskArchival component now managed in Kitchen
import FrontDeskArchival from './FrontDeskArchival';

// MONITORING: We start from Status 2 (Confirmed) up to 6 (Delivered)
const KITCHEN_MONITORING_STATUSES = [2, 3, 4, 5, 6]; 
const CURRENT_KITCHEN_ID = "Kitchen_User_A"; 

const formatTime = (timestampOrDate) => {
    if (!timestampOrDate) return '--:--';
    try {
        const date = timestampOrDate.toDate ? timestampOrDate.toDate() : new Date(timestampOrDate); 
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) { return '--:--'; }
};

function KitchenDashboard() {
    const [activeView, setActiveView] = useState('operations'); 
    const { orders, loading } = useRealTimeOrders(null, null, KITCHEN_MONITORING_STATUSES);
    const [broadcasts, setBroadcasts] = useState([]);
    
    // --- AUDIO ALERTS STATE ---
    const [audioEnabled, setAudioEnabled] = useState(false);
    const lastConfirmedCountRef = useRef(0);

    // 1. Listen for Front Desk Notes
    useEffect(() => {
        const q = query(collection(db, 'kitchen_notes'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setBroadcasts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, []);

    // 2. VOICE ALERT LOGIC (Text-to-Speech Female Voice)
    useEffect(() => {
        if (loading) return;

        // Filter for "NEW ORDERS" column (Status 2)
        const newOrders = orders.filter(o => o.currentStatus === 2);
        const currentCount = newOrders.length;

        // Trigger Voice if a new confirmed order arrives and audio is enabled
        if (audioEnabled && currentCount > lastConfirmedCountRef.current) {
            const utterance = new SpeechSynthesisUtterance("Hello kitchen! , You have recieved a new order");
            
            // Fetch available voices
            const voices = window.speechSynthesis.getVoices();
            
            // Priority list for female voices across different browsers
            const femaleVoice = voices.find(v => 
                v.name.includes('Google UK English Female') || 
                v.name.includes('Female') || 
                v.name.includes('Zira') || 
                v.name.includes('Samantha') ||
                v.name.includes('Microsoft Zira')
            );

            if (femaleVoice) utterance.voice = femaleVoice;
            
            utterance.rate = 0.9; 
            utterance.pitch = 1.1; // Higher pitch helps simulate a female tone
            window.speechSynthesis.speak(utterance);
        }

        lastConfirmedCountRef.current = currentCount;
    }, [orders, loading, audioEnabled]);

    const markAsRead = async (msgId) => {
        try {
            await updateDoc(doc(db, 'kitchen_notes', msgId), { status: 'read' });
        } catch (e) { console.error("Error marking read:", e); }
    };

    const groupedOrders = useMemo(() => {
        return {
            new: orders.filter(o => o.currentStatus === 2),
            prep: orders.filter(o => o.currentStatus === 3),
            ready: orders.filter(o => o.currentStatus === 4),
            sent: orders.filter(o => o.currentStatus === 5),
        };
    }, [orders]);

    const handleAction = useCallback(async (orderId, nextStatus) => {
        const confirmMsg = nextStatus === 3 ? "Start preparing?" : "Mark as Ready?";
        if (!window.confirm(confirmMsg)) return;
        try {
            await updateOrderStatus(orderId, nextStatus, CURRENT_KITCHEN_ID, `Kitchen move to ${nextStatus}`);
            logSystemEvent("ORDER_EVENT", `Kitchen ${nextStatus === 3 ? 'Started' : 'Finished'} Order: ${orderId}`);
        } catch (e) { alert("Error: " + e.message); }
    }, []);

    const handleDispatch = useCallback(async (orderId, order) => {
        const server = window.prompt("ENTER SERVER NAME:");
        if (!server) return; 
        try {
            await dispatchOrder(orderId, server, order.dispatchLocation || order.roomNumber || "N/A", CURRENT_KITCHEN_ID, "Kitchen");
            logSystemEvent("ORDER_EVENT", `Kitchen DISPATCHED Order: ${orderId} via ${server}`);
        } catch (e) { alert("Error: " + e.message); }
    }, []);

    const renderTicket = (order) => {
        const statusDetails = getStatusDetails(order.currentStatus);
        const loc = order.orderType === 'Dining Hall' ? (order.dispatchLocation || "Hall") : (order.roomNumber || "Guest");
        const items = order.items || [];
        const hasUnpriced = items.some(item => item.type === 'special' && (item.price === undefined || item.price <= 0));
        
        const placedTime = formatTime(order.orderTime);
        const confirmedEntry = order.statusHistory?.find(e => e.status === 2);
        const confirmTime = confirmedEntry ? formatTime(confirmedEntry.timestamp) : '--:--';
        
        return (
            <div key={order.id} className="kitchen-ticket" style={ticketStyle(statusDetails?.color || '#ccc')}>
                <div style={ticketHeader}>
                    <span style={locTitle}>{loc}</span>
                    <span style={idText}>{order.id}</span>
                </div>
                <div style={infoRow}>
                    <span>P: {placedTime} | C: {confirmTime}</span>
                </div>
                {hasUnpriced && order.currentStatus === 2 && (
                    <div style={priceAlert}>⚠️ PRICE REQUIRED</div>
                )}
                <div style={itemsWrapper}>
                    {items.map((item, index) => (
                        <div key={index} style={itemLine}>
                            <span style={qtyBadge}>{item.qty || 1}</span>
                            <span style={itemLabel(item.type === 'special')}>{item.name?.toUpperCase()}</span>
                        </div>
                    ))}
                    {order.notes && <div style={notesStyle}><strong>N:</strong> {order.notes}</div>}
                </div>
                <div style={actionRow}>
                    {order.currentStatus === 2 && (
                        <button onClick={() => handleAction(order.id, 3)} disabled={hasUnpriced} style={{...btnBase, backgroundColor: hasUnpriced ? '#cbd5e1' : '#3b82f6'}}>START</button>
                    )}
                    {order.currentStatus === 3 && (
                        <button onClick={() => handleAction(order.id, 4)} style={{...btnBase, backgroundColor: '#f59e0b'}}>READY</button>
                    )}
                    {order.currentStatus === 4 && (
                         <button onClick={() => handleDispatch(order.id, order)} style={{...btnBase, backgroundColor: '#10b981'}}>DISPATCH</button>
                    )}
                    {order.currentStatus === 5 && (
                         <div style={statusTag}>Server: {order.serverName}</div>
                    )}
                </div>
            </div>
        );
    };

    const renderOperations = () => (
        <div style={kdsContent}>
            {[
                { title: 'NEW ORDERS', data: groupedOrders.new, color: '#3b82f6' },
                { title: 'PREPARING', data: groupedOrders.prep, color: '#f59e0b' },
                { title: 'READY', data: groupedOrders.ready, color: '#10b981' },
                { title: 'SENT', data: groupedOrders.sent, color: '#6366f1' }
            ].map((col) => (
                <div key={col.title} style={kdsCol}>
                    <div style={colHead(col.color)}>{col.title} ({col.data.length})</div>
                    <div style={colBody}>{col.data.map(renderTicket)}</div>
                </div>
            ))}
        </div>
    );

    const renderNotesUpdates = () => (
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
            <h2 style={{ color: '#1e293b' }}>Front Desk Broadcast Messages</h2>
            {broadcasts.length === 0 ? <p>No broadcast messages received.</p> : 
                broadcasts.map(msg => (
                    <div 
                        key={msg.id} 
                        onClick={() => markAsRead(msg.id)} 
                        style={{
                            ...noteLogStyle,
                            cursor: 'pointer',
                            backgroundColor: msg.status === 'read' ? '#fff' : '#fff9f0',
                            borderLeft: msg.status === 'read' ? '5px solid #cbd5e1' : '5px solid #f59e0b'
                        }}
                    >
                        <div style={{display:'flex', justifyContent:'space-between'}}>
                           <strong style={{color: msg.status === 'read' ? '#64748b' : '#3b82f6'}}>FROM: {msg.sender || msg.name || 'Front Desk'}</strong>
                           <span style={{fontSize:'0.7rem', fontWeight:'bold', color: msg.status === 'read' ? '#2ecc71' : '#f39c12'}}>
                                {msg.status === 'read' ? 'READ' : 'UNREAD'}
                           </span>
                        </div>
                        <p style={{ margin: '5px 0', fontSize: '1.1rem', whiteSpace: 'pre-wrap' }}>{msg.message}</p>
                        <small style={{ color: '#64748b' }}>
                            Sent: {msg.date || ''} {msg.time ? ` at ${msg.time}` : ''}
                        </small>
                    </div>
                ))
            }
        </div>
    );

    if (loading) return <div style={centerMsg}>Syncing Kitchen System...</div>;

    return (
        <div style={kdsContainer}>
            <div style={kdsAppBar}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button onClick={() => setActiveView('operations')} style={activeView === 'operations' ? activeNavBtn : navBtn}>🍳 Kitchen Ops</button>
                    <button onClick={() => setActiveView('final')} style={activeView === 'final' ? activeNavBtn : navBtn}>🛎️ Final Actions</button>
                    <button onClick={() => setActiveView('notes')} style={activeView === 'notes' ? activeNavBtn : navBtn}>📝 FD Notes</button>
                    
                    <button 
                        onClick={() => setAudioEnabled(!audioEnabled)} 
                        style={{...navBtn, backgroundColor: audioEnabled ? '#10b981' : '#ef4444', marginLeft: '15px'}}
                    >
                        {audioEnabled ? '🔊 Voice On' : '🔇 Voice Off'}
                    </button>
                </div>
                <div style={badge}>Active: {orders.length}</div>
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {activeView === 'operations' && renderOperations()}
                {activeView === 'notes' && renderNotesUpdates()}
                {activeView === 'final' && (
                    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#fff' }}>
                        <FrontDeskArchival isActive={activeView === 'final'} orders={orders} />
                    </div>
                )}
            </div>
        </div>
    );
}

// STYLES
const kdsContainer = { height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9', overflow: 'hidden' };
const kdsAppBar = { padding: '8px 20px', backgroundColor: '#1e293b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const badge = { backgroundColor: '#334155', color: '#fff', padding: '4px 12px', borderRadius: '15px', fontSize: '0.8rem' };
const kdsContent = { display: 'flex', flex: 1, overflow: 'hidden', padding: '8px', gap: '8px' };
const kdsCol = { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#e2e8f0', borderRadius: '8px', minWidth: '0' };
const colHead = (color) => ({ padding: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.85rem', color: '#fff', backgroundColor: color, borderRadius: '8px 8px 0 0' });
const colBody = { flex: 1, overflowY: 'auto', padding: '8px' };
const ticketStyle = (color) => ({ backgroundColor: '#fff', borderRadius: '6px', marginBottom: '8px', borderLeft: `5px solid ${color}`, padding: '4px' });
const ticketHeader = { padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' };
const locTitle = { fontSize: '1.2rem', fontWeight: '900', color: '#0f172a' };
const idText = { fontSize: '0.55rem', color: '#94a3b8', fontFamily: 'monospace', maxWidth: '120px', wordBreak: 'break-all', textAlign: 'right' };
const infoRow = { padding: '4px 8px', fontSize: '0.65rem', color: '#64748b' };
const itemsWrapper = { padding: '6px 8px' };
const itemLine = { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' };
const qtyBadge = { backgroundColor: '#fee2e2', padding: '2px 5px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', color: '#dc2626' };
const itemLabel = (isSpec) => ({ fontSize: '0.85rem', fontWeight: '600', color: isSpec ? '#7c3aed' : '#334155' });
const notesStyle = { marginTop: '5px', padding: '5px', backgroundColor: '#fefce8', border: '1px solid #fef08a', borderRadius: '4px', fontSize: '0.75rem' };
const priceAlert = { backgroundColor: '#fef2f2', color: '#dc2626', padding: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.7rem' };
const actionRow = { padding: '8px' };
const btnBase = { width: '100%', padding: '10px', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' };
const statusTag = { textAlign: 'center', fontSize: '0.8rem', fontWeight: 'bold', color: '#6366f1' };
const centerMsg = { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' };
const navBtn = { padding: '8px 20px', backgroundColor: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' };
const activeNavBtn = { ...navBtn, backgroundColor: '#3b82f6' };
const noteLogStyle = { padding: '15px', backgroundColor: '#fff', borderLeft: '5px solid #3b82f6', marginBottom: '12px', borderRadius: '6px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' };

export default KitchenDashboard;