import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDSdGlqkVGOF_UClBel-DtQJ8GS7e6ssS4",
  authDomain: "attendance-tracker-e6c27.firebaseapp.com",
  projectId: "attendance-tracker-e6c27",
  storageBucket: "attendance-tracker-e6c27.firebasestorage.app",
  messagingSenderId: "1090938785947",
  appId: "1:1090938785947:web:b8609fbc2d3fb570ee763e",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);