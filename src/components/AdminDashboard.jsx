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
import { migrateMenuToFirestore } from '../utils/dbMigration';

// --- ORIGINAL MENU DATA (FIXED: Re-added to resolve migration error) ---
const ORIGINAL_MENU_DATA = {
    "BREAKFAST": [
        { id: 'B01', name: 'Plain Omelette', price: 10.91, prepTime: '10 mins', imageUrl: 'https://picsum.photos/seed/plainomelette/60/60' },
        { id: 'B02', name: 'Cheese Omelette', price: 10.91, prepTime: '12 mins', imageUrl: 'https://picsum.photos/seed/cheeseomelette/60/60' },
        { id: 'B03', name: 'Omelette with Hot Dogs', price: 10.91, prepTime: '12 mins', imageUrl: 'https://picsum.photos/seed/hotdog/60/60' },
        { id: 'B04', name: 'Omelette with Vegetables', price: 10.91, prepTime: '12 mins', imageUrl: 'https://picsum.photos/seed/mixedveggies/60/60' },
        { id: 'B05', name: 'Spanish Omelette', price: 12.28, prepTime: '15 mins', imageUrl: 'https://picsum.photos/seed/spanishdish/60/60' },
        { id: 'B06', name: 'Plain Pizza', price: 10.91, prepTime: '18 mins', imageUrl: 'https://picsum.photos/seed/plainpizza/60/60' },
        { id: 'B07', name: 'Pizza with Vegetables', price: 10.91, prepTime: '20 mins', imageUrl: 'https://picsum.photos/seed/veggiepizza/60/60' },
        { id: 'B08', name: 'Pizza with Hot Dogs', price: 19.09, prepTime: '25 mins', imageUrl: 'https://picsum.photos/seed/pizzahotdogs/60/60' },
        { id: 'B09', name: 'Hot Dogs Only', price: 10.91, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/hotdogs/60/60' }
    ],
    "LUNCH/DINNER": [
        { id: 'LD01', name: 'Plain Pasta', price: 29.70, prepTime: '15 mins', imageUrl: 'https://picsum.photos/seed/pasta/60/60' },
        { id: 'LD02', name: 'Pasta with Hot Dogs', price: 32.73, prepTime: '18 mins', imageUrl: 'https://picsum.photos/seed/pastahotdogs/60/60' },
        { id: 'LD03', name: 'Pasta with Tuna/Sardines/Corned Beef', price: 40.92, prepTime: '20 mins', imageUrl: 'https://picsum.photos/seed/tuna/60/60' },
        { id: 'LD04', name: 'Pasta with Chicken', price: 32.73, prepTime: '18 mins', imageUrl: 'https://picsum.photos/seed/chickenpasta/60/60' },
        { id: 'LD05', name: 'Pasta with Vegetables', price: 30.01, prepTime: '17 mins', imageUrl: 'https://picsum.photos/seed/pastawithveggies/60/60' },
        { id: 'LD06', name: 'Pasta with Fried Rice', price: 35.46, prepTime: '25 mins', imageUrl: 'https://picsum.photos/seed/friedricepasta/60/60' },
        { id: 'LD07', name: 'Pasta with Shrimps', price: 32.73, prepTime: '20 mins', imageUrl: 'https://picsum.photos/seed/shrimp/60/60' },
        { id: 'LD08', name: 'Pasta with Cheese', price: 35.46, prepTime: '18 mins', imageUrl: 'https://picsum.photos/seed/cheese/60/60' },
        { id: 'LD09', name: 'Pasta with Sausages', price: 30.01, prepTime: '17 mins', imageUrl: 'https://picsum.photos/seed/sausagepasta/60/60' },
        { id: 'LD10', name: 'Pasta with Fried Chicken', price: 35.46, prepTime: '22 mins', imageUrl: 'https://picsum.photos/seed/friedchicken/60/60' },
        { id: 'LD11', name: 'Pasta with Fish', price: 32.73, prepTime: '20 mins', imageUrl: 'https://picsum.photos/seed/fishmeal/60/60' },
        { id: 'LD12', name: 'Pasta with Grilled Chicken', price: 35.46, prepTime: '25 mins', imageUrl: 'https://picsum.photos/seed/grilledchicken/60/60' },
        { id: 'LD13', name: 'Pasta with Fruits', price: 30.01, prepTime: '15 mins', imageUrl: 'https://picsum.photos/seed/pastafruits/60/60' },
        { id: 'LD14', name: 'Pasta with Pizza', price: 49.10, prepTime: '30 mins' },
        { id: 'LD15', name: 'Pasta with Plain Rice', price: 38.19, prepTime: '20 mins' },
        { id: 'LD16', name: 'Plain Rice', price: 16.37, prepTime: '10 mins', imageUrl: 'https://picsum.photos/seed/plainrice/60/60' },
        { id: 'LD17', name: 'Fried Rice', price: 35.46, prepTime: '20 mins', imageUrl: 'https://picsum.photos/seed/friedrice/60/60' },
        { id: 'LD18', name: 'Rice with Vegetables', price: 32.73, prepTime: '18 mins', imageUrl: 'https://picsum.photos/seed/riceveggie/60/60' },
        { id: 'LD19', name: 'Rice with Chicken', price: 38.19, prepTime: '22 mins', imageUrl: 'https://picsum.photos/seed/chickenrice/60/60' },
        { id: 'LD20', name: 'Green Salad', price: 15.00, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/greensalad/60/60' },
        { id: 'LD21', name: 'Salad with Chicken', price: 35.46, prepTime: '15 mins', imageUrl: 'https://picsum.photos/seed/chickensalad/60/60' },
        { id: 'LD22', name: 'Salad with Tuna', price: 32.73, prepTime: '12 mins', imageUrl: 'https://picsum.photos/seed/tunasalad/60/60' },
        { id: 'LD23', name: 'Salad with Fruits', price: 38.19, prepTime: '10 mins', imageUrl: 'https://picsum.photos/seed/fruitsalad/60/60' }
    ],
    "SOUPS": [
        { id: 'S01', name: 'Chicken Noodle Soup', price: 21.82, prepTime: '15 mins', imageUrl: 'https://picsum.photos/seed/chickensoup/60/60' },
        { id: 'S02', name: 'Buffet Soup', price: 68.19, prepTime: '20 mins', imageUrl: 'https://picsum.photos/seed/buffetsoup/60/60' }
    ],
    "FRUITS & VEGETABLES": [
        { id: 'FV01', name: 'Vegetables Only', price: 16.37, prepTime: '10 mins', imageUrl: 'https://picsum.photos/seed/steamedveggies/60/60' },
        { id: 'FV02', name: 'Fruits Only', price: 15.00, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/freshfruit/60/60' }
    ],
    "DRINKS": [
        { id: 'D01', name: 'coke', price: 10.00, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/cokecan/60/60' },
        { id: 'D02', name: 'Beta Malt', price: 15.00, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/betamalt/60/60' },
        { id: 'D03', name: 'Fanta', price: 10.00, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/fanta/60/60' },
        { id: 'D04', name: 'Alvaro', price: 12.00, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/alvaro/60/60' }
    ]
};

function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('inventory');
    const [menuItems, setMenuItems] = useState([]);
    const [logs, setLogs] = useState([]);
    const [hotelSettings, setHotelSettings] = useState({ roomServiceCharge: 30, currency: 'GH₵' });
    const [loading, setLoading] = useState(true);
    const [isMigrating, setIsMigrating] = useState(false);
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

    const toggleAvailability = async (id, currentStatus) => {
        try {
            await updateDoc(doc(db, "menu", id), { isAvailable: !currentStatus });
        } catch (e) { alert("Update failed: " + e.message); }
    };

    const runMigration = async () => {
        if (!window.confirm("Initialize Database with default menu?")) return;
        setIsMigrating(true);
        const result = await migrateMenuToFirestore(ORIGINAL_MENU_DATA);
        setIsMigrating(false);
        alert(result.message);
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
                <div style={contentBox}>
                    <div style={inventoryHeaderContainer}>
                        <div>
                            <h3>Menu Availability</h3>
                            <span style={countBadge}>{filteredInventory.length} Items Listed</span>
                        </div>
                        <input 
                            type="text" 
                            placeholder="Search Name, Category, or ID..." 
                            style={inventorySearchInput}
                            value={inventorySearchTerm}
                            onChange={(e) => setInventorySearchTerm(e.target.value)}
                        />
                    </div>
                    <div style={scrollableTableWrapper}>
                        <table style={tableStyle}>
                            <thead style={stickyHeader}>
                                <tr style={thRow}>
                                    <th>ID</th><th>Item Name</th><th>Category</th><th>Price</th><th>Status</th><th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredInventory.map(item => (
                                    <tr key={item.id} style={trStyle}>
                                        <td><code>{item.id}</code></td>
                                        <td><b>{item.name}</b></td>
                                        <td>{item.category}</td>
                                        <td>{hotelSettings.currency}{item.price}</td>
                                        <td style={{color: item.isAvailable ? '#28a745' : '#dc3545', fontWeight: 'bold'}}>
                                            {item.isAvailable ? "LIVE" : "SOLD OUT"}
                                        </td>
                                        <td>
                                            <button onClick={() => toggleAvailability(item.id, item.isAvailable)} style={toggleBtn}>Toggle</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                    <div style={dangerZone}>
                        <h3>⚠️ Database Maintenance (Hard Purge)</h3>
                        <p style={{fontSize: '0.9rem', color: '#666'}}>Use this section to permanently delete transaction history and departmental messages after accounting is closed.</p>
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
                                style={{...migrateBtn, backgroundColor: '#dc3545', margin: 0}}
                            >
                                {isPurging ? 'Purging...' : 'Permanently Delete Month Records'}
                            </button>
                        </div>
                    </div>

                    <hr style={{margin: '30px 0', border: 'none', borderTop: '1px solid #eee'}} />

                    <div style={setupSection}>
                        <h3>🚀 Portal Synchronization</h3>
                        <p>Restore default menu items to database.</p>
                        <button onClick={runMigration} disabled={isMigrating} style={migrateBtn}>
                            {isMigrating ? 'Processing...' : 'Migrate Default Menu'}
                        </button>
                    </div>

                    <hr style={{margin: '30px 0', border: 'none', borderTop: '1px solid #eee'}} />

                    <h3>⚙️ Global Constants</h3>
                    <div style={settingItem}>
                        <span>Room Service Fee: <b>{hotelSettings.currency}{hotelSettings.roomServiceCharge}</b></span>
                        <button style={editBtn} onClick={async () => {
                            const val = window.prompt("Update Fee:", hotelSettings.roomServiceCharge);
                            if(val) await updateDoc(doc(db, "config", "hotel_settings"), { roomServiceCharge: parseFloat(val) });
                        }}>Update</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- MASTER STYLES ---
const adminContainer = { maxWidth: '1200px', margin: '20px auto', padding: '20px', backgroundColor: '#f4f7f6', borderRadius: '15px', minHeight: '80vh' };
const adminHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #ddd', marginBottom: '25px', paddingBottom: '15px' };
const tabBar = { display: 'flex', gap: '8px' };
const inactiveBtn = { padding: '10px 18px', cursor: 'pointer', border: 'none', borderRadius: '6px', backgroundColor: '#e2e8f0', fontWeight: 'bold' };
const activeBtn = { ...inactiveBtn, backgroundColor: '#007bff', color: 'white' };
const contentBox = { backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const thRow = { textAlign: 'left', borderBottom: '2px solid #edf2f7', color: '#4a5568' };
const trStyle = { borderBottom: '1px solid #f7fafc', height: '48px' };
const toggleBtn = { padding: '6px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' };
const inventoryHeaderContainer = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' };
const inventorySearchInput = { padding: '10px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', width: '320px' };
const scrollableTableWrapper = { maxHeight: '500px', overflowY: 'auto' };
const stickyHeader = { position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 };
const metricsGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' };
const metricCard = { padding: '25px', backgroundColor: '#fff', border: '1px solid #edf2f7', borderRadius: '12px', textAlign: 'center' };
const metricVal = { fontSize: '2.8rem', fontWeight: 'bold', color: '#007bff' };
const logBox = { backgroundColor: '#111', padding: '20px', borderRadius: '12px', height: '450px', overflowY: 'auto', color: '#eee' };
const logEntry = { borderBottom: '1px solid #222', padding: '10px', backgroundColor: '#1a1a1a', marginBottom: '8px' };
const setupSection = { padding: '20px', backgroundColor: '#fffaf0', border: '1px solid #fbd38d', borderRadius: '8px' };
const migrateBtn = { padding: '12px 24px', backgroundColor: '#dd6b20', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' };
const dangerZone = { padding: '20px', backgroundColor: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '8px' };
const purgeInput = { padding: '10px', borderRadius: '6px', border: '1px solid #ddd' };
const settingItem = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px', border: '1px solid #e2e8f0', borderRadius: '8px' };
const editBtn = { padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' };
const loadingOverlay = { textAlign: 'center', padding: '100px', fontSize: '1.2rem' };
const countBadge = { backgroundColor: '#ebf8ff', color: '#3182ce', padding: '4px 10px', borderRadius: '20px' };
const errorCountBadge = { backgroundColor: '#dc3545', color: 'white', padding: '2px 7px', borderRadius: '10px', fontSize: '0.7rem' };
const dismissBtn = { backgroundColor: '#2d3748', color: '#a0aec0', border: 'none', borderRadius: '4px', padding: '6px 12px', fontSize: '0.75rem' };
const indexErrorBox = { padding: '30px', textAlign: 'center', backgroundColor: '#fff5f5', color: '#c53030' };

export default AdminDashboard;