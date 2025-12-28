import React, { useState, useEffect, useMemo } from 'react';
import { useRealTimeOrders } from '../hooks/useRealTimeOrders'; 
import { logSystemEvent } from '../utils/logger';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

const CURRENCY_SYMBOL = 'GH₵'; 
const formatCurrency = (amount) => `${CURRENCY_SYMBOL}${parseFloat(amount || 0).toFixed(2)}`;
const HOTEL_NAME = "HOMS HOTEL";

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
    const { orders: historyOrders, loading } = useRealTimeOrders(null, null, historyStatuses);
    
    const [filterDate, setFilterDate] = useState(new Date().toISOString().substring(0, 7));
    const [monthlyOrders, setMonthlyOrders] = useState([]); 
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [commLogs, setCommLogs] = useState([]); // 💬 Broadcast History
    const [showCommModal, setShowCommModal] = useState(false); // Modal Toggle

    const [monthlySummary, setMonthlySummary] = useState({
        totalRevenue: 0, totalServiceCharges: 0, completedOrders: 0, cancelledOrders: 0, netSales: 0,
    });

    useEffect(() => {
        logSystemEvent("SYSTEM", "Account Office accessed the financial portal");
    }, []);

    // --- FETCH PERMANENT BROADCAST HISTORY ---
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
        // --- ERROR-PROOFING: BLOOMFILTER SYNC SHIELD ---
        if (loading || !historyOrders) return;

        try {
            const targetYear = parseInt(filterDate.substring(0, 4));
            const targetMonth = parseInt(filterDate.substring(5, 7)) - 1;

            const filteredOrders = historyOrders.filter(order => {
                const dateRaw = (order.archivalDate || order.orderTime);
                const date = dateRaw?.toDate ? dateRaw.toDate() : new Date(dateRaw);
                
                if (!(date instanceof Date) || isNaN(date)) return false; 
                return date.getMonth() === targetMonth && date.getFullYear() === targetYear;
            });
            
            setMonthlyOrders(filteredOrders);

            const summary = filteredOrders.reduce((acc, order) => {
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

            setMonthlySummary(summary);
        } catch (error) {
            console.warn("Firestore BloomFilter caught in computation, retrying...");
        }
    }, [historyOrders, loading, filterDate]);

    // --- RECEIPT PRINTING WITH WATERMARK ---
    const handlePrint = (type) => {
        logSystemEvent("SYSTEM", `Accountant generated ${type} document`);
        
        if (type === 'Receipt' && selectedOrder) {
            const printContent = document.getElementById('receipt-area-content').innerHTML;
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);

            const doc = iframe.contentWindow.document;
            doc.write(`
                <html>
                    <head>
                        <style>
                            body { font-family: sans-serif; padding: 40px; color: #000; position: relative; }
                            .watermark { 
                                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg);
                                font-size: 70px; color: rgba(220, 220, 220, 0.2); z-index: -1; white-space: nowrap; font-weight: bold;
                            }
                            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                            th, td { text-align: left; padding: 8px; border-bottom: 1px solid #eee; }
                            .sum-line { display: flex; justify-content: space-between; margin-bottom: 5px; }
                            .status-box { background: #f0f0f0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; margin: 15px 0; }
                            .msg-content { white-space: pre-wrap; font-style: italic; }
                        </style>
                    </head>
                    <body>
                        <div class="watermark">${HOTEL_NAME}</div>
                        ${printContent}
                    </body>
                </html>
            `);
            doc.close();
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 1000);
        } else {
            window.print();
        }
    };

    const handleExportExcel = () => {
        if (monthlyOrders.length === 0) return alert("No data to export");
        const headers = ["Order ID", "Date", "Status", "Net Sale", "Service Charge", "Total"];
        const rows = monthlyOrders.map(o => [
            o.id, (o.archivalDate || o.orderTime)?.toLocaleDateString(),
            getStatusName(o.currentStatus), o.financials?.subtotal || 0,
            o.financials?.serviceCharge || 0, o.financials?.grandTotal || 0
        ]);
        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Account_Report_${filterDate}.csv`;
        link.click();
    };

    if (loading) return <div style={dashboardStyle}>Syncing secure data logs...</div>;

    const currentMonthName = new Date(filterDate).toLocaleString('en-US', { month: 'long', year: 'numeric' });

    return (
        <div style={dashboardStyle}>
            <style>
                {`
                    @media print {
                        .no-print { display: none !important; }
                        body * { visibility: hidden; }
                        #report-area, #report-area * { visibility: visible; }
                        #report-area { position: absolute; left: 0; top: 0; width: 100%; }
                        #report-area::after {
                            content: "${HOTEL_NAME}";
                            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg);
                            font-size: 100px; color: rgba(200, 200, 200, 0.1) !important;
                            z-index: -1; font-weight: bold; white-space: nowrap; pointer-events: none;
                        }
                    }
                `}
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
                    <SummaryCard title="Gross Revenue" value={formatCurrency(monthlySummary.totalRevenue)} color="#4CAF50" description={`${monthlySummary.completedOrders} orders.`} />
                    <SummaryCard title="Net Sales" value={formatCurrency(monthlySummary.netSales)} color="#00bcd4" description={`Total value of items.`} />
                    <SummaryCard title="Service Charges" value={formatCurrency(monthlySummary.totalServiceCharges)} color="#ff9800" description={`Room Service fees.`} />
                    <SummaryCard title="Cancelled" value={monthlySummary.cancelledOrders} color="#f44336" description={`${monthlySummary.cancelledOrders} cancelled.`} />
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

            {/* --- CONVERSATION HISTORY MODAL --- */}
            {showCommModal && (
                <div style={modalOverlay} onClick={() => setShowCommModal(false)} className="no-print">
                    <div style={{...modalContent, width: '650px'}} onClick={e => e.stopPropagation()}>
                        <div style={modalHeader}>
                            <h3>Departmental Broadcast History</h3>
                            <button onClick={() => setShowCommModal(false)} style={closeBtn}>&times;</button>
                        </div>
                        <div style={{...modalBody, maxHeight: '70vh', overflowY: 'auto'}}>
                            {commLogs.length === 0 ? (
                                <p style={{textAlign: 'center', color: '#888'}}>No messages recorded for {currentMonthName}.</p>
                            ) : (
                                commLogs.map(log => (
                                    <div key={log.id} style={commLogCardStyle}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #edf2f7', paddingBottom: '5px'}}>
                                            <strong style={{color: '#0056b3'}}>FROM: {log.sender}</strong>
                                            <small style={{color: '#718096', fontWeight: '500'}}>{log.date} @ {log.time}</small>
                                        </div>
                                        {/* PRESERVING TEXT FORMATTING AS WRITTEN */}
                                        <p style={{
                                            margin: 0, 
                                            fontSize: '0.95rem', 
                                            whiteSpace: 'pre-wrap', 
                                            lineHeight: '1.5',
                                            color: '#2d3748'
                                        }}>
                                            {log.message}
                                        </p>
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
                        <div style={modalHeader} className="no-print">
                            <h3>Order Receipt Breakdown</h3>
                            <div style={{display:'flex', gap:'10px'}}>
                                <button onClick={() => handlePrint('Receipt')} style={receiptPdfBtn}>🖨️ PDF/Print</button>
                                <button onClick={() => setSelectedOrder(null)} style={closeBtn}>&times;</button>
                            </div>
                        </div>
                        <div style={modalBody} id="receipt-area-content">
                            <center>
                                <h2 style={{margin:0, color: '#000'}}>OFFICIAL RECEIPT</h2>
                                <p style={{margin: '5px 0', fontSize: '0.8rem', color:'#666'}}>{HOTEL_NAME} Management System</p>
                            </center>
                            <div style={{marginTop:'15px', fontSize:'0.85rem', color: '#333'}}>
                                <p><strong>Order ID:</strong> {selectedOrder.id}</p>
                                <p><strong>Date:</strong> {(selectedOrder.archivalDate || selectedOrder.orderTime)?.toLocaleString()}</p>
                                <p><strong>Location:</strong> {selectedOrder.roomNumber || selectedOrder.dispatchLocation || 'N/A'}</p>
                                
                                <div className="status-box" style={{background: '#f8f9fa', padding: '10px', border: '1px solid #ddd', margin: '10px 0'}}>
                                    <strong>ORDER STATUS: {getStatusName(selectedOrder.currentStatus)}</strong>
                                </div>
                            </div>
                            <hr />
                            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem'}}>
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
                            <div style={summaryBox}>
                                <div style={sumLine} className="sum-line"><span>Subtotal:</span> <span>{formatCurrency(selectedOrder.financials?.subtotal || 0)}</span></div>
                                <div style={sumLine} className="sum-line"><span>Service Charge:</span> <span>{formatCurrency(selectedOrder.financials?.serviceCharge || 0)}</span></div>
                                <div style={{...sumLine, fontWeight: 'bold', fontSize: '1.2rem', marginTop: '10px', color: '#000', borderTop: '2px solid #000', paddingTop: '5px'}} className="sum-line">
                                    <span>Total Amount:</span> <span>{formatCurrency(selectedOrder.financials?.grandTotal || 0)}</span>
                                </div>
                            </div>
                            <center style={{marginTop:'40px', borderTop: '1px dotted #ccc', paddingTop: '10px'}}>
                                <small style={{color:'#000', fontWeight: 'bold'}}>*** SYSTEM GENERATED ***</small>
                            </center>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// STYLES
const SummaryCard = ({ title, value, color, description }) => (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${color}` }}>
        <p style={{ margin: '0 0 5px 0', fontSize: '0.9em', color: '#555' }}>{title}</p>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '1.5em', color: color }}>{value}</h4>
        <p style={{ margin: 0, fontSize: '0.75em', color: '#777' }}>{description}</p>
    </div>
);

const commBtnStyle = { padding: '8px 15px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' };
const commLogCardStyle = { padding: '15px', backgroundColor: '#f8fafc', borderLeft: '5px solid #0056b3', marginBottom: '15px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const dashboardStyle = { padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' };
const controlsStyle = { marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' };
const monthInputStyle = { padding: '8px', border: '1px solid #ccc', borderRadius: '4px' };
const cardGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginTop: '20px' };
const cardStyle = { padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '5px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '15px', fontSize: '0.9em' };
const thStyle = { borderBottom: '2px solid #ccc', padding: '12px 8px', textAlign: 'left', backgroundColor: '#f1f1f1' };
const tdStyle = { borderBottom: '1px solid #eee', padding: '10px 8px', textAlign: 'left' };
const rowHoverStyle = { cursor: 'pointer' };
const excelBtnStyle = { padding: '8px 15px', backgroundColor: '#2d3748', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' };
const pdfBtnStyle = { padding: '8px 15px', backgroundColor: '#0056b3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' };
const modalOverlay = { position: 'fixed', top:0, left:0, width:'100%', height:'100%', backgroundColor:'rgba(0,0,0,0.7)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:1000 };
const modalContent = { backgroundColor:'#fff', borderRadius:'10px', overflow:'hidden' };
const modalHeader = { padding:'15px', backgroundColor:'#0056b3', color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center' };
const closeBtn = { background:'none', border:'none', color:'#fff', fontSize:'1.5rem', cursor:'pointer' };
const receiptPdfBtn = { padding: '6px 12px', backgroundColor: '#48bb78', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' };
const modalBody = { padding:'20px' };
const summaryBox = { marginTop:'20px', borderTop:'2px solid #eee', paddingTop:'10px' };
const sumLine = { display:'flex', justifyContent:'space-between', color:'#555' };

export default AccountDashboard;