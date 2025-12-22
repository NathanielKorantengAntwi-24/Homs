import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useRealTimeOrders } from '../hooks/useRealTimeOrders'; 
import { updateOrderStatus, dispatchOrder } from '../utils/orderActions'; 
import { getStatusDetails } from '../utils/statusMapping'; 
import { doc, updateDoc, onSnapshot, setDoc, getDoc, collection, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';

const KITCHEN_MONITORING_STATUSES = [2, 3, 4, 5]; 
const CURRENT_KITCHEN_ID = "Kitchen_User_A"; 

// Full Menu Reference for names in the Availability Manager
const FULL_MENU_LIST = [
    { id: 'B01', name: 'Plain Omelette' }, { id: 'B02', name: 'Cheese Omelette' },
    { id: 'B03', name: 'Omelette with Hot Dogs' }, { id: 'B04', name: 'Omelette with Vegetables' },
    { id: 'B05', name: 'Spanish Omelette' }, { id: 'B06', name: 'Plain Pizza' },
    { id: 'B07', name: 'Pizza with Vegetables' }, { id: 'B08', name: 'Pizza with Hot Dogs' },
    { id: 'B09', name: 'Hot Dogs Only' }, { id: 'LD01', name: 'Plain Pasta' },
    { id: 'LD02', name: 'Pasta with Hot Dogs' }, { id: 'LD03', name: 'Pasta with Tuna/Sardines/Corned Beef' },
    { id: 'LD04', name: 'Pasta with Chicken' }, { id: 'LD16', name: 'Plain Rice' },
    { id: 'LD17', name: 'Fried Rice' }, { id: 'D01', name: 'Coke' },
    { id: 'D02', name: 'Beta Malt' }, { id: 'D03', name: 'Fanta' }
];

const formatTime = (timestampOrDate) => {
    if (!timestampOrDate) return '--:--';
    try {
        const date = timestampOrDate.toDate ? timestampOrDate.toDate() : new Date(timestampOrDate); 
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
        return '--:--';
    }
};

function KitchenDashboard() {
    // 1. NAVIGATION STATE
    const [activeView, setActiveView] = useState('operations'); 

    // 2. DATA FETCHING (KDS)
    const { orders, loading } = useRealTimeOrders(null, null, KITCHEN_MONITORING_STATUSES);
    
    // 3. MENU AVAILABILITY STATE
    const [availability, setAvailability] = useState({});
    const [processingId, setProcessingId] = useState(null); 

    // --- NEW: STATE FOR BROADCAST MESSAGES ---
    const [broadcasts, setBroadcasts] = useState([]);

    useEffect(() => {
        const docRef = doc(db, 'config', 'menuAvailability');
        const unsubscribe = onSnapshot(docRef, (snapshot) => {
            if (snapshot.exists()) {
                setAvailability(snapshot.data());
            } else {
                setAvailability({});
            }
        });
        return () => unsubscribe();
    }, []);

    // --- NEW: LISTEN FOR MESSAGES FROM FRONT DESK ---
    useEffect(() => {
        const q = query(collection(db, 'kitchen_notes'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setBroadcasts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, []);

    // NEW FUNCTION: Mark message as read when clicked
    const markAsRead = async (msgId) => {
        try {
            const msgRef = doc(db, 'kitchen_notes', msgId);
            await updateDoc(msgRef, { status: 'read' });
        } catch (e) {
            console.error("Error marking read:", e);
        }
    };

    const toggleAvailability = async (itemId) => {
        if (processingId) return; 
        setProcessingId(itemId);

        const docRef = doc(db, 'config', 'menuAvailability');
        
        try {
            const docSnap = await getDoc(docRef);
            const currentStatus = availability[itemId] !== false; 
            const nextStatus = !currentStatus;

            if (!docSnap.exists()) {
                await setDoc(docRef, { [itemId]: nextStatus });
            } else {
                await updateDoc(docRef, { [itemId]: nextStatus });
            }
        } catch (e) {
            console.error("Toggle Error:", e);
            alert("Permission Denied: Update your Firestore Rules for 'config/menuAvailability'.");
        } finally {
            setProcessingId(null);
        }
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
        } catch (e) { 
            alert("Error: " + e.message); 
        }
    }, []);

    const handleDispatch = useCallback(async (orderId, order) => {
        const server = window.prompt("ENTER SERVER NAME:");
        if (!server) return; 
        try {
            await dispatchOrder(orderId, server, order.dispatchLocation || order.roomNumber || "N/A", CURRENT_KITCHEN_ID, "Kitchen");
        } catch (e) { 
            alert("Error: " + e.message); 
        }
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
                    <span className="id-container" style={idText}>
                        <span className="short-id">#{order.id.slice(-4)}</span>
                        <span className="full-id">{order.id}</span>
                    </span>
                </div>
                <div style={infoRow}>
                    <span>P: {placedTime} | C: {confirmTime}</span>
                </div>
                {hasUnpriced && order.currentStatus === 2 && (
                    <div style={priceAlert}>⚠️ PRICE REQ</div>
                )}
                <div style={itemsWrapper}>
                    {items.length === 0 ? <div style={{fontSize: '0.6rem', color: '#999'}}>No items</div> : 
                    items.map((item, index) => (
                        <div key={item.id || index} style={itemLine}>
                            <span style={qtyBadge}>{item.qty || 1}</span>
                            <span style={itemLabel(item.type === 'special')}>{item.name?.toUpperCase() || "UNKNOWN"}</span>
                        </div>
                    ))}
                    {order.notes && (
                        <div style={notesStyle}><strong>N:</strong> {order.notes}</div>
                    )}
                </div>
                <div style={actionRow}>
                    {order.currentStatus === 2 && (
                        <button onClick={(e) => { e.stopPropagation(); handleAction(order.id, 3); }} disabled={hasUnpriced} style={{...btnBase, backgroundColor: hasUnpriced ? '#cbd5e1' : '#3b82f6'}}>START</button>
                    )}
                    {order.currentStatus === 3 && (
                        <button onClick={(e) => { e.stopPropagation(); handleAction(order.id, 4); }} style={{...btnBase, backgroundColor: '#f59e0b'}}>READY</button>
                    )}
                    {order.currentStatus === 4 && (
                         <button onClick={(e) => { e.stopPropagation(); handleDispatch(order.id, order); }} style={{...btnBase, backgroundColor: '#10b981'}}>DISPATCH</button>
                    )}
                    {order.currentStatus === 5 && (
                         <div style={statusTag}>Server: {order.serverName || "Pending"}</div>
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
                { title: 'DELIVERING', data: groupedOrders.sent, color: '#6366f1' }
            ].map((col) => (
                <div key={col.title} style={kdsCol}>
                    <div style={colHead(col.color)}>{col.title}</div>
                    <div style={colBody}>{col.data.map(renderTicket)}</div>
                </div>
            ))}
        </div>
    );

    // --- FIXED VIEW: SENDER, DATE, AND TIME NOW DISPLAYED ---
    const renderNotesUpdates = () => (
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
            <h2 style={{ color: '#1e293b' }}>Front Desk Broadcast Messages</h2>
            {broadcasts.length === 0 ? <p>No broadcast messages received.</p> : 
                broadcasts.map(msg => (
                    <div 
                        key={msg.id} 
                        onClick={() => markAsRead(msg.id)} // INTEGRATED: Click to mark as read
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

    const renderMenuManager = () => (
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
            <h2 style={{ color: '#1e293b' }}>Menu Availability Control</h2>
            <div style={menuGridStyle}>
                {FULL_MENU_LIST.map(item => {
                    const isBusy = processingId === item.id;
                    const isAvailable = availability[item.id] !== false;
                    return (
                        <div key={item.id} style={menuItemToggleStyle}>
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>ID: {item.id}</div>
                            </div>
                            <button 
                                disabled={!!processingId}
                                onClick={() => toggleAvailability(item.id)}
                                style={{ 
                                    ...toggleButtonStyle, 
                                    backgroundColor: isBusy ? '#94a3b8' : (isAvailable ? '#10b981' : '#ef4444'),
                                    cursor: !!processingId ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {isBusy ? "SAVING..." : (isAvailable ? 'AVAILABLE' : 'SOLD OUT')}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    if (loading) return <div style={centerMsg}>Syncing Kitchen System...</div>;

    return (
        <div style={kdsContainer}>
            <style>
                {`
                    .kitchen-ticket { transition: all 0.2s ease; transform-origin: center; position: relative; z-index: 1; border: 1px solid #e2e8f0; }
                    .kitchen-ticket:hover { transform: scale(1.15); box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4) !important; z-index: 1000; border: 2px solid #1e293b !important; }
                    .full-id { display: none; }
                    .kitchen-ticket:hover .short-id { display: none; }
                    .kitchen-ticket:hover .full-id { display: inline; font-size: 0.65rem; color: #dc2626; }
                `}
            </style>

            <div style={kdsAppBar}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setActiveView('operations')} style={activeView === 'operations' ? activeNavBtn : navBtn}>🍳 Kitchen Ops</button>
                    <button onClick={() => setActiveView('notes')} style={activeView === 'notes' ? activeNavBtn : navBtn}>📝 FD Notes</button>
                    <button onClick={() => setActiveView('menu')} style={activeView === 'menu' ? activeNavBtn : navBtn}>🚫 Manage Menu</button>
                </div>
                <div style={badge}>Active: {orders.length}</div>
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {activeView === 'operations' && renderOperations()}
                {activeView === 'notes' && renderNotesUpdates()}
                {activeView === 'menu' && renderMenuManager()}
            </div>
        </div>
    );
}

// --- ALL ORIGINAL STYLES RESTORED ---
const kdsContainer = { height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9', overflow: 'hidden' };
const kdsAppBar = { padding: '6px 20px', backgroundColor: '#1e293b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const badge = { backgroundColor: '#334155', color: '#fff', padding: '2px 10px', borderRadius: '15px', fontSize: '0.75rem' };
const kdsContent = { display: 'flex', flex: 1, overflow: 'hidden', padding: '6px', gap: '6px' };
const kdsCol = { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#e2e8f0', borderRadius: '6px', minWidth: '0' };
const colHead = (color) => ({ padding: '6px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.8rem', color: '#fff', backgroundColor: color, borderRadius: '6px 6px 0 0' });
const colBody = { flex: 1, overflowY: 'auto', padding: '6px' };
const ticketStyle = (color) => ({ backgroundColor: '#fff', borderRadius: '4px', marginBottom: '6px', borderLeft: `4px solid ${color}` });
const ticketHeader = { padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const locTitle = { fontSize: '1.1rem', fontWeight: '900', color: '#0f172a' };
const idText = { fontSize: '0.6rem', color: '#94a3b8', fontFamily: 'monospace' };
const infoRow = { padding: '0 8px 2px 8px', fontSize: '0.6rem', color: '#64748b', borderBottom: '1px solid #f1f5f9' };
const itemsWrapper = { padding: '4px 8px' };
const itemLine = { display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' };
const qtyBadge = { backgroundColor: '#fee2e2', padding: '1px 4px', borderRadius: '2px', fontSize: '0.8rem', fontWeight: 'bold', color: '#dc2626' };
const itemLabel = (isSpec) => ({ fontSize: '0.75rem', fontWeight: '600', color: isSpec ? '#7c3aed' : '#334155' });
const notesStyle = { marginTop: '4px', padding: '3px 6px', backgroundColor: '#fefce8', border: '1px solid #fef08a', borderRadius: '3px', fontSize: '0.7rem' };
const priceAlert = { backgroundColor: '#fef2f2', color: '#dc2626', padding: '3px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.6rem' };
const actionRow = { padding: '5px' };
const btnBase = { width: '100%', padding: '8px', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' };
const statusTag = { textAlign: 'center', fontSize: '0.7rem', fontWeight: 'bold', color: '#6366f1', padding: '4px' };
const centerMsg = { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' };

const navBtn = { padding: '8px 15px', backgroundColor: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' };
const activeNavBtn = { ...navBtn, backgroundColor: '#3b82f6' };
const noteLogStyle = { padding: '15px', backgroundColor: '#fff', borderLeft: '5px solid #3b82f6', marginBottom: '12px', borderRadius: '6px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' };
const menuGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px', marginTop: '20px' };
const menuItemToggleStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' };
const toggleButtonStyle = { padding: '8px 12px', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.7rem', cursor: 'pointer', minWidth: '90px' };

export default KitchenDashboard;