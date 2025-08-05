// authGuard.js
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCq8eXVoQtt_l9EFkIhYxzoUvW7HOIvZzk",
  authDomain: "pcu-maps-5d985.firebaseapp.com",
  databaseURL: "https://pcu-maps-5d985-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pcu-maps-5d985",
  storageBucket: "pcu-maps-5d985.firebasestorage.app",
  messagingSenderId: "922913954447",
  appId: "1:922913954447:web:c9f2db5e796c56fb7b2efa"
};
let app;

try {
  app = getApp();
} catch (error) {
  app = initializeApp(firebaseConfig);
}

const auth = getAuth(app);

// Redirect if user is not authenticated
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "/index.html";
  }
});
