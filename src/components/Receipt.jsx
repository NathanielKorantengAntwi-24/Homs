import React from 'react';

const CURRENCY_SYMBOL = 'GH₵';

const Receipt = ({ order, onClose }) => {
    if (!order) return null;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div style={modalOverlayStyle}>
            <div style={receiptContainerStyle} className="printable-receipt">
                <button onClick={onClose} style={closeButtonStyle}>✕ Close</button>
                
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: '0 0 5px 0' }}>HOMS RECEIPT</h2>
                    <p style={{ fontSize: '0.8rem', color: '#666', margin: 0 }}>Hotel Order Management System</p>
                    <hr style={{ border: '1px dashed #eee', margin: '15px 0' }} />
                </div>

                <div style={receiptRow}>
                    <span><strong>Order ID:</strong></span>
                    <span>#{order.id.slice(-8).toUpperCase()}</span>
                </div>
                <div style={receiptRow}>
                    <span><strong>Date:</strong></span>
                    <span>{new Date(order.paidAt?.seconds * 1000).toLocaleString()}</span>
                </div>
                <div style={receiptRow}>
                    <span><strong>Payment Ref:</strong></span>
                    <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{order.paystackReference}</span>
                </div>
                <div style={receiptRow}>
                    <span><strong>Location:</strong></span>
                    <span>{order.roomNumber || order.dispatchLocation}</span>
                </div>

                <div style={{ margin: '20px 0' }}>
                    <h4 style={{ borderBottom: '1px solid #eee', paddingBottom: '5px' }}>Items</h4>
                    {order.items?.map((item, idx) => (
                        <div key={idx} style={receiptRow}>
                            <span>{item.qty}x {item.name}</span>
                            <span>{CURRENCY_SYMBOL}{(item.qty * item.price).toFixed(2)}</span>
                        </div>
                    ))}
                </div>

                <div style={{ borderTop: '2px solid #000', paddingTop: '10px' }}>
                    <div style={{ ...receiptRow, fontSize: '1.2rem', fontWeight: 'bold' }}>
                        <span>TOTAL PAID</span>
                        <span>{CURRENCY_SYMBOL}{order.financials?.grandTotal.toFixed(2)}</span>
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '30px' }}>
                    <p style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>Thank you for your patronage!</p>
                    <button onClick={handlePrint} style={printButtonStyle} className="no-print">
                        🖨️ Print / Save as PDF
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- STYLES ---
const modalOverlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex',
    justifyContent: 'center', alignItems: 'center', zIndex: 1000
};

const receiptContainerStyle = {
    backgroundColor: '#fff', padding: '30px', borderRadius: '8px',
    width: '90%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
    position: 'relative'
};

const receiptRow = { display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' };

const closeButtonStyle = {
    position: 'absolute', top: '10px', right: '10px',
    border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem'
};

const printButtonStyle = {
    marginTop: '15px', padding: '10px 20px', backgroundColor: '#3498db',
    color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold'
};

export default Receipt;