import React, { useState, useEffect, useMemo } from 'react';
import { 
    collection, 
    onSnapshot, 
    doc, 
    updateDoc, 
    query, 
    limit, 
    orderBy,
    where,
    getDocs,
    writeBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';
import MenuManager from './MenuManager';
import { updateMenuItem, deleteMenuItem } from '../utils/menuActions';


function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('inventory');
    const [menuItems, setMenuItems] = useState([]);
    const [logs, setLogs] = useState([]);
    const [hotelSettings, setHotelSettings] = useState({ roomServiceCharge: 30, currency: 'GH₵' });
    const [loading, setLoading] = useState(true);
    const [inventorySearchTerm, setInventorySearchTerm] = useState('');
    const [indexError, setIndexError] = useState(false);

    // --- PURGE STATE ---
    const [purgeMonth, setPurgeMonth] = useState(new Date().toISOString().substring(0, 7));
    const [isPurging, setIsPurging] = useState(false);

    useEffect(() => {
        const unsubMenu = onSnapshot(collection(db, "menu"), (snapshot) => {
            setMenuItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        const qLogs = query(
            collection(db, "system_logs"), 
            where("resolved", "==", false), 
            orderBy("timestamp", "desc"), 
            limit(100)
        );
        
        const unsubLogs = onSnapshot(qLogs, (snapshot) => {
            setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIndexError(false);
        }, (error) => {
            if (error.code === 'failed-precondition') setIndexError(true);
            console.error("Monitor Error:", error);
        });

        const unsubConfig = onSnapshot(doc(db, "config", "hotel_settings"), (docSnap) => {
            if (docSnap.exists()) setHotelSettings(docSnap.data());
        });

        return () => { unsubMenu(); unsubLogs(); unsubConfig(); };
    }, []);

    const filteredInventory = useMemo(() => {
        return menuItems.filter(item => 
            item.name?.toLowerCase().includes(inventorySearchTerm.toLowerCase()) ||
            item.category?.toLowerCase().includes(inventorySearchTerm.toLowerCase()) ||
            item.id?.toLowerCase().includes(inventorySearchTerm.toLowerCase())
        );
    }, [menuItems, inventorySearchTerm]);

    const systemMetrics = useMemo(() => {
        const perfLogs = logs.filter(l => l.type === 'PERFORMANCE' && l.loadTimeMs);
        const avgLoad = perfLogs.length > 0 
            ? (perfLogs.reduce((sum, l) => sum + l.loadTimeMs, 0) / perfLogs.length).toFixed(0) 
            : "0";
        return { avgLoad, errorCount: logs.filter(l => l.type === 'ERROR').length };
    }, [logs]);

    const formatFullTimestamp = (timestamp) => {
        if (!timestamp) return '--/-- --:--';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('en-GB', { 
            day: '2-digit', 
            month: 'short', 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const handleHardPurge = async () => {
        if (!purgeMonth) return alert("Select a month first.");

        const confirm1 = window.confirm(`⚠️ PERMANENT DELETION: This will delete ALL orders and broadcast messages for ${purgeMonth}. This action CANNOT be reversed. Continue?`);
        if (!confirm1) return;

        const confirmText = window.prompt("To verify administrative authority, type 'DELETE ALL' below:");
        if (confirmText !== 'DELETE ALL') return alert("Verification failed. Nothing deleted.");

        setIsPurging(true);
        try {
            const batch = writeBatch(db);
            let totalDeleted = 0;

            const ordersQuery = query(collection(db, "orders"));
            const orderSnap = await getDocs(ordersQuery);
            orderSnap.docs.forEach(doc => {
                const data = doc.data();
                const orderDate = data.orderTime?.toDate ? data.orderTime.toDate() : new Date(data.orderTime);
                const orderMonth = orderDate.toISOString().substring(0, 7);
                if (orderMonth === purgeMonth) {
                    batch.delete(doc.ref);
                    totalDeleted++;
                }
            });

            const notesQuery = query(collection(db, "kitchen_notes"));
            const notesSnap = await getDocs(notesQuery);
            notesSnap.docs.forEach(doc => {
                const data = doc.data();
                if (data.date?.substring(0, 7) === purgeMonth) {
                    batch.delete(doc.ref);
                    totalDeleted++;
                }
            });

            await batch.commit();
            alert(`Purge Complete! Removed ${totalDeleted} permanent records.`);
        } catch (e) {
            console.error(e);
            alert("Error during purge: " + e.message);
        } finally {
            setIsPurging(false);
        }
    };

    const dismissLog = async (logId) => {
        try {
            await updateDoc(doc(db, "system_logs", logId), { resolved: true });
        } catch (e) { console.error("Error dismissing log:", e); }
    };
    
    const handleEdit = async (item) => {
    // 1. Ask for new name (pre-filled with current name)
    const newName = window.prompt("Update Item Name:", item.name);
    if (newName === null) return; // User cancelled

    // 2. Ask for new price (pre-filled with current price)
    const newPrice = window.prompt("Update Price:", item.price);
    if (newPrice === null) return; // User cancelled

    try {
        await updateMenuItem(item.id, {
            name: newName,
            price: parseFloat(newPrice)
        });
        // No need to manually update state; onSnapshot handles it!
    } catch (e) {
        alert("Edit failed: " + e.message);
    }
};

 const handleDelete = async (item) => {
    // 1. Validation: Ensure we have a valid item object
    if (!item || !item.id) return;

    const confirmed = window.confirm(
        `⚠️ PERMANENT ACTION\n\nAre you sure you want to delete "${item.name}"?\nThis will remove the data and the image from the cloud.`
    );

    if (confirmed) {
        try {
            // 2. Pass the FULL item object to the utility
            await deleteMenuItem(item);
            
            // Note: Your onSnapshot listener in useEffect will automatically 
            // remove the item from the UI list.
        } catch (e) {
            console.error("Delete Operation Failed:", e);
            alert("Delete failed: " + e.message);
        }
    }
};

    const toggleAvailability = async (id, currentStatus) => {
        try {
            await updateDoc(doc(db, "menu", id), { isAvailable: !currentStatus });
        } catch (e) { alert("Update failed: " + e.message); }
    };

    const getLogColor = (type) => {
        switch(type) {
            case 'ERROR': return '#dc3545';
            case 'SYSTEM': return '#17a2b8';
            case 'ORDER_EVENT': return '#28a745';
            case 'PERFORMANCE': return '#ffc107';
            default: return '#6c757d';
        }
    };

    if (loading) return <div style={loadingOverlay}>Syncing Admin Port...</div>;

    return (
        <div style={adminContainer}>
            <header style={adminHeader}>
                <div>
                    <h1>🛡️ Universal Command Center</h1>
                    <p style={{color: '#666', fontSize: '0.85rem'}}>Administrative Oversight & Database Maintenance</p>
                </div>
                <div style={tabBar}>
                    <button onClick={() => setActiveTab('inventory')} style={activeTab === 'inventory' ? activeBtn : inactiveBtn}>Inventory</button>
                    <button onClick={() => setActiveTab('health')} style={activeTab === 'health' ? activeBtn : inactiveBtn}>
                        Health {systemMetrics.errorCount > 0 && <span style={errorCountBadge}>{systemMetrics.errorCount}</span>}
                    </button>
                    <button onClick={() => setActiveTab('settings')} style={activeTab === 'settings' ? activeBtn : inactiveBtn}>Settings</button>
                </div>
            </header>

            {/* TAB: INVENTORY */}
                
      {activeTab === 'inventory' && (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '30px', animation: 'fadeIn 0.5s ease' }}>
        
        {/* Left Side: Elegant List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Search Header */}
            <div style={{ ...contentBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0', background: '#fff' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#1a202c' }}>Menu</h3>
                    <p style={{ margin: 0, color: '#3182ce', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        {filteredInventory.length} Items
                    </p>
                </div>
                <input 
                    type="text" 
                    placeholder="Search menu..." 
                    style={{ ...inventorySearchInput, background: '#f8fafc', color: '#1a202c', border: '1px solid #e2e8f0' }}
                    value={inventorySearchTerm}
                    onChange={(e) => setInventorySearchTerm(e.target.value)}
                />
            </div>

            {/* Elegant Card List */}
            <div style={{ ...scrollableTableWrapper, maxHeight: '650px', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '10px' }}>
                {filteredInventory.map(item => (
                    <div key={item.id} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '16px', 
                        background: '#fff', 
                        borderRadius: '16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ position: 'relative', width: '64px', height: '64px' }}>
                                <img src={item.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px', border: '1px solid #edf2f7' }} />
                                {!item.isAvailable && (
                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#e53e3e', fontWeight: 'bold' }}>SOLD OUT</div>
                                )}
                            </div>
                            
                            <div>
                                <h4 style={{ margin: 0, color: '#2d3748', fontSize: '1.1rem', fontWeight: '700' }}>{item.name}</h4>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>{item.category}</span>
                                    <span style={{ color: '#3182ce', fontWeight: '800', fontSize: '1rem' }}>{hotelSettings.currency}{item.price}</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                                onClick={() => toggleAvailability(item.id, item.isAvailable)}
                                style={{ 
                                    padding: '8px 14px', 
                                    borderRadius: '10px', 
                                    fontSize: '0.7rem', 
                                    fontWeight: '800', 
                                    cursor: 'pointer',
                                    backgroundColor: item.isAvailable ? '#f0fff4' : '#f7fafc',
                                    color: item.isAvailable ? '#38a169' : '#a0aec0',
                                    border: item.isAvailable ? '1px solid #c6f6d5' : '1px solid #e2e8f0'
                                }}
                            >
                                {item.isAvailable ? "● LIVE" : "○ OFF"}
                            </button>
                            <button onClick={() => handleEdit(item)} style={{ ...actionIconBtn, backgroundColor: '#ebf8ff', color: '#3182ce', border: '1px solid #bee3f8' }}>✏️</button>
                            
                            {/* 🚀 FIXED: Passing 'item' instead of 'item.id' for Production cleanup */}
                            <button onClick={() => handleDelete(item)} style={{ ...actionIconBtn, backgroundColor: '#fff5f5', color: '#e53e3e', border: '1px solid #fed7d7' }}>🗑️</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        <div style={{ position: 'sticky', top: '20px', height: 'fit-content' }}>
            <MenuManager /> 
        </div>
    </div>
)}
      
            {/* TAB: HEALTH */}
            {activeTab === 'health' && (
                <div style={contentBox}>
                    {indexError ? (
                        <div style={indexErrorBox}>
                            <h3>⚙️ Database Index Required</h3>
                            <p>To view logs, click the link in your <b>Browser Console</b> to create the index.</p>
                        </div>
                    ) : (
                        <>
                            <div style={metricsGrid}>
                                <div style={metricCard}><h3>Avg UI Latency</h3><p style={metricVal}>{systemMetrics.avgLoad}ms</p></div>
                                <div style={metricCard}><h3>Critical Alerts</h3><p style={{...metricVal, color: '#dc3545'}}>{systemMetrics.errorCount}</p></div>
                            </div>
                            <div style={logBox}>
                                {logs.map(log => (
                                    <div key={log.id} style={{...logEntry, borderLeft: `4px solid ${getLogColor(log.type)}`}}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                                            <div>
                                                <small style={{color: '#aaa'}}>{formatFullTimestamp(log.timestamp)} [{log.type}]</small>
                                                <p style={{margin: '5px 0'}}>{log.message}</p>
                                            </div>
                                            <button onClick={() => dismissLog(log.id)} style={dismissBtn}>Dismiss</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* TAB: SETTINGS */}
          {activeTab === 'settings' && (
    <div style={contentBox}>
        {/* 1. Maintenance Section: Purging transaction history */}
        <div style={dangerZone}>
            <h3>⚠️ Database Maintenance (Hard Purge)</h3>
            <p style={{fontSize: '0.9rem', color: '#666'}}>
                Permanently delete transaction history and departmental messages after accounting is closed.
            </p>
            <div style={{display: 'flex', gap: '15px', marginTop: '15px', alignItems: 'center'}}>
                <input 
                    type="month" 
                    value={purgeMonth} 
                    onChange={(e) => setPurgeMonth(e.target.value)} 
                    style={purgeInput} 
                />
                <button 
                    onClick={handleHardPurge} 
                    disabled={isPurging} 
                    style={dangerBtn}
                >
                    {isPurging ? 'Purging Cloud Records...' : 'Permanently Delete Month Records'}
                </button>
            </div>
        </div>

        <hr style={{margin: '30px 0', border: 'none', borderTop: '1px solid #eee'}} />

        {/* 2. Global Constants: Real-time hotel configuration */}
        <h3>⚙️ Global Constants</h3>
        <div style={settingItem}>
            <span>Room Service Fee: <b>{hotelSettings.currency}{hotelSettings.roomServiceCharge}</b></span>
            <button style={editBtn} onClick={async () => {
                const val = window.prompt("Update Fee:", hotelSettings.roomServiceCharge);
                if(val) {
                    try {
                        await updateDoc(doc(db, "config", "hotel_settings"), { 
                            roomServiceCharge: parseFloat(val) 
                        });
                    } catch (e) {
                        alert("Failed to update fee: " + e.message);
                    }
                }
            }}>Update</button>
        </div>

        {/* --- 3. NEW: ROOM MANAGEMENT SECTION --- */}
        <div style={{ 
            marginTop: '30px', 
            padding: '20px', 
            backgroundColor: '#fdfdfd', 
            borderRadius: '12px', 
            border: '1px solid #eef2f7' 
        }}>
            <h3 style={{ marginBottom: '10px' }}>🏨 Room Management</h3>
            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '15px' }}>
                Add or remove rooms available for selection in the Guest Order Form.
            </p>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input 
                    type="text" 
                    placeholder="Room Name (e.g. Room 101)" 
                    id="roomInput" 
                    style={{ ...purgeInput, flex: 1 }} 
                />
                <button 
                    style={editBtn} 
                    onClick={async () => {
                        const input = document.getElementById('roomInput');
                        const roomName = input.value.trim();
                        if (!roomName) return;
                        
                        const existingRooms = hotelSettings.availableRooms || [];
                        if (existingRooms.includes(roomName)) return alert("Room already exists.");
                        
                        try {
                            await updateDoc(doc(db, "config", "hotel_settings"), { 
                                availableRooms: [...existingRooms, roomName].sort() 
                            });
                            input.value = '';
                        } catch (e) {
                            alert("Error: " + e.message);
                        }
                    }}
                >
                    Add Room
                </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {(hotelSettings.availableRooms || []).map(room => (
                    <div key={room} style={{ 
                        padding: '6px 12px', 
                        backgroundColor: '#f1f5f9', 
                        borderRadius: '20px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        fontSize: '0.85rem', 
                        border: '1px solid #e2e8f0' 
                    }}>
                        <span style={{ fontWeight: '600' }}>{room}</span>
                        <button 
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc3545', fontWeight: 'bold' }}
                            onClick={async () => {
                                if (window.confirm(`Delete ${room}?`)) {
                                    const updatedRooms = hotelSettings.availableRooms.filter(r => r !== room);
                                    await updateDoc(doc(db, "config", "hotel_settings"), { 
                                        availableRooms: updatedRooms 
                                    });
                                }
                            }}
                        >
                            ✕
                        </button>
                    </div>
                ))}
                {(!hotelSettings.availableRooms || hotelSettings.availableRooms.length === 0) && (
                    <p style={{ color: '#999', fontSize: '0.85rem', fontStyle: 'italic' }}>No rooms added yet.</p>
                )}
            </div>
        </div>
    </div>
)}
        </div>
    );
}

// --- MASTER STYLES (Production Clean) ---
const adminContainer = { 
    maxWidth: '1200px', 
    margin: '20px auto', 
    padding: '20px', 
    backgroundColor: '#f4f7f6', 
    borderRadius: '15px', 
    minHeight: '80vh' 
};

const adminHeader = { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    borderBottom: '2px solid #ddd', 
    marginBottom: '25px', 
    paddingBottom: '15px' 
};

const tabBar = { display: 'flex', gap: '8px' };

const inactiveBtn = { 
    padding: '10px 18px', 
    cursor: 'pointer', 
    border: 'none', 
    borderRadius: '6px', 
    backgroundColor: '#e2e8f0', 
    fontWeight: 'bold',
    transition: '0.2s'
};

const activeBtn = { ...inactiveBtn, backgroundColor: '#3182ce', color: 'white' };

const contentBox = { 
    backgroundColor: 'white', 
    padding: '25px', 
    borderRadius: '12px', 
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)' 
};

const inventorySearchInput = { 
    padding: '10px 15px', 
    borderRadius: '8px', 
    border: '1px solid #e2e8f0', 
    width: '320px',
    outline: 'none'
};

const scrollableTableWrapper = { 
    maxHeight: '650px', 
    overflowY: 'auto' 
};

const metricsGrid = { 
    display: 'grid', 
    gridTemplateColumns: '1fr 1fr', 
    gap: '20px', 
    marginBottom: '30px' 
};

const metricCard = { 
    padding: '25px', 
    backgroundColor: '#fff', 
    border: '1px solid #edf2f7', 
    borderRadius: '12px', 
    textAlign: 'center' 
};

const metricVal = { 
    fontSize: '2.8rem', 
    fontWeight: 'bold', 
    color: '#3182ce' 
};

const logBox = { 
    backgroundColor: '#111', 
    padding: '20px', 
    borderRadius: '12px', 
    height: '450px', 
    overflowY: 'auto', 
    color: '#eee' 
};

const logEntry = { 
    borderBottom: '1px solid #222', 
    padding: '10px', 
    backgroundColor: '#1a1a1a', 
    marginBottom: '8px' 
};

const dangerZone = { 
    padding: '20px', 
    backgroundColor: '#fff5f5', 
    border: '1px solid #feb2b2', 
    borderRadius: '8px' 
};

const dangerBtn = { 
    padding: '12px 24px', 
    backgroundColor: '#e53e3e', 
    color: 'white', 
    border: 'none', 
    borderRadius: '6px', 
    fontWeight: 'bold', 
    cursor: 'pointer' 
};

const purgeInput = { 
    padding: '10px', 
    borderRadius: '6px', 
    border: '1px solid #ddd',
    outline: 'none'
};

const settingItem = { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: '18px', 
    border: '1px solid #e2e8f0', 
    borderRadius: '8px' 
};

const editBtn = { 
    padding: '8px 16px', 
    backgroundColor: '#3182ce', 
    color: 'white', 
    border: 'none', 
    borderRadius: '4px',
    cursor: 'pointer'
};

const loadingOverlay = { 
    textAlign: 'center', 
    padding: '100px', 
    fontSize: '1.2rem',
    color: '#2d3748'
};

const errorCountBadge = { 
    backgroundColor: '#e53e3e', 
    color: 'white', 
    padding: '2px 7px', 
    borderRadius: '10px', 
    fontSize: '0.7rem',
    marginLeft: '5px'
};

const dismissBtn = { 
    backgroundColor: '#2d3748', 
    color: '#a0aec0', 
    border: 'none', 
    borderRadius: '4px', 
    padding: '6px 12px', 
    fontSize: '0.75rem',
    cursor: 'pointer'
};

const indexErrorBox = { 
    padding: '30px', 
    textAlign: 'center', 
    backgroundColor: '#fff5f5', 
    color: '#c53030' 
};

const actionIconBtn = {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '1rem',
    transition: '0.2s'
};

export default AdminDashboard;