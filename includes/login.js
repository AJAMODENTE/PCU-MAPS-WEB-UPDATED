import { firebaseConfig } from "/includes/firebaseConfig.js";
import {
  initializeApp,
  getApp,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  update,
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

// Prepare Admin Trail logger
const adminTrail = new AdminTrail(db, auth);

// Security and state management
let isLoggingIn = false;
let loginAttempts = parseInt(localStorage.getItem("loginAttempts") || "0");
let lockoutTime = parseInt(localStorage.getItem("lockoutTime") || "0");
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const ALLOWED_EMAIL_DOMAIN = "pcu.edu.ph";

// Security Functions
function sanitizeInput(input) {
  if (!input) return "";
  return String(input)
    .replace(/[<>"'&]/g, "")
    .trim()
    .slice(0, 1000);
}

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function validateEmail(email) {
  if (!email || typeof email !== "string") {
    return { valid: false, error: "Email is required" };
  }

  const trimmed = email.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "Email is required" };
  }

  if (trimmed.length > 254) {
    return { valid: false, error: "Email is too long" };
  }

  // RFC 5322 compliant email regex
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: "Please enter a valid email address" };
  }

  return { valid: true };
}

function validatePassword(password) {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Password is required" };
  }

  if (password.length === 0) {
    return { valid: false, error: "Password is required" };
  }

  if (password.length < 6) {
    return { valid: false, error: "Password must be at least 6 characters" };
  }

  if (password.length > 128) {
    return { valid: false, error: "Password is too long" };
  }

  return { valid: true };
}

function isAccountLocked() {
  const now = Date.now();
  if (lockoutTime > now) {
    return true;
  } else if (lockoutTime > 0 && lockoutTime <= now) {
    // Lockout expired, reset attempts
    loginAttempts = 0;
    lockoutTime = 0;
    localStorage.setItem("loginAttempts", "0");
    localStorage.removeItem("lockoutTime");
    return false;
  }
  return false;
}

function getRemainingLockoutTime() {
  const now = Date.now();
  const remaining = lockoutTime - now;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / 1000); // seconds
}

function recordFailedAttempt() {
  loginAttempts++;
  localStorage.setItem("loginAttempts", loginAttempts.toString());

  if (loginAttempts >= MAX_ATTEMPTS) {
    lockoutTime = Date.now() + LOCKOUT_DURATION;
    localStorage.setItem("lockoutTime", lockoutTime.toString());
  }
}

function resetLoginAttempts() {
  loginAttempts = 0;
  lockoutTime = 0;
  localStorage.setItem("loginAttempts", "0");
  localStorage.removeItem("lockoutTime");
}

function updateAttemptsDisplay() {
  const attemptsDiv = document.getElementById("loginAttempts");
  const attemptsText = document.getElementById("attemptsText");

  if (isAccountLocked()) {
    const remainingSeconds = getRemainingLockoutTime();
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    attemptsDiv.style.display = "flex";
    attemptsText.textContent = `Account locked. Try again in ${minutes}m ${seconds}s`;
    return true;
  } else if (loginAttempts > 0 && loginAttempts < MAX_ATTEMPTS) {
    const remaining = MAX_ATTEMPTS - loginAttempts;
    attemptsDiv.style.display = "flex";
    attemptsText.textContent = `${remaining} attempt${remaining !== 1 ? "s" : ""} remaining`;
    return false;
  } else {
    attemptsDiv.style.display = "none";
    return false;
  }
}

function getSafeErrorMessage(error) {
  // Sanitize Firebase error messages to prevent information disclosure
  const errorCode = error.code || "";

  if (
    errorCode === "auth/user-not-found" ||
    errorCode === "auth/wrong-password"
  ) {
    return "Invalid email or password";
  } else if (errorCode === "auth/invalid-email") {
    return "Invalid email format";
  } else if (errorCode === "auth/user-disabled") {
    return "This account has been disabled";
  } else if (errorCode === "auth/too-many-requests") {
    return "Too many failed attempts. Please try again later";
  } else if (errorCode === "auth/network-request-failed") {
    return "Network error. Please check your connection";
  } else if (errorCode === "auth/invalid-credential") {
    return "Invalid email or password";
  } else {
    return "Login failed. Please try again";
  }
}

// DOM Elements
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitButton = document.getElementById("submit");
const loginForm = document.getElementById("loginForm");
const togglePasswordBtn = document.getElementById("togglePassword");
const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");
const forgotPasswordButton = document.getElementById("forgotPassword");

// Real-time validation
function validateFormInputs() {
  const emailValidation = validateEmail(emailInput.value);
  const passwordValidation = validatePassword(passwordInput.value);

  // Update email error
  if (emailInput.value && !emailValidation.valid) {
    emailError.textContent = emailValidation.error;
    emailError.style.display = "block";
  } else {
    emailError.style.display = "none";
  }

  // Update password error
  if (passwordInput.value && !passwordValidation.valid) {
    passwordError.textContent = passwordValidation.error;
    passwordError.style.display = "block";
  } else {
    passwordError.style.display = "none";
  }

  // Enable/disable submit button
  const isValid =
    emailValidation.valid && passwordValidation.valid && !isAccountLocked();
  submitButton.disabled = !isValid || isLoggingIn;
}

// Toggle password visibility
if (togglePasswordBtn) {
  togglePasswordBtn.addEventListener("click", () => {
    const type = passwordInput.type === "password" ? "text" : "password";
    passwordInput.type = type;
    togglePasswordBtn.querySelector(".show-text").textContent =
      type === "password" ? "Show password" : "Hide password";
    togglePasswordBtn.setAttribute(
      "aria-label",
      type === "password" ? "Show password" : "Hide password",
    );
    togglePasswordBtn.dataset.visibility =
      type === "password" ? "hidden" : "visible";
  });
}

// Input event listeners
emailInput.addEventListener("input", validateFormInputs);
passwordInput.addEventListener("input", validateFormInputs);

if (forgotPasswordButton) {
  forgotPasswordButton.addEventListener("click", async () => {
    if (isLoggingIn) {
      return;
    }

    const prefill = emailInput.value ? emailInput.value.trim() : "";
    const safePrefill = escapeHtml(prefill);

    const { value: resetEmail } = await Swal.fire({
      title: "Forgot your password?",
      html: `
        <div class="reset-request-body">
          <div class="reset-request-illustration" aria-hidden="true">🔐</div>
          <p class="reset-request-text">
            Enter your <strong>@${ALLOWED_EMAIL_DOMAIN}</strong> email address and we'll send you a secure link to reset your password.
          </p>
          <label class="reset-request-label" for="resetEmailInput">Email address</label>
          <div class="reset-request-input-wrapper">
            <span class="reset-request-icon" aria-hidden="true">@</span>
            <input
              id="resetEmailInput"
              class="swal2-input reset-request-input"
              type="email"
              name="resetEmail"
              autocomplete="email"
              spellcheck="false"
              autocapitalize="none"
              placeholder="you@${ALLOWED_EMAIL_DOMAIN}"
              maxlength="254"
              value="${safePrefill}"
            />
          </div>
          <p class="reset-request-error" id="resetEmailError" role="alert" aria-live="polite"></p>
          <p class="reset-request-hint">We’ll never share your email. Make sure to check your spam folder if you don’t see the message.</p>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      cancelButtonText: "Cancel",
      confirmButtonText: "Send Reset Link",
      showCloseButton: true,
      customClass: {
        popup: "reset-request-popup",
        confirmButton: "btn-blue",
      },
      willOpen: () => {
        Swal.resetValidationMessage();
      },
      didOpen: () => {
        const inputEl = document.getElementById("resetEmailInput");
        const errorEl = document.getElementById("resetEmailError");
        if (inputEl) {
          setTimeout(() => inputEl.focus(), 10);
          inputEl.addEventListener("input", () => {
            if (errorEl) errorEl.textContent = "";
            Swal.resetValidationMessage();
          });
        }
      },
      preConfirm: () => {
        const inputEl = document.getElementById("resetEmailInput");
        const errorEl = document.getElementById("resetEmailError");
        const rawValue = (inputEl?.value || "").trim();
        const normalized = rawValue.toLowerCase();

        if (errorEl) errorEl.textContent = "";

        const { valid, error } = validateEmail(normalized);
        if (!valid) {
          if (errorEl) errorEl.textContent = error;
          Swal.showValidationMessage(error);
          return false;
        }

        if (!normalized.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
          const domainError = `Please use your @${ALLOWED_EMAIL_DOMAIN} email address.`;
          if (errorEl) errorEl.textContent = domainError;
          Swal.showValidationMessage(domainError);
          return false;
        }

        return normalized;
      },
      allowOutsideClick: () => !Swal.isLoading(),
    });

    if (!resetEmail) {
      return;
    }

    try {
      await sendPasswordResetEmail(auth, resetEmail);

      adminTrail
        .logAction(
          "PASSWORD_RESET_REQUEST",
          "USER",
          resetEmail,
          {
            userEmail: resetEmail,
            timestamp: new Date().toISOString(),
          },
          "MEDIUM",
          "AUTHENTICATION",
        )
        .catch((e) => {});

      const safeEmail = escapeHtml(resetEmail);

      await Swal.fire({
        icon: "success",
        title: "Reset link on its way",
        html: `
          <div class="reset-success-body">
            <p>We have emailed <strong>${safeEmail}</strong> with a link to reset your password.</p>
            <ul class="reset-success-tips">
              <li>The link will only be active for a limited time.</li>
              <li>Check your spam or junk folder if you don’t see it soon.</li>
            </ul>
          </div>
        `,
        confirmButtonText: "Got it",
        customClass: {
          popup: "reset-success-popup",
          confirmButton: "btn-blue",
        },
      });
    } catch (error) {
      let message = "Unable to send a reset link right now.";
      if (error?.code === "auth/user-not-found") {
        message = "No account found with that email address.";
      } else if (error?.code === "auth/invalid-email") {
        message = "Invalid email address format.";
      } else if (error?.code === "auth/network-request-failed") {
        message = "Network error. Please check your connection.";
      } else if (error?.code === "auth/too-many-requests") {
        message = "Too many reset attempts. Please try again later.";
      }

      await Swal.fire({
        icon: "error",
        title: "Reset Failed",
        text: message,
        confirmButtonText: "OK",
        customClass: { confirmButton: "btn-blue" },
      });
    }
  });
}

// Check lockout status on page load
updateAttemptsDisplay();
if (isAccountLocked()) {
  submitButton.disabled = true;
  // Update countdown every second
  const countdownInterval = setInterval(() => {
    if (!updateAttemptsDisplay()) {
      clearInterval(countdownInterval);
      validateFormInputs();
    }
  }, 1000);
}

// Form submission
loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  // Prevent concurrent login attempts
  if (isLoggingIn) {
    return;
  }

  // Check if account is locked
  if (isAccountLocked()) {
    const remainingSeconds = getRemainingLockoutTime();
    const minutes = Math.floor(remainingSeconds / 60);
    Swal.fire({
      title: "Account Locked",
      html: `Too many failed attempts.<br>Please try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`,
      icon: "error",
      confirmButtonText: "OK",
      customClass: { confirmButton: "btn-blue" },
    });
    return;
  }

  const email = sanitizeInput(emailInput.value);
  const password = passwordInput.value; // Don't sanitize password
  const normalizedEmail = email.trim().toLowerCase();

  // Validate inputs
  const emailValidation = validateEmail(email);
  const passwordValidation = validatePassword(password);

  if (!emailValidation.valid) {
    emailError.textContent = emailValidation.error;
    emailError.style.display = "block";
    emailInput.focus();
    return;
  }

  if (!passwordValidation.valid) {
    passwordError.textContent = passwordValidation.error;
    passwordError.style.display = "block";
    passwordInput.focus();
    return;
  }

  // Set loading state
  isLoggingIn = true;
  submitButton.disabled = true;
  submitButton.querySelector(".button-text").textContent = "Logging in...";
  submitButton.querySelector(".button-loader").style.display = "inline-block";

  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const user = userCredential.user;

    // Load provisioned account record
    const userRecordRef = ref(db, `users/${user.uid}`);
    let userRecordSnapshot;
    try {
      userRecordSnapshot = await get(userRecordRef);
    } catch (recordError) {
      await signOut(auth);
      await Swal.fire({
        title: "Access Error",
        text: "We couldn't verify your account permissions. Please try again later.",
        icon: "error",
      });
      throw recordError;
    }

    if (!userRecordSnapshot.exists()) {
      adminTrail
        .logAction(
          "LOGIN_BLOCKED",
          "USER",
          user.uid,
          {
            userEmail: user.email || normalizedEmail,
            reason: "missing_directory_record",
            timestamp: new Date().toISOString(),
          },
          "HIGH",
          "AUTHENTICATION",
        )
        .catch(() => {});

      await signOut(auth);
      await Swal.fire({
        title: "Access Restricted",
        text: "This account is not provisioned in the PCU Maps directory. Please contact an administrator.",
        icon: "error",
      });
      return;
    }

    const userRecord = userRecordSnapshot.val();
    const isAdminAccount =
      userRecord?.role === "admin" || userRecord?.bootstrapAdmin === true;

    if (userRecord?.isDisabled || userRecord?.deletedAt) {
      await signOut(auth);

      adminTrail
        .logAction(
          "LOGIN_BLOCKED",
          "USER",
          user.uid,
          {
            userEmail: user.email || normalizedEmail,
            reason: userRecord?.isDisabled ? "disabled" : "deleted",
            timestamp: new Date().toISOString(),
          },
          "HIGH",
          "AUTHENTICATION",
        )
        .catch((e) => {});

      await Swal.fire({
        title: "Account Disabled",
        text: "This account is currently disabled. Please contact an administrator.",
        icon: "error",
      });
      return;
    }

    if (!user.emailVerified && !isAdminAccount) {
      resetLoginAttempts();

      adminTrail
        .logAction(
          "LOGIN_BLOCKED",
          "USER",
          user.uid,
          {
            userEmail: user.email || normalizedEmail,
            reason: "unverified",
            timestamp: new Date().toISOString(),
          },
          "MEDIUM",
          "AUTHENTICATION",
        )
        .catch((e) => {});

      const verificationPrompt = await Swal.fire({
        title: "Verify Your Email",
        html: `We sent an activation email to <strong>${escapeHtml(user.email || normalizedEmail)}</strong>.<br>Please verify it before signing in.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Resend Email",
        cancelButtonText: "OK",
        customClass: { confirmButton: "btn-blue" },
      });

      if (verificationPrompt.isConfirmed) {
        try {
          await sendEmailVerification(user);
          await Swal.fire({
            icon: "success",
            title: "Verification Email Sent",
            text: `A new verification link was sent to ${user.email || normalizedEmail}.`,
            confirmButtonText: "OK",
            customClass: { confirmButton: "btn-blue" },
          });
        } catch (resendError) {
          let resendMessage = "Unable to send a verification email right now.";
          if (resendError?.code === "auth/too-many-requests") {
            resendMessage = "Too many attempts. Please try again later.";
          } else if (resendError?.code === "auth/network-request-failed") {
            resendMessage = "Network error. Check your connection and try again.";
          }

          await Swal.fire({
            icon: "error",
            title: "Resend Failed",
            text: resendMessage,
            confirmButtonText: "OK",
            customClass: { confirmButton: "btn-blue" },
          });
        }
      }

      await signOut(auth);
      return;
    }

    await update(userRecordRef, {
      email: user.email || normalizedEmail,
      emailVerified: Boolean(user.emailVerified),
      lastLoginAt: new Date().toISOString(),
    });

    // Reset login attempts on successful login
    resetLoginAttempts();

    // Log successful login to Admin Trail (non-blocking)
    adminTrail.logLogin(user.email || normalizedEmail).catch((e) => {});

    await Swal.fire({
      title: "Login Successful!",
      text: `Welcome back, ${escapeHtml(user.email || normalizedEmail)}`,
      icon: "success",
      showConfirmButton: false,
      timer: 1500,
    });

    // Redirect to dashboard
    window.location.href = "/pages/manage_events.html";
  } catch (error) {
    // Record failed attempt
    recordFailedAttempt();
    updateAttemptsDisplay();

    // Log failed login attempt to admin trail
    adminTrail
      .logAction(
        "LOGIN_FAILED",
        "USER",
        normalizedEmail,
        {
          userEmail: normalizedEmail,
          errorCode: error.code || "UNKNOWN",
          attemptCount: loginAttempts,
          isLocked: isAccountLocked(),
          timestamp: new Date().toISOString(),
        },
        "MEDIUM",
        "AUTHENTICATION",
      )
      .catch((e) => {});

    // Get safe error message
    const safeErrorMessage = getSafeErrorMessage(error);

    // Show error with attempts remaining
    let errorHtml = safeErrorMessage;
    if (isAccountLocked()) {
      const minutes = Math.floor(LOCKOUT_DURATION / 60000);
      errorHtml += `<br><br><strong>Account locked for ${minutes} minutes due to too many failed attempts.</strong>`;
    } else if (loginAttempts < MAX_ATTEMPTS) {
      const remaining = MAX_ATTEMPTS - loginAttempts;
      errorHtml += `<br><br>${remaining} attempt${remaining !== 1 ? "s" : ""} remaining before account lockout.`;
    }

    await Swal.fire({
      title: "Login Failed",
      html: errorHtml,
      icon: "error",
      confirmButtonText: "OK",
      customClass: { confirmButton: "btn-blue" },
    });
  } finally {
    // Reset button state
    isLoggingIn = false;
    submitButton.querySelector(".button-text").textContent = "Login";
    submitButton.querySelector(".button-loader").style.display = "none";
    validateFormInputs();
  }
});
