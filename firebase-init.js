import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC51lf36MugEO7NHxDjX4RCsWWcvEnyQZE",
  authDomain: "films-28c85.firebaseapp.com",
  projectId: "films-28c85",
  storageBucket: "films-28c85.firebasestorage.app",
  messagingSenderId: "999069222104",
  appId: "1:999069222104:web:ce57837c8b473d2f6843ad"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged, collection, addDoc, getDocs, query, orderBy, serverTimestamp, deleteDoc, doc, updateDoc };
