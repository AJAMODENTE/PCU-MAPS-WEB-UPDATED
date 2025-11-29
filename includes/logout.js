import { firebaseConfig } from "/includes/firebaseConfig.js";
import {
  initializeApp,
  getApp,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import AdminTrail from "/includes/adminTrail.js";

// Initialize Firebase safely (avoids duplicate initialization)
let app;
try {
  app = initializeApp(firebaseConfig);
} catch (error) {
  app = getApp();
}

const auth = getAuth(app);
const db = getDatabase(app);
const adminTrail = new AdminTrail(db, auth);

// Ensure SweetAlert2 is available (fallback loader)
if (typeof window.Swal === "undefined") {
  const swalScript = document.createElement("script");
  swalScript.src = "https://cdn.jsdelivr.net/npm/sweetalert2@11";
  document.head.appendChild(swalScript);
}

// Handle logout click (defensive null check)
const logoutBtn = document.getElementById("logout");
if (!logoutBtn) {
} else {
  logoutBtn.addEventListener("click", () => {
    Swal.fire({
      title: "Are you sure?",
      text: "Do you really want to log out?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, log me out!",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#1a73e8",
      cancelButtonColor: "#6b7280",
    }).then((result) => {
      if (result.isConfirmed) {
        const email = (auth.currentUser && auth.currentUser.email) || "unknown";
        // Try to record logout first, then proceed to sign out regardless
        Promise.resolve(adminTrail.logLogout(email))
          .catch((e) => {})
          .finally(() =>
            signOut(auth)
              .then(() => {
                Swal.fire({
                  icon: "success",
                  title: "Logged out!",
                  text: "You have been logged out successfully.",
                  showConfirmButton: false,
                  timer: 1500,
                }).then(() => {
                  window.location.href = "/index.html"; // Redirect to login page
                });
              })
              .catch((error) => {
                Swal.fire({
                  icon: "error",
                  title: "Logout Failed",
                  text: "Something went wrong. Please try again.",
                });
              }),
          );
      }
    });
  });
}
