// src/components/GuestOrderForm.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, serverTimestamp, doc, onSnapshot } from 'firebase/firestore'; 
import { db } from '../config/firebase'; 
// --- NEW IMPORT ---
import CartItemEditor from './CartItemEditor'; 

// --- Constants ---
const ROOM_SERVICE_FLAT_CHARGE = 30.00; 
const CURRENCY_SYMBOL = 'GH₵';


const fullMenu = {
    // Retaining image seeds for visual appeal
    "BREAKFAST": [
        { id: 'B01', name: 'Plain Omelette', price: 10.91, prepTime: '10 mins', imageUrl: 'https://picsum.photos/seed/plainomelette/60/60' },
        { id: 'B02', name: 'Cheese Omelette', price: 10.91, prepTime: '12 mins', imageUrl: 'https://picsum.photos/seed/cheeseomelette/60/60' },
        { id: 'B03', name: 'Omelette with Hot Dogs', price: 10.91, prepTime: '12 mins', imageUrl: 'https://picsum.photos/seed/hotdog/60/60' },
        { id: 'B04', name: 'Omelette with Vegetables', price: 10.91, prepTime: '12 mins', imageUrl: 'https://picsum.photos/seed/mixedveggies/60/60' },
        { id: 'B05', name: 'Spanish Omelette', price: 12.28, prepTime: '15 mins', imageUrl: 'https://picsum.photos/seed/spanishdish/60/60' },
        { id: 'B06', name: 'Plain Pizza', price: 10.91, prepTime: '18 mins', imageUrl: 'https://picsum.photos/seed/plainpizza/60/60' },
        { id: 'B07', name: 'Pizza with Vegetables', price: 10.91, prepTime: '20 mins', imageUrl: 'https://picsum.photos/seed/veggiepizza/60/60' },
        { id: 'B08', name: 'Pizza with Hot Dogs', price: 19.09, prepTime: '25 mins', imageUrl: 'https://picsum.photos/seed/pizzahotdogs/60/60' },
        { id: 'B09', name: 'Hot Dogs Only', price: 10.91, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/hotdogs/60/60' }
    ],
    "LUNCH/DINNER": [
        { id: 'LD01', name: 'Plain Pasta', price: 29.70, prepTime: '15 mins', imageUrl: 'https://picsum.photos/seed/pasta/60/60' },
        { id: 'LD02', name: 'Pasta with Hot Dogs', price: 32.73, prepTime: '18 mins', imageUrl: 'https://picsum.photos/seed/pastahotdogs/60/60' },
        { id: 'LD03', name: 'Pasta with Tuna/Sardines/Corned Beef', price: 40.92, prepTime: '20 mins', imageUrl: 'https://picsum.photos/seed/tuna/60/60' },
        { id: 'LD04', name: 'Pasta with Chicken', price: 32.73, prepTime: '18 mins', imageUrl: 'https://picsum.photos/seed/chickenpasta/60/60' },
        { id: 'LD05', name: 'Pasta with Vegetables', price: 30.01, prepTime: '17 mins', imageUrl: 'https://picsum.photos/seed/pastawithveggies/60/60' },
        { id: 'LD06', name: 'Pasta with Fried Rice', price: 35.46, prepTime: '25 mins', imageUrl: 'https://picsum.photos/seed/friedricepasta/60/60' },
        { id: 'LD07', name: 'Pasta with Shrimps', price: 32.73, prepTime: '20 mins', imageUrl: 'https://picsum.photos/seed/shrimp/60/60' },
        { id: 'LD08', name: 'Pasta with Cheese', price: 35.46, prepTime: '18 mins', imageUrl: 'https://picsum.photos/seed/cheese/60/60' },
        { id: 'LD09', name: 'Pasta with Sausages', price: 30.01, prepTime: '17 mins', imageUrl: 'https://picsum.photos/seed/sausagepasta/60/60' },
        { id: 'LD10', name: 'Pasta with Fried Chicken', price: 35.46, prepTime: '22 mins', imageUrl: 'https://picsum.photos/seed/friedchicken/60/60' },
        { id: 'LD11', name: 'Pasta with Fish', price: 32.73, prepTime: '20 mins', imageUrl: 'https://picsum.photos/seed/fishmeal/60/60' },
        { id: 'LD12', name: 'Pasta with Grilled Chicken', price: 35.46, prepTime: '25 mins', imageUrl: 'https://picsum.photos/seed/grilledchicken/60/60' },
        { id: 'LD13', name: 'Pasta with Fruits', price: 30.01, prepTime: '15 mins', imageUrl: 'https://picsum.photos/seed/pastafruits/60/60' },
        { id: 'LD14', name: 'Pasta with Pizza', price: 49.10, prepTime: '30 mins' },
        { id: 'LD15', name: 'Pasta with Plain Rice', price: 38.19, prepTime: '20 mins' },
        { id: 'LD16', name: 'Plain Rice', price: 16.37, prepTime: '10 mins', imageUrl: 'https://picsum.photos/seed/plainrice/60/60' },
        { id: 'LD17', name: 'Fried Rice', price: 35.46, prepTime: '20 mins', imageUrl: 'https://picsum.photos/seed/friedrice/60/60' },
        { id: 'LD18', name: 'Rice with Vegetables', price: 32.73, prepTime: '18 mins', imageUrl: 'https://picsum.photos/seed/riceveggie/60/60' },
        { id: 'LD19', name: 'Rice with Chicken', price: 38.19, prepTime: '22 mins', imageUrl: 'https://picsum.photos/seed/chickenrice/60/60' },
        { id: 'LD20', name: 'Green Salad', price: 15.00, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/greensalad/60/60' },
        { id: 'LD21', name: 'Salad with Chicken', price: 35.46, prepTime: '15 mins', imageUrl: 'https://picsum.photos/seed/chickensalad/60/60' },
        { id: 'LD22', name: 'Salad with Tuna', price: 32.73, prepTime: '12 mins', imageUrl: 'https://picsum.photos/seed/tunasalad/60/60' },
        { id: 'LD23', name: 'Salad with Fruits', price: 38.19, prepTime: '10 mins', imageUrl: 'https://picsum.photos/seed/fruitsalad/60/60' }
    ],
    "SOUPS": [
        { id: 'S01', name: 'Chicken Noodle Soup', price: 21.82, prepTime: '15 mins', imageUrl: 'https://picsum.photos/seed/chickensoup/60/60' },
        { id: 'S02', name: 'Buffet Soup', price: 68.19, prepTime: '20 mins', imageUrl: 'https://picsum.photos/seed/buffetsoup/60/60' }
    ],
    "FRUITS & VEGETABLES": [
        { id: 'FV01', name: 'Vegetables Only', price: 16.37, prepTime: '10 mins', imageUrl: 'https://picsum.photos/seed/steamedveggies/60/60' },
        { id: 'FV02', name: 'Fruits Only', price: 15.00, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/freshfruit/60/60' }
    ],
    "DRINKS": [
        { id: 'D01', name: 'coke', price: 10.00, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/cokecan/60/60' },
        { id: 'D02', name: 'Beta Malt', price: 15.00, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/betamalt/60/60' },
        { id: 'D03', name: 'Fanta', price: 10.00, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/fanta/60/60' },
        { id: 'D04', name: 'Alvaro', price: 12.00, prepTime: '5 mins', imageUrl: 'https://picsum.photos/seed/alvaro/60/60' }
    ]
};

const mockRooms = ['Aseda', 'Nkonim', 'Ahobrase', 'Pleasant', 'Delight', 'Benevolence', 'Beatitude', 'Beauty']; 
const CATEGORIES = ["BREAKFAST", "LUNCH/DINNER", "SOUPS", "FRUITS & VEGETABLES","DRINKS"];
const ALL_MENU_ITEMS = Object.values(fullMenu).flat();

// Map categories to distinct colors for visual appeal
const CATEGORY_COLORS = {
    "BREAKFAST": "#FFC107", 
    "LUNCH/DINNER": "#007BFF", 
    "SOUPS": "#28A745", 
    "FRUITS & VEGETABLES": "#DC3545",
    "DRINKS": "#6C757D"
};

// --- HOOK: Fetch Menu Item Availability ---
const useMenuAvailability = () => {
    // availability map: { 'B01': true, 'LD04': false, ... }
    const [availabilityMap, setAvailabilityMap] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Document path: config/menuAvailability
        const docRef = doc(db, 'config', 'menuAvailability');
        
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                setAvailabilityMap(docSnap.data());
            } else {
                // If config document is missing, assume all items are available (true)
                const defaultMap = ALL_MENU_ITEMS.reduce((acc, item) => {
                    acc[item.id] = true; 
                    return acc;
                }, {});
                setAvailabilityMap(defaultMap);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching menu availability:", error);
            // Default to fully available on error to prevent blocking guest orders
            setAvailabilityMap(ALL_MENU_ITEMS.reduce((acc, item) => {
                acc[item.id] = true; 
                return acc;
            }, {}));
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { availabilityMap, loading };
};


function GuestOrderForm({ guestId, onOrderSuccess }) {
    
    // --- READ Availability Status ---
    const { availabilityMap, loading: availabilityLoading } = useMenuAvailability();
    
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

    // --- NEW STATE FOR MODAL ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [itemToEdit, setItemToEdit] = useState(null);
    // ---------------------------

    const filteredRooms = mockRooms.filter(room => 
        room.toLowerCase().includes(roomSearchTerm.toLowerCase())
    );

    // --- VIEW HANDLERS ---
    const handleStartMenuOrder = () => {
        setIsCustomOnlyMode(false);
        setIsMenuDetailsPhase(false); // START at menu selection phase
        setViewMode('ordering');
    };

    const handleStartCustomOrder = () => {
        setIsCustomOnlyMode(true);
        setIsMenuDetailsPhase(true); // START immediately at details phase since no menu selection is needed
        setItemQuantities({}); // Clear menu items if the user switches to custom-only
        setViewMode('ordering');
    };

    const handleBackToLanding = () => {
        setViewMode('landing');
        setIsCustomOnlyMode(false);
        setIsMenuDetailsPhase(false);
    };
    
    // Handler for continuing from Menu Selection to Location/Notes form
    const handleContinueToDetails = () => {
        const itemsSelected = Object.keys(itemQuantities).length > 0 || specialOrders.length > 0;
        
        if (!itemsSelected) {
            alert("Please select at least one menu item or custom item before continuing.");
            return;
        }
        setIsMenuDetailsPhase(true);
    };

    // --- NEW HANDLERS FOR MODAL INTERACTION ---
    const handleSelectItemForEdit = (item) => {
        // --- ADDED: BLOCK SELECTION IF KITCHEN MARKED AS SOLD OUT ---
        if (availabilityMap[item.id] === false) return;

        const currentQty = itemQuantities[item.id] || 0;
        
        // Pass item data and current quantity to the modal
        setItemToEdit({ 
            id: item.id, 
            name: item.name, 
            price: item.price, 
            imageUrl: item.imageUrl,
            quantity: currentQty 
        });
        setIsModalOpen(true); // Open the modal
    };
    
    const handleSaveItemFromModal = (updatedItem) => {
        const itemId = updatedItem.id;
        const newQuantity = updatedItem.quantity;
        
        // Update the main itemQuantities state based on modal output
        setItemQuantities(prev => {
            const newState = { ...prev };
            if (newQuantity > 0) newState[itemId] = newQuantity;
            else delete newState[itemId]; // Remove item if quantity is 0
            return newState;
        });

        if (validationErrors.items && newQuantity > 0) setValidationErrors(prev => ({...prev, items: null}));
        setIsModalOpen(false); // Close the modal
        setItemToEdit(null);
    };
    
    // --- LOGIC ---
    
    const getSelectedItemsArray = () => {
        const selectedItems = [];
        const submissionTimestamp = Date.now();
        for (const itemId in itemQuantities) {
            const item = ALL_MENU_ITEMS.find(i => i.id === itemId);
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
        const subtotal = selectedItems.reduce(
            (sum, item) => sum + (item.price * item.qty * (item.type === 'menu' ? 1 : 0)), 0
        );
        const serviceCharge = (currentOrderType === 'Room Service') ? ROOM_SERVICE_FLAT_CHARGE : 0.00;
        return {
            subtotal, serviceCharge, grandTotal: subtotal + serviceCharge,
            totalItemsCount: selectedItems.reduce((sum, item) => sum + item.qty, 0)
        };
    };

    const handleAddSpecialItem = () => {
        const name = newSpecialItemName.trim();
        const qty = parseInt(newSpecialItemQty);
        if (name.length < 2) { alert("Please enter a valid item name."); return; }
        if (qty < 1 || isNaN(qty)) { alert("Quantity must be at least 1."); return; }
        setSpecialOrders(prev => [...prev, { name, qty }]);
        setNewSpecialItemName('');
        setNewSpecialItemQty(1);
        setValidationErrors(prev => ({...prev, items: null}));
    };

    const handleRemoveSpecialItem = (index) => setSpecialOrders(prev => prev.filter((_, i) => i !== index));

    const handleClearForm = () => {
        if (!window.confirm("Clear form and return to start?")) return;
        setItemQuantities({}); setOrderNotes(''); setValidationErrors({});
        setSelectedRoom(''); setRoomSearchTerm(''); setGuestName(''); setWhatsappNumber(''); 
        setOrderType('default'); setSpecialOrders([]); 
        setNewSpecialItemName(''); setNewSpecialItemQty(1);
        setViewMode('landing'); 
        setIsCustomOnlyMode(false); 
        setIsMenuDetailsPhase(false); 
    };

    const placeOrder = async () => {
        const itemsToOrder = getSelectedItemsArray();
        const breakdown = getFinancialBreakdown(itemsToOrder, orderType); 

        let errors = {};
        let destination = '';
        let roomReference = '';

        if (itemsToOrder.length === 0) errors.items = "🛑 Please select at least one item (Menu or Custom).";
        if (orderType === 'default') errors.service = "🛑 Please select a Service Type.";
        else {
            if (orderType === 'Room Service') {
                if (!selectedRoom || !mockRooms.includes(selectedRoom)) errors.location = "🛑 Please select your Room Name.";
                else { destination = selectedRoom; roomReference = selectedRoom; }
            } else { 
                if (guestName.trim() === '') errors.location = "🛑 Please enter your Name.";
                else { destination = guestName.trim(); roomReference = 'WALK-IN'; }
            }
        }
        
        const phoneRegex = /^\+?\d{8,15}$/;
        if (!phoneRegex.test(whatsappNumber.trim())) errors.whatsapp = "🛑 Please enter a valid WhatsApp number.";
        if (orderNotes.trim() === '') errors.notes = "🛑 Please enter 'N/A' or any special instructions.";
        
        setValidationErrors(errors);
        if (Object.keys(errors).length > 0) return;
        
        setLoading(true);

        const initialStatusEntry = { 
            status: 1, 
            statusName: "PENDING", 
            timestamp: new Date(), 
            updatedBy: "Guest App" 
        };
        
        const orderData = {
            guestId: guestId, 
            roomNumber: roomReference, 
            orderType: orderType, 
            orderTime: serverTimestamp(), 
            currentStatus: 1, 
            serverName: null, 
            dispatchLocation: destination, 
            items: itemsToOrder, 
            notes: orderNotes.trim(), 
            whatsappNumber: whatsappNumber.trim(), 
            financials: {
                subtotal: parseFloat(breakdown.subtotal.toFixed(2)),
                serviceCharge: parseFloat(breakdown.serviceCharge.toFixed(2)),
                grandTotal: parseFloat(breakdown.grandTotal.toFixed(2)),
                hasSpecialItems: specialOrders.length > 0 
            },
            statusHistory: [initialStatusEntry] 
        };

        try {
            await addDoc(collection(db, "orders"), orderData);
            alert(`Order placed successfully!`);
            
            // 1. Reset Form Data 
            setItemQuantities({}); setOrderNotes(''); setValidationErrors({});
            setSelectedRoom(''); setRoomSearchTerm(''); setGuestName(''); 
            setOrderType('default'); setSpecialOrders([]); 
            setNewSpecialItemName(''); setNewSpecialItemQty(1);
            
            // 2. Return to Landing
            setViewMode('landing');
            setIsCustomOnlyMode(false);
            setIsMenuDetailsPhase(false);

            // 3. Trigger Callback to App.jsx to switch to the tracker view
            if (onOrderSuccess) onOrderSuccess();
            
        } catch (e) {
            console.error("Error placing order: ", e);
            alert(`Failed to place order. Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };


    const currentOrderSummary = getSelectedItemsArray();
    const financialBreakdown = getFinancialBreakdown(currentOrderSummary, orderType); 

    if (availabilityLoading) {
        return <div style={containerStyle}>Loading menu configurations...</div>
    }

    // --- RENDER: LANDING MODE ---
    if (viewMode === 'landing') {
        return (
            <div style={containerStyle}>
                <h2 style={{...headerStyleGuestForm, border: 'none'}}>👋 Welcome! How would you like to order?</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <button onClick={handleStartMenuOrder} style={landingButtonStyle}>
                        <span style={{ fontSize: '1.5em', display: 'block' }}>🍔</span>
                        Browse Full Menu
                    </button>
                    <button onClick={handleStartCustomOrder} style={{...landingButtonStyle, backgroundColor: '#6f42c1'}}>
                        <span style={{ fontSize: '1.5em', display: 'block' }}>✍️</span>
                        Custom Order Only
                    </button>
                </div>
            </div>
        );
    }

    // --- RENDER: ORDERING MODE (Two Phases) ---
    return (
        <div style={containerStyle}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                <button onClick={handleBackToLanding} style={backButtonStyle}>
                    ← Back to Start
                </button>
                <button onClick={handleClearForm} style={clearButtonStyle}>
                    Start Over
                </button>
            </div>
            
            {/* ======================================================= */}
            {/* PHASE 1: MENU SELECTION (Horizontal Scroll) */}
            {/* ======================================================= */}
            {viewMode === 'ordering' && !isMenuDetailsPhase && !isCustomOnlyMode && (
                <>
                    <h2 style={{...headerStyleGuestForm, marginBottom: '10px'}}>🍽️ Menu Selection (Scroll ➡️)</h2>
                    
                    <input
                        type="text" placeholder="Search menu..." value={menuSearchTerm}
                        onChange={(e) => setMenuSearchTerm(e.target.value)}
                        style={{...inputStyle, marginBottom: '15px', backgroundColor: '#fff', width: '100%'}} 
                    />
                    
                    {/* Horizontal Scroll Wrapper */}
                    <div style={horizontalScrollWrapperStyle}> 
                        {CATEGORIES.map(category => {
                            const filteredCategoryItems = fullMenu[category]
                                .filter(item => item.name.toLowerCase().includes(menuSearchTerm.toLowerCase()));
                            
                            return (
                                <div key={category} style={horizontalCategoryColumnStyle}>
                                    <h4 style={{...categoryHeaderStyle, borderBottom: `3px solid ${CATEGORY_COLORS[category]}`}}>{category}</h4>
                                    {/* Vertical scrolling container */}
                                    <div style={verticalScrollListStyle}> 
                                        <div style={categoryItemsListStyle}>
                                            {filteredCategoryItems.map(item => {
                                                const currentQty = itemQuantities[item.id] || 0;
                                                const isAvailable = availabilityMap[item.id] !== false;
                                                
                                                return (
                                                    // Menu Item Card
                                                    <div 
                                                        key={item.id} 
                                                        style={{
                                                            ...itemCardStyle, 
                                                            cursor: isAvailable ? 'pointer' : 'not-allowed', 
                                                            borderColor: currentQty > 0 ? CATEGORY_COLORS[category] : '#e9ecef',
                                                            opacity: isAvailable ? 1 : 0.6
                                                        }} 
                                                        onClick={() => handleSelectItemForEdit(item)}
                                                    >
                                                        <img 
                                                            src={item.imageUrl || 'https://picsum.photos/seed/defaultfood/55/55'} 
                                                            alt={item.name} 
                                                            style={imageStyle} 
                                                        />
                                                        <div style={itemDetailsContainerStyle}>
                                                            <div style={itemTextGroupStyle}>
                                                                <strong style={itemNameStyle}>{item.name}</strong> 
                                                                <em style={itemPriceStyle}>{CURRENCY_SYMBOL}{item.price.toFixed(2)}</em>
                                                                {!isAvailable && <span style={{color: '#dc3545', fontSize: '0.7rem', fontWeight: 'bold', display: 'block'}}>SOLD OUT</span>}
                                                            </div>
                                                            {/* Show Quantity Badge */}
                                                            {currentQty > 0 && isAvailable && (
                                                                <span style={{ backgroundColor: CATEGORY_COLORS[category], color: 'white', padding: '4px 8px', borderRadius: '15px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                                    Qty: {currentQty}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '15px' }}>
                        <button 
                            onClick={handleContinueToDetails} 
                            disabled={Object.keys(itemQuantities).length === 0 && specialOrders.length === 0}
                            style={continueButtonStyle}
                        >
                            Continue to Checkout ({Object.keys(itemQuantities).length + specialOrders.length} Items)
                        </button>
                    </div>
                </>
            )}

            {/* ======================================================= */}
            {/* PHASE 2: DETAILS & CHECKOUT (For Menu & Custom Orders) */}
            {/* ======================================================= */}
            {viewMode === 'ordering' && (isMenuDetailsPhase || isCustomOnlyMode) && (
                <>
                    <h2 style={{...headerStyleGuestForm, marginBottom: '10px'}}>
                        {isCustomOnlyMode ? '✍️ Custom Order Checkout' : '🛒 Order Details & Location'}
                    </h2>

                    {/* Service Type */}
                    <div style={sectionStyleGuestForm}>
                        <label style={labelStyle}>Service Type:</label>
                        <select 
                            value={orderType} 
                            onChange={e => { setOrderType(e.target.value); setValidationErrors(prev => ({...prev, service: null})); }} 
                            style={selectStyle}
                        >
                            <option value="default" disabled>— Select Service Type —</option>
                            <option value="Room Service">Room Service</option>
                            <option value="Dining Hall">Dining Hall (Walk-in)</option>
                        </select>
                        {validationErrors.service && <p style={yellTextStyle}>{validationErrors.service}</p>}
                        
                        {orderType !== 'default' && (
                            <div style={inputGroupStyle}>
                                {orderType === 'Room Service' ? (
                                    <>
                                        <label style={labelStyle}>Room Name:</label>
                                        <input
                                            type="text" placeholder="Search room..." value={roomSearchTerm}
                                            onChange={(e) => {
                                                const term = e.target.value; setRoomSearchTerm(term);
                                                setSelectedRoom(''); 
                                                if (validationErrors.location) setValidationErrors(prev => ({...prev, location: null}));
                                            }}
                                            style={inputStyle}
                                        />
                                        {filteredRooms.length > 0 && (
                                            <select 
                                                value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}
                                                style={{...inputStyle, marginTop: '10px'}}
                                            >
                                                <option value="" disabled>— Select Room —</option>
                                                {filteredRooms.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        )}
                                        {selectedRoom && <p style={infoTextStyle}>Room: <strong>{selectedRoom}</strong></p>}
                                    </>
                                ) : (
                                    <>
                                        <label style={labelStyle}>Walk-in Name:</label>
                                        <input type="text" value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Your Name" style={inputStyle}/>
                                    </>
                                )}
                                {validationErrors.location && <p style={yellTextStyle}>{validationErrors.location}</p>}
                            </div>
                        )}
                    </div>

                    {/* Custom Items Section */}
                    <div style={sectionStyleGuestForm}>
                        <h3 style={summaryHeaderStyle}>Order Details</h3>
                        
                        <div style={specialOrderContainerStyle}>
                            <h4>⭐ Custom Items {!isCustomOnlyMode && '(Extras)'}</h4>
                            {specialOrders.length > 0 && (
                                <ul style={customItemListStyle}>
                                    {specialOrders.map((item, index) => (
                                        <li key={index} style={{...customItemListItemStyle, padding: '3px 0'}}> 
                                            <span>{item.qty} x {item.name}</span>
                                            <button onClick={() => handleRemoveSpecialItem(index)} style={removeCustomButtonStyle}>Remove</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div style={specialOrderInputGroup}>
                                <input type="text" placeholder="Item Name" value={newSpecialItemName}
                                    onChange={(e) => setNewSpecialItemName(e.target.value)} style={{ ...inputStyle, flexGrow: 1, marginRight: '10px' }} />
                                <input type="number" min="1" value={newSpecialItemQty}
                                    onChange={(e) => setNewSpecialItemQty(e.target.value)} style={{ ...inputStyle, width: '60px', textAlign: 'center' }} />
                                <button onClick={handleAddSpecialItem} style={addSpecialButtonStyle}>+ Add</button>
                            </div>
                        </div>

                        <label style={{...labelStyle, marginTop: '5px'}}>WhatsApp:</label>
                        <input type="tel" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="+233..." style={{...inputStyle, width: '100%'}}/>
                        {validationErrors.whatsapp && <p style={yellTextStyle}>{validationErrors.whatsapp}</p>}

                        <label style={{...labelStyle, marginTop: '5px'}}>Notes:</label>
                        <textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Allergies/Instructions..." rows="3" style={{...inputStyle, width: '100%', resize: 'vertical'}}/>
                        {validationErrors.notes && <p style={yellTextStyle}>{validationErrors.notes}</p>}

                        {/* Final List */}
                        {currentOrderSummary.length > 0 ? (
                            <div style={{marginTop: '10px', padding: '10px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px'}}>
                                <p style={{fontWeight: 'bold', borderBottom: '1px solid #ccc', paddingBottom: '5px'}}>Items Selected:</p>
                                {currentOrderSummary.map((item, idx) => (
                                    <div key={idx} style={{display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dotted #ccc'}}>
                                        <span>{item.qty} x {item.name} {item.type === 'special' && '(Custom)'}</span>
                                        <span>{item.type === 'menu' ? `${CURRENCY_SYMBOL}${item.price.toFixed(2)}` : 'TBD'}</span>
                                    </div>
                                ))}
                                <div style={{...grandTotalRowStyle, marginTop: '5px', paddingTop: '5px'}}> 
                                    Total Estimated: {CURRENCY_SYMBOL}{financialBreakdown.grandTotal.toFixed(2)}
                                </div>
                            </div>
                        ) : <p>No items added.</p>}

                        {validationErrors.items && <p style={yellTextStyle}>{validationErrors.items}</p>}

                        <button onClick={placeOrder} disabled={loading || currentOrderSummary.length === 0} style={{...placeOrderButtonStyle, marginTop: '10px'}}>
                            {loading ? 'Submitting...' : 'Submit Order'}
                        </button>
                    </div>
                </>
            )}

            {isModalOpen && itemToEdit && (
                <CartItemEditor
                    item={itemToEdit}
                    onSave={handleSaveItemFromModal}
                    onClose={() => setIsModalOpen(false)}
                    currencySymbol={CURRENCY_SYMBOL}
                />
            )}
        </div>
    );
}

// --- ALL ORIGINAL STYLES PRESERVED ---
const landingButtonStyle = { padding: '20px', fontSize: '1.2rem', fontWeight: 'bold', color: 'white', backgroundColor: '#007bff', border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', transition: 'transform 0.1s' };
const continueButtonStyle = { padding: '15px 30px', backgroundColor: '#ff8c00', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s', width: '100%', boxSizing: 'border-box' };
const backButtonStyle = { padding: '8px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' };
const clearButtonStyle = { padding: '8px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' };
const containerStyle = { maxWidth: '1400px', width: '95%', margin: '20px auto', padding: '20px', fontFamily: 'sans-serif', backgroundColor: '#f8f9fa', borderRadius: '12px', boxShadow: '0 8px 20px rgba(0,0,0,0.15)', boxSizing: 'border-box' };
const headerStyleGuestForm = { textAlign: 'center', color: '#007bff', borderBottom: '2px solid #e9ecef', paddingBottom: '10px', marginBottom: '20px' };
const sectionStyleGuestForm = { marginBottom: '8px', padding: '15px', border: '1px solid #dee2e6', borderRadius: '8px', backgroundColor: '#ffffff' }; 
const labelStyle = { fontWeight: '600', display: 'block', marginBottom: '3px', color: '#343a40' }; 
const selectStyle = { padding: '10px', width: '100%', marginBottom: '10px', borderRadius: '5px', border: '1px solid #ced4da' };
const inputGroupStyle = { padding: '10px', border: '1px dashed #ced4da', borderRadius: '5px' };
const inputStyle = { padding: '10px', borderRadius: '5px', border: '1px solid #ced4da', boxSizing: 'border-box', width: '100%' };
const horizontalScrollWrapperStyle = { display: 'flex', overflowX: 'auto', padding: '0 0 10px 0', gap: '15px', WebkitOverflowScrolling: 'touch' };
const horizontalCategoryColumnStyle = { flex: '0 0 auto', width: 'min(80vw, 350px)', padding: '0 10px 10px 10px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '1px solid #e9ecef', boxSizing: 'border-box' };
const verticalScrollListStyle = { maxHeight: '70vh', overflowY: 'auto', paddingRight: '10px', marginTop: '5px' };
const categoryItemsListStyle = { display: 'flex', flexDirection: 'column', gap: '4px' }
const categoryHeaderStyle = { textAlign: 'left', marginBottom: '5px', fontSize: '1.3rem', paddingBottom: '5px' };
const itemCardStyle = { display: 'flex', alignItems: 'center', padding: '4px', backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', border: '1px solid #e9ecef', transition: 'transform 0.1s' };
const imageStyle = { width: '55px', height: '55px', borderRadius: '6px', objectFit: 'cover', marginRight: '10px', flexShrink: 0, border: '1px solid #f8f9fa' };
const itemDetailsContainerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexGrow: 1 };
const itemTextGroupStyle = { flexGrow: 1, paddingRight: '10px' };
const itemNameStyle = { fontSize: '0.95rem', color: '#343a40' };
const itemPriceStyle = { fontSize: '0.85rem', fontWeight: '600', color: '#007bff', display: 'block' };
const summaryHeaderStyle = { borderBottom: '1px solid #ccc', paddingBottom: '5px' };
const placeOrderButtonStyle = { padding: '15px', width: '100%', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '25px', fontSize: '1.2rem', fontWeight: 'bold', marginTop: '10px', cursor: 'pointer' };
const infoTextStyle = { fontSize: '0.9rem', color: '#666' };
const yellTextStyle = { color: '#dc3545', fontWeight: 'bold', margin: '5px 0', backgroundColor: '#ffe3e3', padding: '5px', borderRadius: '4px' };
const specialOrderContainerStyle = { padding: '15px', backgroundColor: '#e9f7ff', border: '1px solid #91d5ff', borderRadius: '8px', marginBottom: '5px' }; 
const specialOrderInputGroup = { display: 'flex', alignItems: 'center', marginTop: '10px' };
const customItemListStyle = { listStyleType: 'none', padding: '0', marginBottom: '5px' }; 
const customItemListItemStyle = { display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#800080' }; 
const addSpecialButtonStyle = { padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', marginLeft: '5px', flexShrink: 0 };
const removeCustomButtonStyle = { backgroundColor: 'transparent', border: '1px solid #dc3545', color: '#dc3545', padding: '2px 5px', borderRadius: '4px', cursor: 'pointer' };
const grandTotalRowStyle = { marginTop: '5px', paddingTop: '5px', borderTop: '2px solid #333', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'right' };

export default GuestOrderForm;