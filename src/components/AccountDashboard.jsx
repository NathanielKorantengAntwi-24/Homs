import React, { useState, useEffect } from 'react';
import { useRealTimeOrders } from '../hooks/useRealTimeOrders'; 

const CURRENCY_SYMBOL = 'GH₵'; 
const formatCurrency = (amount) => `${CURRENCY_SYMBOL}${amount.toFixed(2)}`;

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
    // 1. We keep this exactly as is. The hook now correctly returns these statuses.
    const historyStatuses = [0, 7, 8];
    const { orders: historyOrders, loading } = useRealTimeOrders(null, null, historyStatuses);
    
    const [filterDate, setFilterDate] = useState(new Date().toISOString().substring(0, 7));
    const [monthlyOrders, setMonthlyOrders] = useState([]); 

    const [monthlySummary, setMonthlySummary] = useState({
        totalRevenue: 0,
        totalServiceCharges: 0,
        completedOrders: 0,
        cancelledOrders: 0,
        netSales: 0,
    });

    useEffect(() => {
        if (loading || !historyOrders) return;

        const targetYear = parseInt(filterDate.substring(0, 4));
        const targetMonth = parseInt(filterDate.substring(5, 7)) - 1;

        const filteredOrders = historyOrders.filter(order => {
            // The hook now guarantees these are Date objects or null
            const date = (order.archivalDate || order.orderTime);
            if (!(date instanceof Date)) return false; 
            
            return date.getMonth() === targetMonth && date.getFullYear() === targetYear;
        });
        
        setMonthlyOrders(filteredOrders);

        const summary = filteredOrders.reduce((acc, order) => {
            const grandTotal = order.financials?.grandTotal || 0;
            const serviceCharge = order.financials?.serviceCharge || 0;
            const subtotal = order.financials?.subtotal || 0;

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
    }, [historyOrders, loading, filterDate]);

    if (loading) return <div style={dashboardStyle}>Loading Financial History...</div>;

    const currentMonthName = new Date(filterDate).toLocaleString('en-US', { month: 'long', year: 'numeric' });

    return (
        <div style={dashboardStyle}>
            <h2 style={{ marginBottom: '20px', color: '#0056b3' }}>Account Office: Monthly Transaction Balancing</h2>
            
            <div style={controlsStyle}>
                <label style={{ fontWeight: 'bold' }}>Select Month: </label>
                <input type="month" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={monthInputStyle} />
            </div>
            
            <h3 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px' }}>Summary for {currentMonthName}</h3>

            <div style={cardGridStyle}>
                <SummaryCard title="Gross Revenue" value={formatCurrency(monthlySummary.totalRevenue)} color="#4CAF50" description={`${monthlySummary.completedOrders} completed orders.`} />
                <SummaryCard title="Net Sales" value={formatCurrency(monthlySummary.netSales)} color="#00bcd4" description={`Total value of items.`} />
                <SummaryCard title="Service Charges" value={formatCurrency(monthlySummary.totalServiceCharges)} color="#ff9800" description={`Room Service fees.`} />
                <SummaryCard title="Cancelled" value={monthlySummary.cancelledOrders} color="#f44336" description={`Status 0 orders.`} />
            </div>

            {/*  */}
            
            <h3 style={{ marginTop: '30px' }}>Transaction Details ({monthlyOrders.length} Records)</h3>
            <table style={tableStyle}>
                <thead>
                    <tr>
                        <th style={thStyle}>ID</th>
                        <th style={thStyle}>Date</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Net Sale</th>
                        <th style={thStyle}>Service Charge</th>
                        <th style={thStyle}>Gross Total</th>
                    </tr>
                </thead>
                <tbody>
                    {monthlyOrders.map(order => (
                        <tr key={order.id}>
                            <td style={tdStyle}>{order.id.substring(0, 5)}...</td>
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
    );
}

// --- Card and Styles preserved exactly as provided ---
const SummaryCard = ({ title, value, color, description }) => (
    <div style={{ ...cardStyle, borderLeft: `5px solid ${color}` }}>
        <p style={{ margin: '0 0 5px 0', fontSize: '0.9em', color: '#555' }}>{title}</p>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '1.5em', color: color }}>{value}</h4>
        <p style={{ margin: 0, fontSize: '0.75em', color: '#777' }}>{description}</p>
    </div>
);

const dashboardStyle = { padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' };
const controlsStyle = { marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' };
const monthInputStyle = { padding: '8px', border: '1px solid #ccc', borderRadius: '4px' };
const cardGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '20px' };
const cardStyle = { padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '5px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '15px', fontSize: '0.9em' };
const thStyle = { borderBottom: '2px solid #ccc', padding: '12px 8px', textAlign: 'left', backgroundColor: '#f1f1f1' };
const tdStyle = { borderBottom: '1px solid #eee', padding: '10px 8px', textAlign: 'left' };

export default AccountDashboard;