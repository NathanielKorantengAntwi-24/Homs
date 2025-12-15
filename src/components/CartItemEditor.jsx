import React, { useState } from 'react';

function CartItemEditor({ item, onSave, onClose, currencySymbol }) {
    const [quantity, setQuantity] = useState(item.quantity);

    const handleQuantityChange = (e) => {
        const newQuantity = Math.max(0, parseInt(e.target.value) || 0);
        setQuantity(newQuantity);
    };

    const handleIncrement = () => setQuantity(prev => prev + 1);
    const handleDecrement = () => setQuantity(prev => Math.max(0, prev - 1));

    const handleSubmit = () => {
        onSave({ ...item, quantity: quantity });
    };

    // Basic Styles for the Modal (You should improve these with CSS)
    const modalBackdrop = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', 
        justifyContent: 'center', alignItems: 'center', zIndex: 1000
    };
    const modalContent = {
        backgroundColor: 'white', padding: '25px', borderRadius: '10px', 
        maxWidth: '400px', width: '90%', boxShadow: '0 5px 15px rgba(0,0,0,0.3)'
    };

    return (
        <div style={modalBackdrop}>
            <div style={modalContent}>
                <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '15px' }}>
                    Customize Order: {item.name}
                </h3>
                <p style={{ fontWeight: 'bold' }}>
                    Price: {currencySymbol}{item.price.toFixed(2)}
                </p>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '20px 0' }}>
                    <button onClick={handleDecrement} disabled={quantity <= 0} style={{ padding: '10px 15px', fontSize: '1.2rem', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px' }}>-</button>
                    <input 
                        type="number" 
                        value={quantity} 
                        onChange={handleQuantityChange}
                        min="0"
                        style={{ width: '80px', margin: '0 10px', padding: '10px', textAlign: 'center', fontSize: '1.2rem', borderRadius: '5px', border: '1px solid #ccc' }}
                    />
                    <button onClick={handleIncrement} style={{ padding: '10px 15px', fontSize: '1.2rem', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px' }}>+</button>
                </div>
                <p style={{textAlign: 'center', fontSize: '1.1rem'}}>Total: {currencySymbol}{(item.price * quantity).toFixed(2)}</p>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                    <button onClick={handleSubmit} style={{ padding: '10px 15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                        {quantity > 0 ? `Update Cart (${quantity})` : 'Remove from Cart'}
                    </button>
                    <button onClick={onClose} style={{ padding: '10px 15px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Cancel</button>
                </div>
            </div>
        </div>
    );
}

export default CartItemEditor;