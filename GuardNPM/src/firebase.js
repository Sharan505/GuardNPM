import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAvoGpyCMPMQ711OAFK0W-qbHN9yRhlQyQ",
  authDomain: "guardnpm.firebaseapp.com",
  projectId: "guardnpm",
  storageBucket: "guardnpm.firebasestorage.app",
  messagingSenderId: "8343748211",
  appId: "1:8343748211:web:edbba8d1d24a3dbc42b406",
  measurementId: "G-ZMRMK5ZSZJ"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

export { app, analytics, auth, provider, db };
