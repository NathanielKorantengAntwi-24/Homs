import { storage, db } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { 
    collection, 
    addDoc, 
    serverTimestamp, 
    doc, 
    updateDoc, 
    deleteDoc 
} from 'firebase/firestore';

/**
 * PRODUCTION-READY UPLOAD
 * Includes Path Tracking and Atomic Cleanup
 */
export const uploadMenuItem = async (itemData, imageFile) => {
  let imageRef = null;
  try {
    // 1. Generate unique filename and reference
    const fileExtension = imageFile.name.split('.').pop();
    const fileName = `dish_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
    imageRef = ref(storage, `menu/${fileName}`);

    // 2. Upload to Storage with Metadata (Cache control for faster guest loading)
    const metadata = { cacheControl: 'public,max-age=31536000' };
    const snapshot = await uploadBytes(imageRef, imageFile, metadata);
    const downloadURL = await getDownloadURL(snapshot.ref);

    // 3. Save to Firestore
    const docRef = await addDoc(collection(db, "menu"), {
      name: itemData.name.trim(),
      price: parseFloat(itemData.price),
      category: itemData.category || "General",
      imageUrl: downloadURL,
      imagePath: `menu/${fileName}`, // 👈 CRITICAL: Saved to allow deletion later
      isAvailable: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return { success: true, id: docRef.id };
  } catch (error) {
    // 4. ATOMIC CLEANUP: If Firestore fails, delete the image from Storage
    if (imageRef) {
      await deleteObject(imageRef).catch((err) => console.warn("Cleanup failed:", err));
    }
    console.error("Production Upload Failed:", error);
    throw new Error("System failed to sync menu item. Please try again.");
  }
};

/**
 * PRODUCTION-READY UPDATE
 */
export const updateMenuItem = async (docId, updatedData) => {
  try {
    const itemRef = doc(db, "menu", docId);
    await updateDoc(itemRef, {
      ...updatedData,
      ...(updatedData.name && { name: updatedData.name.trim() }),
      ...(updatedData.price && { price: parseFloat(updatedData.price) }),
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error("Update failed:", error);
    throw error;
  }
};

/**
 * PRODUCTION-READY DELETE
 * Deletes both the Database record AND the physical file in London
 * @param {Object} item - The full item object from the AdminDashboard
 */
export const deleteMenuItem = async (item) => {
  try {
    // 1. Physical Cleanup: Delete from Firebase Storage (London)
    if (item.imagePath) {
      const storageRef = ref(storage, item.imagePath);
      await deleteObject(storageRef).catch((err) => {
        console.warn("Storage item already missing or inaccessible:", err.message);
      });
    }

    // 2. Database Cleanup: Delete from Firestore
    await deleteDoc(doc(db, "menu", item.id));
    
    return { success: true };
  } catch (error) {
    console.error("Critical Deletion Error:", error);
    throw error;
  }
};