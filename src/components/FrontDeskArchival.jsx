// src/components/FrontDeskArchival.jsx
import React from 'react';
import { useRealTimeOrders } from '../hooks/useRealTimeOrders';
// 🛑 FIX: Changed 'completeOrder' to 'markOrderCompleted' 
import { confirmDelivery, markOrderCompleted } from '../utils/orderActions';
import { getStatusDetails } from '../utils/statusMapping';

// Mock user ID
const CURRENT_FRONT_DESK_ID = "FD_User_A"; 

function FrontDeskArchival() {
    // 🛑 FIX: Explicitly fetch only Status 5 and 6 orders 
    const FINAL_ACTION_STATUSES = [5, 6];
    const { orders, loading } = useRealTimeOrders(null, FINAL_ACTION_STATUSES);

    // activeFinalOrders is now just 'orders' since the hook filters them
    const activeFinalOrders = orders;

    const handleConfirmDelivery = async (orderId) => {
        if (window.confirm("Confirm order was successfully DELIVERED to the guest?")) {
            try {
                // Uses confirmDelivery (Status 5 -> 6)
                await confirmDelivery(orderId, CURRENT_FRONT_DESK_ID);
                alert(`Order ${orderId} marked as Delivered (Status 6).`);
            } catch (error) {
                alert(`Failed to confirm delivery: ${error.message}`);
            }
        }
    };

    const handleArchive = async (orderId) => {
        if (window.confirm("Confirm order completion and archive (Status 7)?")) {
            try {
                // Uses markOrderCompleted (Status 6/5 -> 7)
                await markOrderCompleted(orderId, CURRENT_FRONT_DESK_ID);
                alert(`Order ${orderId} marked as Completed (Status 7).`);
            } catch (error) {
                 alert(`Failed to complete order: ${error.message}`);
            }
        }
    };

    if (loading) {
        return <div>Loading Final Status Orders...</div>;
    }

    return (
        <div style={{ padding: '20px', border: '1px solid #ccc', marginTop: '20px' }}>
            <h2>🛎️ Front Desk Final Actions</h2>
            <p>Manage Dispatched and Delivered orders before archiving.</p>

            {activeFinalOrders.length === 0 ? (
                <p>No orders awaiting final actions (Delivery or Archival).</p>
            ) : (
                activeFinalOrders.map(order => (
                    <div key={order.id} style={finalOrderCardStyle(order.currentStatus)}>
                        <h4>Order ID: {order.id} | Status: {getStatusDetails(order.currentStatus).name}</h4>
                        
                        <p>
                            To: <strong>{order.dispatchLocation || order.roomNumber}</strong> | 
                            Server: <strong>{order.serverName || 'N/A'}</strong>
                        </p>
                        
                        {/* Status 5: DISPATCHED -> Action: Confirm Delivery (Status 6) */}
                        {order.currentStatus === 5 && (
                            <button 
                                onClick={() => handleConfirmDelivery(order.id)}
                                style={{ ...actionButtonStyle, backgroundColor: '#007bff' }}
                            >
                                Confirm Delivery (Status 6)
                            </button>
                        )}
                        
                        {/* Status 6: DELIVERED -> Action: Archive/Complete (Status 7) */}
                        {order.currentStatus === 6 && (
                            <button 
                                onClick={() => handleArchive(order.id)}
                                style={{ ...actionButtonStyle, backgroundColor: '#6c757d' }}
                            >
                                Archive/Complete (Status 7)
                            </button>
                        )}
                         {/* Fallback check for Dispatch -> Complete (if Status 6 is skipped) */}
                         {order.currentStatus === 5 && (
                            <button 
                                onClick={() => handleArchive(order.id)}
                                style={{ ...actionButtonStyle, backgroundColor: '#a0a0a0', marginLeft: '10px' }}
                            >
                                Skip Delivery & Complete (Status 7)
                            </button>
                        )}
                    </div>
                ))
            )}
        </div>
    );
}

// Basic inline styling
const finalOrderCardStyle = (status) => ({
    margin: '10px 0',
    padding: '15px',
    borderLeft: `5px solid ${getStatusDetails(status).color}`,
    borderRadius: '5px',
    backgroundColor: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
});

const actionButtonStyle = {
    padding: '8px 15px',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginRight: '10px'
};

export default FrontDeskArchival;