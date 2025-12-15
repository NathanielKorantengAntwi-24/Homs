// src/components/GuestMainView.jsx

import React, { useRef, useState } from 'react';
import GuestOrderForm from './GuestOrderForm';
import GuestTracker from './GuestTracker';

// NOTE: This assumes the actual guestId is passed down from the parent App/Auth context.
// Using a mock ID for standalone demonstration consistency.
const MOCK_GUEST_ID = "G_40201"; 

function GuestMainView({ guestId = MOCK_GUEST_ID }) {
    
    // Ref to target the tracker section for scrolling
    const trackerRef = useRef(null);
    // State used to force a re-render/data refresh in the tracker after order placement
    const [lastOrderTime, setLastOrderTime] = useState(null);

    // Handler passed to the GuestOrderForm component
    const handleOrderSuccess = () => {
        // 1. Update state to trigger tracker refresh
        setLastOrderTime(Date.now()); 
        
        // 2. Scroll to the tracker section
        if (trackerRef.current) {
            trackerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <div style={pageContainerStyle}>
            <h1 style={mainHeaderStyle}>
                🍽️ Guest Service Center 
                <span style={{ fontSize: '0.6em', color: '#6c757d', display: 'block', marginTop: '5px' }}>
                    (Guest: {guestId})
                </span>
            </h1>

            {/* Responsive Flex Layout Container */}
            <div style={contentLayout}>
                
                {/* 1. Ordering Section (Takes ~60% space on wide screens) */}
                <div style={orderFormWrapperStyle}>
                    <GuestOrderForm 
                        guestId={guestId} 
                        onOrderSuccess={handleOrderSuccess} 
                    />
                </div>

                {/* 2. Tracker Section (Takes ~40% space on wide screens) */}
                <div ref={trackerRef} style={trackerWrapperStyle}>
                    <GuestTracker 
                        // Passing key forces re-render/re-fetch on order success
                        key={lastOrderTime} 
                    /> 
                </div>
            </div>
        </div>
    );
}

// --- Styles for the Combined Responsive View ---

const pageContainerStyle = {
    padding: '20px',
    backgroundColor: '#f0f4f7', 
    minHeight: '100vh',
    fontFamily: 'sans-serif',
};

const mainHeaderStyle = {
    textAlign: 'center',
    color: '#007bff',
    marginBottom: '20px',
    paddingBottom: '10px',
    borderBottom: '2px solid #e9ecef'
};

const contentLayout = {
    display: 'flex',
    flexWrap: 'wrap', // Allows wrapping to stack vertically on small screens
    gap: '20px',
    margin: '0 auto',
    maxWidth: '1400px', // Matches max width of GuestOrderForm
    alignItems: 'flex-start', // Keeps the columns aligned to the top
};

const orderFormWrapperStyle = {
    // Flex: grow | shrink | basis
    // On wide screens, takes a base of 650px (Form's target width)
    flex: '2 1 650px', 
    minWidth: '350px', 
};

const trackerWrapperStyle = {
    // On wide screens, takes a base of 350px (Tracker's content width)
    flex: '1 1 350px', 
    minWidth: '300px',
    // Force the inner content (GuestTracker) to occupy the full width of this wrapper
    width: '100%', 
};


export default GuestMainView;