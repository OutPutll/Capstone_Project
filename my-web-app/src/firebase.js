// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ★★★ 아래 값을 본인의 Firebase 프로젝트 설정값으로 교체해야 합니다 ★★★
const firebaseConfig = {
  apiKey: "AIzaSyDiFdSBxOYkcU7bCRRHBrANFNCSy_wmpTU",
  authDomain: "food-test-433f3.firebaseapp.com",
  projectId: "food-test-433f3",
  storageBucket: "food-test-433f3.firebasestorage.app",
  messagingSenderId: "84041484014",
  appId: "1:84041484014:web:c08346768392b0568915ff"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);

// 서비스 내보내기
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);


