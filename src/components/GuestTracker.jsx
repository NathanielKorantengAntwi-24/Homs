import React, { useState } from 'react';
import { useRealTimeOrders } from '../hooks/useRealTimeOrders';
import { getStatusDetails } from '../utils/statusMapping';
import { cancelOrder } from '../utils/orderActions'; 

// Mock guest ID - replace with real user context
const GUEST_ID = "G_40201"; 
const RECEPTION_CONTACT = "030 223 4567"; 
const CURRENCY_SYMBOL = 'GH₵'; 

const ACTIVE_STATUSES = [1, 2, 3, 4, 5, 6];
const HISTORY_STATUSES = [0, 7, 8];

// Note: This component now relies on the parent (App.jsx) to control 
// whether it should render Active Orders or History via the 'viewMode' prop.
function GuestTracker({ guestId, viewMode }) {
    
    // Determine which orders to fetch based on the mode
    const fetchActive = viewMode !== 'history';
    const fetchHistory = viewMode !== 'active';

    // 1. Fetch ACTIVE orders (Status 1-6)
    const { orders: activeOrders, loading: activeLoading } = useRealTimeOrders('guestId', guestId || GUEST_ID, ACTIVE_STATUSES, fetchActive);
    
    // 2. Fetch HISTORY orders (Status 0, 7, 8)
    const { orders: historyOrders, loading: historyLoading } = useRealTimeOrders('guestId', guestId || GUEST_ID, HISTORY_STATUSES, fetchHistory);

    // State: Tracks the ID of the currently expanded individual history order detail
    const [expandedHistoryId, setExpandedHistoryId] = useState(null); 
    
    // Function: Toggles the visibility of individual history details
    const toggleHistoryDetails = (orderId) => {
        setExpandedHistoryId(prevId => (prevId === orderId ? null : orderId));
    };

    // CANCELLATION LOGIC
    const handleCancel = async (orderId) => {
        if (window.confirm(`Are you sure you want to CANCEL order ${orderId}? This cannot be undone.`)) {
            try {
                await cancelOrder(orderId, `Guest ${guestId}`, "Order cancelled by guest.");
                alert(`Order ${orderId} has been CANCELLED. The Front Desk has been notified.`);
                setExpandedHistoryId(null); 
            } catch (e) {
                alert(`Failed to cancel order: ${e.message}`);
                console.error("Cancellation Error:", e);
            }
        }
    };

    // Robust Helper function to handle Firestore Timestamps
    const formatTime = (timestampOrDate) => {
        if (!timestampOrDate) return 'N/A';
        let date;
        
        if (timestampOrDate instanceof Date) {
            date = timestampOrDate; 
        } else if (timestampOrDate.toDate) {
            date = timestampOrDate.toDate(); 
        } else {
            return 'N/A';
        }
        
        return date.toLocaleString('en-US', { 
            year: 'numeric', month: '2-digit', day: '2-digit', 
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true 
        });
    };
    
    // Helper to render the financial breakdown
    const renderFinancials = (order) => {
        const financials = order.financials || {};
        
        if (!order.items || order.items.length === 0) {
            return <p style={{ color: '#dc3545', fontWeight: 'bold' }}>⚠️ Item list unavailable or empty.</p>;
        }
        
        if (financials.grandTotal === undefined || financials.grandTotal === null) {
             return <p style={{ color: '#6c757d' }}>Financial summary unavailable.</p>;
        }

        return (
            <div style={breakdownCardStyle}>
                <h4 style={{ borderBottom: '1px solid #ced4da', paddingBottom: '5px' }}>Price Breakdown</h4>
                
                {/* Itemized List */}
                <ul style={itemizedListStyle}>
                    {order.items.map((item, index) => (
                        <li key={item.id || index} style={itemizedListItemStyle}>
                            <span>{item.qty}x **{item.name}**</span>
                            {/* Display Price TBD for unpriced custom items */}
                            {item.price === 0 && item.type === 'special' ? (
                                <span style={{ color: '#800080', fontWeight: 'bold' }}>Price TBD</span>
                            ) : (
                                <span>{CURRENCY_SYMBOL}{(item.qty * item.price).toFixed(2)}</span>
                            )}
                        </li>
                    ))}
                </ul>

                {/* Financial Summary */}
                <div style={breakdownSummaryStyle}>
                    <div style={breakdownRowStyle}>
                        <span>Subtotal (Items):</span>
                        <span>{CURRENCY_SYMBOL}{financials.subtotal.toFixed(2)}</span>
                    </div>
                    {financials.serviceCharge > 0 && (
                        <div style={breakdownRowStyle}>
                            <span>Service Charge (GH₵ 30.00):</span>
                            <span>{CURRENCY_SYMBOL}{financials.serviceCharge.toFixed(2)}</span>
                        </div>
                    )}
                    <div style={grandTotalRowStyle}>
                        <strong>GRAND TOTAL:</strong>
                        <strong>{CURRENCY_SYMBOL}{financials.grandTotal.toFixed(2)}</strong>
                    </div>
                </div>
            </div>
        );
    };

    // Displays the current status of a single order (Active orders section uses this)
    const renderOrderStatus = (order) => {
        const statusDetail = getStatusDetails(order.currentStatus);
        
        const orderTime = formatTime(order.orderTime);
        const confirmedEntry = order.statusHistory.find(entry => entry.status === 2);
        const confirmationTime = confirmedEntry ? formatTime(confirmedEntry.timestamp) : 'Awaiting Confirmation...';
        const lastTimestampObject = order.statusHistory[order.statusHistory.length - 1]?.timestamp;
        const latestTime = lastTimestampObject ? formatTime(lastTimestampObject) : orderTime; 
        
        const isCancellable = order.currentStatus === 1;

        // Use dispatchLocation (Guest Name) for Walk-in orders
        const displayLocation = order.orderType === 'Dining Hall' ? order.dispatchLocation : order.roomNumber;


        return (
            <div 
                // ✅ FIX 2: Replaced shorthand 'border' with longhand properties
                style={{ 
                    borderWidth: '2px', 
                    borderStyle: 'solid', 
                    borderColor: statusDetail.color, 
                    padding: '15px', 
                    borderRadius: '8px', 
                    margin: '15px 0', 
                    backgroundColor: '#fff' 
                }}
            >
                {/* Order Header */}
                <h3>Order ID: <strong>{order.id}</strong> | Service: <strong>{order.orderType}</strong></h3> 
                <p>Location/Room: <strong>{displayLocation || order.roomNumber}</strong></p>
                
                <hr style={{ margin: '10px 0' }}/>
                
                {/* 🛒 ITEMIZED LIST & FINANCIAL BREAKDOWN */}
                {renderFinancials(order)}
                
                {/* Display Notes/Special Requests for Active Order */}
                {order.notes && (
                    <div style={notesContainerStyle}>
                        <strong>Special Request/Allergies:</strong> 
                        <p style={{ margin: '5px 0 0 0', fontStyle: 'italic' }}>{order.notes}</p>
                    </div>
                )}
                
                <hr style={{ margin: '10px 0' }}/>
                
                {/* Status and Time Tracking */}
                <p>Order Placed: <strong>{orderTime}</strong></p>
                <p>Confirmed At: <strong>{confirmationTime}</strong></p>
                
                <h3 style={{ color: statusDetail.color, marginTop: '10px' }}>
                    Current Status: {statusDetail.name}
                </h3>
                <p>Last Status Update: {latestTime}</p>
                
                {/* Delivery details */}
                {order.currentStatus >= 5 && order.serverName && order.dispatchLocation && (
                    <p style={{ fontWeight: 'bold', color: '#800080' }}>
                        {order.currentStatus === 5 ? "Dispatched for Delivery" : "Delivered"} by: 
                        <strong> {order.serverName}</strong>
                    </p>
                )}
                
                {order.whatsappNumber && <p>WhatsApp: {order.whatsappNumber}</p>}
                
                {/* Communication */}
                <div style={{ padding: '10px', marginTop: '15px', backgroundColor: '#fffbe0', borderRadius: '4px' }}>
                    <p style={{ margin: '0', fontWeight: 'bold' }}>Need help?</p>
                    <p style={{ margin: '5px 0 0 0' }}>Call Reception: 
                        <strong style={{ marginLeft: '5px' }}>{RECEPTION_CONTACT}</strong>
                    </p>
                </div>

                {/* Cancellation Button */}
                {isCancellable && (
                    <button 
                        onClick={() => handleCancel(order.id)}
                        style={cancelButtonStyle}
                    >
                        ❌ Cancel Order (Before Confirmation)
                    </button>
                )}
            </div>
        );
    };
    
    // --- RENDER LOGIC BASED ON MODE ---
    
    if (viewMode === 'active') {
        if (activeLoading) return <div style={pageContainerStyle}>Loading active orders...</div>;
        
        return (
            <div style={pageContainerStyle}>
                {activeOrders.length === 0 ? (
                    <p style={{padding: '10px', backgroundColor: '#fff', borderRadius: '6px'}}>No active orders. Place a new order to start tracking!</p>
                ) : (
                    activeOrders.map(order => (
                        <div key={order.id}> 
                            {renderOrderStatus(order)}
                        </div>
                    ))
                )}
            </div>
        );
    }
    
    if (viewMode === 'history') {
        if (historyLoading) return <div style={pageContainerStyle}>Loading order history...</div>;
        
        return (
            <div style={pageContainerStyle}>
                {historyOrders.length === 0 ? (
                    <p style={{padding: '10px', backgroundColor: '#fff', borderRadius: '6px'}}>No completed orders in your history.</p>
                ) : (
                    historyOrders.map(order => {
                        const isExpanded = expandedHistoryId === order.id;
                        const financials = order.financials || {};
                        const displayLocation = order.orderType === 'Dining Hall' ? order.dispatchLocation : order.roomNumber;

                        return (
                            <div key={order.id} style={historyCardStyle} onClick={() => toggleHistoryDetails(order.id)}>
                                
                                <div style={historyHeaderStyle}>
                                    <div style={historyHeaderRowStyle}>
                                        <span style={{ fontWeight: 'bold' }}>Order #{order.id} ({displayLocation})</span> 
                                        <span style={historyTotalStyle}>
                                            Total: {CURRENCY_SYMBOL}{(financials.grandTotal || 0).toFixed(2)}
                                        </span>
                                    </div>
                                    
                                    <div style={historyHeaderRowStyle}>
                                        <span style={{ fontSize: '0.8em', color: '#6c757d' }}>
                                            Completed: {formatTime(order.archivalDate || order.orderTime)}
                                        </span>
                                        <span style={{ color: '#343a40' }}>
                                            {order.orderType}
                                        </span>
                                    </div>

                                    <span style={historyToggleStyle}>
                                        {isExpanded ? '▲ Hide Details' : '▼ Show Details'}
                                    </span>
                                </div>
                                
                                {isExpanded && (
                                    <div style={historyDetailStyle}>
                                        <hr style={{ margin: '10px 0' }}/>
                                        <p>Delivery Location: <strong>{displayLocation}</strong></p>
                                        
                                        {order.notes && (
                                            <div style={notesContainerStyle}>
                                                <strong>Special Request/Allergies:</strong> 
                                                <p style={{ margin: '5px 0 0 0', fontStyle: 'italic' }}>{order.notes}</p>
                                            </div>
                                        )}

                                        {renderFinancials(order)}

                                        <p style={{ marginTop: '10px' }}>
                                            Order Placed: {formatTime(order.orderTime)} | Server: {order.serverName || 'N/A'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        );
    }
    
    return null;
}

// --- STYLES ---

const breakdownCardStyle = {
    padding: '10px',
    border: '1px solid #eee',
    borderRadius: '4px',
    marginBottom: '10px',
    backgroundColor: '#fafafa'
};

const breakdownSummaryStyle = {
    marginTop: '10px',
    paddingTop: '5px',
    borderTop: '1px dotted #ced4da',
    fontSize: '0.95rem'
};

const notesContainerStyle = {
    padding: '10px',
    backgroundColor: '#fff3cd', 
    border: '1px solid #ffeeba',
    borderRadius: '4px',
    marginBottom: '10px'
};

const pageContainerStyle = {
    // Note: Padding is kept simple here, assume parent App.jsx wrapper provides necessary container padding
    backgroundColor: '#f0f4f7',
    margin: '0 auto', 
    boxSizing: 'border-box'
}

const historyCardStyle = {
    margin: '10px 0',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: '#fff',
    fontSize: '0.9em',
    transition: 'box-shadow 0.2s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
    cursor: 'pointer'
};

const historyHeaderStyle = {
    display: 'flex',
    flexDirection: 'column', 
    gap: '4px',
    paddingBottom: '5px',
    alignItems: 'flex-start',
};

const historyHeaderRowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
};

const historyTotalStyle = {
    fontWeight: 'bold',
    color: '#008000',
    backgroundColor: '#e6ffe6',
    padding: '2px 6px',
    borderRadius: '4px'
};

const historyToggleStyle = {
    marginTop: '5px',
    fontSize: '0.8em',
    color: '#007bff',
};

const historyDetailStyle = {
    paddingTop: '5px',
    borderTop: '1px solid #eee',
    marginTop: '10px'
};

const itemizedListStyle = {
    listStyle: 'none',
    padding: '0',
    margin: '0 0 10px 0',
    borderBottom: '1px dotted #ced4da',
    paddingBottom: '5px'
};

const itemizedListItemStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '3px 0',
    fontSize: '0.95em'
};

const breakdownRowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '3px 0',
    color: '#343a40'
};

const grandTotalRowStyle = {
    ...breakdownRowStyle,
    borderTop: '2px double #343a40',
    paddingTop: '8px',
    fontSize: '1.1rem',
    fontWeight: 'bold'
};

const cancelButtonStyle = {
    padding: '10px 15px',
    backgroundColor: '#dc3545', 
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginTop: '15px',
    width: '100%',
    fontWeight: 'bold'
};

export default GuestTracker;