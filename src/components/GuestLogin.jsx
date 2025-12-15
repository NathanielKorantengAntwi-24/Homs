import React, { useState, useEffect, useRef } from 'react';
import { 
    getAuth, 
    RecaptchaVerifier, 
    signInWithPhoneNumber, 
    GoogleAuthProvider, 
    signInWithPopup,
    updateProfile
} from 'firebase/auth';

function GuestLogin({ onLoginSuccess }) {
    const auth = getAuth(); 
    const recaptchaWrapperRef = useRef(null);

    const [loginMethod, setLoginMethod] = useState('phone'); 
    const [guestName, setGuestName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [otp, setOtp] = useState('');
    const [step, setStep] = useState('input'); 
    const [confirmationResult, setConfirmationResult] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        return () => {
            if (window.recaptchaVerifier) {
                try {
                    window.recaptchaVerifier.clear();
                } catch (e) {}
                window.recaptchaVerifier = null;
            }
        };
    }, []);

    const setupRecaptcha = () => {
        if (recaptchaWrapperRef.current) {
            if (window.recaptchaVerifier) {
                try { window.recaptchaVerifier.clear(); } catch(e){}
            }

            window.recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaWrapperRef.current, {
                'size': 'normal',
                'callback': () => {},
                'expired-callback': () => {
                    setError('Recaptcha expired. Please refresh and try again.');
                }
            });
        }
    };

    const handleSendPhoneOtp = async () => {
        setError('');
        
        if (!guestName || guestName.length < 2) {
            setError("Please enter your name.");
            return;
        }

        if (!phoneNumber || phoneNumber.length < 9) {
            setError("Please enter a valid phone number.");
            return;
        }

        setLoading(true);

        const formattedNumber = phoneNumber.startsWith('+') 
            ? phoneNumber 
            : `+233${phoneNumber.replace(/^0+/, '')}`; 

        try {
            setupRecaptcha();
            const appVerifier = window.recaptchaVerifier;
            
            const confirmation = await signInWithPhoneNumber(auth, formattedNumber, appVerifier);
            
            setConfirmationResult(confirmation);
            setLoading(false);
            setStep('verify_otp');
        } catch (err) {
            console.error("Phone Auth Error:", err);
            setLoading(false);

            if (err.code === 'auth/invalid-phone-number') {
                setError('The phone number entered is invalid.');
            } else if (err.code === 'auth/quota-exceeded') {
                setError('SMS limit reached. Please use Google Sign-In.');
            } else if (err.code === 'auth/billing-not-enabled') {
                setError('PROJECT ERROR: Firebase Billing (Blaze Plan) required for SMS.');
            } else if (err.code === 'auth/invalid-app-credential') {
                setError('CONFIG ERROR: reCAPTCHA setup failed. Check Cloud Console.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Too many requests. Use a Firebase test number.');
            } else {
                setError(`Login failed: ${err.message}`);
            }
        }
    };

    const handleVerifyOtp = async () => {
        setError('');
        setLoading(true);
        try {
            const result = await confirmationResult.confirm(otp);
            let user = result.user;
            
            if (guestName) {
                await updateProfile(user, { displayName: guestName });
                user = { ...user, displayName: guestName };
            }

            onLoginSuccess(user);
        } catch (err) {
            console.error(err);
            setLoading(false);
            setError('Invalid OTP code. Please try again.');
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setLoading(true);

        const provider = new GoogleAuthProvider();

        try {
            const result = await signInWithPopup(auth, provider);
            let user = result.user;

            let updatedName = user.displayName;

            if (guestName) {
                updatedName = guestName;
            } else if (!updatedName) {
                updatedName = 'Guest';
            }
            
            if (updatedName !== user.displayName) {
                await updateProfile(user, { displayName: updatedName });
                user = { ...user, displayName: updatedName };
            }
            
            onLoginSuccess(user);
        } catch (err) {
            console.error("Google Auth Error:", err);
            setLoading(false);

            if (err.code === 'auth/popup-closed-by-user') {
                setError('Sign-in cancelled.');
            } else {
                setError('Google Sign-In failed. Please try again.');
            }
        }
    };

    return (
        <div style={containerStyle}>
            <h2 style={{color: '#007bff', marginBottom: '10px'}}>🔐 Guest Login</h2>
            <p style={{marginBottom: '20px', color: '#666'}}>Verify your identity to place an order.</p>

            {error && <p style={errorStyle}>{error}</p>}

            {step === 'input' && (
                <>
                    <div style={tabContainerStyle}>
                        <button 
                            style={loginMethod === 'phone' ? activeTabStyle : tabStyle} 
                            onClick={() => setLoginMethod('phone')}
                            disabled={loading}
                        >
                            📱 Phone
                        </button>

                        <button 
                            style={loginMethod === 'google' ? activeTabStyle : tabStyle} 
                            onClick={() => setLoginMethod('google')}
                            disabled={loading}
                        >
                            🔵 Google
                        </button>
                    </div>

                    <div style={formGroupStyle}>
                        <label style={labelStyle}>Your Name ({loginMethod === 'phone' ? 'Required' : 'Optional'})</label>
                        <input 
                            type="text" 
                            placeholder="e.g., Alice Brown" 
                            value={guestName} 
                            onChange={(e) => setGuestName(e.target.value)}
                            style={inputStyle}
                            disabled={loading}
                        />
                    </div>

                    {loginMethod === 'phone' && (
                        <div style={formGroupStyle}>
                            <label style={labelStyle}>Phone Number</label>
                            <input 
                                type="tel" 
                                placeholder="e.g., 0551234567" 
                                value={phoneNumber} 
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                style={inputStyle}
                                disabled={loading}
                            />
                            
                            <div ref={recaptchaWrapperRef} style={{marginTop: '10px', minHeight: '20px'}}></div>

                            <button 
                                onClick={handleSendPhoneOtp} 
                                style={{...primaryButtonStyle, opacity: loading ? 0.7 : 1}}
                                disabled={loading}
                            >
                                {loading ? 'Sending Code...' : 'Send Verification Code'}
                            </button>
                        </div>
                    )}

                    {loginMethod === 'google' && (
                        <div style={formGroupStyle}>
                            <p style={{color: '#555', fontSize: '0.9rem'}}>
                                Sign in with Google. Name above will be used if provided.
                            </p>
                            <button 
                                onClick={handleGoogleLogin} 
                                style={{...googleButtonStyle, opacity: loading ? 0.7 : 1}}
                                disabled={loading}
                            >
                                <span style={{marginRight: '10px'}}>G</span> 
                                {loading ? 'Signing in...' : 'Sign in with Google'}
                            </button>
                        </div>
                    )}
                </>
            )}

            {step === 'verify_otp' && (
                <div style={formGroupStyle}>
                    <label style={labelStyle}>Enter 6-Digit Code</label>
                    <input 
                        type="text" 
                        placeholder="123456" 
                        value={otp} 
                        onChange={(e) => setOtp(e.target.value)}
                        style={{
                            ...inputStyle,
                            textAlign: 'center',
                            letterSpacing: '5px',
                            fontSize: '1.2em'
                        }}
                        maxLength={6}
                        disabled={loading}
                    />
                    <button 
                        onClick={handleVerifyOtp} 
                        style={{...primaryButtonStyle, opacity: loading ? 0.7 : 1}}
                        disabled={loading}
                    >
                        {loading ? 'Verifying...' : 'Verify & Login'}
                    </button>

                    <button 
                        onClick={() => {
                            setStep('input');
                            setOtp('');
                            setLoading(false);
                        }} 
                        style={secondaryButtonStyle}
                        disabled={loading}
                    >
                        Change Number
                    </button>
                </div>
            )}
        </div>
    );
}

// --- FIXED STYLES ---
const containerStyle = { 
    maxWidth: '400px', 
    margin: '40px auto', 
    padding: '30px', 
    backgroundColor: 'white', 
    borderRadius: '12px', 
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', 
    textAlign: 'center', 
    fontFamily: 'sans-serif' 
};

const tabContainerStyle = { 
    display: 'flex', 
    marginBottom: '20px', 
    borderBottom: '2px solid #eee' 
};

const tabStyle = { 
    flex: 1,
    padding: '10px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    color: '#666',
    fontWeight: 'bold',

    // 🟦 FIX: Replace `border: none` with equivalent longhands
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    borderBottom: 'none'
};

const activeTabStyle = { 
    ...tabStyle,
    color: '#007bff',
    borderBottom: '2px solid #007bff'   // OK now — no shorthand conflict
};

const formGroupStyle = { 
    display: 'flex', 
    flexDirection: 'column', 
    gap: '15px' 
};

const labelStyle = { 
    textAlign: 'left', 
    fontWeight: 'bold', 
    fontSize: '0.9rem', 
    color: '#333' 
};

const inputStyle = { 
    padding: '12px', 
    borderRadius: '8px', 
    border: '1px solid #ccc',
    fontSize: '1rem', 
    width: '100%', 
    boxSizing: 'border-box' 
};

const primaryButtonStyle = { 
    padding: '12px', 
    borderRadius: '8px', 
    border: 'none',
    backgroundColor: '#007bff', 
    color: 'white',
    fontSize: '1rem', 
    fontWeight: 'bold', 
    cursor: 'pointer', 
    marginTop: '10px' 
};

const secondaryButtonStyle = { 
    padding: '10px', 
    borderRadius: '8px', 
    border: 'none',
    backgroundColor: '#e2e6ea', 
    color: '#333', 
    cursor: 'pointer', 
    marginTop: '10px' 
};

const googleButtonStyle = { 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: '12px', 
    borderRadius: '8px', 
    border: '1px solid #ddd', 
    backgroundColor: 'white', 
    color: '#333',
    fontSize: '1rem', 
    fontWeight: 'bold', 
    cursor: 'pointer', 
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)' 
};

const errorStyle = { 
    color: '#dc3545', 
    backgroundColor: '#ffe3e3', 
    padding: '10px', 
    borderRadius: '6px', 
    marginBottom: '15px', 
    fontSize: '0.9rem' 
};

export default GuestLogin;
