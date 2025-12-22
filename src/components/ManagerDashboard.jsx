import React, { useState, useEffect, useMemo } from 'react';
import { useRealTimeOrders } from '../hooks/useRealTimeOrders'; 
import { getStatusDetails } from '../utils/statusMapping'; 

// Helper to format order count
const formatCount = (count) => count.toLocaleString();

function ManagerDashboard() {
    // UPDATED: Now we only need ONE call. 
    // Passing null/null/null to fetch every order in the system.
    const { orders: allOrders, loading } = useRealTimeOrders(null, null, null);

    const [metrics, setMetrics] = useState({
        totalOrders: 0,
        activeOrdersCount: 0,
        completedToday: 0,
        avgPrepTime: 'N/A',
        ordersByStatus: {},
    });

    useEffect(() => {
        if (loading) return;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let completedTodayCount = 0;
        let activeCount = 0;
        let ordersByStatus = {};

        // Initialize status counts (0 through 8)
        for (let i = 0; i <= 8; i++) {
            ordersByStatus[i] = 0;
        }

        allOrders.forEach(order => {
            const status = order.currentStatus;
            
            // Count orders by status
            if (ordersByStatus[status] !== undefined) {
                ordersByStatus[status] += 1;
            }

            // Define Active as Status 1 through 6
            if (status >= 1 && status <= 6) {
                activeCount += 1;
            }

            // Check for completed today (Status 7/8, archived today)
            const archivalDate = order.archivalDate; 
            if (archivalDate instanceof Date && (status === 7 || status === 8) && archivalDate >= startOfDay) {
                completedTodayCount += 1;
            }
        });
        
        const avgPrepTime = "15 min (Approx)"; 

        setMetrics({
            totalOrders: allOrders.length,
            activeOrdersCount: activeCount,
            completedToday: completedTodayCount,
            avgPrepTime: avgPrepTime,
            ordersByStatus: ordersByStatus,
        });

    }, [allOrders, loading]);

    if (loading) {
        return <div style={dashboardStyle}>Loading General Manager Dashboard Data...</div>;
    }

    // Prepare status cards for active monitoring
    const activeStatusCards = [1, 2, 3, 4, 5, 6].map(statusId => {
        const details = getStatusDetails(statusId);
        const count = metrics.ordersByStatus[statusId] || 0;
        return {
            title: details.label || details.name, // Support different naming conventions
            count: count,
            color: details.color,
        };
    });

    return (
        <div style={dashboardStyle}>
            <h2 style={{ marginBottom: '20px', color: '#2C3E50' }}>General Manager: Operational Monitoring</h2>
            
            {/* High-Level KPIs */}
            <div style={kpiGridStyle}>
                <KpiCard title="Total Orders Recorded" value={formatCount(metrics.totalOrders)} icon="📈" color="#1A5276"/>
                <KpiCard title="Currently Active Orders" value={formatCount(metrics.activeOrdersCount)} icon="🔔" color="#3498DB"/>
                <KpiCard title="Orders Completed Today" value={formatCount(metrics.completedToday)} icon="✅" color="#27AE60"/>
                <KpiCard title="Average Prep Time" value={metrics.avgPrepTime} icon="⏱️" color="#F39C12"/>
            </div>

            {/* Status Breakdown */}
            <h3 style={{ marginTop: '40px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>Active Order Status Breakdown</h3>
            <div style={cardGridStyle}>
                {activeStatusCards.map(card => (
                    <StatusCard key={card.title} {...card} />
                ))}
            </div>

            {/* Historical Status Summary */}
            <h3 style={{ marginTop: '40px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>Historical Status Summary</h3>
            <div style={historyGridStyle}>
                <KpiCard title="Total Cancelled (Status 0)" value={formatCount(metrics.ordersByStatus[0] || 0)} icon="❌" color="#E74C3C"/>
                <KpiCard title="Total Cleared/Archived (7/8)" value={formatCount((metrics.ordersByStatus[7] || 0) + (metrics.ordersByStatus[8] || 0))} icon="📦" color="#808B96"/>
            </div>
        </div>
    );
}

// --- Components & Styles (Preserved from your original) ---
const KpiCard = ({ title, value, icon, color }) => (
    <div style={{ ...kpiCardStyle, borderBottom: `3px solid ${color}` }}>
        <div style={{ fontSize: '2em' }}>{icon}</div>
        <div>
            <p style={{ margin: '0', fontSize: '0.9em', color: '#555' }}>{title}</p>
            <h4 style={{ margin: '5px 0 0 0', fontSize: '1.8em', color: color }}>{value}</h4>
        </div>
    </div>
);

const StatusCard = ({ title, count, color }) => (
    <div style={{ ...statusCardStyle, backgroundColor: color + '20', border: `1px solid ${color}` }}>
        <h4 style={{ margin: 0, color: color, fontSize: '0.8rem' }}>{title}</h4>
        <div style={{ fontSize: '2em', fontWeight: 'bold', color: color }}>{formatCount(count)}</div>
    </div>
);

const dashboardStyle = { padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' };
const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '20px' };
const kpiCardStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '15px', backgroundColor: '#fff', borderRadius: '5px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const cardGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '20px', marginTop: '20px' };
const statusCardStyle = { padding: '15px', textAlign: 'center', borderRadius: '5px' };
const historyGridStyle = { ...kpiGridStyle, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' };

export default ManagerDashboard;