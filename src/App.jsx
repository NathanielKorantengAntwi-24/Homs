// src/App.jsx
import React, { useRef, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth'; 
import { collection, query, where, getDocs } from 'firebase/firestore'; 
import { db } from './config/firebase'; 

// Import all core components
import GuestLogin from './components/GuestLogin'; 
import GuestOrderForm from './components/GuestOrderForm';
import GuestTracker from './components/GuestTracker';
import FrontDeskDashboard from './components/FrontDeskDashboard';
import FrontDeskArchival from './components/FrontDeskArchival'; // Still used by FD
import KitchenDashboard from './components/KitchenDashboard'; // The new dedicated kitchen view
import AccountDashboard from './components/AccountDashboard'; 
import ManagerDashboard from './components/ManagerDashboard'; 

// Default Room (This is maintained but no longer displayed on GuestPage)
const DEFAULT_ROOM = "305"; 
const ACTIVE_STATUSES = [1, 2, 3, 4, 5, 6];

// Helper function to derive a display name from the Firebase User object
const getUserDisplayName = (user) => {
    if (!user) return "Guest";
    
    // 1. Prefer Firebase/Google Display Name (set in GuestLogin.js)
    if (user.displayName) return user.displayName.split(' ')[0]; 

    // 2. Use Phone Number (formatted)
    if (user.phoneNumber) {
        // Display last 8 digits for brevity
        const p = user.phoneNumber;
        return p.length > 5 ? p.substring(p.length - 8) : p;
    }

    // 3. Use Email (before the @)
    if (user.email) return user.email.split('@')[0];

    // 4. Fallback to UID
    return user.uid.substring(0, 8);
};

// Function to check for active orders
const checkForActiveOrders = async (guestId) => {
    if (!guestId) return false;
    try {
        const q = query(
            collection(db, 'orders'),
            where('guestId', '==', guestId),
            where('currentStatus', 'in', ACTIVE_STATUSES)
        );
        const snapshot = await getDocs(q);
        return !snapshot.empty;
    } catch (error) {
        console.error("Error checking for active orders:", error);
        return false;
    }
};


// --- 1. PORTAL / LANDING PAGE COMPONENT (REMAINS THE SAME) ---
const LandingPage = () => {
    return (
        <div style={landingContainerStyle}>
            <h2 style={{ marginBottom: '30px', color: '#2C3E50' }}>Select Your Portal</h2>
            <div style={gridContainerStyle}>
                
                <Link to="/guest" style={{ textDecoration: 'none' }}>
                    <div style={{ ...cardStyle, borderTop: '5px solid #007bff' }}>
                        <div style={iconStyle}>🏨</div>
                        <h3>Guest View</h3>
                        <p style={descStyle}>Order Tracking</p>
                    </div>
                </Link>

                {/* Staff Link now points to the new Staff Selection Page */}
                <Link to="/staff" style={{ textDecoration: 'none' }}>
                    <div style={{ ...cardStyle, borderTop: '5px solid #ffc107' }}>
                        <div style={iconStyle}>🛎️</div>
                        <h3>Staff Operations</h3>
                        <p style={descStyle}>Front Desk & Kitchen</p>
                    </div>
                </Link>

                <Link to="/account" style={{ textDecoration: 'none' }}>
                    <div style={{ ...cardStyle, borderTop: '5px solid #17a2b8' }}>
                        <div style={iconStyle}>📊</div>
                        <h3>Account Office</h3>
                        <p style={descStyle}>Account Office</p>
                    </div>
                </Link>

                <Link to="/manager" style={{ textDecoration: 'none' }}>
                    <div style={{ ...cardStyle, borderTop: '5px solid #28a745' }}>
                        <div style={iconStyle}>📈</div>
                        <h3>General Manager</h3>
                        <p style={descStyle}>High-Level Monitoring & Stats</p>
                    </div>
                </Link>

            </div>
        </div>
    );
};

// --- 2. WRAPPER COMPONENTS ---

// Authenticated Guest Page Wrapper (REMAINS THE SAME)
const GuestPage = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Tracks the current view: 'order', 'active', or 'history'
    const [currentView, setCurrentView] = useState('order'); 
    const [orderSuccessTrigger, setOrderSuccessTrigger] = useState(null); 

    const auth = getAuth();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            
            // PERSISTENCE FIX: Check for active orders when user state changes
            if (currentUser) {
                const hasActiveOrders = await checkForActiveOrders(currentUser.uid);
                // If the user has active orders, default them to the 'active' tracker view
                setCurrentView(hasActiveOrders ? 'active' : 'order');
            } else {
                setCurrentView('order');
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [auth]);

    // Switches the view to the 'active' tracker upon successful order submission
    const handleOrderSuccess = () => {
        setOrderSuccessTrigger(Date.now()); 
        setCurrentView('active'); 
    };

    const handleLogout = () => {
    if (window.confirm("Are you sure you want to sign out?")) {
        signOut(auth)
            .then(() => {
                navigate('/guest'); 
            })
            .catch((error) => {
                console.error("Sign out error:", error);
            });
    }
};


    if (loading) return <div>Loading...</div>;

    // 🔒 AUTH GUARD: If not logged in, show Login Screen
    if (!user) {
        return (
            <div style={pageWrapperStyle}>
                <button onClick={() => navigate('/')} style={homeButtonStyle}>🏠 Home</button>
                <GuestLogin onLoginSuccess={(u) => setUser(u)} />
            </div>
        );
    }

    // --- LOGGED IN: Show Guest Dashboard with View Switching ---
    const displayName = getUserDisplayName(user);
    
    // Helper to get button style
    const getNavButtonStyle = (view) => (
        view === currentView ? activeNavButtonStyle : inactiveNavButtonStyle
    );

    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/')} style={homeButtonStyle}>🏠 Home</button>
            <button onClick={handleLogout} style={logoutButtonStyle}>Sign Out</button>
            
            <div style={sectionStyle}>
                
                <h2 style={{color: '#007bff', borderBottom: '2px solid #eee', paddingBottom: '10px'}}>
                    Welcome, {displayName}!
                </h2>

                {/* Three-Way Navigation Buttons */}
                <div style={navButtonContainerStyle}>
                    <button 
                        onClick={() => setCurrentView('order')} 
                        style={getNavButtonStyle('order')}
                    >
                        📝 New Order
                    </button>
                    <button 
                        onClick={() => setCurrentView('active')} 
                        style={getNavButtonStyle('active')}
                    >
                        🚀 Active Tracker
                    </button>
                    <button 
                        onClick={() => setCurrentView('history')} 
                        style={getNavButtonStyle('history')}
                    >
                        📦 Order History
                    </button>
                </div>

                {currentView === 'order' && (
                    <div style={contentWrapperStyle}>
                        <GuestOrderForm 
                            guestId={user.uid} 
                            onOrderSuccess={handleOrderSuccess}
                        />
                    </div>
                )}
                
                {currentView === 'active' && (
                    <div style={contentWrapperStyle}>
                        <h3 style={viewTitleStyle}>Live Tracking (In Progress)</h3>
                        <GuestTracker 
                            key={`active-${orderSuccessTrigger}`} 
                            guestId={user.uid}
                            viewMode={'active'} // Pass mode to render only active list
                        /> 
                    </div>
                )}
                
                {currentView === 'history' && (
                    <div style={contentWrapperStyle}>
                        <h3 style={viewTitleStyle}>Completed & Cancelled History</h3>
                        <GuestTracker 
                            key={`history-${orderSuccessTrigger}`} 
                            guestId={user.uid}
                            viewMode={'history'} // Pass mode to render only history list
                        /> 
                    </div>
                )}

            </div>
        </div>
    );
};

// --- NEW: STAFF ROLE SELECTION / AUTH PAGE ---
const StaffPortal = () => {
    const navigate = useNavigate();
    
    // NOTE: This is where you would place the main Staff Login component later.
    // For now, it acts as the selector for the unauthenticated dashboards.

    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/')} style={homeButtonStyle}>🏠 Home</button>
            <div style={landingContainerStyle}>
                <h2 style={{ marginBottom: '30px', color: '#ffc107' }}>Staff Login Portal</h2>
                <p style={{marginBottom: '30px'}}>Please select your department dashboard.</p>
                <div style={gridContainerStyle}>
                    
                    {/* Link to Front Desk Dashboard */}
                    <Link to="/staff/frontdesk" style={{ textDecoration: 'none' }}>
                        <div style={{ ...cardStyle, borderTop: '5px solid #ffc107' }}>
                            <div style={iconStyle}>🛎️</div>
                            <h3>Front Desk</h3>
                            <p style={descStyle}>Order Confirmation & Dispatch</p>
                        </div>
                    </Link>

                    {/* Link to Kitchen Dashboard */}
                    <Link to="/staff/kitchen" style={{ textDecoration: 'none' }}>
                        <div style={{ ...cardStyle, borderTop: '5px solid #28a745' }}>
                            <div style={iconStyle}>🔪</div>
                            <h3>Kitchen</h3>
                            <p style={descStyle}>Order Preparation & Hand-off</p>
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    );
};

// --- NEW: DEDICATED FRONT DESK VIEW ---
const FrontDeskPage = () => {
    const navigate = useNavigate();
    // FUTURE: Add Authentication Guard here.
    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/staff')} style={homeButtonStyle}>← Staff Portal</button>
            <div style={staffPanelWrapperStyle}> 
                <h2 style={{color: '#ffc107', textAlign: 'center'}}>FRONT DESK OPERATIONS</h2>
                {/* Your updated FrontDeskDashboard (now only FD logic) */}
                <FrontDeskDashboard />
                {/* Archival is still useful for FD staff, keep it */}
                <FrontDeskArchival /> 
            </div>
        </div>
    );
};

// --- NEW: DEDICATED KITCHEN VIEW ---
const KitchenPage = () => {
    const navigate = useNavigate();
    // FUTURE: Add Authentication Guard here.
    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/staff')} style={homeButtonStyle}>← Staff Portal</button>
            <div style={staffPanelWrapperStyle}>
                <h2 style={{color: '#28a745', textAlign: 'center'}}>KITCHEN OPERATIONS</h2>
                {/* Your new KitchenDashboard (now only Kitchen logic) */}
                <KitchenDashboard />
            </div>
        </div>
    );
};


// Account Wrapper (REMAINS THE SAME)
const AccountPage = () => {
    const navigate = useNavigate();
    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/')} style={homeButtonStyle}>🏠 Home</button>
            <AccountDashboard />
        </div>
    );
};

// Manager Wrapper (REMAINS THE SAME)
const ManagerPage = () => {
    const navigate = useNavigate();
    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/')} style={homeButtonStyle}>🏠 Home</button>
            <ManagerDashboard />
        </div>
    );
};

// --- MAIN APP COMPONENT ---

function App() {
  return (
    <Router>
        <div style={appContainerStyle}>
            <header style={headerStyle}>
                <h1>Hotel Order Management System (HOMS)</h1>
            </header>
            
            <hr style={separatorStyle}/>

            <main>
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/guest" element={<GuestPage />} />
                    
                    {/* UPDATED STAFF ROUTES */}
                    <Route path="/staff" element={<StaffPortal />} />
                    <Route path="/staff/frontdesk" element={<FrontDeskPage />} />
                    <Route path="/staff/kitchen" element={<KitchenPage />} />
                    
                    <Route path="/account" element={<AccountPage />} />
                    <Route path="/manager" element={<ManagerPage />} />
                    <Route path="*" element={<div style={{textAlign: 'center'}}>Page not found. <Link to="/">Go Home</Link></div>} />
                </Routes>
            </main>
        </div>
    </Router>
  );
}

// --- NEW STAFF STYLES ---

const staffPanelWrapperStyle = {
  padding: '15px',
  border: '1px solid #ccc',
  borderRadius: '8px',
  backgroundColor: '#f8f9fa',
  margin: '20px auto',
  maxWidth: '1200px'
};

// --- EXISTING STYLES (Provided in original file) ---
const appContainerStyle = {
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '20px',
  fontFamily: 'Arial, sans-serif'
};

const headerStyle = {
  textAlign: 'center',
  paddingBottom: '10px',
  borderBottom: '2px solid #eee'
};

const separatorStyle = {
    margin: '20px 0',
    borderTop: '1px solid #eee'
};

// Landing Page Styles
const landingContainerStyle = {
    textAlign: 'center',
    padding: '40px 20px',
};

const gridContainerStyle = {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: '30px',
};

const cardStyle = {
    width: '220px',
    padding: '30px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    color: '#333',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
};

const iconStyle = {
    fontSize: '3rem',
    marginBottom: '15px'
};

const descStyle = {
    color: '#666',
    fontSize: '0.9rem',
    marginTop: '10px'
};

// Internal Page Styles
const pageWrapperStyle = {
    position: 'relative',
};

const homeButtonStyle = {
    position: 'absolute',
    top: '-60px',
    left: '0',
    padding: '8px 12px',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    zIndex: 1000
};

const logoutButtonStyle = {
    position: 'absolute',
    top: '-60px',
    right: '0',
    padding: '8px 12px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    zIndex: 1000
};

const sectionStyle = {
  marginBottom: '40px',
  padding: '20px',
  backgroundColor: '#e6f7ff',
  borderRadius: '8px',
  maxWidth: '800px', 
  margin: '0 auto'
};

// NEW STYLES: Navigation Tabs/Buttons
const navButtonContainerStyle = {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    marginTop: '10px',
    borderBottom: '2px solid #ddd',
    paddingBottom: '10px'
};

const baseNavButtonStyle = {
    padding: '10px 15px',
    borderWidth: '1px', 
    borderStyle: 'solid',
    borderColor: '#007bff', 
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'background-color 0.2s, color 0.2s, border-color 0.2s',
    flexGrow: 1,
    textAlign: 'center',
    fontSize: '0.95rem'
};

const activeNavButtonStyle = {
    ...baseNavButtonStyle,
    backgroundColor: '#007bff',
    color: 'white',
};

const inactiveNavButtonStyle = {
    ...baseNavButtonStyle,
    backgroundColor: '#fff',
    color: '#007bff',
};

const viewTitleStyle = {
    color: '#007bff',
    borderBottom: '2px solid #eee',
    paddingBottom: '5px',
    marginBottom: '20px'
};

const contentWrapperStyle = {
    padding: '10px 0'
};


export default App;