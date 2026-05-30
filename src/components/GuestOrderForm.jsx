import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore'; 
import { db } from '../config/firebase'; 
import CartItemEditor from './CartItemEditor'; 
import { logSystemEvent } from '../utils/logger'; 
import { createOrder } from '../utils/orderActions'; 
import { useRealTimeOrders } from '../hooks/useRealTimeOrders';
import { requestPersonalizedMealSuggestions } from '../utils/aiRecommender';

function GuestOrderForm({ guestId, onOrderSuccess }) {
    
    // --- 1. DYNAMIC DATA STATE (Schema Integration) ---
    const [menuData, setMenuData] = useState({});
    const [flatCharge, setFlatCharge] = useState(0);
    const [currency, setCurrency] = useState('GH₵');
    const [menuLoading, setMenuLoading] = useState(true);
    const [hoveredImage, setHoveredImage] = useState(null);

    // --- 2. RESTORED UI STATE ---
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
    const [availableRooms, setAvailableRooms] = useState([]); 
    const [orderSubmitted, setOrderSubmitted] = useState(false);

    const startTime = useRef(Date.now());

    // --- 4. DATA HELPERS ---
    const allItemsFlat = useMemo(() => Object.values(menuData).flat(), [menuData]);
    
    // 🔥 CACHE PERFORMANCE FIX: Storing clean category groupings to prevent main-thread layout blocking
    const sortedCategories = useMemo(() => {
        const cats = Object.keys(menuData);
        const preferred = ["BREAKFAST", "LUNCH/DINNER", "SOUPS", "FRUITS & VEGETABLES", "DRINKS"];
        return cats.sort((a, b) => preferred.indexOf(a) - preferred.indexOf(b));
    }, [menuData]);

    const filteredRooms = useMemo(() => {
        return availableRooms.filter(room => 
            String(room).toLowerCase().includes(roomSearchTerm.toLowerCase().trim())
        );
    }, [availableRooms, roomSearchTerm]);

    
    // --- 3. DATABASE LISTENERS & AI PREFERENCES ---
    // 🔥 FIX 1: Destructure 'loading' as 'historyLoading' from your custom hook track
    const { orders: historyOrders, loading: historyLoading } = useRealTimeOrders('guestId', guestId, [0, 7, 8], true);
    const flatMenuItemsList = useMemo(() => Object.values(menuData).flat(), [menuData]);
    const [aiSuggestions, setAiSuggestions] = useState([]);
    const [aiLoading, setAiLoading] = useState(false);
    const apiLockRef = useRef(false);

    // 🔥 THE FIX: Top-level hooks for the auto-sliding carousel engine
    const carouselRef = useRef(null);
    const isCarouselInteractingRef = useRef(false);

    // 🔥 THE FIX: Side-effect automation handler synchronized with AI suggestions state metrics
    useEffect(() => {
        const container = carouselRef.current;
        if (!container || aiSuggestions.length === 0) return;

        const autoScrollInterval = setInterval(() => {
            if (isCarouselInteractingRef.current) return;

            const cardWidth = 254; // Width of card + spacing gaps (240px + 14px)
            const maxScrollLeft = container.scrollWidth - container.clientWidth;

            if (container.scrollLeft >= maxScrollLeft - 5) {
                container.scrollTo({
                    left: 0,
                    behavior: 'smooth'
                });
            } else {
                container.scrollBy({
                    left: cardWidth,
                    behavior: 'smooth'
                });
            }
        }, 3500); // Transitions to the next item card every 3.5 seconds

        return () => clearInterval(autoScrollInterval);
    }, [aiSuggestions]);

    useEffect(() => {
        // A. Synchronize Hotel Settings Configuration Metrics
        const unsubConfig = onSnapshot(doc(db, 'config', 'hotel_settings'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setFlatCharge(data.roomServiceCharge || 0); 
                setCurrency(data.currency || 'GH₵');
                
                if (data.availableRooms && Array.isArray(data.availableRooms)) {
                    setAvailableRooms(data.availableRooms);
                }
            }
        });

        // B. Synchronize Menu Catalog & Process AI in Non-Blocking Background Thread Execution Loop
        const unsubMenu = onSnapshot(collection(db, 'menu'), (snapshot) => {
            const categorized = {};
            const localFlatList = [];
            
            snapshot.docs.forEach(docSnap => {
                const item = { id: docSnap.id, ...docSnap.data() };
                const cat = item.category || "OTHER";
                if (!categorized[cat]) categorized[cat] = [];
                categorized[cat].push(item);
                localFlatList.push(item); 
            });

            setMenuData(categorized);
            
            if (menuLoading) {
                const loadTime = Date.now() - startTime.current;
                logSystemEvent("PERFORMANCE", "Guest Menu Sync Complete", { loadTimeMs: loadTime });
                setMenuLoading(false); // 🚀 UNBLOCKED: Layout reveals instantly to guest
            }

            // 🔥 FIX 2: Pause right here if Firestore hasn't finished loading past order metrics.
            if (historyLoading) {
                console.log("⏳ AI Recommender: Waiting for real-time history sync...");
                return;
            }

            // C. Fire AI Request Asynchronously without lagging the client interface
            if (localFlatList.length > 0 && aiSuggestions.length === 0 && !apiLockRef.current) {
                apiLockRef.current = true;
                setAiLoading(true);
                
                (async () => {
                    try {
                        console.log(`📡 Background Thread: Handpicking suggestions for ${localFlatList.length} items with ${historyOrders.length} historical logs...`);
                        const rawItemIds = await requestPersonalizedMealSuggestions(historyOrders, localFlatList);
                        
                        // Structural protection wrapper ensures fallback arrays filter securely
                        const recommendedItemIds = Array.isArray(rawItemIds) ? rawItemIds : [];
                        
                        // Limit matched array nodes specifically to a premium subset slice profile
                        const matchedObjects = localFlatList
                            .filter(item => recommendedItemIds.includes(item.id))
                            .slice(0, 5);

                        if (matchedObjects.length > 0) {
                            setAiSuggestions(matchedObjects);
                        } else {
                            setAiSuggestions([]);
                        }
                    } catch (err) {
                        console.error("❌ Background AI pipeline error:", err);
                        apiLockRef.current = false;
                    } finally {
                        setAiLoading(false);
                    }
                })();
            }
        }, (error) => {
            logSystemEvent("ERROR", "Menu Subscription Failed", { error: error.message });
            setMenuLoading(false);
        });

        return () => { unsubConfig(); unsubMenu(); };
    // 🔥 FIX 3: Include historyLoading here so the hook evaluates instantly the moment the logs land
    }, [historyOrders?.length, historyLoading, aiSuggestions.length]);

    useEffect(() => {
        const cleanTerm = roomSearchTerm.trim();
        if (cleanTerm === '') {
            setSelectedRoom('');
            return;
        }

        if (filteredRooms.length === 1) {
            setSelectedRoom(filteredRooms[0]);
            if (validationErrors.room) {
                setValidationErrors(prev => ({ ...prev, room: null }));
            }
        } else {
            const exactMatch = availableRooms.find(
                room => String(room).toLowerCase() === cleanTerm.toLowerCase()
            );
            if (exactMatch) {
                setSelectedRoom(exactMatch);
            } else {
                setSelectedRoom(''); 
            }
        }
    }, [roomSearchTerm, filteredRooms, availableRooms]);
                     

    const handleRoomSelectChange = (val) => {
        setSelectedRoom(val);
        setRoomSearchTerm(val); 
        if (validationErrors.room) {
            setValidationErrors(prev => ({ ...prev, room: null }));
        }
    };

    // --- 5. UI HANDLERS ---
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
                    id: String(itemId), 
                    name: String(item.name || 'Unknown Item'), 
                    price: Number(item.price) || 0, 
                    qty: Number(itemQuantities[itemId]), 
                    prepTime: String(item.prepTime || 'N/A'), 
                    type: 'menu',
                    imageUrl: item.imageUrl || null 
                });
            }
        }

        specialOrders.forEach((item, index) => {
            selectedItems.push({
                id: `SP_${submissionTimestamp}_${index}`, 
                name: String(item.name), 
                price: 0, 
                qty: Number(item.qty), 
                prepTime: 'N/A', 
                type: 'special',
                imageUrl: null
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
        setSpecialOrders(prev => [...prev, { 
            name: newSpecialItemName.trim(), 
            qty: newSpecialItemQty 
        }]);
        setNewSpecialItemName(''); 
        setNewSpecialItemQty(1); 
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
        let errors = {};

        if (orderType === 'default') {
            errors.service = "🛑 Please select a Service Type (Room Service or Dining Hall).";
        }

        if (orderType === 'Room Service') {
            if (!selectedRoom) errors.room = "🛑 Please select your room number.";
        } else if (orderType === 'Dining Hall') {
            const nameClean = guestName.trim();
            const nameRegex = /^[a-zA-Z]{2,}\s[a-zA-Z]{1,}/; 

            if (!nameClean) {
                errors.guestName = "🛑 Please enter your full name.";
            } else if (nameClean.length < 5) {
                errors.guestName = "🛑 Name too short. Please use your full name.";
            } else if (!nameRegex.test(nameClean)) {
                errors.guestName = "🛑 Please enter at least two names (e.g., Nathaniel Antwi).";
            }
        }

        const phoneRegex = /^\+\d{10,15}$/;
        const whatsappClean = whatsappNumber.trim();
        if (!whatsappClean) {
            errors.whatsapp = "🛑 WhatsApp number is required.";
        } else if (!phoneRegex.test(whatsappClean)) {
            errors.whatsapp = "🛑 Use international format (e.g., +233240000000).";
        }

        if (itemsToOrder.length === 0 && specialOrders.length === 0) {
            errors.items = "🛑 Your cart is empty.";
        }
        
        setValidationErrors(errors);

        if (Object.keys(errors).length > 0) {
            const firstErrorMessage = Object.values(errors)[0];
            alert(firstErrorMessage);
            return;
        }
        
        setLoading(true);
        try {
            const hasCustomItems = specialOrders.length > 0 || itemsToOrder.some(i => i.price === 0);
            const initialPaymentStatus = hasCustomItems ? 'pending_price' : 'unpaid';

            const packedOrderPayload = {
                guestId, 
                roomNumber: orderType === 'Room Service' ? selectedRoom : 'DINING-HALL', 
                orderType, 
                paymentStatus: initialPaymentStatus,
                paidAt: null, 
                dispatchLocation: orderType === 'Room Service' ? selectedRoom : guestName.trim(), 
                items: itemsToOrder, 
                notes: orderNotes.trim(), 
                whatsappNumber: whatsappClean,
                serviceCharge: orderType === 'Room Service' ? Number(flatCharge) : 0.00
            };

            await createOrder(packedOrderPayload);
            setOrderSubmitted(true);
            logSystemEvent("INFO", "Order Successfully Placed", { guestId });
        } catch (e) {
            logSystemEvent("ERROR", "Submission Failure", { error: e.message });
            alert("Failed to place order: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    if (menuLoading) return <div style={containerStyle}>🔄 Synchronizing with Hotel Database...</div>;

    const currentOrderSummary = getSelectedItemsArray();
    const financialBreakdown = getFinancialBreakdown(currentOrderSummary, orderType); 
    const CATEGORY_COLORS = { "BREAKFAST": "#FFC107", "LUNCH/DINNER": "#007BFF", "SOUPS": "#28A745", "FRUITS & VEGETABLES": "#DC3545", "DRINKS": "#6C757D" };

    // 🔥 FIXED STYLE PORTAL: Injects hardware-accelerated continuous infinite marquee animations safely
    const AnimationStyles = () => (
        <style>{`
            @keyframes fadeSlideUp {
                from { opacity: 0; transform: translateY(15px); }
                to { opacity: 1; transform: translateY(0); }
            }

            @keyframes marqueeContinuous {
                0% { transform: translateX(0); }
                100% { transform: translateX(-50%); }
            }

            .marquee-container {
                display: flex !important;
                width: max-content !important;
                animation: marqueeContinuous 30s linear infinite !important;
            }

            .marquee-container:hover {
                animation-play-state: paused !important;
            }
        `}</style>
    );
    
    if (viewMode === 'landing') {
        return (
            <div style={{...containerStyle, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '90vh'}}>
                <AnimationStyles />
                <div style={{ textAlign: 'center', marginBottom: '40px', animation: 'fadeSlideUp 0.6s ease-out' }}>
                    <div style={{ fontSize: '0.8rem', letterSpacing: '3px', color: '#0047AB', fontWeight: '800', textTransform: 'uppercase', marginBottom: '10px' }}>
                        Luxury Concierge
                    </div>
                    <h2 style={{ ...elegantTitleStyle, fontSize: 'clamp(1.8rem, 8vw, 2.8rem)', marginBottom: '15px' }}>
                        How can we <br/> serve you today?
                    </h2>
                    <p style={{ color: '#666', fontSize: '1rem', fontWeight: '400' }}>Select your preferred ordering method</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', width: '100%', maxWidth: '1200px', margin: '0 auto', animation: 'fadeSlideUp 0.8s ease-out' }}>
                    <button onClick={handleStartMenuOrder} style={premiumLandingButtonStyle}>
                        <span style={{ fontSize: '1.4rem' }}>🍔</span>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: '700' }}>Browse Full Menu</div>
                            <div style={{ fontSize: '0.75rem', fontWeight: '400', opacity: 0.7 }}>
                                {aiLoading ? '✨ Curating matching recommendations...' : 'Explore dishes and drinks'}
                            </div>
                        </div>
                        <span style={{ marginLeft: 'auto', opacity: 0.5 }}>→</span>
                    </button>

                    <button onClick={handleStartCustomOrder} style={{...premiumLandingButtonStyle, backgroundColor: '#FFFFFF', color: '#121212', border: '1px solid #E8E8E1'}}>
                        <span style={{ fontSize: '1.4rem' }}>✍️</span>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: '700' }}>Custom Order Only</div>
                            <div style={{ fontSize: '0.75rem', fontWeight: '400', opacity: 0.7 }}>Direct request to the kitchen</div>
                        </div>
                        <span style={{ marginLeft: 'auto', opacity: 0.5 }}>→</span>
                    </button>
                </div>

                <div style={{ marginTop: 'auto', textAlign: 'center', padding: '20px', fontSize: '0.8rem', color: '#999', letterSpacing: '1px' }}>
                    POWERED BY ALGRACE SYSTEMS
                </div>
            </div>
        );
    }

    if (orderSubmitted) {
        const hasCustom = specialOrders.length > 0 || currentOrderSummary.some(i => i.price === 0);
        return (
            <div style={{...containerStyle, textAlign: 'center', minHeight: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'}}>
                <div style={{ fontSize: '5rem', marginBottom: '10px' }}>✅</div>
                <h2 style={elegantTitleStyle}>Order Sent!</h2>
                <p style={{ color: '#666', fontSize: '1rem', maxWidth: '320px', margin: '0 auto 25px auto', lineHeight: '1.5' }}>
                    {hasCustom 
                        ? "We've received your order. The Front Desk will confirm the final price shortly."
                        : "We've received your order. The Front Desk will confirm shortly"}
                </p>
                <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '16px', border: '1px solid #E2E2E2', width: '100%', maxWidth: '320px', marginBottom: '30px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#999', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        {hasCustom ? "Estimated Total" : "Total Amount"}
                    </span>
                    <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1A1A1A' }}>
                        {currency}{financialBreakdown.grandTotal.toFixed(2)}
                        {hasCustom && <span style={{ color: '#2B6CB0', fontSize: '0.9rem', display: 'block', marginTop: '4px' }}>+ Custom Items TBD</span>}
                    </div>
                </div>
                <button onClick={onOrderSuccess} style={{ ...elegantContinueButton, backgroundColor: '#2B6CB0', maxWidth: '320px' }}>
                    Track Live Status →
                </button>
            </div>
        );
    }

    return (
          <div style={containerStyle}>
            <AnimationStyles />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', padding: '4px 0', width: '100%', boxSizing: 'border-box' }}>
                <button onClick={() => { if (isMenuDetailsPhase && !isCustomOnlyMode) { setIsMenuDetailsPhase(false); } else { handleBackToLanding(); } }} style={backButtonStyle}>
                    ← Back
                </button>
                <button onClick={handleClearForm} style={clearButtonStyle}>
                    Start Over
                </button>
            </div>

            {!isMenuDetailsPhase && !isCustomOnlyMode && (
                <div style={menuContainerFadeIn}>
                    <div style={menuHeaderSection}>
                        <h2 style={elegantTitleStyle}>Explore Our Menu</h2>
                        <div style={searchWrapper}>
                            <span style={searchIcon}>🔍</span>
                            <input type="text" placeholder="Search for dishes or categories..." style={elegantSearchInput} onChange={(e) => setMenuSearchTerm(e.target.value)} />
                        </div>
                    </div>

                    {/* ✨ CHEF'S AI HANDPICKED SUGGESTIONS MAROUSEL (INFINITE MARQUEE) */}
                    {aiSuggestions.length > 0 && (
                        <div style={{ width: '100%', marginBottom: '32px', padding: '0 4px', boxSizing: 'border-box', overflow: 'hidden', animation: 'fadeSlideUp 0.5s ease-out' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                <span style={{ fontSize: '1.2rem' }}>✨</span>
                                <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '900', color: '#121212', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                    Handpicked For You
                                </h3>
                            </div>
                            
                            {/* Masking window wrapper that cuts off overflow */}
                            <div style={{ width: '100%', overflow: 'hidden', position: 'relative' }}>
                                <div className="marquee-container" style={{ display: 'flex', gap: '14px', paddingBottom: '12px' }}>
                                    
                                    {/* Double the array length to create the seamless mirror loop illusion */}
                                    {[...aiSuggestions, ...aiSuggestions].map((item, index) => (
                                        <div 
                                            key={`${item.id}-${index}`} 
                                            onClick={() => handleSelectItemForEdit(item)} 
                                            style={{ minWidth: '240px', maxWidth: '240px', backgroundColor: '#FFFFFF', border: '1px solid #121212', borderRadius: '16px', padding: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer', position: 'relative', boxSizing: 'border-box' }}
                                        >
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                                                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '800', color: '#1A1A1A', lineHeight: '1.2' }}>{item.name}</h4>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: '900', color: '#2B6CB0', fontFamily: 'monospace' }}>
                                                        {currency}{item.price.toFixed(2)}
                                                    </span>
                                                </div>
                                                {item.description && (
                                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#787873', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                        {item.description}
                                                    </p>
                                                )}
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); handleSelectItemForEdit(item); }} style={{ marginTop: '14px', width: '100%', padding: '10px', backgroundColor: '#121212', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                ⚡ Quick Add
                                            </button>
                                            {itemQuantities[item.id] > 0 && (
                                                <div style={{ position: 'absolute', top: '-8px', right: '12px', backgroundColor: '#2F855A', color: '#FFFFFF', fontSize: '0.65rem', fontWeight: '800', padding: '3px 8px', borderRadius: '20px', border: '2px solid #FAF9F5' }}>
                                                    {itemQuantities[item.id]} Selected
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    
                                </div>
                            </div>
                        </div>
                    )}
                    
                    <div style={verticalMenuWrapperStyle}> 
                        {sortedCategories.map(category => {
                            const query = menuSearchTerm.toLowerCase().trim();
                            const categoryMatches = category.toLowerCase().includes(query);
                            const matchingItems = menuData[category]?.filter(item => 
                                !query || item.name?.toLowerCase().includes(query) || categoryMatches
                            );

                            if (!matchingItems || matchingItems.length === 0) return null;

                            return (
                                <section key={category} style={elegantCategorySection}>
                                    <div style={categoryHeaderRow}>
                                        <h3 style={elegantCategoryTitle}>{category}</h3>
                                        <div style={{...categoryLine, backgroundColor: CATEGORY_COLORS[category] || '#eee'}} />
                                    </div>
                                    <div style={itemsGridStyle}> 
                                        {matchingItems.map(item => (
                                            <div key={item.id} style={{ ...elegantItemCard, opacity: item.isAvailable !== false ? 1 : 0.7, borderLeft: `5px solid ${CATEGORY_COLORS[category] || '#ccc'}` }} onClick={() => handleSelectItemForEdit(item)}>
                                                <div style={imageWrapper}>
                                                    <img src={item.imageUrl || 'https://via.placeholder.com/150'} alt={item.name} style={elegantImageStyle} onMouseEnter={() => setHoveredImage(item.imageUrl)} onMouseLeave={() => setHoveredImage(null)} />
                                                    {item.isAvailable === false && <div style={soldOutOverlay}>SOLD OUT</div>}
                                                </div>
                                                <div style={elegantItemInfo}>
                                                    <div style={itemMeta}>
                                                        <span style={elegantItemName}>{item.name}</span>
                                                        <span style={elegantItemPrice}>{currency}{item.price.toFixed(2)}</span>
                                                    </div>
                                                    {itemQuantities[item.id] > 0 && (
                                                        <div style={activeQtyBadge}>{itemQuantities[item.id]} in cart</div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                    
                    <div style={stickyFooter}>
                        <button onClick={handleContinueToDetails} style={elegantContinueButton}>
                            View Order • {currentOrderSummary.length} Items
                        </button>
                    </div>
                </div>
            )}

            {(isMenuDetailsPhase || isCustomOnlyMode) && (
                <div style={{...sectionStyleGuestForm, animation: 'fadeSlideUp 0.4s ease-out'}}>
                    <h2 style={headerStyleGuestForm}>{isCustomOnlyMode ? '✍️ Custom Order' : ' Order Details'}</h2>
                    <label style={{...labelStyle, marginBottom: '12px'}}>How can we serve you?</label>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '25px' }}>
                        {['Room Service', 'Dining Hall'].map((type) => (
                            <button key={type} type="button" onClick={() => setOrderType(type)} style={{ flex: 1, padding: '18px', borderRadius: '16px', borderWidth: '2px', borderStyle: 'solid', borderColor: orderType === type ? '#121212' : '#E8E8E1', backgroundColor: orderType === type ? '#121212' : '#FFFFFF', color: orderType === type ? '#FFFFFF' : '#4A4A4A', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: orderType === type ? '0 8px 20px rgba(0,0,0,0.12)' : 'none' }}>
                                {type === 'Room Service' ? '🛌 ' : '🍽️ '}{type}
                            </button>
                        ))}
                    </div>

                    {orderType === 'Room Service' ? (
                        <div style={{ padding: '20px', backgroundColor: '#FBFBF9', borderRadius: '20px', border: '1px solid #E8E8E1', marginBottom: '25px' }}>
                            <label style={{ ...labelStyle, color: validationErrors.room ? '#dc3545' : '#121212' }}>Search & Confirm Your Room:</label>
                            <input type="text" placeholder="Type room name ..." style={{ ...inputStyle, borderColor: validationErrors.room ? '#dc3545' : '#E8E8E1', backgroundColor: selectedRoom ? '#E8F5E9' : '#FFFFFF' }} value={roomSearchTerm} onChange={(e) => setRoomSearchTerm(e.target.value)} />
                            <select value={selectedRoom} onChange={e => handleRoomSelectChange(e.target.value)} style={{...selectStyle, marginBottom: 0, marginTop: '12px', border: selectedRoom ? '1px solid #A5D6A7' : '1px solid #E2E2E2'}}>
                                {availableRooms.length > 0 ? (
                                    <>
                                        <option value="">— Select Room —</option>
                                        {filteredRooms.map(r => <option key={r} value={r}>{r}</option>)}
                                    </>
                                ) : (
                                    <option value="">⚠️ No rooms configured</option>
                                )}
                            </select>
                            {selectedRoom && <div style={{ fontSize: '0.75rem', color: '#2E7D32', fontWeight: '700', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>✨ You Selected: {selectedRoom}</div>}
                            {validationErrors.room && <span style={{ color: '#dc3545', fontSize: '0.75rem', fontWeight: '600', display: 'block', marginTop: '6px' }}>⚠️ {validationErrors.room}</span>}
                        </div>
                    ) : (
                        <div style={{ marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{ ...labelStyle, color: validationErrors.guestName ? '#dc3545' : '#121212' }}>Your Full Name:</label>
                            <input type="text" placeholder="e.g. Nathaniel Antwi" style={{ ...inputStyle, borderColor: validationErrors.guestName ? '#dc3545' : '#E8E8E1', backgroundColor: validationErrors.guestName ? '#fff5f5' : '#FFFFFF' }} value={guestName || ''} onChange={(e) => { setGuestName(e.target.value); if(validationErrors.guestName) setValidationErrors(prev => ({...prev, guestName: null})); }} />
                            {validationErrors.guestName && <span style={{ color: '#dc3545', fontSize: '0.75rem', fontWeight: '600' }}>⚠️ {validationErrors.guestName}</span>}
                        </div>
                    )}
                 
                    <div style={{ marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ ...labelStyle, color: validationErrors.whatsapp ? '#dc3545' : '#121212' }}>WhatsApp Number:</label>
                        <input type="tel" placeholder="+233 24 123 4567" style={{ ...inputStyle, borderColor: validationErrors.whatsapp ? '#dc3545' : '#E8E8E1', backgroundColor: validationErrors.whatsapp ? '#fff5f5' : '#FFFFFF' }} value={whatsappNumber || ''} onChange={(e) => { const val = e.target.value.replace(/\s/g, ''); setWhatsappNumber(val); if(validationErrors.whatsapp) setValidationErrors(prev => ({...prev, whatsapp: null})); }} />
                        {validationErrors.whatsapp && <span style={{ color: '#dc3545', fontSize: '0.75rem', fontWeight: '600' }}>⚠️ {validationErrors.whatsapp}</span>}
                    </div>

                    <div style={{...specialOrderContainerStyle, backgroundColor: '#F0F4F8', borderLeft: '4px solid #0047AB'}}>
                        <h4 style={{...labelStyle, color: '#0047AB'}}>⭐ Special Request</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <input type="text" placeholder="e.g. Veg fried Rice" value={newSpecialItemName} onChange={(e) => setNewSpecialItemName(e.target.value)} style={{ ...inputStyle, marginBottom: 0, backgroundColor: '#FFFFFF' }} />
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E8E8E1', overflow: 'hidden' }}>
                                    <button onClick={() => setNewSpecialItemQty(Math.max(1, newSpecialItemQty - 1))} style={{ padding: '12px 18px', border: 'none', background: 'none', fontWeight: 'bold', cursor: 'pointer' }}>-</button>
                                    <span style={{ width: '40px', textAlign: 'center', fontWeight: 'bold' }}>{newSpecialItemQty}</span>
                                    <button onClick={() => setNewSpecialItemQty(newSpecialItemQty + 1)} style={{ padding: '12px 18px', border: 'none', background: 'none', fontWeight: 'bold', cursor: 'pointer' }}>+</button>
                                </div>
                                <button onClick={handleAddSpecialItem} style={{ ...addSpecialButtonStyle, flexGrow: 1, backgroundColor: '#0047AB', borderRadius: '12px' }}>Add to Order</button>
                            </div>
                        </div>
                        {specialOrders.map((item, index) => (
                            <div key={index} style={{...customItemListItemStyle, marginTop: '10px', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '10px'}}>
                                <span style={{ fontWeight: '600', color: '#121212' }}>{item.qty} × {item.name}</span>
                                <button onClick={() => handleRemoveSpecialItem(index)} style={removeCustomButtonStyle}>Remove</button>
                            </div>
                        ))}
                    </div>

                    <div style={{ backgroundColor: '#F7F7F2', borderRadius: '24px', padding: '24px', border: '1px solid #E8E8E1', marginTop: '25px' }}>
                        <h4 style={{ margin: '0 0 20px 0', fontSize: '0.75rem', color: '#999', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '800' }}>Your Selection</h4>
                        {currentOrderSummary.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                                <span style={{ fontWeight: '500', color: '#121212' }}><span style={{ color: '#0047AB', marginRight: '8px' }}>{item.qty}×</span>{item.name}</span>
                                <span style={{ fontWeight: '700', fontFamily: 'monospace', color: '#121212' }}>{item.price > 0 ? `${currency}${item.price.toFixed(2)}` : 'TBD'}</span>
                            </div>
                        ))}
                        {orderType === 'Room Service' && financialBreakdown.serviceCharge > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(0,0,0,0.05)', color: '#666', fontSize: '0.9rem' }}>
                                <span style={{ fontStyle: 'italic' }}>Room Service Fee</span>
                                <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>{currency}{financialBreakdown.serviceCharge.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: '25px' }}>
                        <label style={labelStyle}>Order Notes (Optional):</label>
                        <textarea placeholder="Allergies? Extra spice?" rows="2" style={{ ...inputStyle, height: 'auto', backgroundColor: '#FFFFFF' }} value={orderNotes || ''} onChange={(e) => setOrderNotes(e.target.value)} />
                    </div>

                    <div style={{...grandTotalRowStyle, borderTop: '2px solid #121212', paddingTop: '20px', marginTop: '25px'}}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: '10px' }}>
                            <span style={{ fontSize: '0.95rem', color: '#7A7A7A', fontWeight: '500' }}>Grand Total:</span>
                            <span style={{ fontSize: '2.2rem', fontWeight: '900', color: '#121212', letterSpacing: '-1px' }}>{currency}{financialBreakdown.grandTotal.toFixed(2)}</span>
                        </div>
                        {(specialOrders.length > 0 || currentOrderSummary.some(i => i.price === 0)) && (
                            <div style={{ color: '#0047AB', fontSize: '0.85rem', fontWeight: '700', marginTop: '8px', backgroundColor: '#EBF8FF', display: 'inline-block', padding: '4px 12px', borderRadius: '20px' }}>✨ Special Items TBD by Front Desk</div>
                        )}
                    </div>

                    <button onClick={placeOrder} disabled={loading} style={{...elegantContinueButton, marginTop: '30px', backgroundColor: loading ? '#666' : '#121212' }}>
                        {loading ? 'Processing...' : 'Place Order'}
                    </button>
                </div>
            )}
            
            {hoveredImage && <div style={imagePopOverStyle}><img src={hoveredImage} style={bigImageStyle} alt="Preview" /></div>}
            {isModalOpen && <CartItemEditor item={itemToEdit} onSave={handleSaveItemFromModal} onClose={() => setIsModalOpen(false)} currencySymbol={currency} />}
        </div>
    );
}

// --- MASTER GUEST STYLES (Unmodified & Intact) ---
const containerStyle = { maxWidth: '1200px', width: '100%', margin: '0 auto', padding: 'clamp(8px, 2vw, 20px)', fontFamily: "'Inter', -apple-system, sans-serif", backgroundColor: '#FBFBF9', boxSizing: 'border-box', minHeight: '100vh', color: '#121212' };
const menuContainerFadeIn = { animation: 'fadeIn 0.3s ease-out', paddingBottom: '120px' };
const verticalMenuWrapperStyle = { display: 'flex', flexDirection: 'column', gap: 'clamp(20px, 5vh, 40px)', marginTop: '10px' };
const menuHeaderSection = { textAlign: 'center', marginBottom: '20px' };
const elegantTitleStyle = { fontSize: 'clamp(1.2rem, 5vw, 2rem)', fontWeight: '900', color: '#1A1A1A', marginBottom: '10px' };
const headerStyleGuestForm = { textAlign: 'center', color: '#1A1A1A', paddingBottom: '8px', marginBottom: '15px', fontSize: '1.2rem', fontWeight: '700' };
const searchWrapper = { position: 'relative', width: '100%', maxWidth: '500px', margin: '0 auto' };
const searchIcon = { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.9rem', opacity: 0.3 };
const elegantSearchInput = { width: '100%', padding: '12px 12px 12px 40px', borderRadius: '12px', border: '1px solid #E2E2E2', fontSize: '1rem', outline: 'none', backgroundColor: '#FFFFFF', boxSizing: 'border-box' };
const elegantCategorySection = { marginBottom: '10px' };
const categoryHeaderRow = { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' };
const elegantCategoryTitle = { fontSize: '0.85rem', fontWeight: '800', color: '#7A7A7A', textTransform: 'uppercase', letterSpacing: '0.1em' };
const categoryLine = { height: '1px', flexGrow: 1, backgroundColor: '#E2E2E2' };
const itemsGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '12px', marginTop: '10px' };
const elegantItemCard = { display: 'flex', flexDirection: 'row', backgroundColor: '#FFFFFF', padding: '12px', gap: '12px', cursor: 'pointer', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', borderTop: '1px solid rgba(0,0,0,0.02)', borderRight: '1px solid rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.02)', position: 'relative', alignItems: 'flex-start', transition: 'transform 0.2s ease', WebkitTapHighlightColor: 'transparent', minHeight: '80px' };
const imageWrapper = { position: 'relative', width: '75px', height: '75px', flexShrink: 0, borderRadius: '50%', overflow: 'hidden' };
const elegantImageStyle = { width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' };
const soldOutOverlay = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', display: 'flex', justifyContainer: 'center', alignItems: 'center', fontSize: '0.6rem', fontWeight: '800', color: '#D32F2F', borderRadius: '50%' };
const elegantItemInfo = { display: 'flex', flexDirection: 'column', justifyContainer: 'flex-start', flexGrow: 1, minWidth: 0 };
const itemMeta = { display: 'flex', flexDirection: 'column', gap: '4px' };
const elegantItemName = { fontSize: 'clamp(0.95rem, 4vw, 1.1rem)', fontWeight: '600', color: '#2D3748', lineHeight: '1.3', whiteSpace: 'normal', wordWrap: 'break-word', overflow: 'visible' };
const elegantItemPrice = { fontSize: '0.9rem', fontWeight: '700', color: '#2B6CB0' };
const activeQtyBadge = { fontSize: '0.7rem', color: '#2F855A', fontWeight: 'bold' };
const stickyFooter = { position: 'fixed', bottom: '0', left: '50%', transform: 'translateX(-50%)', width: '100%', padding: '16px', backgroundColor: 'rgba(245, 245, 243, 0.95)', borderTop: '1px solid #E2E2E2', zIndex: 1000, textAlign: 'center' };
const elegantContinueButton = { width: '100%', maxWidth: '400px', padding: '20px', backgroundColor: '#121212', color: '#FFFFFF', border: 'none', borderRadius: '18px', fontSize: '1.1rem', fontWeight: '700', letterSpacing: '0.5px', boxShadow: '0 12px 24px rgba(0,0,0,0.15)', cursor: 'pointer', transition: 'transform 0.2s ease' };
const selectStyle = { padding: '12px', width: '100%', marginBottom: '10px', borderRadius: '10px', border: '1px solid #E2E2E2', fontSize: '1rem', boxSizing: 'border-box', backgroundColor: '#FFFFFF' };
const inputStyle = { padding: '18px', borderRadius: '16px', borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#E8E8E1', boxSizing: 'border-box', width: '100%', fontSize: '1rem', backgroundColor: '#FFFFFF', transition: 'all 0.2s ease', outline: 'none', color: '#121212' };
const sectionStyleGuestForm = { marginBottom: '20px', padding: '32px', backgroundColor: '#FFFFFF', borderRadius: '28px', boxShadow: '0 20px 40px rgba(0,0,0,0.03)', border: '1px solid #E8E8E1', transition: 'all 0.3s ease' };
const imagePopOverStyle = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)', padding: '8px', borderRadius: '50%', pointerEvents: 'none', display: 'flex', justifyContainer: 'center', alignItems: 'center' };
const bigImageStyle = { width: 'min(70vw, 400px)', height: 'min(70vw, 400px)', borderRadius: '50%', objectFit: 'cover', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', border: '4px solid white' };
const grandTotalRowStyle = { marginTop: '12px', padding: '12px 0', borderTop: '1px dashed #E2E2E2', fontSize: '1.2rem', fontWeight: '800', textAlign: 'right' };
const labelStyle = { fontWeight: '600', display: 'block', marginBottom: '4px', fontSize: '0.85rem' }; 
const backButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', backgroundColor: '#F4F3EE', color: '#2C2C29', border: 'none', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s ease', letterSpacing: '0.5px' };
const clearButtonStyle = { padding: '10px 18px', backgroundColor: 'transparent', color: '#C94A4A', border: '1px solid #EEDCDD', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s ease', letterSpacing: '0.5px' };
const specialOrderContainerStyle = { padding: '20px', backgroundColor: '#F0F4F8', borderRadius: '20px', marginTop: '20px', borderLeft: '4px solid #0047AB' };
const customItemListItemStyle = { display: 'flex', justifyContainer: 'space-between', padding: '4px 0' };
const removeCustomButtonStyle = { border: 'none', color: '#C53030', background: 'none', fontWeight: 'bold', cursor: 'pointer' };
const addSpecialButtonStyle = { padding: '8px 16px', backgroundColor: '#2B6CB0', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' };
const premiumLandingButtonStyle = { display: 'flex', alignItems: 'center', gap: '20px', padding: '24px', width: '100%', backgroundColor: '#121212', color: '#FFFFFF', border: 'none', borderRadius: '24px', fontSize: '1.1rem', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', WebkitTapHighlightColor: 'transparent', position: 'relative', overflow: 'hidden' };

export default GuestOrderForm;