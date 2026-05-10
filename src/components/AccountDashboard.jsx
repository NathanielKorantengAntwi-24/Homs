import React, { useState, useEffect, useMemo } from 'react';
import { getMonthlyFinancials } from '../utils/financeActions';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import useRealTimeOrders from '../hooks/useRealTimeOrders'; // Ensure this path is correct

const CURRENCY_SYMBOL = 'GH₵'; 
const formatCurrency = (amount) => `${CURRENCY_SYMBOL}${parseFloat(amount || 0).toFixed(2)}`;
const HOTEL_NAME = "HOMS HOTEL";

// Mock helper for logging if not defined elsewhere
const logSystemEvent = (type, msg) => console.log(`[${type}] ${msg}`);

function getStatusName(statusId) {
    const names = {
        0: "CANCELLED",
        1: "PENDING",
        2: "CONFIRMED",
        3: "PREPARING",
        4: "READY",
        5: "DISPATCHED",
        6: "DELIVERED",
        7: "COMPLETED",
        8: "CLEARED_ADMIN", 
    };
    return names[statusId] || "Unknown";
}

function AccountDashboard() {
    const historyStatuses = [0, 7, 8];
    const [filterDate, setFilterDate] = useState(new Date().toISOString().substring(0, 7));
    
    // We keep this for the Transaction Details table
    const { orders: historyOrders, loading } = useRealTimeOrders(null, null, historyStatuses);
    
    const [monthlyOrders, setMonthlyOrders] = useState([]); 
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [commLogs, setCommLogs] = useState([]); 
    const [showCommModal, setShowCommModal] = useState(false);
    const [isCalculating, setIsCalculating] = useState(false);

    // Summary state now driven by server-side aggregation
    const [monthlySummary, setMonthlySummary] = useState({
        totalRevenue: 0, 
        totalServiceCharges: 0, 
        completedOrders: 0, 
        cancelledOrders: 0, 
        netSales: 0,
    });

    useEffect(() => {
        logSystemEvent("SYSTEM", "Account Office accessed the financial portal");
    }, []);

    // --- 1. NEW: SERVER-SIDE AGGREGATION EFFECT ---
    useEffect(() => {
        const loadAggregates = async () => {
            setIsCalculating(true);
            try {
                const targetYear = parseInt(filterDate.substring(0, 4));
                const targetMonth = parseInt(filterDate.substring(5, 7)) - 1;
                
                const data = await getMonthlyFinancials(targetYear, targetMonth);
                
                // Merge with cancelled count which we still calculate from the local subset
                setMonthlySummary(prev => ({
                    ...prev,
                    totalRevenue: data.totalRevenue || 0,
                    netSales: data.netSales || 0,
                    totalServiceCharges: data.totalServiceCharge || 0,
                    completedOrders: data.orderCount || 0
                }));
            } catch (error) {
                console.error("Aggregation Error:", error);
            } finally {
                setIsCalculating(false);
            }
        };
        loadAggregates();
    }, [filterDate]);

    // --- 2. BROADCAST HISTORY ---
    useEffect(() => {
        const q = query(collection(db, 'kitchen_notes'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCommLogs(logs.filter(l => l.date?.substring(0, 7) === filterDate));
        });
        return () => unsubscribe();
    }, [filterDate]);

    // --- 3. FILTER LOCAL ORDERS FOR TABLE VIEW ---
    useEffect(() => {
        if (loading || !historyOrders) return;

        const targetYear = parseInt(filterDate.substring(0, 4));
        const targetMonth = parseInt(filterDate.substring(5, 7)) - 1;

        const filtered = historyOrders.filter(order => {
            const dateRaw = (order.archivalDate || order.orderTime);
            const date = dateRaw?.toDate ? dateRaw.toDate() : new Date(dateRaw);
            return date.getMonth() === targetMonth && date.getFullYear() === targetYear;
        });
        
        setMonthlyOrders(filtered);

        // Update cancelled count specifically from this filtered list
        const cancelledCount = filtered.filter(o => o.currentStatus === 0).length;
        setMonthlySummary(prev => ({ ...prev, cancelledOrders: cancelledCount }));

    }, [historyOrders, loading, filterDate]);

    // --- PRINTING & EXPORT LOGIC (UNCHANGED) ---
    const handlePrint = (type) => {
        logSystemEvent("SYSTEM", `Accountant generated ${type} document`);
        if (type === 'Receipt' && selectedOrder) {
            const printContent = document.getElementById('receipt-area-content').innerHTML;
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            const doc = iframe.contentWindow.document;
            doc.write(`<html><head><style>body { font-family: sans-serif; padding: 40px; } .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 70px; color: rgba(220, 220, 220, 0.2); z-index: -1; font-weight: bold; } table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 8px; border-bottom: 1px solid #eee; }</style></head><body><div class="watermark">${HOTEL_NAME}</div>${printContent}</body></html>`);
            doc.close();
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 1000);
        } else { window.print(); }
    };

    const handleExportExcel = () => {
        if (monthlyOrders.length === 0) return alert("No data to export");
        const headers = ["Order ID", "Date", "Status", "Net Sale", "Service Charge", "Total"];
        const rows = monthlyOrders.map(o => [o.id, (o.archivalDate || o.orderTime)?.toLocaleDateString(), getStatusName(o.currentStatus), o.financials?.subtotal || 0, o.financials?.serviceCharge || 0, o.financials?.grandTotal || 0]);
        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Account_Report_${filterDate}.csv`;
        link.click();
    };

    if (loading) return <div style={dashboardStyle}>Syncing secure data logs...</div>;

    const currentMonthName = new Date(filterDate).toLocaleString('en-US', { month: 'long', year: 'numeric' });

    return (
        <div style={dashboardStyle}>
            <style>
                {`@media print { .no-print { display: none !important; } body * { visibility: hidden; } #report-area, #report-area * { visibility: visible; } #report-area { position: absolute; left: 0; top: 0; width: 100%; } }`}
            </style>

            <div id="report-area">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="no-print">
                    <h2 style={{ marginBottom: '20px', color: '#0056b3' }}>Account Office: Monthly Transaction Balancing</h2>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => setShowCommModal(true)} style={commBtnStyle}>📝 View Conversations</button>
                        <button onClick={handleExportExcel} style={excelBtnStyle}>📊 Excel</button>
                        <button onClick={() => handlePrint('Full Report')} style={pdfBtnStyle}>📄 Export Full PDF</button>
                    </div>
                </div>
                
                <div style={controlsStyle} className="no-print">
                    <label style={{ fontWeight: 'bold' }}>Select Month: </label>
                    <input type="month" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={monthInputStyle} />
                </div>
                
                <h3 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px' }}>Summary for {currentMonthName}</h3>

                <div style={cardGridStyle}>
                    <SummaryCard 
                        title="Gross Revenue" 
                        value={isCalculating ? "Calculating..." : formatCurrency(monthlySummary.totalRevenue)} 
                        color="#4CAF50" 
                        description={`${monthlySummary.completedOrders} orders completed.`} 
                    />
                    <SummaryCard 
                        title="Net Sales" 
                        value={isCalculating ? "..." : formatCurrency(monthlySummary.netSales)} 
                        color="#00bcd4" 
                        description={`Value of items sold.`} 
                    />
                    <SummaryCard 
                        title="Service Charges" 
                        value={isCalculating ? "..." : formatCurrency(monthlySummary.totalServiceCharges)} 
                        color="#ff9800" 
                        description={`Room Service fees.`} 
                    />
                    <SummaryCard 
                        title="Cancelled" 
                        value={monthlySummary.cancelledOrders} 
                        color="#f44336" 
                        description={`${monthlySummary.cancelledOrders} orders cancelled.`} 
                    />
                </div>
                
                <h3 style={{ marginTop: '30px' }}>Transaction Details</h3>
                <table style={tableStyle}>
                    <thead>
                        <tr>
                            <th style={thStyle}>ID</th><th style={thStyle}>Date</th><th style={thStyle}>Status</th>
                            <th style={thStyle}>Net Sale</th><th style={thStyle}>Service Charge</th><th style={thStyle}>Gross Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {monthlyOrders.map(order => (
                            <tr key={order.id} onClick={() => setSelectedOrder(order)} style={rowHoverStyle}>
                                <td style={tdStyle}>{order.id.substring(0, 8)}...</td>
                                <td style={tdStyle}>{(order.archivalDate || order.orderTime)?.toLocaleDateString() || 'N/A'}</td>
                                <td style={{ ...tdStyle, color: order.currentStatus === 0 ? '#f44336' : '#4CAF50', fontWeight: 'bold' }}>
                                    {getStatusName(order.currentStatus)}
                                </td>
                                <td style={tdStyle}>{formatCurrency(order.financials?.subtotal || 0)}</td>
                                <td style={tdStyle}>{formatCurrency(order.financials?.serviceCharge || 0)}</td>
                                <td style={tdStyle}>{formatCurrency(order.financials?.grandTotal || 0)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* MODALS REMAIN THE SAME AS PER YOUR ORIGINAL CODE */}
            {showCommModal && (
                <div style={modalOverlay} onClick={() => setShowCommModal(false)} className="no-print">
                    <div style={{...modalContent, width: '650px'}} onClick={e => e.stopPropagation()}>
                        <div style={modalHeader}>
                            <h3>Departmental Broadcast History</h3>
                            <button onClick={() => setShowCommModal(false)} style={closeBtn}>&times;</button>
                        </div>
                        <div style={{...modalBody, maxHeight: '70vh', overflowY: 'auto'}}>
                            {commLogs.length === 0 ? (
                                <p style={{textAlign: 'center', color: '#888'}}>No messages recorded.</p>
                            ) : (
                                commLogs.map(log => (
                                    <div key={log.id} style={commLogCardStyle}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #edf2f7'}}>
                                            <strong style={{color: '#0056b3'}}>FROM: {log.sender}</strong>
                                            <small>{log.date} @ {log.time}</small>
                                        </div>
                                        <p style={{margin: 0, whiteSpace: 'pre-wrap'}}>{log.message}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selectedOrder && (
                <div style={modalOverlay} onClick={() => setSelectedOrder(null)} className="no-print">
                    <div style={modalContent} onClick={e => e.stopPropagation()}>
                        <div style={modalHeader}>
                            <h3>Order Receipt Breakdown</h3>
                            <div style={{display:'flex', gap:'10px'}}>
                                <button onClick={() => handlePrint('Receipt')} style={receiptPdfBtn}>🖨️ Print</button>
                                <button onClick={() => setSelectedOrder(null)} style={closeBtn}>&times;</button>
                            </div>
                        </div>
                        <div style={modalBody} id="receipt-area-content">
                            <center><h2>OFFICIAL RECEIPT</h2></center>
                            <p><strong>Order ID:</strong> {selectedOrder.id}</p>
                            <p><strong>Status:</strong> {getStatusName(selectedOrder.currentStatus)}</p>
                            <hr />
                            <table style={{width: '100%'}}>
                                <thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead>
                                <tbody>
                                    {selectedOrder.items?.map((item, i) => (
                                        <tr key={i}><td>{item.name}</td><td>{item.qty}</td><td>{formatCurrency(item.price * item.qty)}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                            <div style={summaryBox}>
                                <div style={sumLine}><span>Subtotal:</span> <span>{formatCurrency(selectedOrder.financials?.subtotal)}</span></div>
                                <div style={{...sumLine, fontWeight: 'bold'}}><span>Total:</span> <span>{formatCurrency(selectedOrder.financials?.grandTotal)}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// STYLES (Kept exactly as per your UI)
const SummaryCard = ({ title, value, color, description }) => (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${color}` }}>
        <p style={{ margin: '0 0 5px 0', fontSize: '0.9em', color: '#555' }}>{title}</p>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '1.5em', color: color }}>{value}</h4>
        <p style={{ margin: 0, fontSize: '0.75em', color: '#777' }}>{description}</p>
    </div>
);

const commBtnStyle = { padding: '8px 15px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' };
const commLogCardStyle = { padding: '15px', backgroundColor: '#f8fafc', borderLeft: '5px solid #0056b3', marginBottom: '15px', borderRadius: '8px' };
const dashboardStyle = { padding: '20px', backgroundColor: '#fff', borderRadius: '8px' };
const controlsStyle = { marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' };
const monthInputStyle = { padding: '8px', border: '1px solid #ccc', borderRadius: '4px' };
const cardGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' };
const cardStyle = { padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '5px' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '15px' };
const thStyle = { borderBottom: '2px solid #ccc', padding: '12px 8px', textAlign: 'left', backgroundColor: '#f1f1f1' };
const tdStyle = { borderBottom: '1px solid #eee', padding: '10px 8px' };
const rowHoverStyle = { cursor: 'pointer' };
const excelBtnStyle = { padding: '8px 15px', backgroundColor: '#2d3748', color: '#fff', borderRadius: '4px' };
const pdfBtnStyle = { padding: '8px 15px', backgroundColor: '#0056b3', color: '#fff', borderRadius: '4px' };
const modalOverlay = { position: 'fixed', top:0, left:0, width:'100%', height:'100%', backgroundColor:'rgba(0,0,0,0.7)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000 };
const modalContent = { backgroundColor:'#fff', borderRadius:'10px' };
const modalHeader = { padding:'15px', backgroundColor:'#0056b3', color:'#fff', display:'flex', justifyContent:'space-between' };
const closeBtn = { background:'none', border:'none', color:'#fff', fontSize:'1.5rem', cursor:'pointer' };
const receiptPdfBtn = { padding: '6px 12px', backgroundColor: '#48bb78', color: '#fff', borderRadius: '4px' };
const modalBody = { padding:'20px' };
const summaryBox = { marginTop:'20px', borderTop:'2px solid #eee' };
const sumLine = { display:'flex', justifyContent:'space-between' };

export default AccountDashboard;