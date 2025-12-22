// src/components/FrontDeskArchival.jsx
import React from 'react';
import { confirmDelivery, markOrderCompleted } from '../utils/orderActions';
import { getStatusDetails } from '../utils/statusMapping';

const CURRENT_FRONT_DESK_ID = "FD_User_A"; 
const CURRENCY_SYMBOL = 'GH₵'; 

function FrontDeskArchival({ isActive, orders }) {

    // 1. HARD RENDER GUARD
    if (!isActive) return null;

    // 2. DATA LOGIC
    // We filter the orders passed from the parent to only show Status 5 (Dispatched) and 6 (Delivered).
    const finalActionOrders = orders ? orders.filter(o => [5, 6].includes(o.currentStatus)) : [];

    const handleConfirmDelivery = async (orderId) => {
        if (window.confirm("Confirm order was successfully DELIVERED to the guest?")) {
            try {
                await confirmDelivery(orderId, CURRENT_FRONT_DESK_ID);
            } catch (error) {
                alert(`Failed to confirm delivery: ${error.message}`);
            }
        }
    };

    const handleArchive = async (orderId) => {
        if (window.confirm("Confirm order completion and archive (Status 7)?")) {
            try {
                await markOrderCompleted(orderId, CURRENT_FRONT_DESK_ID);
            } catch (error) {
                alert(`Failed to complete order: ${error.message}`);
            }
        }
    };

    return (
        <div style={{ padding: '20px', border: '1px solid #ccc', marginTop: '20px', backgroundColor: '#fff', borderRadius: '8px' }}>
            <h2 style={{ color: '#2C3E50', marginBottom: '10px' }}>🛎️ Front Desk Final Actions</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>Manage Dispatched and Delivered orders before archiving.</p>

            {finalActionOrders.length === 0 ? (
                <p style={{ fontStyle: 'italic', color: '#999', textAlign: 'center', padding: '20px' }}>
                    No orders awaiting final actions (Delivery or Archival).
                </p>
            ) : (
                finalActionOrders.map(order => {
                    const statusDetail = getStatusDetails(order.currentStatus);
                    return (
                        <div key={order.id} style={finalOrderCardStyle(statusDetail.color)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h4 style={{ margin: '0 0 5px 0' }}>
                                        Order ID: {order.id.slice(-6).toUpperCase()} | 
                                        <span style={{ color: statusDetail.color }}> {statusDetail.name}</span>
                                    </h4>
                                    <p style={{ margin: '0', fontSize: '0.9rem' }}>
                                        To: <strong>{order.dispatchLocation || order.roomNumber}</strong> | 
                                        Server: <strong>{order.serverName || 'N/A'}</strong>
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <strong style={{ fontSize: '1.1rem' }}>{CURRENCY_SYMBOL}{order.financials?.grandTotal?.toFixed(2)}</strong>
                                </div>
                            </div>

                            <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                                {order.currentStatus === 5 && (
                                    <button
                                        onClick={() => handleConfirmDelivery(order.id)}
                                        style={{ ...actionButtonStyle, backgroundColor: '#3498DB' }}
                                    >
                                        ✅ Confirm Delivery (Status 6)
                                    </button>
                                )}

                                <button
                                    onClick={() => handleArchive(order.id)}
                                    style={{ 
                                        ...actionButtonStyle, 
                                        backgroundColor: order.currentStatus === 6 ? '#27AE60' : '#BDC3C7' 
                                    }}
                                >
                                    📦 Complete & Archive (Status 7)
                                </button>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

const finalOrderCardStyle = (color) => ({
    margin: '15px 0',
    padding: '15px',
    borderLeft: `6px solid ${color}`,
    borderRadius: '6px',
    backgroundColor: '#F8F9F9',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
});

const actionButtonStyle = {
    padding: '10px 18px',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 'bold'
};

export default FrontDeskArchival;