import React, { useState, useEffect, useMemo } from 'react';
import { useRealTimeOrders } from '../hooks/useRealTimeOrders'; 
import { getStatusDetails } from '../utils/statusMapping'; 
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

const CURRENCY_SYMBOL = 'GH₵'; 
const HOTEL_NAME = "HOMS HOTEL";

// Robust formatters to prevent "undefined" crashes
const formatCount = (count) => {
    if (count === undefined || count === null) return "0";
    return count.toLocaleString();
};

const formatCurrency = (amount) => `${CURRENCY_SYMBOL}${parseFloat(amount || 0).toFixed(2)}`;

function getStatusName(statusId) {
    const names = {
        0: "CANCELLED", 1: "PENDING", 2: "CONFIRMED", 3: "PREPARING", 
        4: "READY", 5: "DISPATCHED", 6: "DELIVERED", 7: "COMPLETED", 8: "CLEARED_ADMIN"
    };
    return names[statusId] || "Unknown";
}

function getStatusInfo(statusId) {
    const details = getStatusDetails(statusId);
    return {
        label: details?.label || getStatusName(statusId),
        color: details?.color || "#6c757d"
    };
}

function ManagerDashboard() {
    const { orders: allOrders, loading } = useRealTimeOrders(null, null, null);

    // Manager View States
    const [selectedView, setSelectedView] = useState(null); // 'active-details', 'account-sheet', or 'comm-logs'
    const [filterDate, setFilterDate] = useState(new Date().toISOString().substring(0, 7));
    const [selectedOrder, setSelectedOrder] = useState(null); // Used for Full Receipt Detail
    const [commLogs, setCommLogs] = useState([]); 

    const [metrics, setMetrics] = useState({
        totalOrders: 0, activeOrdersCount: 0, completedToday: 0, ordersByStatus: { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0 },
    });

    // --- FETCH PERMANENT BROADCAST HISTORY (Matching Account Office) ---
    useEffect(() => {
        const q = query(collection(db, 'kitchen_notes'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Filter logs by the current selected audit month
            setCommLogs(logs.filter(l => l.date?.substring(0, 7) === filterDate));
        });
        return () => unsubscribe();
    }, [filterDate]);

    useEffect(() => {
        if (loading || !allOrders) return;
        let activeCount = 0;
        let ordersByStatus = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0 };

        allOrders.forEach(order => {
            const status = order.currentStatus;
            if (ordersByStatus[status] !== undefined) ordersByStatus[status] += 1;
            if (status >= 1 && status <= 6) activeCount += 1;
        });

        setMetrics(prev => ({ ...prev, totalOrders: allOrders.length, activeOrdersCount: activeCount, ordersByStatus }));
    }, [allOrders, loading]);

    // Data Filtering Logics
    const activeOrdersList = useMemo(() => 
        allOrders.filter(o => o.currentStatus >= 1 && o.currentStatus <= 6), 
    [allOrders]);

    const monthlyAuditData = useMemo(() => {
        if (!allOrders) return [];
        const targetYear = parseInt(filterDate.substring(0, 4));
        const targetMonth = parseInt(filterDate.substring(5, 7)) - 1;

        return allOrders.filter(order => {
            if (order.currentStatus !== 0 && order.currentStatus < 7) return false;
            const dateRaw = (order.archivalDate || order.orderTime);
            const date = dateRaw?.toDate ? dateRaw.toDate() : new Date(dateRaw);
            return date.getMonth() === targetMonth && date.getFullYear() === targetYear;
        });
    }, [allOrders, filterDate]);

    const auditSummary = useMemo(() => {
        return monthlyAuditData.reduce((acc, order) => {
            const grandTotal = parseFloat(order.financials?.grandTotal || 0);
            const serviceCharge = parseFloat(order.financials?.serviceCharge || 0);
            const subtotal = parseFloat(order.financials?.subtotal || 0);

            if (order.currentStatus === 7 || order.currentStatus === 8) {
                acc.totalRevenue += grandTotal;
                acc.totalServiceCharges += serviceCharge;
                acc.completedOrders += 1;
                acc.netSales += subtotal; 
            } else if (order.currentStatus === 0) {
                acc.cancelledOrders += 1;
            }
            return acc;
        }, { totalRevenue: 0, totalServiceCharges: 0, completedOrders: 0, cancelledOrders: 0, netSales: 0 });
    }, [monthlyAuditData]);

    if (loading) return <div style={dashboardStyle}>Syncing Managerial Intelligence...</div>;

    return (
        <div style={dashboardStyle}>
            <h2 style={{ marginBottom: '20px', color: '#2C3E50' }}>General Manager: Operational Monitoring</h2>
            
            {/* KPI Section */}
            <div style={kpiGridStyle}>
                <KpiCard title="Total Orders Recorded" value={formatCount(metrics.totalOrders)} icon="📈" color="#1A5276"/>
                <div onClick={() => setSelectedView('active-details')} style={{cursor: 'pointer'}}>
                    <KpiCard title="Currently Active Orders" value={formatCount(metrics.activeOrdersCount)} icon="🔔" color="#3498DB"/>
                </div>
                <div onClick={() => setSelectedView('comm-logs')} style={{cursor: 'pointer'}}>
                    <KpiCard title="Dept. Conversations" value={formatCount(commLogs.length)} icon="💬" color="#8E44AD"/>
                </div>
            </div>

            {/* Status Breakdown */}
            <h3 style={{ marginTop: '40px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>Active Order Status Breakdown</h3>
            <div style={cardGridStyle}>
                {[1, 2, 3, 4, 5, 6].map(id => {
                    const info = getStatusInfo(id);
                    return <StatusCard key={id} title={info.label} count={metrics.ordersByStatus[id]} color={info.color} />;
                })}
            </div>

            {/* Historical Section */}
            <h3 style={{ marginTop: '40px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>Historical Status Summary</h3>
            <div style={historyGridStyle}>
                <div onClick={() => setSelectedView('account-sheet')} style={{cursor: 'pointer'}}>
                    <KpiCard title="Total Cancelled" value={formatCount(metrics.ordersByStatus[0])} icon="❌" color="#E74C3C"/>
                </div>
                <div onClick={() => setSelectedView('account-sheet')} style={{cursor: 'pointer'}}>
                    <KpiCard title="Total Cleared/Archived" value={formatCount((metrics.ordersByStatus[7] || 0) + (metrics.ordersByStatus[8] || 0))} icon="📦" color="#808B96"/>
                </div>
            </div>

            {/* --- MODAL: ACTIVE ORDER DETAILS --- */}
            {selectedView === 'active-details' && (
                <div style={modalOverlay} onClick={() => setSelectedView(null)}>
                    <div style={{...modalContent, width: '85%'}} onClick={e => e.stopPropagation()}>
                        <div style={modalHeader}>
                            <h3>Live Operational Flow</h3>
                            <button onClick={() => setSelectedView(null)} style={closeBtn}>&times;</button>
                        </div>
                        <div style={{padding: '20px', maxHeight: '70vh', overflowY: 'auto'}}>
                            <table style={tableStyle}>
                                <thead>
                                    <tr style={thStyle}><th>Location</th><th>STATUS NAME</th><th>Time Placed</th><th>Items Ordered</th><th>Total Value</th></tr>
                                </thead>
                                <tbody>
                                    {activeOrdersList.map(o => {
                                        const info = getStatusInfo(o.currentStatus);
                                        return (
                                            <tr key={o.id} style={trStyle}>
                                                <td style={tdStyle}><b>{o.roomNumber || o.dispatchLocation}</b></td>
                                                <td style={{...tdStyle, color: info.color, fontWeight: 'bold'}}>{info.label}</td>
                                                <td style={tdStyle}>{new Date(o.orderTime?.toDate ? o.orderTime.toDate() : o.orderTime).toLocaleTimeString()}</td>
                                                <td style={tdStyle}>{o.items?.map(i => `${i.qty}x ${i.name}`).join(', ')}</td>
                                                <td style={tdStyle}>{formatCurrency(o.financials?.grandTotal)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: DEPARTMENTAL CONVERSATIONS (Preserving pre-wrap formatting) --- */}
            {selectedView === 'comm-logs' && (
                <div style={modalOverlay} onClick={() => setSelectedView(null)}>
                    <div style={{...modalContent, width: '600px'}} onClick={e => e.stopPropagation()}>
                        <div style={modalHeader}>
                            <h3>Departmental Broadcast History</h3>
                            <button onClick={() => setSelectedView(null)} style={closeBtn}>&times;</button>
                        </div>
                        <div style={{padding: '20px', maxHeight: '70vh', overflowY: 'auto'}}>
                            <input type="month" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{...monthInputStyle, marginBottom: '20px'}} />
                            {commLogs.length === 0 ? <p style={{textAlign: 'center', color: '#888'}}>No conversations recorded for this month.</p> : 
                                commLogs.map(log => (
                                    <div key={log.id} style={commLogCardStyle}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '5px'}}>
                                            <strong style={{color: '#0056b3'}}>FROM: {log.sender}</strong>
                                            <small style={{color: '#666'}}>{log.date} @ {log.time}</small>
                                        </div>
                                        {/* FIXED: Using pre-wrap to show message exactly as written */}
                                        <p style={{margin: 0, fontStyle: 'italic', fontSize: '0.95rem', whiteSpace: 'pre-wrap'}}>"{log.message}"</p>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: ACCOUNT SHEET (Audit Format + Click row for detail) --- */}
            {selectedView === 'account-sheet' && (
                <div style={modalOverlay} onClick={() => setSelectedView(null)}>
                    <div style={{...modalContent, width: '90%'}} onClick={e => e.stopPropagation()}>
                        <div style={modalHeader}>
                            <h3>Managerial Audit Ledger</h3>
                            <button onClick={() => setSelectedView(null)} style={closeBtn}>&times;</button>
                        </div>
                        <div style={{padding: '25px'}}>
                            <div style={{marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                                <label style={{ fontWeight: 'bold' }}>Audit Month: </label>
                                <input type="month" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={monthInputStyle} />
                            </div>

                            <div style={cardGridStyle}>
                                <SummaryCard title="Gross Revenue" value={formatCurrency(auditSummary.totalRevenue)} color="#4CAF50" description={`${auditSummary.completedOrders} orders.`} />
                                <SummaryCard title="Net Sales" value={formatCurrency(auditSummary.netSales)} color="#00bcd4" description={`Food/Item value.`} />
                                <SummaryCard title="Service Charges" value={formatCurrency(auditSummary.totalServiceCharges)} color="#ff9800" description={`Delivery fees.`} />
                                <SummaryCard title="Cancelled" value={auditSummary.cancelledOrders} color="#f44336" description={`${auditSummary.cancelledOrders} losses.`} />
                            </div>

                            <h3 style={{ marginTop: '30px' }}>Monthly Transaction Audit (Click Row for Receipt)</h3>
                            <div style={{maxHeight: '40vh', overflowY: 'auto'}}>
                                <table style={tableStyle}>
                                    <thead>
                                        <tr>
                                            <th style={thStyle}>ID</th><th style={thStyle}>Date</th><th style={thStyle}>STATUS NAME</th>
                                            <th style={thStyle}>Net Sale</th><th style={thStyle}>Service Charge</th><th style={thStyle}>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {monthlyAuditData.map(order => {
                                            const info = getStatusInfo(order.currentStatus);
                                            return (
                                                <tr key={order.id} onClick={() => setSelectedOrder(order)} style={rowHoverStyle}>
                                                    <td style={tdStyle}>{order.id.substring(0, 8)}...</td>
                                                    <td style={tdStyle}>{(order.archivalDate || order.orderTime)?.toLocaleDateString() || 'N/A'}</td>
                                                    <td style={{ ...tdStyle, color: info.color, fontWeight: 'bold' }}>{info.label}</td>
                                                    <td style={tdStyle}>{formatCurrency(order.financials?.subtotal || 0)}</td>
                                                    <td style={tdStyle}>{formatCurrency(order.financials?.serviceCharge || 0)}</td>
                                                    <td style={tdStyle}><b>{formatCurrency(order.financials?.grandTotal || 0)}</b></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: FULL RECEIPT DETAILS (MATCHES ACCOUNT PAGE) --- */}
            {selectedOrder && (
                <div style={{...modalOverlay, zIndex: 3000}} onClick={() => setSelectedOrder(null)}>
                    <div style={{...modalContent, width: '480px'}} onClick={e => e.stopPropagation()}>
                        <div style={{...modalHeader, backgroundColor: '#0056b3'}}>
                            <h3>Order Receipt Breakdown</h3>
                            <button onClick={() => setSelectedOrder(null)} style={closeBtn}>&times;</button>
                        </div>
                        <div style={{padding: '20px', color: '#333'}}>
                            <center>
                                <h2 style={{margin:0}}>{HOTEL_NAME}</h2>
                                <p style={{margin: '5px 0', fontSize: '0.8rem', color:'#666'}}>Audit Copy - System Generated</p>
                            </center>
                            <div style={{marginTop:'15px', fontSize:'0.85rem'}}>
                                <p><strong>Order ID:</strong> {selectedOrder.id}</p>
                                <p><strong>Date:</strong> {(selectedOrder.archivalDate || selectedOrder.orderTime)?.toLocaleString()}</p>
                                <p><strong>Location:</strong> {selectedOrder.roomNumber || selectedOrder.dispatchLocation || 'N/A'}</p>
                                <div style={{background: '#f8f9fa', padding: '10px', border: '1px solid #ddd', margin: '10px 0'}}>
                                    <strong>ORDER STATUS: {getStatusName(selectedOrder.currentStatus)}</strong>
                                </div>
                            </div>
                            <hr />
                            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginTop: '10px'}}>
                                <thead>
                                    <tr style={{textAlign: 'left', borderBottom: '2px solid #333'}}>
                                        <th style={{padding: '8px 5px'}}>Item</th><th style={{padding: '8px 5px'}}>Qty</th><th style={{padding: '8px 5px'}}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedOrder.items?.map((item, i) => (
                                        <tr key={i} style={{borderBottom: '1px solid #eee'}}>
                                            <td style={{padding: '8px 5px'}}>{item.name}</td>
                                            <td style={{padding: '8px 5px'}}>{item.qty}</td>
                                            <td style={{padding: '8px 5px'}}>{formatCurrency((item.price || 0) * (item.qty || 1))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div style={{marginTop:'20px', borderTop:'2px solid #eee', paddingTop:'10px'}}>
                                <div style={sumLineStyle}><span>Subtotal:</span> <span>{formatCurrency(selectedOrder.financials?.subtotal || 0)}</span></div>
                                <div style={sumLineStyle}><span>Service Charge:</span> <span>{formatCurrency(selectedOrder.financials?.serviceCharge || 0)}</span></div>
                                <div style={{...sumLineStyle, fontWeight: 'bold', fontSize: '1.2rem', marginTop: '10px', color: '#000', borderTop: '2px solid #000', paddingTop: '5px'}}>
                                    <span>Total Amount:</span> <span>{formatCurrency(selectedOrder.financials?.grandTotal || 0)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Components & Styles ---
const KpiCard = ({ title, value, icon, color }) => (
    <div style={{ ...kpiCardStyle, borderBottom: `3px solid ${color}` }}>
        <div style={{ fontSize: '2em' }}>{icon}</div>
        <div>
            <p style={{ margin: '0', fontSize: '0.85em', color: '#555' }}>{title}</p>
            <h4 style={{ margin: '5px 0 0 0', fontSize: '1.7em', color: color }}>{value}</h4>
        </div>
    </div>
);

const StatusCard = ({ title, count, color }) => (
    <div style={{ ...statusCardStyle, backgroundColor: color + '15', border: `1px solid ${color}` }}>
        <h4 style={{ margin: 0, color: color, fontSize: '0.8rem' }}>{title}</h4>
        <div style={{ fontSize: '1.8em', fontWeight: 'bold', color: color }}>{formatCount(count)}</div>
    </div>
);

const SummaryCard = ({ title, value, color, description }) => (
    <div style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '5px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: `5px solid ${color}` }}>
        <p style={{ margin: '0 0 5px 0', fontSize: '0.85em', color: '#555' }}>{title}</p>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '1.4em', color: color }}>{value}</h4>
        <p style={{ margin: 0, fontSize: '0.7em', color: '#777' }}>{description}</p>
    </div>
);

const commLogCardStyle = { padding: '15px', backgroundColor: '#f8fafc', borderLeft: '5px solid #8E44AD', marginBottom: '10px', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const dashboardStyle = { padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', minHeight: '100vh' };
const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '20px' };
const kpiCardStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' };
const cardGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '20px' };
const statusCardStyle = { padding: '15px', textAlign: 'center', borderRadius: '8px' };
const historyGridStyle = { ...kpiGridStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' };
const modalOverlay = { position: 'fixed', top:0, left:0, width:'100%', height:'100%', backgroundColor:'rgba(0,0,0,0.7)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:2000 };
const modalContent = { backgroundColor:'#fff', borderRadius:'12px', overflow:'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' };
const modalHeader = { padding:'15px', backgroundColor:'#2C3E50', color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center' };
const closeBtn = { background:'none', border:'none', color:'#fff', fontSize:'1.8rem', cursor:'pointer' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '10px' };
const thStyle = { borderBottom: '2px solid #dee2e6', padding: '12px 10px', textAlign: 'left', backgroundColor: '#f8f9fa', fontSize: '0.85rem', color: '#495057' };
const tdStyle = { borderBottom: '1px solid #eee', padding: '12px 10px', textAlign: 'left', fontSize: '0.85rem' };
const trStyle = { borderBottom: '1px solid #f8f9fa' };
const rowHoverStyle = { cursor: 'pointer' };
const monthInputStyle = { padding: '8px', border: '1px solid #ced4da', borderRadius: '4px', marginBottom: '15px' };
const sumLineStyle = { display:'flex', justifyContent:'space-between', color:'#555', marginBottom:'5px' };

export default ManagerDashboard;