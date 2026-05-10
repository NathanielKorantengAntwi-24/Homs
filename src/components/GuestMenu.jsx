import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore'; 
import { db } from '../config/firebase'; 
import CartItemEditor from './CartItemEditor';

function GuestMenu({ onOrderConfirmed }) {
    const [menuItems, setMenuItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [cart, setCart] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [itemToEdit, setItemToEdit] = useState(null);
    const [loading, setLoading] = useState(true);

    // --- 1. Real-Time Production Stream ---
    useEffect(() => {
        // Query only items marked as available in your database
        const q = query(collection(db, 'menu'), where("isAvailable", "==", true));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const itemsList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setMenuItems(itemsList);
            setLoading(false);
        }, (error) => {
            console.error("Menu Stream Error:", error);
            setLoading(false);
        });

        return () => unsubscribe(); // Cleanup listener on unmount
    }, []);

    // --- New: Dual-Field Search Logic ---
    const filteredMenuItems = useMemo(() => {
    // 1. Clean the user's search input
    const query = searchTerm.toLowerCase().trim();
    
    // 2. If nothing is typed, return everything immediately
    if (!query) return menuItems;

    return menuItems.filter(item => {
        // 3. Clean the Name field for comparison
        const itemName = (item.name || "").toString().toLowerCase().trim();
        
        // 4. Clean the Category field for comparison (The line you asked about)
        const itemCategory = (item.category || "").toString().toLowerCase().trim();
        
        const nameMatch = itemName.includes(query);
        const categoryMatch = itemCategory.includes(query);
        
        // 5. Show the item if EITHER matches
        return nameMatch || categoryMatch;
    });
}, [menuItems, searchTerm]);



    // --- 2. Handlers for Menu Interaction ---
    const handleSelectItem = (item) => {
        const existingCartItem = cart.find(i => i.menuItemId === item.id);
        if (existingCartItem) {
            setItemToEdit(existingCartItem);
        } else {
            setItemToEdit({ 
                menuItemId: item.id, 
                name: item.name,
                price: item.price, 
                quantity: 1 
            });
        }
        setIsEditing(true);
    };

    const handleSaveItem = (updatedItem) => {
        setCart(prevCart => {
            const existingIndex = prevCart.findIndex(i => i.menuItemId === updatedItem.menuItemId);
            if (existingIndex > -1) {
                if (updatedItem.quantity > 0) {
                    const newCart = [...prevCart];
                    newCart[existingIndex] = updatedItem;
                    return newCart;
                } else {
                    return prevCart.filter(item => item.menuItemId !== updatedItem.menuItemId);
                }
            } else if (updatedItem.quantity > 0) {
                return [...prevCart, updatedItem];
            }
            return prevCart;
        });
        setIsEditing(false);
        setItemToEdit(null);
    };

    const handleConfirmOrder = () => {
        if (cart.length > 0) {
            onOrderConfirmed(cart);
        } else {
            alert("Please select at least one item.");
        }
    };

    if (loading) return <div style={loaderStyle}>Syncing with London...</div>;
    
    return (
    <div style={containerStyle}>
        <h2 style={headerStyle}>Select Your Dishes</h2>

        {/* 🔍 The Search Bar */}
        <div style={{ marginBottom: '20px' }}>
            <input 
                type="text" 
                placeholder="Search by food or category (e.g. Breakfast)..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={searchInputStyle}
            />
        </div>

        <div style={gridStyle}>
            {filteredMenuItems.map(item => (
                <div key={item.id} style={cardStyle} onClick={() => handleSelectItem(item)}>
                    {/* Item Image */}
                    {item.imageUrl && (
                        <img src={item.imageUrl} alt={item.name} style={imageStyle} />
                    )}
                    
                    <div style={contentStyle}>
                        {/* 1. The Item Name (Always Visible) */}
                        <h3 style={nameStyle}>{item.name}</h3>
                        
                        {/* 2. The Category (Helps confirm why it appeared in search) */}
                        <p style={categoryLabelStyle}>{item.category}</p>

                        {/* 3. Price */}
                        <p style={priceStyle}>GH₵{item.price.toFixed(2)}</p>
                        
                        {/* 4. Selection Badge */}
                        {cart.find(i => i.menuItemId === item.id) && (
                            <div style={badgeStyle}>
                                Qty: {cart.find(i => i.menuItemId === item.id).quantity}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>

        {/* Sticky Cart Summary */}
        <div style={cartSummaryStyle}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.8rem', color: '#cbd5e0' }}>Total Amount</span>
                <span style={{ fontSize: '1.2rem', fontWeight: '800' }}>
                    GH₵{cart.reduce((total, item) => total + (item.price * item.quantity), 0).toFixed(2)}
                </span>
            </div>
            <button 
                onClick={handleConfirmOrder} 
                disabled={cart.length === 0}
                style={cart.length > 0 ? activeConfirmBtn : disabledConfirmBtn}
            >
                Order {cart.length} Items
            </button>
        </div>

        {isEditing && (
            <CartItemEditor 
                item={itemToEdit}
                onSave={handleSaveItem}
                onClose={() => setIsEditing(false)}
            />
        )}
    </div>
);
}

// --- MASTER GUEST STYLES ---
const containerStyle = { padding: '20px', paddingBottom: '120px' };
const headerStyle = { fontSize: '1.6rem', fontWeight: '800', color: '#1a202c', marginBottom: '20px' };

// NEW: Search Input Style
const searchInputStyle = {
    width: '100%',
    padding: '14px 20px',
    borderRadius: '14px',
    border: '1px solid #e2e8f0',
    background: '#fff',
    fontSize: '1rem',
    outline: 'none',
    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
    color: '#1a202c'
};

const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px' };
const cardStyle = { background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', cursor: 'pointer' };
const imageStyle = { width: '100%', height: '120px', objectFit: 'cover' };
const contentStyle = { padding: '12px' };
const nameStyle = { margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#2d3748' };

// NEW: Category Label Style
const categoryLabelStyle = {
    fontSize: '0.7rem',
    color: '#718096',
    textTransform: 'uppercase',
    fontWeight: '700',
    margin: '2px 0',
    letterSpacing: '0.5px'
};

const priceStyle = { margin: '4px 0', color: '#3182ce', fontWeight: '800' };
const badgeStyle = { backgroundColor: '#ebf8ff', color: '#3182ce', padding: '4px 8px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold', textAlign: 'center' };
const loaderStyle = { textAlign: 'center', padding: '100px', fontSize: '1.1rem', color: '#718096' };

const cartSummaryStyle = {
    position: 'fixed', bottom: '25px', left: '20px', right: '20px',
    background: '#1a202c', color: '#fff', padding: '18px 25px',
    borderRadius: '24px', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', zIndex: 10
};

const activeConfirmBtn = {
    background: '#3182ce', color: '#fff', border: 'none', padding: '12px 24px',
    borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer'
};

const disabledConfirmBtn = {
    ...activeConfirmBtn, background: '#4a5568', cursor: 'not-allowed', opacity: 0.6
};

export default GuestMenu;