// src/components/FrontDeskDashboard.jsx

import React, { useState } from 'react'; 
import { useRealTimeOrders } from '../hooks/useRealTimeOrders'; 
// Only importing what is absolutely necessary for PENDING and HISTORY management
import { confirmOrder, updateOrderStatus, deleteOrderPermanently, cancelOrder, updateCustomItemPrices } from '../utils/orderActions'; 
import { getStatusDetails } from '../utils/statusMapping'; 

// --- STATUS CONSTANTS FOR FRONT DESK VIEW ---
const ACTIVE_MONITORING_STATUSES = [1, 2, 4, 5, 6]; 
const HISTORY_STATUSES = [0, 7, 8];

// Mock user ID (replace with actual auth context in a full app)
const CURRENT_FRONT_DESK_ID = "FD_User_A"; 
const CURRENCY_SYMBOL = 'GH₵'; 

// --- Helper function for clear, consistent date formatting ---
const formatTime = (timestampOrDate) => {
    if (!timestampOrDate) return 'N/A';
    let date;
    if (timestampOrDate.toDate) {
        date = timestampOrDate.toDate(); 
    } else {
        date = timestampOrDate; 
    }
    return date.toLocaleString('en-US', { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true 
    });
};

// --- Helper to render the full itemized list and financial summary ---
const renderFinancialsCard = (order, isPriceEditable, customItemPrices, setCustomItemPrices) => {
    const financials = order.financials || {};
    
    if (!order.items || order.items.length === 0) {
        return <p style={failureTextStyle}>⚠️ Item list is missing or empty in the order payload.</p>;
    }
    
    if (financials.grandTotal === undefined || financials.grandTotal === null) {
        return <p style={failureTextStyle}>⚠️ Financial totals (Grand Total) are missing in the order payload.</p>;
    }


    const handlePriceInputChange = (itemId, value) => {
        setCustomItemPrices(prev => ({ ...prev, [itemId]: value }));
    };
    
    return (
        <div style={financialCardStyle}>
            <h4 style={{ fontWeight: 'bold', marginBottom: '10px' }}>Itemized Breakdown:</h4>
            
            <ul style={itemizedListStyle}>
                {order.items.map((item, index) => {
                    const key = item.id || index;
                    const isCustom = item.type === 'special';
                    const tempPriceString = customItemPrices[item.id];
                    const savedPrice = item.price || 0; 
                    
                    const calculatedPrice = (tempPriceString !== undefined && tempPriceString !== "")
                                            ? parseFloat(tempPriceString) || 0
                                            : savedPrice;
                    
                    const inputValue = tempPriceString !== undefined 
                                       ? tempPriceString 
                                       : savedPrice.toFixed(2);
                    
                    return (
                        <li key={key} style={itemizedListItemStyle}>
                            <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                                <span>{item.qty}x **{item.name}** {isCustom && <strong style={{ color: '#800080' }}>(CUSTOM)</strong>}</span>
                                {isCustom && (savedPrice === 0) && (
                                    <span style={{ fontSize: '0.8em', color: '#dc3545' }}>
                                        Price TBD
                                    </span>
                                )}
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                
                                {isPriceEditable && isCustom ? (
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <span style={{ marginRight: '3px' }}>{CURRENCY_SYMBOL}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={inputValue} 
                                            onChange={(e) => handlePriceInputChange(item.id, e.target.value)}
                                            style={customPriceInputStyle}
                                            placeholder="0.00"
                                        />
                                        <span style={{ marginLeft: '5px' }}>x {item.qty}</span>
                                        <span style={{ fontWeight: 'bold', marginLeft: '10px', width: '60px', textAlign: 'right' }}>
                                            = {CURRENCY_SYMBOL}{(calculatedPrice * item.qty).toFixed(2)}
                                        </span>
                                    </div>
                                ) : (
                                    <span>{CURRENCY_SYMBOL}{(savedPrice * item.qty).toFixed(2)}</span>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>

            <div style={breakdownContainerStyle}>
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
                    <strong>GRAND TOTAL DUE:</strong>
                    <strong>{CURRENCY_SYMBOL}{financials.grandTotal.toFixed(2)}</strong>
                </div>
                {order.financials?.hasSpecialItems && order.currentStatus === 1 && (
                    <p style={{ color: '#ffc107', fontSize: '0.8em', fontWeight: 'bold', marginTop: '5px' }}>
                        *Pricing required for custom item(s).*
                    </p>
                )}
            </div>
        </div>
    );
};


function FrontDeskDashboard() {
    
    // 1. Fetch ACTIVE Orders - Use the defined status array
    const { orders: activeOrdersData, loading: activeLoading } = useRealTimeOrders(null, ACTIVE_MONITORING_STATUSES);
    
    // 2. Fetch HISTORY Orders - Use the defined history status array
    const { orders: historyOrdersData, loading: historyLoading } = useRealTimeOrders(null, HISTORY_STATUSES);
    
    const [expandedHistoryId, setExpandedHistoryId] = useState(null); 
    const [customItemPrices, setCustomItemPrices] = useState({}); 

    
    const toggleHistoryDetails = (orderId) => {
        setExpandedHistoryId(prevId => (prevId === orderId ? null : orderId)); 
    };

    const allActiveOrders = activeOrdersData;
    const allHistoryOrders = historyOrdersData;

    const pendingOrders = allActiveOrders.filter(order => order.currentStatus === 1); 
    
    const completedHistory = allHistoryOrders.filter(order => order.currentStatus === 0 || order.currentStatus === 7 || order.currentStatus === 8);


    const handleConfirm = async (orderId) => {
        const order = allActiveOrders.find(o => o.id === orderId); 
        
        if (!order) {
             alert("Order not found in active list. Please refresh.");
             return;
        }

        if (window.confirm(`Are you sure you want to verify and accept order ${orderId}?`)) {
            try {
                // Status 1 -> 2 (CONFIRMED)
                await confirmOrder(orderId, CURRENT_FRONT_DESK_ID);
                alert(`Order ${orderId} is now CONFIRMED and sent to the kitchen.`);
                
                setExpandedHistoryId(null); 
                
            } catch (e) {
                console.error("Confirmation Error:", e);
                alert(`Failed to confirm order: ${e.message}`);
            }
        }
    };
    
    // 🛑 HANDLERS REMOVED: handleMarkDispatched, handleConfirmDelivery, handleMarkCompleted 
    // These are now handled by KitchenDashboard or FrontDeskArchival

    // --- handlePriceUpdate (UNCHANGED) ---
    const handlePriceUpdate = async (order) => {
        const customItems = order.items?.filter(item => item.type === 'special') || [];
        
        const itemsWithNoPrice = customItems.filter(item => {
            const rawPrice = customItemPrices[item.id];
            const price = (rawPrice !== undefined && rawPrice !== "") ? parseFloat(rawPrice) : item.price;
            return price <= 0 || isNaN(price);
        });

        if (itemsWithNoPrice.length > 0) {
            alert("🛑 All custom items must be priced above GH₵ 0.00 and be valid numbers before saving.");
            return;
        }

        if (!window.confirm("Confirm saving new prices for custom items?")) {
            return;
        }

        const finalItems = order.items.map(item => {
            if (item.type === 'special') {
                const rawPrice = customItemPrices[item.id];
                const newPrice = (rawPrice !== undefined && rawPrice !== "") ? parseFloat(rawPrice) : item.price;
                
                return {
                    ...item,
                    price: newPrice
                };
            }
            return item;
        });

        try {
            await updateCustomItemPrices(order.id, finalItems, order.orderType, CURRENT_FRONT_DESK_ID);
            alert(`Prices updated successfully!`);
            
            setCustomItemPrices(prev => {
                const newState = { ...prev };
                order.items?.forEach(item => delete newState[item.id]);
                return newState;
            });

        } catch (e) {
            alert(`Failed to update prices: ${e.message}`);
        }
    };

    // --- History Handlers (UNCHANGED) ---
    const handleFrontDeskCancel = async (orderId) => {
        const orderStatus = allActiveOrders.find(o => o.id === orderId)?.currentStatus;
        
        if (orderStatus >= 3) { 
            alert("🛑 Cannot cancel: Order is already being prepared or dispatched.");
            return;
        }

        const reason = window.prompt(`Enter reason for cancelling Order ${orderId}:`);
        
        if (reason) {
            if (window.confirm(`Confirm cancellation of Order ${orderId}? This cannot be undone.`)) {
                try {
                    await cancelOrder(orderId, `FrontDesk:${CURRENT_FRONT_DESK_ID}`, `Cancelled by FD due to: ${reason}`);
                    alert(`Order ${orderId} has been successfully CANCELLED.`);
                    setExpandedHistoryId(null); 
                } catch (e) {
                    alert(`Failed to cancel order: ${e.message}`);
                }
            }
        }
    };
    
    const handleClearHistory = async () => {
        const ordersToClear = completedHistory.filter(order => order.currentStatus === 7);
        if (ordersToClear.length === 0) {
            alert("No orders currently marked as COMPLETED (Status 7) to archive/clear.");
            return;
        }
        if (!window.confirm(`Are you sure you want to ARCHIVE ${ordersToClear.length} completed orders? (They will still be visible to Account/Manager)`)) {
            return;
        }

        const clearPromises = ordersToClear.map(order => 
            // Status 7 -> 8 (ARCHIVED)
            updateOrderStatus(order.id, 8, `Front Desk: ${CURRENT_FRONT_DESK_ID}`, "Order cleared from history list.")
        );
        try {
            await Promise.all(clearPromises);
            alert(`${ordersToClear.length} orders successfully ARCHIVED (Status 8).`);
            setExpandedHistoryId(null); 
        } catch (e) {
            alert(`Failed to archive history: ${e.message}`);
        }
    };
    
    const handlePermanentDelete = async (orderId) => {
        if (!window.confirm(`⚠️ WARNING: Are you ABSOLUTELY sure you want to permanently DELETE Order ${orderId}? This cannot be recovered.`)) {
            return;
        }
        try {
            await deleteOrderPermanently(orderId);
            alert(`Order ${orderId} has been permanently removed.`);
            setExpandedHistoryId(null); 
        } catch (e) {
            alert(`Failed to delete order: ${e.message}`);
        }
    };
    
    const handlePermanentDeleteAllArchived = async () => {
        const archivedOrders = completedHistory.filter(order => order.currentStatus === 8);
        
        if (archivedOrders.length === 0) {
            alert("No orders are currently archived (Status 8) to delete.");
            return;
        }

        if (!window.confirm(`⚠️ WARNING: Are you ABSOLUTELY sure you want to permanently DELETE ALL ${archivedOrders.length} archived orders? This cannot be recovered.`)) {
            return;
        }

        const deletePromises = archivedOrders.map(order => 
            deleteOrderPermanently(order.id)
        );

        try {
            await Promise.all(deletePromises);
            alert(`✅ ${archivedOrders.length} archived orders have been permanently cleared.`);
            setExpandedHistoryId(null); 
        } catch (e) {
            alert(`Failed to delete archived orders: ${e.message}`);
        }
    };


    const renderOrderCard = (order) => {
        const confirmedEntry = order.statusHistory?.find(entry => entry.status === 2);
        const confirmationTime = confirmedEntry ? formatTime(confirmedEntry.timestamp) : 'Awaiting Confirmation...';
        const statusDetails = getStatusDetails(order.currentStatus);

        const isPriceEditable = order.currentStatus === 1; // Only editable when PENDING
        const hasCustomItems = order.items?.some(item => item.type === 'special');

        const canCancel = order.currentStatus <= 2;
        // Block confirm if custom items exist AND their price is still 0 
        const canConfirm = order.currentStatus === 1 && !order.financials?.hasSpecialItems; 

        // FIX: Use dispatchLocation (Guest Name for walk-in) or roomNumber for display
        const displayLocation = order.orderType === 'Dining Hall' ? order.dispatchLocation : order.roomNumber;

        // Action Buttons: Dispatch/Complete
        // THESE STATUSES ARE ONLY FOR DISPLAY, ACTIONS ARE REMOVED
        const isReadyForDispatch = order.currentStatus === 4; 
        const isDispatched = order.currentStatus === 5;
        const isDelivered = order.currentStatus === 6;


        return (
            <div key={order.id} style={{ ...orderCardStyle, backgroundColor: statusDetails.color + '30' }}>
                
                <h4>
                    Order ID: {order.id} | Service: <strong>{order.orderType}</strong> | 
                    Status: <strong style={{color: statusDetails.color}}>{statusDetails.name}</strong> 
                </h4>
                <p>Location: <strong>{displayLocation || order.roomNumber}</strong></p> 
                <p style={{fontSize: '0.9em'}}>WhatsApp: <strong>{order.whatsappNumber || 'N/A'}</strong></p>
                
                <hr style={{ margin: '8px 0'}} />
                
                {order.notes && (
                    <div style={notesContainerStyle}>
                        <strong>Special Request/Allergies:</strong> 
                        <p style={{ margin: '5px 0 0 0', fontStyle: 'italic' }}>{order.notes}</p>
                    </div>
                )}
                
                {/* 🎨 Render Financials Card (passing edit permissions and state) */}
                {renderFinancialsCard(order, isPriceEditable, customItemPrices, setCustomItemPrices)}

                <hr style={{ margin: '8px 0'}} />

                <p>Order Placed: <strong>{formatTime(order.orderTime)}</strong></p>
                <p style={{ marginBottom: '10px' }}>Confirmed At: <strong>{confirmationTime}</strong></p>

                {order.serverName && (<p style={{ fontSize: '0.9em' }}>Server: {order.serverName}</p>)}
                
                {/* Action Buttons for Front Desk */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                    
                    {/* Price Update Button (Shows when custom items are pending pricing) */}
                    {isPriceEditable && hasCustomItems && (
                        <button 
                            onClick={() => handlePriceUpdate(order)} 
                            style={priceUpdateButton}
                        >
                            💰 Save Custom Prices
                        </button>
                    )}

                    {/* Confirm Button (Status 1) */}
                    {order.currentStatus === 1 && canConfirm && (
                        <button 
                            onClick={() => handleConfirm(order.id)} 
                            style={confirmButtonStyle}
                        >
                            Verify and Accept (Status 2)
                        </button>
                    )}
                    
                    {/* Display message if Prep has started, Dispatch, or Delivery is confirmed */}
                    {order.currentStatus >= 3 && order.currentStatus <= 6 && (
                        <span style={cancelBlockedStyle}>
                           Order Status: {statusDetails.name} - See Front Desk Final Actions for next step.
                        </span>
                    )}

                    {/* Warn message if confirmation is blocked by pricing */}
                    {order.currentStatus === 1 && !canConfirm && hasCustomItems && (
                        <span style={cancelBlockedStyle}>Set Price to Confirm!</span>
                    )}

                    {/* Front Desk Cancel Button (Status 1 or 2) */}
                    {canCancel && (
                        <button 
                            onClick={() => handleFrontDeskCancel(order.id)} 
                            style={cancelFrontDeskButtonStyle}
                        >
                            ❌ Cancel Order
                        </button>
                    )}
                </div>
            </div>
        );
    };

    if (activeLoading || historyLoading) {
        return <div>Loading Front Desk Orders...</div>;
    }

    // 🛑 FIX: This is the ONLY declaration for frontDeskMonitoredNoPrep.
    // Filter Active Monitoring to exclude Status 3 (IN_PREP) and only show Confirmed (2)
    const frontDeskMonitoredNoPrep = allActiveOrders.filter(order => order.currentStatus === 2);


    // --- FRONT DESK RENDERING ---
    return (
        <div style={{ padding: '20px', border: '1px solid #ccc' }}>
            
            {/* 1. PENDING Orders Section */}
            <h2>🛎️ New PENDING Orders ({pendingOrders.length})</h2>
            <p>Action: Price custom items (if any), verify, accept, or cancel.</p>
            {pendingOrders.length === 0 ? (<p>No new orders pending confirmation.</p>) : (
                pendingOrders.map(order => (
                    <div key={order.id}> 
                        {renderOrderCard(order)}
                    </div>
                ))
            )}
            
            <hr/>

            {/* 2. Active Monitoring Section (Confirmed Only) */}
            <h2>👀 Confirmed Orders Awaiting Kitchen ({frontDeskMonitoredNoPrep.length})</h2>
            <p>Monitors confirmed orders (Status 2) before they enter preparation (Status 3).</p>
            {frontDeskMonitoredNoPrep.length === 0 ? (<p>No confirmed orders currently being monitored.</p>) : (frontDeskMonitoredNoPrep.map(renderOrderCard))}
            
            <hr/>
            
            {/* 3. Completed Staff History Section (Status 0, 7, 8) */}
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap'}}>
                <h2>📦 History Log ({completedHistory.length})</h2>
                <div>
                    {/* Button to archive Status 7 orders */}
                    {completedHistory.filter(order => order.currentStatus === 7).length > 0 && (
                        <button onClick={handleClearHistory} style={clearHistoryButtonStyle}>
                            Archive Completed ({completedHistory.filter(order => order.currentStatus === 7).length})
                        </button>
                    )}
                    
                    {/* Button to delete ALL Status 8 orders */}
                    {completedHistory.filter(order => order.currentStatus === 8).length > 0 && (
                        <button onClick={handlePermanentDeleteAllArchived} style={{...deleteButtonStyle, marginLeft: '10px'}}>
                            Clear All Archived ({completedHistory.filter(order => order.currentStatus === 8).length})
                        </button>
                    )}
                </div>
            </div>
            
            <p>Records of completed (Status 7), cleared (Status 8), and cancelled (Status 0) orders.</p>

            {completedHistory.length === 0 ? (
                <p style={{color: '#6c757d'}}>No orders in history log.</p>
            ) : (
                completedHistory.map(order => {
                    const isExpanded = expandedHistoryId === order.id;
                    const isCleared = order.currentStatus === 8;
                    const isCancelled = order.currentStatus === 0;
                    const headerColor = isCleared ? '#778899' : (isCancelled ? '#E74C3C' : '#008000');
                    const displayLocation = order.orderType === 'Dining Hall' ? order.dispatchLocation : order.roomNumber;


                    return (
                        <div 
                            key={order.id} 
                            style={{ ...historyCardStyle, cursor: 'pointer', opacity: isCleared ? 0.6 : 1 }}
                            onClick={() => toggleHistoryDetails(order.id)} 
                        >
                            <div style={historyHeaderStyle}>
                                <span style={{ fontWeight: 'bold' }}>Order #{order.id} ({displayLocation})</span>
                                <span style={{ fontWeight: 'bold', color: headerColor }}>
                                    {isCancelled ? 'CANCELLED' : (isCleared ? 'ARCHIVED' : `TOTAL: ${CURRENCY_SYMBOL}${order.financials?.grandTotal.toFixed(2)}`)}
                                </span>
                                <span>{isExpanded ? '▲ Hide Details' : '▼ Show Details'}</span>
                            </div>

                            {/* Detailed Breakdown (Only rendered when expanded) */}
                            {isExpanded && (
                                <div style={historyDetailStyle} onClick={(e) => e.stopPropagation()}> 
                                    <hr/>
                                    {order.notes && (
                                        <div style={notesContainerStyle}>
                                            <strong>Special Request/Allergies:</strong> 
                                            <p style={{ margin: '5px 0 0 0', fontStyle: 'italic' }}>{order.notes}</p>
                                        </div>
                                    )}
                                    {/* History view uses the non-editable financial card */}
                                    {renderFinancialsCard(order, false, {}, () => {})} 
                                    <p style={{fontSize: '0.8em', marginTop: '10px'}}>
                                        Status Time: {formatTime(order.archivalDate || order.orderTime)} | Server: {order.serverName || 'N/A'}
                                    </p>
                                    <p style={{fontSize: '0.8em'}}>
                                        Order Placed: {formatTime(order.orderTime)}
                                    </p>
                                    
                                    {/* Permanent Deletion Button for Canceled and Cleared */}
                                    {(isCleared || isCancelled) && (
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation(); 
                                                handlePermanentDelete(order.id);
                                            }}
                                            style={deleteButtonStyle}
                                        >
                                            🗑️ Delete Permanently ({isCancelled ? 'Status 0' : 'Status 8'})
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}

// --- STYLES (UNCHANGED) ---
const priceUpdateButton = {
    padding: '8px 15px',
    backgroundColor: '#ffc107', 
    color: '#343a40',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    flexGrow: 1
};
const customPriceInputStyle = {
    width: '60px',
    padding: '4px',
    marginLeft: '5px',
    textAlign: 'right',
    border: '1px solid #ced4da',
    borderRadius: '3px'
};

const failureTextStyle = {
    color: '#dc3545', 
    fontWeight: 'bold', 
    marginTop: '10px', 
    marginBottom: '10px',
    padding: '10px',
    backgroundColor: '#ffe6e6',
    border: '1px solid #dc3545',
    borderRadius: '4px'
}

const orderCardStyle = {
    margin: '10px 0',
    padding: '15px',
    border: '1px solid #ddd',
    borderRadius: '5px',
};

const confirmButtonStyle = {
    padding: '8px 15px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
};

const cancelFrontDeskButtonStyle = {
    padding: '8px 15px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    flexGrow: 1
};

const cancelBlockedStyle = {
    padding: '8px 15px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    border: '1px solid #f5c6cb',
    borderRadius: '4px',
    fontSize: '0.9em',
    alignSelf: 'center'
};

const financialCardStyle = {
    marginBottom: '10px',
    padding: '5px',
    backgroundColor: '#fff',
    borderRadius: '4px'
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

const breakdownContainerStyle = {
    marginTop: '5px',
    paddingTop: '5px',
    fontSize: '0.95rem'
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

const historyCardStyle = {
    margin: '10px 0',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    backgroundColor: '#f9f9f9',
};

const historyHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '5px 0'
};

const historyDetailStyle = {
    paddingTop: '10px'
};

const clearHistoryButtonStyle = {
    padding: '8px 15px',
    backgroundColor: '#DC3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold'
};

const deleteButtonStyle = {
    padding: '8px 15px',
    backgroundColor: '#8B0000', 
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    marginTop: '10px',
};

const notesContainerStyle = {
    padding: '10px',
    backgroundColor: '#fff3cd', 
    border: '1px solid #ffeeba',
    borderRadius: '4px',
    marginBottom: '10px'
};


export default FrontDeskDashboard;