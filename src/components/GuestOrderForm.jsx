import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, addDoc, serverTimestamp, doc, onSnapshot } from 'firebase/firestore'; 
import { db } from '../config/firebase'; 
import CartItemEditor from './CartItemEditor'; 
import { logSystemEvent } from '../utils/logger'; 

function GuestOrderForm({ guestId, onOrderSuccess }) {
    
    // --- 1. DYNAMIC DATA STATE (Schema Integration) ---
    const [menuData, setMenuData] = useState({});
    const [categories, setCategories] = useState([]);
    const [flatCharge, setFlatCharge] = useState(30.00);
    const [currency, setCurrency] = useState('GH₵');
    const [menuLoading, setMenuLoading] = useState(true);

    // --- 2. RESTORED UI STATE (Exact Logic from your provided code) ---
    const [viewMode, setViewMode] = useState('landing');
    const [itemQuantities, setItemQuantities] = useState({});
    const [orderType, setOrderType] = useState('default'); 
    const [menuSearchTerm, setMenuSearchTerm] = useState(''); 
    const [selectedRoom, setSelectedRoom] = useState(''); 
    const [guestName, setGuestName] = useState(''); 
    const [roomSearchTerm, setRoomSearchTerm] = useState(''); 
    const [orderNotes, setOrderNotes] = useState(''); 
    const [whatsappNumber, setWhatsappNumber] = useState(''); 
    const [loading, setLoading] = useState(false);
    const [validationErrors, setValidationErrors] = useState({}); 

    const [specialOrders, setSpecialOrders] = useState([]);
    const [newSpecialItemName, setNewSpecialItemName] = useState('');
    const [newSpecialItemQty, setNewSpecialItemQty] = useState(1);
    
    const [isCustomOnlyMode, setIsCustomOnlyMode] = useState(false); 
    const [isMenuDetailsPhase, setIsMenuDetailsPhase] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [itemToEdit, setItemToEdit] = useState(null);

    const startTime = useRef(Date.now());
    const mockRooms = ['Aseda', 'Nkonim', 'Ahobrase', 'Pleasant', 'Delight', 'Benevolence', 'Beatitude', 'Beauty']; 

    // --- 3. DATABASE LISTENERS (Schema Connection) ---
    useEffect(() => {
        const unsubConfig = onSnapshot(doc(db, 'config', 'hotel_settings'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setFlatCharge(data.roomServiceCharge || 30.00);
                setCurrency(data.currency || 'GH₵');
            }
        });

        const unsubMenu = onSnapshot(collection(db, 'menu'), (snapshot) => {
            const categorized = {};
            const cats = new Set();
            
            snapshot.docs.forEach(docSnap => {
                const item = { id: docSnap.id, ...docSnap.data() };
                const cat = item.category || "OTHER";
                cats.add(cat);
                if (!categorized[cat]) categorized[cat] = [];
                categorized[cat].push(item);
            });

            setMenuData(categorized);
            const preferred = ["BREAKFAST", "LUNCH/DINNER", "SOUPS", "FRUITS & VEGETABLES", "DRINKS"];
            const sortedCats = Array.from(cats).sort((a, b) => preferred.indexOf(a) - preferred.indexOf(b));
            setCategories(sortedCats);
            
            if (menuLoading) {
                const loadTime = Date.now() - startTime.current;
                logSystemEvent("PERFORMANCE", "Guest Menu Sync Complete", { loadTimeMs: loadTime });
            }
            setMenuLoading(false);
        }, (error) => {
            logSystemEvent("ERROR", "Menu Subscription Failed", { error: error.message });
        });

        return () => { unsubConfig(); unsubMenu(); };
    }, []);

    // --- 4. DATA HELPERS ---
    const allItemsFlat = useMemo(() => Object.values(menuData).flat(), [menuData]);

    const filteredRooms = mockRooms.filter(room => 
        room.toLowerCase().includes(roomSearchTerm.toLowerCase())
    );

    // --- 5. UI HANDLERS (Preserved) ---
    const handleStartMenuOrder = () => { setViewMode('ordering'); setIsCustomOnlyMode(false); setIsMenuDetailsPhase(false); };
    const handleStartCustomOrder = () => { setViewMode('ordering'); setIsCustomOnlyMode(true); setIsMenuDetailsPhase(true); setItemQuantities({}); };
    const handleBackToLanding = () => { setViewMode('landing'); setIsCustomOnlyMode(false); setIsMenuDetailsPhase(false); };
    
    const handleContinueToDetails = () => {
        if (Object.keys(itemQuantities).length === 0 && specialOrders.length === 0) {
            alert("Please select at least one menu item or custom item before continuing.");
            return;
        }
        setIsMenuDetailsPhase(true);
    };

    const handleSelectItemForEdit = (item) => {
        if (item.isAvailable === false) return; 
        setItemToEdit({ ...item, quantity: itemQuantities[item.id] || 0 });
        setIsModalOpen(true);
    };
    
    const handleSaveItemFromModal = (updatedItem) => {
        setItemQuantities(prev => {
            const newState = { ...prev };
            if (updatedItem.quantity > 0) newState[updatedItem.id] = updatedItem.quantity;
            else delete newState[updatedItem.id];
            return newState;
        });
        setIsModalOpen(false);
    };

    const getSelectedItemsArray = () => {
        const selectedItems = [];
        const submissionTimestamp = Date.now();
        for (const itemId in itemQuantities) {
            const item = allItemsFlat.find(i => i.id === itemId);
            if (item) {
                selectedItems.push({
                    id: itemId, name: item.name, price: item.price, 
                    qty: itemQuantities[itemId], prepTime: item.prepTime, type: 'menu',
                    imageUrl: item.imageUrl || null 
                });
            }
        }
        specialOrders.forEach((item, index) => {
            selectedItems.push({
                id: `SP_${submissionTimestamp}_${index}`, 
                name: item.name, price: 0, qty: item.qty, prepTime: 'N/A', type: 'special'
            });
        });
        return selectedItems;
    };
    
    const getFinancialBreakdown = (selectedItems, currentOrderType) => {
        const subtotal = selectedItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const serviceCharge = (currentOrderType === 'Room Service') ? flatCharge : 0.00;
        return {
            subtotal, serviceCharge, grandTotal: subtotal + serviceCharge,
            totalItemsCount: selectedItems.reduce((sum, item) => sum + item.qty, 0)
        };
    };

    const handleAddSpecialItem = () => {
        if (newSpecialItemName.trim().length < 2) return;
        setSpecialOrders(prev => [...prev, { name: newSpecialItemName, qty: newSpecialItemQty }]);
        setNewSpecialItemName(''); setNewSpecialItemQty(1);
    };

    const handleRemoveSpecialItem = (index) => setSpecialOrders(prev => prev.filter((_, i) => i !== index));

    const handleClearForm = () => {
        if (!window.confirm("Clear form?")) return;
        setItemQuantities({}); setOrderNotes(''); setValidationErrors({});
        setSelectedRoom(''); setRoomSearchTerm(''); setGuestName(''); setWhatsappNumber(''); 
        setOrderType('default'); setSpecialOrders([]); setViewMode('landing'); 
    };

    const placeOrder = async () => {
        const itemsToOrder = getSelectedItemsArray();
        const breakdown = getFinancialBreakdown(itemsToOrder, orderType); 

        let errors = {};
        if (itemsToOrder.length === 0) errors.items = "🛑 Select items.";
        if (orderType === 'default') errors.service = "🛑 Select Service Type.";
        
        setValidationErrors(errors);
        if (Object.keys(errors).length > 0) return;
        
        setLoading(true);
       try {
            // 💰 Determine if the guest can pay now or must wait for the Front Desk
            // Logic: If there are special items (price 0) or the specialOrders list isn't empty
            const hasCustomItems = specialOrders.length > 0 || itemsToOrder.some(i => i.price === 0);
            const initialPaymentStatus = hasCustomItems ? 'pending_price' : 'unpaid';

            await addDoc(collection(db, "orders"), {
                guestId, 
                roomNumber: orderType === 'Room Service' ? selectedRoom : 'WALK-IN', 
                orderType, 
                orderTime: serverTimestamp(), 
                currentStatus: 1, 
                
                // ✅ NEW FIELDS FOR PAYMENT TRACKING
                paymentStatus: initialPaymentStatus,
                paidAt: null, 

                dispatchLocation: orderType === 'Room Service' ? selectedRoom : guestName, 
                items: itemsToOrder, 
                notes: orderNotes.trim(), 
                whatsappNumber: whatsappNumber.trim(), 
                financials: {
                    subtotal: parseFloat(breakdown.subtotal.toFixed(2)),
                    serviceCharge: parseFloat(breakdown.serviceCharge.toFixed(2)),
                    grandTotal: parseFloat(breakdown.grandTotal.toFixed(2)),
                    hasSpecialItems: specialOrders.length > 0 
                },
                statusHistory: [{ status: 1, statusName: "PENDING", timestamp: new Date(), updatedBy: "Guest App" }]
            });
            onOrderSuccess();
        } catch (e) {
            logSystemEvent("ERROR", "Submission Failure", { error: e.message });
            alert("Failed to place order.");
        } finally {
            setLoading(false);
        }
    };

    if (menuLoading) return <div style={containerStyle}>🔄 Synchronizing with Hotel Database...</div>;

    const currentOrderSummary = getSelectedItemsArray();
    const financialBreakdown = getFinancialBreakdown(currentOrderSummary, orderType); 
    const CATEGORY_COLORS = { "BREAKFAST": "#FFC107", "LUNCH/DINNER": "#007BFF", "SOUPS": "#28A745", "FRUITS & VEGETABLES": "#DC3545", "DRINKS": "#6C757D" };

    // --- 6. RENDER LOGIC ---
    if (viewMode === 'landing') {
        return (
            <div style={containerStyle}>
                <h2 style={{...headerStyleGuestForm, border: 'none'}}>👋 Welcome! How would you like to order?</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <button onClick={handleStartMenuOrder} style={landingButtonStyle}>🍔 Browse Full Menu</button>
                    <button onClick={handleStartCustomOrder} style={{...landingButtonStyle, backgroundColor: '#6f42c1'}}>✍️ Custom Order Only</button>
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                <button onClick={handleBackToLanding} style={backButtonStyle}>← Back</button>
                <button onClick={handleClearForm} style={clearButtonStyle}>Start Over</button>
            </div>
            
            {/* PHASE 1: MENU SELECTION */}
            {!isMenuDetailsPhase && !isCustomOnlyMode && (
                <>
                    <h2 style={{...headerStyleGuestForm, marginBottom: '10px'}}>🍽️ Menu Selection (Scroll ➡️)</h2>
                    <input type="text" placeholder="Search menu..." style={inputStyle} onChange={(e) => setMenuSearchTerm(e.target.value)} />
                    
                    <div style={horizontalScrollWrapperStyle}> 
                        {categories.map(category => (
                            <div key={category} style={horizontalCategoryColumnStyle}>
                                <h4 style={{...categoryHeaderStyle, borderBottom: `3px solid ${CATEGORY_COLORS[category] || '#333'}`}}>{category}</h4>
                                <div style={verticalScrollListStyle}> 
                                    {menuData[category]?.filter(i => i.name.toLowerCase().includes(menuSearchTerm.toLowerCase())).map(item => (
                                        <div key={item.id} style={{...itemCardStyle, opacity: item.isAvailable !== false ? 1 : 0.6}} onClick={() => handleSelectItemForEdit(item)}>
                                            <img src={item.imageUrl} alt={item.name} style={imageStyle} />
                                            <div style={itemDetailsContainerStyle}>
                                                <div style={itemTextGroupStyle}>
                                                    <strong style={itemNameStyle}>{item.name}</strong> 
                                                    <em style={itemPriceStyle}>{currency}{item.price.toFixed(2)}</em>
                                                    {item.isAvailable === false && <span style={{color: '#dc3545', fontSize: '0.7rem', fontWeight: 'bold', display: 'block'}}>SOLD OUT</span>}
                                                </div>
                                                {itemQuantities[item.id] > 0 && item.isAvailable !== false && (
                                                    <span style={{ backgroundColor: CATEGORY_COLORS[category] || '#007BFF', color: 'white', padding: '4px 8px', borderRadius: '15px', fontSize: '0.8rem' }}>Qty: {itemQuantities[item.id]}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <button onClick={handleContinueToDetails} style={continueButtonStyle}>Continue to Checkout ({currentOrderSummary.length} Items)</button>
                </>
            )}

            {/* PHASE 2: DETAILS & CHECKOUT */}
            {(isMenuDetailsPhase || isCustomOnlyMode) && (
                <div style={sectionStyleGuestForm}>
                    <h2 style={headerStyleGuestForm}>{isCustomOnlyMode ? '✍️ Custom Order' : '🛒 Order Details'}</h2>
                    
                    <label style={labelStyle}>Service Type:</label>
                    <select value={orderType} onChange={e => setOrderType(e.target.value)} style={selectStyle}>
                        <option value="default">Select...</option>
                        <option value="Room Service">Room Service</option>
                        <option value="Dining Hall">Dining Hall</option>
                    </select>

                    {orderType === 'Room Service' ? (
                        <div style={{padding: '10px', border: '1px dashed #ccc', marginBottom: '10px'}}>
                            <label style={labelStyle}>Room Name:</label>
                            <input type="text" placeholder="Search room..." style={inputStyle} onChange={(e) => setRoomSearchTerm(e.target.value)} />
                            <select value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)} style={selectStyle}>
                                <option value="">— Select Room —</option>
                                {filteredRooms.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    ) : (
                        <input type="text" placeholder="Your Name" style={inputStyle} onChange={(e) => setGuestName(e.target.value)} />
                    )}

                    <input type="tel" placeholder="WhatsApp Number" style={inputStyle} onChange={(e) => setWhatsappNumber(e.target.value)} />
                    <textarea placeholder="Notes..." rows="3" style={inputStyle} onChange={(e) => setOrderNotes(e.target.value)} />
                    
                    {/* RESTORED: LIST OF SELECTED ITEMS */}
                    <div style={{marginTop: '15px', padding: '10px', backgroundColor: '#fdfdfd', border: '1px solid #eee', borderRadius: '8px'}}>
                        <h4 style={{margin: '0 0 10px 0', borderBottom: '1px solid #eee', paddingBottom: '5px'}}>Selected Items:</h4>
                        {currentOrderSummary.map((item, idx) => (
                            <div key={idx} style={{display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.9rem'}}>
                                <span>{item.qty} x {item.name} {item.type === 'special' ? '(Custom)' : ''}</span>
                                <span>{item.price > 0 ? `${currency}${item.price.toFixed(2)}` : 'TBD'}</span>
                            </div>
                        ))}
                    </div>

                    <div style={specialOrderContainerStyle}>
                        <h4>⭐ Add More Custom Items</h4>
                        {specialOrders.map((item, index) => (
                            <div key={index} style={customItemListItemStyle}>
                                <span>{item.qty} x {item.name}</span>
                                <button onClick={() => handleRemoveSpecialItem(index)} style={removeCustomButtonStyle}>Remove</button>
                            </div>
                        ))}
                        <div style={specialOrderInputGroup}>
                            <input type="text" placeholder="Item Name" value={newSpecialItemName} onChange={(e) => setNewSpecialItemName(e.target.value)} style={inputStyle} />
                            <button onClick={handleAddSpecialItem} style={addSpecialButtonStyle}>+ Add</button>
                        </div>
                    </div>

                    <div style={grandTotalRowStyle}>Total Estimated: {currency}{financialBreakdown.grandTotal.toFixed(2)}</div>
                    <button onClick={placeOrder} disabled={loading} style={placeOrderButtonStyle}>{loading ? 'Submitting...' : 'Submit Order'}</button>
                </div>
            )}

            {isModalOpen && <CartItemEditor item={itemToEdit} onSave={handleSaveItemFromModal} onClose={() => setIsModalOpen(false)} currencySymbol={currency} />}
        </div>
    );
}

// --- ORIGINAL STYLES PRESERVED ---
const landingButtonStyle = { padding: '20px', fontSize: '1.2rem', fontWeight: 'bold', color: 'white', backgroundColor: '#007bff', border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' };
const continueButtonStyle = { padding: '15px 30px', backgroundColor: '#ff8c00', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 'bold', width: '100%', marginTop: '15px' };
const backButtonStyle = { padding: '8px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' };
const clearButtonStyle = { padding: '8px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' };
const containerStyle = { maxWidth: '1400px', width: '95%', margin: '20px auto', padding: '20px', fontFamily: 'sans-serif', backgroundColor: '#f8f9fa', borderRadius: '12px', boxSizing: 'border-box' };
const headerStyleGuestForm = { textAlign: 'center', color: '#007bff', borderBottom: '2px solid #e9ecef', paddingBottom: '10px', marginBottom: '20px' };
const sectionStyleGuestForm = { marginBottom: '8px', padding: '15px', border: '1px solid #dee2e6', borderRadius: '8px', backgroundColor: '#ffffff' }; 
const labelStyle = { fontWeight: '600', display: 'block', marginBottom: '3px' }; 
const selectStyle = { padding: '10px', width: '100%', marginBottom: '10px', borderRadius: '5px', border: '1px solid #ced4da' };
const inputStyle = { padding: '10px', borderRadius: '5px', border: '1px solid #ced4da', boxSizing: 'border-box', width: '100%', marginBottom: '10px' };
const horizontalScrollWrapperStyle = { display: 'flex', overflowX: 'auto', padding: '0 0 10px 0', gap: '15px' };
const horizontalCategoryColumnStyle = { flex: '0 0 auto', width: '350px', padding: '10px', backgroundColor: '#fff', borderRadius: '8px', borderTop: '1px solid #e9ecef' };
const verticalScrollListStyle = { maxHeight: '70vh', overflowY: 'auto' };
const categoryHeaderStyle = { textAlign: 'left', marginBottom: '5px', fontSize: '1.3rem' };
const itemCardStyle = { display: 'flex', alignItems: 'center', padding: '10px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e9ecef', marginBottom: '5px', cursor: 'pointer' };
const imageStyle = { width: '55px', height: '55px', borderRadius: '6px', marginRight: '10px' };
const itemDetailsContainerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexGrow: 1 };
const itemTextGroupStyle = { flexGrow: 1 };
const itemNameStyle = { fontSize: '0.95rem' };
const itemPriceStyle = { fontSize: '0.85rem', fontWeight: '600', color: '#007bff', display: 'block' };
const grandTotalRowStyle = { marginTop: '10px', padding: '10px', borderTop: '2px solid #333', fontSize: '1.2rem', fontWeight: 'bold', textAlign: 'right' };
const placeOrderButtonStyle = { padding: '15px', width: '100%', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '25px', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' };
const specialOrderContainerStyle = { padding: '15px', backgroundColor: '#e9f7ff', borderRadius: '8px', marginTop: '10px' };
const specialOrderInputGroup = { display: 'flex', gap: '10px', marginTop: '10px' };
const customItemListItemStyle = { display: 'flex', justifyContent: 'space-between', padding: '5px 0' };
const removeCustomButtonStyle = { backgroundColor: 'transparent', border: '1px solid #dc3545', color: '#dc3545', cursor: 'pointer' };
const addSpecialButtonStyle = { padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px' };

export default GuestOrderForm;