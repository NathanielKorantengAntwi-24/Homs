import { useState } from 'react';
import { uploadMenuItem } from '../utils/menuActions';

export default function MenuManager() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ 
    name: '', 
    price: '', 
    category: 'LUNCH/DINNER' 
  });

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return alert("Please select a dish photo first!");
    
    setLoading(true);
    try {
      await uploadMenuItem(formData, file);
      alert("Dish added successfully!");
      setFile(null);
      setPreview(null);
      setFormData({ name: '', price: '', category: 'LUNCH/DINNER' });
    } catch (error) {
      alert("Upload failed. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={formContainer}>
      <h2 style={formTitle}>Add New Dish</h2>
      
      <form onSubmit={handleSubmit} style={formStack}>
        {/* 📸 Image Upload Zone */}
        <div style={uploadZone}>
          {preview ? (
            <div style={previewWrapper}>
              <img src={preview} alt="Preview" style={imagePreview} />
              <div style={changeOverlay}>Tap to Change Image</div>
            </div>
          ) : (
            <div style={placeholderContent}>
              <span style={{ fontSize: '2rem' }}>📸</span>
              <p style={uploadText}>Click to upload dish photo</p>
            </div>
          )}
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleFileChange}
            style={fileInputHidden}
          />
        </div>

        {/* ✍️ Detail Inputs */}
        <div style={inputGroup}>
          <label style={labelStyle}>Item Name</label>
          <input 
            type="text" 
            placeholder="e.g. Spicy Jollof Rice" 
            required
            style={inputStyle}
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
          />
        </div>

        <div style={inputGroup}>
          <label style={labelStyle}>Price (GH₵)</label>
          <input 
            type="number" 
            placeholder="0.00" 
            required
            style={inputStyle}
            value={formData.price}
            onChange={(e) => setFormData({...formData, price: e.target.value})}
          />
        </div>

        <div style={inputGroup}>
          <label style={labelStyle}>Menu Category</label>
          <select 
            style={inputStyle}
            value={formData.category}
            onChange={(e) => setFormData({...formData, category: e.target.value})}
          >
            <option value="BREAKFAST">Breakfast</option>
            <option value="LUNCH/DINNER">Lunch/Dinner</option>
            <option value="DRINKS">Drinks</option>
            <option value="SOUPS">Soups</option>
          </select>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          style={loading ? disabledBtn : submitBtn}
        >
          {loading ? "Please Wait ..." : "Add to Live Menu"}
        </button>
      </form>
    </div>
  );
}

// --- MASTER STYLES (Cleaned & High-Visibility) ---
const formContainer = {
  background: '#ffffff',
  padding: '30px',
  borderRadius: '24px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
};

const formTitle = {
  margin: '0 0 20px 0',
  fontSize: '1.4rem',
  color: '#1a202c',
  fontWeight: '800',
  letterSpacing: '-0.5px'
};

const formStack = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px'
};

const uploadZone = {
  position: 'relative',
  height: '180px',
  background: '#f8fafc',
  border: '2px dashed #cbd5e1',
  borderRadius: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  overflow: 'hidden',
  transition: '0.2s'
};

const previewWrapper = { width: '100%', height: '100%', position: 'relative' };
const imagePreview = { width: '100%', height: '100%', objectFit: 'cover' };
const changeOverlay = {
  position: 'absolute', bottom: 0, left: 0, right: 0,
  background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.7rem',
  padding: '10px', textAlign: 'center', fontWeight: 'bold'
};

const placeholderContent = { textAlign: 'center', color: '#64748b' };
const uploadText = { margin: '8px 0 0 0', fontSize: '0.8rem', fontWeight: '600' };
const fileInputHidden = { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' };

const inputGroup = { display: 'flex', flexDirection: 'column', gap: '6px' };
const labelStyle = { fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', paddingLeft: '4px' };

const inputStyle = {
  padding: '12px 16px',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  fontSize: '1rem',
  color: '#1a202c',
  outline: 'none'
};

const submitBtn = {
  marginTop: '10px', padding: '16px', borderRadius: '14px', border: 'none',
  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
  color: '#fff', fontSize: '1rem', fontWeight: '700', cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
};

const disabledBtn = { ...submitBtn, background: '#94a3b8', cursor: 'not-allowed', boxShadow: 'none' };