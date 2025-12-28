import React, { useRef, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth'; 
import { collection, query, where, getDocs, limit } from 'firebase/firestore'; 
import { db } from './config/firebase'; 

// Import all core components
import GuestLogin from './components/GuestLogin'; 
import GuestOrderForm from './components/GuestOrderForm';
import GuestTracker from './components/GuestTracker';
import FrontDeskDashboard from './components/FrontDeskDashboard';
import FrontDeskArchival from './components/FrontDeskArchival'; 
import KitchenDashboard from './components/KitchenDashboard'; 
import AccountDashboard from './components/AccountDashboard'; 
import ManagerDashboard from './components/ManagerDashboard'; 
import AdminDashboard from './components/AdminDashboard'; // --- NEW IMPORT ---

const ACTIVE_STATUSES = [1, 2, 3, 4, 5, 6];

// Helper to derive display name
const getUserDisplayName = (user) => {
    if (!user) return "Guest";
    if (user.displayName) return user.displayName.split(' ')[0]; 
    if (user.phoneNumber) {
        const p = user.phoneNumber;
        return p.length > 5 ? p.substring(p.length - 8) : p;
    }
    if (user.email) return user.email.split('@')[0];
    return user.uid.substring(0, 8);
};

// PERFORMANCE FIX: Optimized check using limit(1)
const checkForActiveOrders = async (guestId) => {
    if (!guestId) return false;
    try {
        const q = query(
            collection(db, 'orders'),
            where('guestId', '==', guestId),
            where('currentStatus', 'in', ACTIVE_STATUSES),
            limit(1)
        );
        const snapshot = await getDocs(q);
        return !snapshot.empty;
    } catch (error) {
        console.error("Error checking orders:", error);
        return false;
    }
};

// --- 1. PORTAL / LANDING PAGE (UPDATED WITH ADMIN) ---
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
                <Link to="/staff" style={{ textDecoration: 'none' }}>
                    <div style={{ ...cardStyle, borderTop: '5px solid #ffc107' }}>
                        <div style={iconStyle}>🛎️</div>
                        <h3>Staff Operations</h3>
                        <p style={descStyle}>Front Desk & Kitchen</p>
                    </div>
                </Link>
                <Link to="/admin" style={{ textDecoration: 'none' }}>
                    <div style={{ ...cardStyle, borderTop: '5px solid #6c757d' }}>
                        <div style={iconStyle}>🛡️</div>
                        <h3>System Admin</h3>
                        <p style={descStyle}>Inventory & Health</p>
                    </div>
                </Link>
                <Link to="/account" style={{ textDecoration: 'none' }}>
                    <div style={{ ...cardStyle, borderTop: '5px solid #17a2b8' }}>
                        <div style={iconStyle}>📊</div>
                        <h3>Account Office</h3>
                        <p style={descStyle}>Financial Monitoring</p>
                    </div>
                </Link>
                <Link to="/manager" style={{ textDecoration: 'none' }}>
                    <div style={{ ...cardStyle, borderTop: '5px solid #28a745' }}>
                        <div style={iconStyle}>📈</div>
                        <h3>General Manager</h3>
                        <p style={descStyle}>Management View</p>
                    </div>
                </Link>
            </div>
        </div>
    );
};

// --- 2. GUEST PAGE (OPTIMIZED) ---
const GuestPage = () => {
    const navigate = useNavigate();
    const location = useLocation(); 
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState('order'); 
    const [refreshKey, setRefreshKey] = useState(Date.now()); 

    const auth = getAuth();

    useEffect(() => {
        let isMounted = true;
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                const hasActive = await checkForActiveOrders(currentUser.uid);
                if (isMounted) {
                    setUser(currentUser);
                    setCurrentView(hasActive ? 'active' : 'order');
                    setLoading(false);
                }
            } else {
                if (isMounted) {
                    setUser(null);
                    setLoading(false);
                }
            }
        });
        return () => { isMounted = false; unsubscribe(); };
    }, [auth]);

    useEffect(() => {
        if (user) {
            setRefreshKey(Date.now());
        }
    }, [location.pathname, user]);

    const handleOrderSuccess = () => {
        setRefreshKey(Date.now()); 
        setCurrentView('active'); 
    };

    const handleLogout = () => {
        if (window.confirm("Are you sure you want to sign out?")) {
            signOut(auth).then(() => navigate('/guest')).catch(console.error);
        }
    };

    if (loading) return <div style={{textAlign: 'center', padding: '50px'}}>Syncing Session...</div>;

    if (!user) {
        return (
            <div style={pageWrapperStyle}>
                <button onClick={() => navigate('/')} style={homeButtonStyle}>🏠 Home</button>
                <GuestLogin onLoginSuccess={(u) => setUser(u)} />
            </div>
        );
    }

    const displayName = getUserDisplayName(user);
    const getNavButtonStyle = (view) => (view === currentView ? activeNavButtonStyle : inactiveNavButtonStyle);

    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/')} style={homeButtonStyle}>🏠 Home</button>
            <button onClick={handleLogout} style={logoutButtonStyle}>Sign Out</button>
            
            <div style={sectionStyle}>
                <h2 style={{color: '#007bff', borderBottom: '2px solid #eee', paddingBottom: '10px'}}>
                    Welcome, {displayName}!
                </h2>

                <div style={navButtonContainerStyle}>
                    <button onClick={() => setCurrentView('order')} style={getNavButtonStyle('order')}>📝 New Order</button>
                    <button onClick={() => setCurrentView('active')} style={getNavButtonStyle('active')}>🚀 Active Tracker</button>
                    <button onClick={() => setCurrentView('history')} style={getNavButtonStyle('history')}>📦 Order History</button>
                </div>

                <div style={contentWrapperStyle}>
                    {currentView === 'order' && (
                        <GuestOrderForm guestId={user.uid} onOrderSuccess={handleOrderSuccess} />
                    )}
                    
                    {currentView === 'active' && (
                        <>
                            <h3 style={viewTitleStyle}>Live Tracking</h3>
                            <GuestTracker key={`active-${refreshKey}`} guestId={user.uid} viewMode='active' /> 
                        </>
                    )}
                    
                    {currentView === 'history' && (
                        <>
                            <h3 style={viewTitleStyle}>Order History</h3>
                            <GuestTracker key={`history-${refreshKey}`} guestId={user.uid} viewMode='history' /> 
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- STAFF PORTAL ---
const StaffPortal = () => {
    const navigate = useNavigate();
    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/')} style={homeButtonStyle}>🏠 Home</button>
            <div style={landingContainerStyle}>
                <h2 style={{ marginBottom: '30px', color: '#ffc107' }}>Staff Login Portal</h2>
                <div style={gridContainerStyle}>
                    <Link to="/staff/frontdesk" style={{ textDecoration: 'none' }}>
                        <div style={{ ...cardStyle, borderTop: '5px solid #ffc107' }}>
                            <div style={iconStyle}>🛎️</div>
                            <h3>Front Desk</h3>
                            <p style={descStyle}>Confirmation & Dispatch</p>
                        </div>
                    </Link>
                    <Link to="/staff/kitchen" style={{ textDecoration: 'none' }}>
                        <div style={{ ...cardStyle, borderTop: '5px solid #28a745' }}>
                            <div style={iconStyle}>🔪</div>
                            <h3>Kitchen</h3>
                            <p style={descStyle}>Preparation & Hand-off</p>
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    );
};

const FrontDeskPage = () => {
    const navigate = useNavigate();
    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/staff')} style={homeButtonStyle}>← Staff Portal</button>
            <div style={staffPanelWrapperStyle}> 
                <h2 style={{color: '#ffc107', textAlign: 'center'}}>FRONT DESK OPERATIONS</h2>
                <FrontDeskDashboard />
                <FrontDeskArchival /> 
            </div>
        </div>
    );
};

const KitchenPage = () => {
    const navigate = useNavigate();
    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/staff')} style={homeButtonStyle}>← Staff Portal</button>
            <div style={staffPanelWrapperStyle}>
                <h2 style={{color: '#28a745', textAlign: 'center'}}>KITCHEN OPERATIONS</h2>
                <KitchenDashboard />
            </div>
        </div>
    );
};

// --- ADMIN PAGE ---
const AdminPage = () => {
    const navigate = useNavigate();
    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/')} style={homeButtonStyle}>🏠 Home</button>
            <AdminDashboard />
        </div>
    );
};

const AccountPage = () => {
    const navigate = useNavigate();
    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/')} style={homeButtonStyle}>🏠 Home</button>
            <AccountDashboard />
        </div>
    );
};

const ManagerPage = () => {
    const navigate = useNavigate();
    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/')} style={homeButtonStyle}>🏠 Home</button>
            <ManagerDashboard />
        </div>
    );
};

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
                    <Route path="/staff" element={<StaffPortal />} />
                    <Route path="/staff/frontdesk" element={<FrontDeskPage />} />
                    <Route path="/staff/kitchen" element={<KitchenPage />} />
                    <Route path="/admin" element={<AdminPage />} /> {/* --- NEW ROUTE --- */}
                    <Route path="/account" element={<AccountPage />} />
                    <Route path="/manager" element={<ManagerPage />} />
                    <Route path="*" element={<div style={{textAlign: 'center', padding: '50px'}}>Page not found. <Link to="/">Go Home</Link></div>} />
                </Routes>
            </main>
        </div>
    </Router>
  );
}

// --- STYLES (Unchanged) ---
const staffPanelWrapperStyle = { padding: '15px', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#f8f9fa', margin: '20px auto', maxWidth: '1200px' };
const appContainerStyle = { maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif' };
const headerStyle = { textAlign: 'center', paddingBottom: '10px', borderBottom: '2px solid #eee' };
const separatorStyle = { margin: '20px 0', borderTop: '1px solid #eee' };
const landingContainerStyle = { textAlign: 'center', padding: '40px 20px' };
const gridContainerStyle = { display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '30px' };
const cardStyle = { width: '220px', padding: '30px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' };
const iconStyle = { fontSize: '3rem', marginBottom: '15px' };
const descStyle = { color: '#666', fontSize: '0.9rem', marginTop: '10px' };
const pageWrapperStyle = { position: 'relative' };
const homeButtonStyle = { position: 'absolute', top: '-60px', left: '0', padding: '8px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', zIndex: 1000 };
const logoutButtonStyle = { position: 'absolute', top: '-60px', right: '0', padding: '8px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', zIndex: 1000 };
const sectionStyle = { marginBottom: '40px', padding: '20px', backgroundColor: '#e6f7ff', borderRadius: '8px', maxWidth: '800px', margin: '0 auto' };
const navButtonContainerStyle = { display: 'flex', gap: '10px', marginBottom: '20px', marginTop: '10px', borderBottom: '2px solid #ddd', paddingBottom: '10px' };
const baseNavButtonStyle = { padding: '10px 15px', border: '1px solid #007bff', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', flexGrow: 1, textAlign: 'center' };
const activeNavButtonStyle = { ...baseNavButtonStyle, backgroundColor: '#007bff', color: 'white' };
const inactiveNavButtonStyle = { ...baseNavButtonStyle, backgroundColor: '#fff', color: '#007bff' };
const viewTitleStyle = { color: '#007bff', borderBottom: '2px solid #eee', paddingBottom: '5px', marginBottom: '20px' };
const contentWrapperStyle = { padding: '10px 0' };

export default App;