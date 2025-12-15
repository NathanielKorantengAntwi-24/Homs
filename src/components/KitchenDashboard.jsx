// src/components/KitchenDashboard.jsx

import React, { useState } from 'react';
import { useRealTimeOrders } from '../hooks/useRealTimeOrders'; 
// Ensure dispatchOrder is imported along with updateOrderStatus
import { updateOrderStatus, dispatchOrder } from '../utils/orderActions'; 
import { getStatusDetails } from '../utils/statusMapping'; 

// --- KITCHEN CONSTANTS ---
// Kitchen monitors: CONFIRMED (2), IN_PREP (3), READY (4), DISPATCHED (5)
const KITCHEN_MONITORING_STATUSES = [2, 3, 4, 5]; 
const CURRENT_KITCHEN_ID = "Kitchen_User_A"; 
// -------------------------

// --- Helper function for clear, consistent time formatting (FIXES REFERENCE ERROR) ---
const formatTime = (timestampOrDate) => {
    if (!timestampOrDate) return 'N/A';
    let date;
    if (timestampOrDate.toDate) {
        date = timestampOrDate.toDate(); 
    } else {
        date = timestampOrDate; 
    }
    // Only shows hour and minute, which is typically enough for a kitchen board
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', minute: '2-digit', hour12: true 
    });
};

// --- Helper to render the itemized list for Kitchen view (FIXES REFERENCE ERROR) ---
const renderKitchenOrderDetails = (order) => {
    // Styles needed for this function (must be defined or imported elsewhere)
    const kitchenDetailContainerStyle = { borderTop: '1px solid #eee', marginTop: '5px', paddingTop: '5px' };
    const itemizedListStyle = { listStyle: 'none', padding: '0', margin: '0' };
    const itemizedListItemStyle = { display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '0.95em' };
    const notesContainerStyle = { padding: '8px', backgroundColor: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '4px', marginBottom: '5px' };


    if (!order.items || order.items.length === 0) {
        return <p style={{color: '#dc3545'}}>Item list is missing.</p>;
    }
    
    return (
        <div style={kitchenDetailContainerStyle}>
            <ul style={itemizedListStyle}>
                {order.items.map((item, index) => {
                    const isCustom = item.type === 'special';
                    const priceSet = item.price > 0;
                    const style = isCustom ? {color: '#800080', fontWeight: 'bold'} : {};

                    return (
                        <li key={item.id || index} style={itemizedListItemStyle}>
                            <span style={style}>{item.qty}x **{item.name}**</span>
                            {isCustom && !priceSet && <span style={{color: '#ffc107', marginLeft: '10px'}}> (Price TBD)</span>}
                        </li>
                    );
                })}
            </ul>
            {order.notes && (
                <div style={notesContainerStyle}>
                    <strong>Notes:</strong> 
                    <p style={{ margin: '5px 0 0 0', fontStyle: 'italic', fontSize: '0.9em' }}>{order.notes}</p>
                </div>
            )}
            <p style={{fontSize: '0.8em', marginTop: '10px'}}>
                Order Time: {formatTime(order.orderTime)}
            </p>
        </div>
    );
};


function KitchenDashboard() {
    
    const { orders, loading, error } = useRealTimeOrders(null, KITCHEN_MONITORING_STATUSES);
    const [expandedOrderId, setExpandedOrderId] = useState(null); 
    
    const toggleOrderDetails = (orderId) => {
        setExpandedOrderId(prevId => (prevId === orderId ? null : prevId)); 
    };

    // ACTION: Move Status CONFIRMED (2) -> IN_PREP (3)
    const handleStartPrep = async (orderId) => {
        if (!window.confirm("Confirm STARTING preparation for this order?")) return;
        try {
            await updateOrderStatus(orderId, 3, CURRENT_KITCHEN_ID, "Preparation started.");
            alert(`Order ${orderId} is now IN PREP.`);
        } catch (e) {
            alert(`Failed to start prep: ${e.message}`);
        }
    };

    // ACTION: Move Status IN_PREP (3) -> READY_FOR_PICKUP (4)
    const handleMarkReady = async (orderId) => {
        if (!window.confirm("Confirm order is READY for hand-off?")) return;
        try {
            await updateOrderStatus(orderId, 4, CURRENT_KITCHEN_ID, "Food is ready for delivery staff.");
            alert(`Order ${orderId} is now READY.`);
        } catch (e) {
            alert(`Failed to mark ready: ${e.message}`);
        }
    };

    // 🛑 KITCHEN ACTION: Dispatch (Status 4 -> 5) - FIXED CALL SIGNATURE
    const handleDispatch = async (orderId) => {
        const order = orders.find(o => o.id === orderId);
        if (order.currentStatus !== 4) return;
        
        const serverName = window.prompt("Enter Server Staff Name for dispatch:");
        if (!serverName) return; 

        try {
            // UPDATED: Added "Kitchen" as the sourceRole argument
            await dispatchOrder(orderId, serverName, order.dispatchLocation || order.roomNumber, CURRENT_KITCHEN_ID, "Kitchen");
            alert(`Order ${orderId} DISPATCHED by ${serverName}.`);
        } catch (e) {
            console.error("Dispatch Error:", e);
            alert(`Failed to dispatch order: ${e.message}`);
        }
    };
    
    if (loading) return <div>Loading Kitchen Orders...</div>;
    if (error) return <div style={{color: 'red'}}>Error loading orders: {error.message}</div>;

    // Separate orders for the Kanban columns
    const confirmedOrders = orders.filter(o => o.currentStatus === 2);
    const prepOrders = orders.filter(o => o.currentStatus === 3);
    const readyToDispatchOrders = orders.filter(o => o.currentStatus === 4);
    const dispatchedOrders = orders.filter(o => o.currentStatus === 5); // Monitor dispatched items

    const renderKitchenCard = (order) => {
        const statusDetails = getStatusDetails(order.currentStatus);
        const displayLocation = order.orderType === 'Dining Hall' ? order.dispatchLocation : order.roomNumber;
        const hasUnpricedCustom = order.items.some(item => item.type === 'special' && item.price <= 0);

        return (
            <div 
                key={order.id} 
                style={{ ...kitchenOrderCardStyle, borderColor: statusDetails.color }}
                onClick={() => toggleOrderDetails(order.id)}
            >
                <div style={kitchenHeaderStyle}>
                    <span style={{ fontWeight: 'bold' }}>#{order.id} ({displayLocation})</span>
                    <span style={{ color: statusDetails.color }}>{statusDetails.name}</span>
                </div>
                
                {hasUnpricedCustom && order.currentStatus === 2 && (
                    <p style={{...failureTextStyle, padding: '5px', margin: '5px 0'}}>
                        🛑 Awaiting FD Price Check!
                    </p>
                )}

                {renderKitchenOrderDetails(order)}
                
                {/* Kitchen Action Buttons */}
                <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                    {/* Status 2 -> 3 (Start Prep) */}
                    {order.currentStatus === 2 && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleStartPrep(order.id); }}
                            disabled={hasUnpricedCustom}
                            style={{ ...kitchenActionButtonStyle, backgroundColor: '#007bff' }}
                        >
                            Start Prep (Status 3)
                        </button>
                    )}
                    {/* Status 3 -> 4 (Mark Ready) */}
                    {order.currentStatus === 3 && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleMarkReady(order.id); }}
                            style={{ ...kitchenActionButtonStyle, backgroundColor: '#ffc107' }}
                        >
                            Mark Ready (Status 4)
                        </button>
                    )}
                    {/* Status 4 -> 5 (DISPATCH) */}
                    {order.currentStatus === 4 && (
                         <button 
                            onClick={(e) => { e.stopPropagation(); handleDispatch(order.id); }}
                            style={{ ...kitchenActionButtonStyle, backgroundColor: '#28a745' }}
                        >
                            ➡️ Dispatch Order (Status 5)
                        </button>
                    )}
                    {/* Status 5 Indicator */}
                    {order.currentStatus === 5 && (
                        <span style={{...cancelBlockedStyle, flexGrow: 1, backgroundColor: '#800080', color: 'white'}}>
                            Dispatched by: {order.serverName || 'Server N/A'}
                        </span>
                    )}
                </div>

            </div>
        );
    };


    return (
        <div style={kitchenBoardContainerStyle}>
            <h2>🔪 Kitchen Order Board</h2>
            <p>Focus: Preparation and Dispatch.</p>
            
            <div style={kanbanContainerStyle}>
                
                {/* 1. CONFIRMED Column (Status 2) */}
                <div style={kanbanColumnStyle}>
                    <h3 style={{...kanbanHeaderStyle, borderBottom: '3px solid #007bff'}}>New Confirmed ({confirmedOrders.length})</h3>
                    {confirmedOrders.map(renderKitchenCard)}
                    {confirmedOrders.length === 0 && <p style={emptyColumnStyle}>No confirmed orders.</p>}
                </div>

                {/* 2. IN PREP Column (Status 3) */}
                <div style={kanbanColumnStyle}>
                    <h3 style={{...kanbanHeaderStyle, borderBottom: '3px solid #ffc107'}}>In Preparation ({prepOrders.length})</h3>
                    {prepOrders.map(renderKitchenCard)}
                    {prepOrders.length === 0 && <p style={emptyColumnStyle}>No orders in prep.</p>}
                </div>

                {/* 3. READY/DISPATCH Column (Status 4) */}
                <div style={kanbanColumnStyle}>
                    <h3 style={{...kanbanHeaderStyle, borderBottom: '3px solid #28a745'}}>Ready to Dispatch ({readyToDispatchOrders.length})</h3>
                    {readyToDispatchOrders.map(renderKitchenCard)}
                    {readyToDispatchOrders.length === 0 && <p style={emptyColumnStyle}>Nothing ready.</p>}
                </div>
                 
                {/* 4. DISPATCHED MONITORING Column (Status 5) */}
                <div style={kanbanColumnStyle}>
                    <h3 style={{...kanbanHeaderStyle, borderBottom: '3px solid #800080'}}>Dispatched Orders ({dispatchedOrders.length})</h3>
                    {dispatchedOrders.map(renderKitchenCard)}
                    {dispatchedOrders.length === 0 && <p style={emptyColumnStyle}>No active deliveries.</p>}
                </div>
            </div>
        </div>
    );
}

export default KitchenDashboard;

// --- STYLES ---
const kitchenBoardContainerStyle = { padding: '20px', fontFamily: 'sans-serif' };
const kanbanContainerStyle = { display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '15px' };
const kanbanColumnStyle = { flex: '1 1 300px', minWidth: '300px', backgroundColor: '#f0f0f0', padding: '10px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' };
const kanbanHeaderStyle = { paddingBottom: '5px', marginBottom: '10px' };
const kitchenOrderCardStyle = { padding: '10px', backgroundColor: 'white', border: '2px solid', borderRadius: '6px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer' };
const kitchenHeaderStyle = { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '5px' };
const kitchenDetailContainerStyle = { borderTop: '1px solid #eee', marginTop: '5px', paddingTop: '5px' };
const kitchenActionButtonStyle = { padding: '8px', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', flexGrow: 1 };
const emptyColumnStyle = { textAlign: 'center', color: '#6c757d', padding: '20px', border: '1px dashed #ced4da', borderRadius: '5px' };

const failureTextStyle = {
    color: '#dc3545', 
    fontWeight: 'bold', 
    backgroundColor: '#ffe6e6',
    border: '1px solid #dc3545',
    borderRadius: '4px'
}

const cancelBlockedStyle = {
    padding: '8px 15px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    border: '1px solid #f5c6cb',
    borderRadius: '4px',
    fontSize: '0.9em',
    alignSelf: 'center'
};