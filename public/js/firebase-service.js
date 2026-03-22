// Firebase Service Module
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-functions.js";

// Replace with your Firebase project configuration
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// Callable Functions
export const redeemCode = httpsCallable(functions, 'redeemCode');
export const unlockVideo = httpsCallable(functions, 'unlockVideo');
export const generateCodes = httpsCallable(functions, 'generateCodes');
export const generateExam = httpsCallable(functions, 'generateExam');

// Auth Helpers
export const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);
export const getCurrentUser = () => new Promise((resolve) => onAuthStateChanged(auth, resolve));

// DB Helpers
export const getUserData = async (uid) => {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
};

export const getVideos = async (grade) => {
    // Logic to fetch videos based on grade
    // Note: videos might still be in a static list or Firestore
    return [];
};
