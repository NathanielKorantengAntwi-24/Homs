import React, { useRef, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth'; 
import { collection, query, where, getDocs, limit, doc, getDoc, onSnapshot } from 'firebase/firestore'; 
import { db } from './config/firebase'; 
import localHeroBg from './assets/hero-bg.avif';

// Import core components
import GuestLogin from './components/GuestLogin'; 
import GuestOrderForm from './components/GuestOrderForm';
import GuestTracker from './components/GuestTracker';
import FrontDeskDashboard from './components/FrontDeskDashboard';
import FrontDeskArchival from './components/FrontDeskArchival'; 
import KitchenDashboard from './components/KitchenDashboard'; 
import AccountDashboard from './components/AccountDashboard'; 
import ManagerDashboard from './components/ManagerDashboard'; 
import AdminDashboard from './components/AdminDashboard';

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

// Check for active orders
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

// --- 1. LANDING PAGE (REAL-TIME SYNC & LOGO INTEGRATED) ---
const DEFAULT_LOGO = ""; 
const DEFAULT_BG = localHeroBg;

const LandingPage = () => {
    const [config, setConfig] = useState(null);
    const [assetsLoaded, setAssetsLoaded] = useState(false);

    // 1. OPTIMIZED SCROLL LOCK
    useEffect(() => {
        const docEl = document.documentElement.style;
        const bodyEl = document.body.style;
        docEl.margin = docEl.padding = bodyEl.margin = bodyEl.padding = '0';
        docEl.height = bodyEl.height = bodyEl.width = '100%';
        docEl.overflow = bodyEl.overflow = 'hidden';
        bodyEl.position = 'fixed'; 

        return () => {
            docEl.overflow = bodyEl.overflow = 'auto';
            bodyEl.position = 'static';
        };
    }, []);

    // 2. SMART PRELOADER
    const preloadImage = (url) => {
        return new Promise((resolve) => {
            if (!url) return resolve();
            const img = new Image();
            img.src = url;
            if (img.complete) resolve();
            else {
                img.onload = resolve;
                img.onerror = resolve;
            }
        });
    };

    // 3. FIREBASE SYNC & LOCAL ASSET FALLBACK
    useEffect(() => {
        const unsub = onSnapshot(doc(db, "config", "hotel_settings"), async (docSnap) => {
            const data = docSnap.exists() ? docSnap.data() : {};
            const newConfig = {
                hotelName: data.hotelName || "THE ROYAL PALACE",
                slogan: data.slogan || "Excellence in Hospitality, Simplified.",
                logoUrl: data.logoUrl || DEFAULT_LOGO,
                heroBgUrl: data.heroBgUrl || DEFAULT_BG
            };

            // Parallel pre-load of local or remote assets
            await Promise.all([
                preloadImage(newConfig.logoUrl),
                preloadImage(newConfig.heroBgUrl)
            ]);

            setConfig(newConfig);
            setAssetsLoaded(true);
        }, (error) => {
            console.error("Branding sync failed:", error);
            // Emergency fallback to local assets on network failure
            setConfig({
                hotelName: "HOMS",
                slogan: "Welcome",
                logoUrl: DEFAULT_LOGO,
                heroBgUrl: DEFAULT_BG
            });
            setAssetsLoaded(true); 
        });

        return () => unsub();
    }, []);

    // 4. MEMOIZED STYLE
    const dynamicBackgroundStyle = React.useMemo(() => {
        if (!config) return {};
        return {
            ...backgroundImageStyle,
            backgroundImage: `url("${config.heroBgUrl}")`,
            animation: 'fadeIn 1.2s ease-out'
        };
    }, [config?.heroBgUrl]);

    // 5. ASSET GATE
    if (!assetsLoaded || !config) {
        return (
            <div style={splashWrapperStyle}>
                <div style={splashTextStyle}>LOADING...</div>
            </div>
        );
    }

    return (
        <div style={{...heroWrapperStyle, animation: 'fadeIn 0.8s ease-out'}}>
            <div style={dynamicBackgroundStyle} />
            <div style={scubaOverlayStyle} />
            
            <div style={heroContentStyle}>
                <div style={glassCardStyle}>
                    {config.logoUrl && (
                        <div style={logoContainerStyle}>
                            <img src={config.logoUrl} alt="Hotel Logo" style={logoImageStyle} />
                        </div>
                    )}

                    <div style={taglineWrapperStyle}>
                        <span style={lineStyle} />
                        <h2 style={hotelNameStyle}>{config.hotelName}</h2>
                        <span style={lineStyle} />
                    </div>

                    <h1 style={heroTitleStyle}>HOMS</h1>
                    <p style={heroSubTitleStyle}>{config.slogan}</p>

                    <div style={ctaContainerStyle}>
                        <Link to="/guest" style={heroCTAStyle}>
                            ENTER GUEST PORTAL
                        </Link>
                    </div>
                </div>
            </div>

            <div style={brandFooterStyle}>
                <span>POWERED BY ALGRACE SYSTEMS</span>
            </div>
        </div>
    );
};

// --- 2. GUEST PAGE ---
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
        if (user) { setRefreshKey(Date.now()); }
    }, [location.pathname, user]);

    const handleLogout = () => {
        if (window.confirm("Sign out of your session?")) {
            signOut(auth).then(() => navigate('/')).catch(console.error);
        }
    };

    if (loading) return <div style={loaderStyle}>Syncing...</div>;

    if (!user) {
        return (
            <div style={pageWrapperStyle}>
                <button onClick={() => navigate('/')} style={homeButtonStyle}>🏠 Home</button>
                <div style={sectionStyle}>
                    <GuestLogin onLoginSuccess={(u) => setUser(u)} />
                </div>
            </div>
        );
    }

    const displayName = getUserDisplayName(user);

    return (
        <div style={pageWrapperStyle}>
            <button onClick={() => navigate('/')} style={homeButtonStyle}>🏠 Home</button>
            <button onClick={handleLogout} style={logoutButtonStyle}>Sign Out</button>
            
            <div style={sectionStyle}>
                <h2 style={welcomeHeaderStyle}>Welcome, {displayName}!</h2>

                <div style={navButtonContainerStyle}>
                    <button onClick={() => setCurrentView('order')} style={currentView === 'order' ? activeNavButtonStyle : inactiveNavButtonStyle}>📝 New Order</button>
                    <button onClick={() => setCurrentView('active')} style={currentView === 'active' ? activeNavButtonStyle : inactiveNavButtonStyle}>🚀 Active Tracker</button>
                    <button onClick={() => setCurrentView('history')} style={currentView === 'history' ? activeNavButtonStyle : inactiveNavButtonStyle}>📦 History</button>
                </div>

                <div style={contentWrapperStyle}>
                    {currentView === 'order' && <GuestOrderForm guestId={user.uid} onOrderSuccess={() => setCurrentView('active')} />}
                    {currentView === 'active' && <GuestTracker key={`active-${refreshKey}`} guestId={user.uid} viewMode='active' />}
                    {currentView === 'history' && <GuestTracker key={`history-${refreshKey}`} guestId={user.uid} viewMode='history' />}
                </div>
            </div>
        </div>
    );
};

// --- ROUTING ---
function App() {
  return (
    <Router>
        <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/guest" element={<GuestPage />} />
            <Route path="/staff/frontdesk" element={<FrontDeskPage />} />
            <Route path="/staff/kitchen" element={<KitchenPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/manager" element={<ManagerPage />} />
            <Route path="*" element={<div style={{textAlign: 'center', padding: '100px'}}>404 | Portal Not Found</div>} />
        </Routes>
    </Router>
  );
}

// Staff Stubs
const FrontDeskPage = () => <div style={pageWrapperStyle}><div style={staffPanelWrapperStyle}><FrontDeskDashboard /><FrontDeskArchival /></div></div>;
const KitchenPage = () => <div style={pageWrapperStyle}><div style={staffPanelWrapperStyle}><KitchenDashboard /></div></div>;
const AdminPage = () => <div style={pageWrapperStyle}><AdminDashboard /></div>;
const AccountPage = () => <div style={pageWrapperStyle}><AccountDashboard /></div>;
const ManagerPage = () => <div style={pageWrapperStyle}><ManagerDashboard /></div>;

// --- STYLES: HERO ---
const heroWrapperStyle = { 
    height: '100vh', 
    width: '100vw', 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    position: 'fixed', 
    top: 0,
    left: 0,
    overflow: 'hidden', 
    margin: 0,
    padding: 0,
    backgroundColor: '#0a0f1e', 
    fontFamily: "'Inter', sans-serif",
    animation: 'fadeIn 1.2s ease-in-out',
    opacity: 1,
};
const backgroundImageStyle = { 
    position: 'absolute', 
    top: '-1%',    
    left: '-1%',   
    width: '102%', 
    height: '102%', 
    backgroundImage: 'url("https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&q=80&w=2070")', 
    backgroundSize: 'cover', 
    backgroundPosition: 'center', 
    
    // --- HIGH CLARITY SETTINGS ---
    // 1px blur is just enough to soften harsh edges without losing detail
    filter: 'blur(1px) brightness(0.8) contrast(1.2) saturate(1.1)', 
    
    zIndex: 1 
};
const scubaOverlayStyle = { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    bottom: 0, 
    background: 'linear-gradient(180deg, rgba(10, 15, 30, 0.4) 0%, rgba(10, 15, 30, 0.6) 100%)', 
    zIndex: 2 
};
const heroContentStyle = { zIndex: 3, width: '90%', maxWidth: '500px' };
const glassCardStyle = { padding: 'clamp(30px, 8vw, 60px)', background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(20px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.1)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' };
const logoContainerStyle = { 
    marginBottom: '20px',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
};
const logoImageStyle = { 
    maxHeight: '120px', 
    maxWidth: '220px', 
    width: 'auto', 
    height: 'auto', 
    marginBottom: '15px',
    display: 'block',
    objectFit: 'contain',

    // --- HIGH-VISIBILITY FILTERS ---
    filter: `
        brightness(1.2)
        contrast(1.1)
        drop-shadow(0 0 20px rgba(255, 255, 255, 0.6)) 
        drop-shadow(0 0 2px rgba(255, 255, 255, 0.8))
        drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5))
    `,
};
const taglineWrapperStyle = { display: 'flex', alignItems: 'center', gap: 'clamp(10px, 3vw, 20px)', marginBottom: '10px' };
const hotelNameStyle = { fontSize: 'clamp(0.7rem, 2vw, 0.9rem)', letterSpacing: 'clamp(4px, 1.5vw, 8px)', color: '#FFFFFF', fontWeight: '900', margin: 0 };
const lineStyle = { width: 'clamp(20px, 5vw, 40px)', height: '1px', backgroundColor: 'rgba(255,255,255,0.4)' };
const heroTitleStyle = { fontSize: 'clamp(3rem, 15vw, 5.5rem)', fontWeight: '900', color: '#FFFFFF', margin: '5px 0', lineHeight: '1' };
const heroSubTitleStyle = { fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)', color: '#E2E8F0', marginTop: '10px', fontWeight: '300', opacity: 0.9 };
const ctaContainerStyle = { marginTop: '30px', width: '100%' };
const heroCTAStyle = { width: '100%', maxWidth: '280px', padding: '16px 0', backgroundColor: '#FFFFFF', color: '#1A202C', textDecoration: 'none', fontWeight: '800', borderRadius: '50px', display: 'inline-block' };
const brandFooterStyle = { position: 'absolute', bottom: '30px', fontSize: '0.6rem', letterSpacing: '3px', color: 'rgba(255,255,255,0.4)', fontWeight: '700', zIndex: 3, textAlign: 'center', width: '100%' };

// --- STYLES: PORTALS ---
// --- STYLES: PORTALS ---
const pageWrapperStyle = { 
    padding: '20px',           // Reduced top padding for mobile-first
    minHeight: '100vh', 
    backgroundColor: '#FAF9F6', 
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',      // Centers the 1400px card on huge screens
    width: '100%',
    boxSizing: 'border-box'
};
const sectionStyle = { 
    // This is the "Full Screen" magic
    width: '100%',
    maxWidth: '1400px',        // Stops it from becoming TOO wide on massive ultra-wide monitors
    margin: '0 auto', 
    padding: '40px 5%',        // 5% side padding keeps it breathable on all screens
    backgroundColor: '#FFFFFF', 
    borderRadius: '32px',      // Slightly rounder for a modern look
    boxShadow: '0 10px 40px rgba(0,0,0,0.03)',
    boxSizing: 'border-box',
    minHeight: '85vh',         // Ensures it fills the screen vertically too
    display: 'flex',
    flexDirection: 'column'
};
const welcomeHeaderStyle = { color: '#0047AB', borderBottom: '1px solid #E8E8E1', paddingBottom: '15px', fontWeight: '900', fontSize: '1.6rem' };
const navButtonContainerStyle = { display: 'flex', gap: '8px', marginBottom: '25px', marginTop: '15px', backgroundColor: '#F7F7F2', padding: '6px', borderRadius: '20px', border: '1px solid #E8E8E1' };
const baseNavButtonStyle = { padding: '14px 10px', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: '800', flexGrow: 1, fontSize: '0.85rem', textTransform: 'uppercase' };
const activeNavButtonStyle = { ...baseNavButtonStyle, backgroundColor: '#121212', color: '#FFFFFF' };
const inactiveNavButtonStyle = { ...baseNavButtonStyle, backgroundColor: 'transparent', color: '#888888' };
const homeButtonStyle = { position: 'fixed', top: '20px', left: '20px', zIndex: 1000, padding: '10px 15px', backgroundColor: '#121212', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' };
const logoutButtonStyle = { position: 'fixed', top: '20px', right: '20px', zIndex: 1000, padding: '10px 15px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' };
const loaderStyle = { textAlign: 'center', padding: '100px', background: '#F7F9FC', height: '100vh', color: '#2B6CB0' };
const staffPanelWrapperStyle = { padding: '20px', backgroundColor: '#FFFFFF', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', maxWidth: '1200px', margin: '0 auto' };
const contentWrapperStyle = { minHeight: '400px' };

const splashWrapperStyle = {
    height: '100vh', width: '100vw', backgroundColor: '#0a0f1e',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    fontFamily: "'Inter', sans-serif"
};

const splashTextStyle = { 
    color: 'white', letterSpacing: '5px', fontSize: '0.7rem', 
    opacity: 0.5, fontWeight: '300' 
};



const navAreaStyle = {
    // ... (as we discussed for the Home/Sign out area)
};

export default App;