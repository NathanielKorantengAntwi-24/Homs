import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore'; 
import { db } from '../config/firebase'; 
import CartItemEditor from './CartItemEditor'; // Component to create in Step 2

// Mock Menu Data structure (You will replace this with your actual database fetch)
// Assumed structure: { id: 'B01', name: 'Breakfast Deluxe', price: 15, imageUrl: '...' }

// This component will live in your main order page (e.g., GuestOrderForm.jsx)
function GuestMenu({ onOrderConfirmed }) {
    const [menuItems, setMenuItems] = useState([]);
    const [cart, setCart] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [itemToEdit, setItemToEdit] = useState(null);
    const [loading, setLoading] = useState(true);

    // --- 1. Fetch Menu Items (From 'menu' or equivalent collection) ---
    useEffect(() => {
        const fetchMenu = async () => {
            try {
                // NOTE: Assume menu items are stored in a 'menu' collection
                const menuCollection = collection(db, 'menu');
                const menuSnapshot = await getDocs(menuCollection);
                const itemsList = menuSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setMenuItems(itemsList);
                setLoading(false);
            } catch (error) {
                console.error("Error fetching menu items:", error);
                // Optionally display error message to user
                setLoading(false);
            }
        };

        fetchMenu();
    }, []);

    // --- 2. Handlers for Menu Interaction ---

    // Handles the selection of a new item or editing an existing one
    const handleSelectItem = (item) => {
        // Find if this item is already in the cart (to edit existing quantity)
        const existingCartItem = cart.find(i => i.menuItemId === item.id);

        if (existingCartItem) {
            setItemToEdit(existingCartItem);
        } else {
            // New item, set initial quantity to 1 for the editor
            setItemToEdit({ 
                menuItemId: item.id, 
                name: item.name,
                price: item.price, 
                quantity: 1 
            });
        }
        setIsEditing(true);
    };

    // Handles changes/saving from the CartItemEditor modal
    const handleSaveItem = (updatedItem) => {
        setCart(prevCart => {
            const existingIndex = prevCart.findIndex(i => i.menuItemId === updatedItem.menuItemId);

            if (existingIndex > -1) {
                // Item exists: update quantity or remove if quantity is 0
                if (updatedItem.quantity > 0) {
                    const newCart = [...prevCart];
                    newCart[existingIndex] = updatedItem;
                    return newCart;
                } else {
                    // Remove item if quantity is 0
                    return prevCart.filter(item => item.menuItemId !== updatedItem.menuItemId);
                }
            } else if (updatedItem.quantity > 0) {
                // New item: add to cart
                return [...prevCart, updatedItem];
            }
            return prevCart; // Should not happen if logic is correct
        });
        
        setIsEditing(false);
        setItemToEdit(null);
    };

    const handleConfirmOrder = () => {
        if (cart.length > 0) {
            // Passes the final cart items up to the parent component (GuestOrderForm)
            onOrderConfirmed(cart);
        } else {
            alert("Please select at least one item.");
        }
    };

    if (loading) return <div>Loading Menu...</div>;
    
    // --- Render Logic ---
    return (
        <div className="guest-menu">
            <h2>Select Your Items</h2>
            <div className="menu-grid">
                {menuItems.map(item => (
                    <div key={item.id} className="menu-item-card" onClick={() => handleSelectItem(item)}>
                        {/* 🛑 NOTE: Create a 'menu' collection in Firestore 
                            and add fields: name, price (number), imageUrl (string URL) 
                            for this to display correctly. */}
                        {/*  */}
                        {item.imageUrl && <img src={item.imageUrl} alt={item.name} style={{ width: '100px', height: '100px', objectFit: 'cover' }} />}
                        <h3>{item.name}</h3>
                        <p>${item.price.toFixed(2)}</p>
                        {/* Display current quantity in cart if present */}
                        {cart.find(i => i.menuItemId === item.id) && (
                            <span className="cart-quantity">
                                Qty: {cart.find(i => i.menuItemId === item.id).quantity}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            <div className="cart-summary">
                <h4>Cart Total: ${cart.reduce((total, item) => total + (item.price * item.quantity), 0).toFixed(2)}</h4>
                <button onClick={handleConfirmOrder} disabled={cart.length === 0}>
                    Continue to Order Form ({cart.length} Items)
                </button>
            </div>

            {/* Modal/Overlay for Editing Quantity */}
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

export default GuestMenu;