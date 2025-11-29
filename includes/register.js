import { firebaseConfig } from "/includes/firebaseConfig.js";
import {
  initializeApp,
  getApp,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  get,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
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

// DOM elements
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitButton = document.getElementById("submit");
const togglePasswordBtn = document.getElementById("togglePassword");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const registerForm = document.getElementById("registerForm");

const WARNING_KEY = "pcuRegisterAccessWarning";
const DEFAULT_ADMIN_PERMISSIONS = {
  manageEvents: true,
  createEvents: true,
  viewAdminTrail: true,
  manageRelocation: true,
  manageAccounts: true,
};
const DEFAULT_USER_PERMISSIONS = {
  manageEvents: false,
  createEvents: false,
  viewAdminTrail: false,
  manageRelocation: false,
  manageAccounts: false,
};

let isRegistering = false;
let isBootstrapRegistration = false;

function redirectToLogin(message) {
  localStorage.setItem(WARNING_KEY, message);
  window.location.href = "/index.html";
}

async function ensureRegistrationAllowed() {
  const snapshot = await get(ref(db, "users"));
  const hasExistingUsers = snapshot.exists();
  isBootstrapRegistration = !hasExistingUsers;

  if (hasExistingUsers) {
    redirectToLogin(
      "Registration is disabled because accounts already exist. Please sign in or contact an administrator.",
    );
    return false;
  }
  return true;
}

ensureRegistrationAllowed().catch(() => {
  isBootstrapRegistration = false;
  redirectToLogin(
    "Unable to verify registration availability right now. Please try again later.",
  );
});

const storedWarning = localStorage.getItem(WARNING_KEY);
if (storedWarning) {
  localStorage.removeItem(WARNING_KEY);
  Swal.fire({
    icon: "warning",
    title: "Registration Unavailable",
    text: storedWarning,
    confirmButtonText: "OK",
    customClass: { confirmButton: "btn-blue" },
  });
}

// 🛡️ Input Sanitization
function sanitizeInput(input) {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .replace(/[<>"'&]/g, "")
    .substring(0, 1000);
}

// 🛡️ Email Validation (RFC 5322 compliant)
function validateEmail(email) {
  const sanitized = sanitizeInput(email);
  if (!sanitized) return { valid: false, message: "Email is required" };
  if (sanitized.length > 254)
    return { valid: false, message: "Email is too long" };

  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(sanitized)) {
    return { valid: false, message: "Please enter a valid email address" };
  }

  if (!sanitized.toLowerCase().endsWith("@pcu.edu.ph")) {
    return {
      valid: false,
      message: "Email must use the pcu.edu.ph domain",
    };
  }

  return { valid: true, sanitized };
}

// 🛡️ Password Validation
function validatePassword(password) {
  if (!password) return { valid: false, message: "Password is required" };
  if (password.length < 6)
    return { valid: false, message: "Password must be at least 6 characters" };
  if (password.length > 128)
    return { valid: false, message: "Password is too long" };

  return { valid: true };
}

// Show error message
function showError(element, message) {
  element.textContent = message;
  element.style.display = "block";
}

// Clear error message
function clearError(element) {
  element.textContent = "";
  element.style.display = "none";
}

// Password toggle functionality
togglePasswordBtn.addEventListener("click", () => {
  const type =
    passwordInput.getAttribute("type") === "password" ? "text" : "password";
  passwordInput.setAttribute("type", type);

  const showText = togglePasswordBtn.querySelector(".show-text");
  showText.textContent =
    type === "password" ? "Show password" : "Hide password";
});

// Real-time validation
emailInput.addEventListener("input", () => {
  clearError(emailError);
  const validation = validateEmail(emailInput.value);
  if (emailInput.value && !validation.valid) {
    showError(emailError, validation.message);
  }
});

passwordInput.addEventListener("input", () => {
  clearError(passwordError);
  const validation = validatePassword(passwordInput.value);
  if (passwordInput.value && !validation.valid) {
    showError(passwordError, validation.message);
  }
});

// Form submission
registerForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  if (isRegistering) return;

  // Clear previous errors
  clearError(emailError);
  clearError(passwordError);

  // Validate inputs
  const emailValidation = validateEmail(emailInput.value);
  const passwordValidation = validatePassword(passwordInput.value);

  let hasErrors = false;

  if (!emailValidation.valid) {
    showError(emailError, emailValidation.message);
    hasErrors = true;
  }

  if (!passwordValidation.valid) {
    showError(passwordError, passwordValidation.message);
    hasErrors = true;
  }

  if (hasErrors) return;

  // Start registration
  isRegistering = true;
  submitButton.disabled = true;
  submitButton.querySelector(".button-text").textContent =
    "Creating Account...";
  submitButton.querySelector(".button-loader").style.display = "inline-block";

  const sanitizedEmail = emailValidation.sanitized;
  const password = passwordInput.value;

  try {
    const allowed = await ensureRegistrationAllowed();
    if (!allowed) {
      return;
    }

    const userCredential = await createUserWithEmailAndPassword(
      auth,
      sanitizedEmail,
      password,
    );
    const user = userCredential.user;

    // Determine default profile based on bootstrap status
    const role = isBootstrapRegistration ? "admin" : "user";
    const profilePayload = {
      email: sanitizedEmail,
      role,
      createdAt: new Date().toISOString(),
      uid: user.uid,
      permissions: isBootstrapRegistration
        ? { ...DEFAULT_ADMIN_PERMISSIONS }
        : { ...DEFAULT_USER_PERMISSIONS },
    };

    if (isBootstrapRegistration) {
      profilePayload.bootstrapAdmin = true;
    }

    // Create user profile in database with resolved role
    const userRef = ref(db, `users/${user.uid}`);
    await set(userRef, profilePayload);

    // Log registration to admin trail
    adminTrail
      .logAction(
        "REGISTER",
        "USER",
        user.uid,
        {
          userEmail: sanitizedEmail,
          role,
          bootstrapAdmin: isBootstrapRegistration,
          registrationDate: new Date().toISOString(),
        },
        "HIGH",
        "AUTHENTICATION",
      )
      .catch((e) => {});

    // Success
    await Swal.fire({
      title: "✅ Account Created!",
      text: "Your account has been created successfully. You will now be redirected to login.",
      icon: "success",
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
    });

    window.location.href = "/index.html";
  } catch (error) {
    // Log failed registration attempt
    adminTrail
      .logAction(
        "REGISTER_FAILED",
        "USER",
        sanitizedEmail,
        {
          userEmail: sanitizedEmail,
          errorCode: error.code || "UNKNOWN",
          errorMessage: error.message,
          timestamp: new Date().toISOString(),
        },
        "MEDIUM",
        "AUTHENTICATION",
      )
      .catch((e) => {});

    // Show user-friendly error message
    let errorMessage = "Registration failed. Please try again.";

    switch (error.code) {
      case "auth/email-already-in-use":
        errorMessage =
          "Registration failed. Please try again or contact an administrator.";
        break;
      case "auth/invalid-email":
        errorMessage = "Invalid email address format.";
        break;
      case "auth/weak-password":
        errorMessage = "Password is too weak. Please use a stronger password.";
        break;
      case "auth/network-request-failed":
        errorMessage = "Network error. Please check your connection.";
        break;
      case "auth/too-many-requests":
        errorMessage = "Too many attempts. Please try again later.";
        break;
    }

    await Swal.fire({
      title: "Registration Failed",
      text: errorMessage,
      icon: "error",
      confirmButtonText: "OK",
      customClass: { confirmButton: "btn-blue" },
    });
  } finally {
    isRegistering = false;
    submitButton.disabled = false;
    submitButton.querySelector(".button-text").textContent = "Register";
    submitButton.querySelector(".button-loader").style.display = "none";
  }
});
