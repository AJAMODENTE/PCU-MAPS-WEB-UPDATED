// authGuard.js
import { firebaseConfig } from "/includes/firebaseConfig.js";
import {
  initializeApp,
  getApp,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

// Initialize Firebase safely (avoids duplicate initialization)
let app;
try {
  app = initializeApp(firebaseConfig);
} catch (error) {
  app = getApp();
}

const auth = getAuth(app);

// Redirect if user is not authenticated
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "/index.html";
  }
});
