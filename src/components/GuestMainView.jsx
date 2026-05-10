import React, { useState } from 'react';
import GuestOrderForm from './GuestOrderForm';
import GuestTracker from './GuestTracker';

const MOCK_GUEST_ID = "G_40201"; 

function GuestMainView({ guestId = MOCK_GUEST_ID }) {
    const [activeTab, setActiveTab] = useState('new'); 

    // This ensures the CSS rules are injected into the page head
    const AnimationStyles = () => (
        <style>{`
            @keyframes slideUp {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .premium-nav-button {
                flex: 1;
                padding: 14px 10px;
                border: none;
                background: transparent;
                border-radius: 40px;
                font-size: 0.85rem;
                font-weight: 800;
                color: #A0A0A0;
                cursor: pointer;
                transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
                letter-spacing: 0.5px;
                text-transform: uppercase;
            }
            .premium-nav-button.active {
                background-color: #121212 !important; /* Carbon Black */
                color: #FFFFFF !important;
                box-shadow: 0 10px 20px rgba(0,0,0,0.15);
                transform: scale(1.02);
            }
            .premium-nav-button:hover:not(.active) {
                color: #0047AB;
                background-color: rgba(0, 71, 171, 0.05);
            }
        `}</style>
    );

    const handleOrderSuccess = () => {
        setActiveTab('active');
    };

    return (
        <div style={pageContainerStyle}>
            <AnimationStyles />

            <header style={headerStyle}>
                <h1 style={brandTitleStyle}>Algrace Concierge</h1>
                <div style={statusBadgeStyle}>
                    <span style={liveDot}></span> GUEST PORTAL • {guestId}
                </div>
            </header>

            {/* THE SEGMENTED NAV BAR */}
            <div style={navWrapper}>
                <nav style={segmentedControlStyle}>
                    <button 
                        onClick={() => setActiveTab('new')} 
                        className={`premium-nav-button ${activeTab === 'new' ? 'active' : ''}`}
                    >
                        New Order
                    </button>
                    <button 
                        onClick={() => setActiveTab('active')} 
                        className={`premium-nav-button ${activeTab === 'active' ? 'active' : ''}`}
                    >
                        Status
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')} 
                        className={`premium-nav-button ${activeTab === 'history' ? 'active' : ''}`}
                    >
                        History
                    </button>
                </nav>
            </div>

            <main style={{ animation: 'slideUp 0.5s ease-out' }}>
                {activeTab === 'new' && (
                    <GuestOrderForm guestId={guestId} onOrderSuccess={handleOrderSuccess} />
                )}

                {activeTab === 'active' && (
                    <GuestTracker guestId={guestId} />
                )}

                {activeTab === 'history' && (
                    <div style={emptyStateStyle}>
                        <div style={{ fontSize: '3rem', marginBottom: '20px', opacity: 0.2 }}>📜</div>
                        <h3 style={{ fontWeight: '800', color: '#121212' }}>Archive Empty</h3>
                        <p style={{ fontSize: '0.9rem', color: '#888' }}>Your digital history starts after your first order.</p>
                    </div>
                )}
            </main>

            <footer style={footerStyle}>
                ALGRACE SYSTEMS • DIGITAL SOLUTIONS
            </footer>
        </div>
    );
}

// --- MASTER STYLES ---

const pageContainerStyle = {
    padding: '24px',
    backgroundColor: '#F7F7F5', // Stone White
    minHeight: '100vh',
    fontFamily: "'Inter', sans-serif",
};

const headerStyle = {
    textAlign: 'center',
    marginBottom: '40px',
    marginTop: '20px'
};

const brandTitleStyle = {
    fontSize: '1rem',
    fontWeight: '950',
    letterSpacing: '3px',
    textTransform: 'uppercase',
    color: '#121212',
    margin: 0
};

const statusBadgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.65rem',
    fontWeight: '800',
    color: '#0047AB',
    letterSpacing: '1.5px',
    marginTop: '10px',
    padding: '6px 16px',
    backgroundColor: '#FFFFFF',
    borderRadius: '50px',
    border: '1px solid #E8E8E1'
};

const liveDot = {
    width: '6px',
    height: '6px',
    backgroundColor: '#0047AB',
    borderRadius: '50%',
    boxShadow: '0 0 8px #0047AB'
};

const navWrapper = {
    position: 'sticky',
    top: '20px',
    zIndex: 1000,
    marginBottom: '50px'
};

const segmentedControlStyle = {
    display: 'flex',
    backgroundColor: '#FFFFFF',
    padding: '6px',
    borderRadius: '50px',
    maxWidth: '550px',
    margin: '0 auto',
    border: '1px solid #EAEAEA',
    boxShadow: '0 15px 35px rgba(0,0,0,0.05)', // Floating effect
};

const emptyStateStyle = {
    textAlign: 'center',
    padding: '100px 20px',
    backgroundColor: '#FFFFFF',
    borderRadius: '32px',
    border: '1px solid #E8E8E1'
};

const footerStyle = {
    marginTop: 'auto',
    padding: '60px 0 30px 0',
    textAlign: 'center',
    fontSize: '0.6rem',
    letterSpacing: '4px',
    color: '#CCC',
    fontWeight: '700'
};

export default GuestMainView;