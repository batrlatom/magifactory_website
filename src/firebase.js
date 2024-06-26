// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { increment } from 'firebase/firestore';

const firebaseConfig = {
    /*
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"*/

  apiKey: "AIzaSyAlARwyGdbK1PyF8ytMCjPF4DXIeaM28rs",
  authDomain: "magifactory2.firebaseapp.com",
  projectId: "magifactory2",
  storageBucket: "magifactory2.appspot.com",
  messagingSenderId: "365734559399",
  appId: "1:365734559399:web:e4fa81df064416ea31a582",
  measurementId: "G-4WDDKGQHN0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
