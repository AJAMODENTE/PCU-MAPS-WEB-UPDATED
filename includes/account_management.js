import { firebaseConfig } from "/includes/firebaseConfig.js";
import {
  initializeApp,
  getApp,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  update,
  remove,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import AdminTrail from "/includes/adminTrail.js";

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (error) {
  app = getApp();
}

const db = getDatabase(app);
const auth = getAuth(app);
const adminTrail = new AdminTrail(db, auth);

const MAX_ADMIN_ACCOUNTS = 1;
let adminCount = 0;
let currentUserId = null;

let provisioningApp;
try {
  provisioningApp = initializeApp(firebaseConfig, "pcu-account-provisioning");
} catch (error) {
  provisioningApp = getApp("pcu-account-provisioning");
}

const provisioningAuth = getAuth(provisioningApp);

const PERMISSIONS = [
  { key: "manageEvents", label: "Manage Events" },
  { key: "createEvents", label: "Create Events" },
  { key: "viewAdminTrail", label: "View Admin Trail" },
  { key: "manageRelocation", label: "Manage Relocation" },
];
const MANAGE_ACCOUNTS_KEY = "manageAccounts";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
];

const accountsLoading = document.getElementById("accountsLoading");
const accountsTableBody = document.getElementById("accountsTableBody");
const accountsEmptyState = document.getElementById("accountsEmpty");
const refreshButton = document.getElementById("refreshAccounts");
const accountManagementRoot = document.querySelector(".account-management");
const accountCreateButton = document.getElementById("openAccountCreateModal");
const BOOTSTRAP_MESSAGE_KEY = "pcuBootstrapAdminInfoShown";
const isAccountManagementPage = window.location.pathname.includes(
  "account_management.html",
);
const DEFAULT_ADMIN_PERMISSIONS = PERMISSIONS.reduce((acc, permission) => {
  acc[permission.key] = true;
  return acc;
}, {});
DEFAULT_ADMIN_PERMISSIONS[MANAGE_ACCOUNTS_KEY] = true;

const DEFAULT_USER_PERMISSIONS = PERMISSIONS.reduce((acc, permission) => {
  acc[permission.key] = false;
  return acc;
}, {});
DEFAULT_USER_PERMISSIONS[MANAGE_ACCOUNTS_KEY] = false;

if (accountManagementRoot) {
  accountManagementRoot.style.display = "none";
}

refreshButton?.addEventListener("click", () => {
  hydrateAccounts();
});

if (accountCreateButton) {
  accountCreateButton.addEventListener("click", openCreateAccountDialog);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    return;
  }

  currentUserId = user.uid;

  try {
    const [currentUserSnapshot, usersSnapshot] = await Promise.all([
      get(ref(db, `users/${user.uid}`)),
      get(ref(db, "users")),
    ]);

    const currentUserData = currentUserSnapshot.exists()
      ? currentUserSnapshot.val()
      : null;
    const usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};
    const hasAdmin = Object.values(usersData).some(
      (entry) => entry?.role === "admin",
    );

    let resolvedUserData = currentUserData;

    if (!hasAdmin) {
      const bootstrapPayload = {
        email: user.email || "",
        role: "admin",
        permissions: {
          ...DEFAULT_ADMIN_PERMISSIONS,
        },
        bootstrapAdmin: true,
        updatedAt: new Date().toISOString(),
      };

      await update(ref(db, `users/${user.uid}`), bootstrapPayload);

      resolvedUserData = {
        ...(resolvedUserData || {}),
        ...bootstrapPayload,
      };

      try {
        await adminTrail.logAction(
          "BOOTSTRAP_ADMIN",
          "USER",
          user.uid,
          {
            targetEmail: user.email || "",
            note: "First admin automatically provisioned",
          },
          "CRITICAL",
          "ACCOUNT_MANAGEMENT",
        );
      } catch (trailError) {
        console.warn("Admin trail bootstrap log failed", trailError);
      }

      const modalAlreadyShown =
        sessionStorage.getItem(BOOTSTRAP_MESSAGE_KEY) ||
        localStorage.getItem(BOOTSTRAP_MESSAGE_KEY);

      if (!modalAlreadyShown && isAccountManagementPage) {
        await Swal.fire({
          title: "Admin Access Granted",
          text: "You're the first administrator in the directory, so full access has been granted to set up other accounts.",
          icon: "info",
          confirmButtonText: "Continue",
        });
        sessionStorage.setItem(BOOTSTRAP_MESSAGE_KEY, "true");
        localStorage.setItem(BOOTSTRAP_MESSAGE_KEY, "true");
      }
    }

    const isAdminUser =
      resolvedUserData?.role === "admin" || resolvedUserData?.bootstrapAdmin;

    if (!isAdminUser) {
      await Swal.fire({
        title: "Access Restricted",
        text: "Only administrators can manage accounts.",
        icon: "warning",
        confirmButtonText: "Back to dashboard",
      });
      window.location.href = "/pages/manage_events.html";
      return;
    }

    if (accountManagementRoot) {
      accountManagementRoot.style.display = "flex";
    }

    if (isAdminUser) {
      adminCount = 1;
    }

    hydrateAccounts();
  } catch (error) {
    console.error("Failed to verify admin role", error);
    await Swal.fire({
      title: "Error",
      text: "Unable to verify your access rights.",
      icon: "error",
    });
    window.location.href = "/pages/manage_events.html";
  }
});

async function hydrateAccounts() {
  renderLoading(true);
  if (accountsTableBody) {
    accountsTableBody.innerHTML = "";
  }
  accountsEmptyState.hidden = true;

  try {
    const usersSnapshot = await get(ref(db, "users"));

    const users = usersSnapshot.exists() ? usersSnapshot.val() : {};
    const allEntries = Object.entries(users);

    adminCount = allEntries.reduce((count, [, data]) => {
      return count + (normalizeRole(data?.role) === "admin" ? 1 : 0);
    }, 0);

    const orderedUsers = allEntries.sort(([, a], [, b]) => {
      const aEmail = (a?.email || "").toLowerCase();
      const bEmail = (b?.email || "").toLowerCase();
      return aEmail.localeCompare(bEmail);
    });

    let renderedCount = 0;

    const visibleUsers = orderedUsers.filter(([uid, data]) => {
      if (uid === currentUserId) {
        return false;
      }
      return normalizeRole(data?.role) !== "admin";
    });

    visibleUsers.forEach(([uid, userData]) => {
      const row = renderUserRow(uid, userData || {});
      if (row) {
        renderedCount += 1;
      }
    });

    if (renderedCount === 0) {
      accountsEmptyState.hidden = false;
    }
  } catch (error) {
    console.error("Failed to load accounts", error);
    await Swal.fire({
      title: "Error",
      text: "Unable to load user list. Please try again later.",
      icon: "error",
    });
  } finally {
    renderLoading(false);
  }
}

function renderLoading(isLoading) {
  if (!accountsLoading) return;
  accountsLoading.style.display = isLoading ? "flex" : "none";
}

function renderUserRow(uid, userData) {
  const row = document.createElement("tr");
  const email = userData.email || "Unknown";
  const role = normalizeRole(userData.role);
  const permissions = userData.permissions || {};
  const isDisabled = Boolean(userData?.isDisabled);
  const emailVerified = Boolean(userData.emailVerified);

  const statusBadges = [];
  if (isDisabled) {
    statusBadges.push(
      '<span class="user-status user-status--disabled">Disabled</span>',
    );
  }
  if (emailVerified) {
    statusBadges.push(
      '<span class="user-status user-status--verified">Verified</span>',
    );
  } else {
    statusBadges.push(
      '<span class="user-status user-status--unverified">Unverified</span>',
    );
  }

  const statusMarkup = statusBadges.join("");

  row.innerHTML = `
    <td>
      <div class="accounts-user-cell">
        <span class="user-email">${escapeHtml(email)}</span>
        <span class="user-id">${escapeHtml(uid)}</span>
        ${statusMarkup}
      </div>
    </td>
    <td>
      <select class="accounts-role-select" data-uid="${uid}">
        ${ROLE_OPTIONS.map(
          (option) => `
            <option value="${option.value}" ${
            option.value === role ? "selected" : ""
          }>
              ${option.label}
            </option>
          `,
        ).join("")}
      </select>
    </td>
    <td>
      <div class="accounts-permissions-group">
        ${PERMISSIONS.map(
          (permission) => `
            <label class="permission-pill">
              <input
                type="checkbox"
                class="permission-checkbox"
                data-uid="${uid}"
                data-permission="${permission.key}"
                ${permissions?.[permission.key] ? "checked" : ""}
              />
              <span>${permission.label}</span>
            </label>
          `,
        ).join("")}
      </div>
    </td>
    <td class="actions-col">
      <div class="accounts-action-buttons">
        <button class="btn accounts-save-btn" data-uid="${uid}" disabled>
          Save
        </button>
        <button
          class="btn accounts-disable-btn ${
            isDisabled ? "is-disabled" : ""
          }"
          data-uid="${uid}"
          data-email="${escapeHtml(email)}"
          data-disabled="${isDisabled}"
        >
          ${isDisabled ? "Enable" : "Disable"}
        </button>
        <button
          class="btn accounts-delete-btn"
          data-uid="${uid}"
          data-email="${escapeHtml(email)}"
        >
          Delete
        </button>
      </div>
    </td>
  `;

  accountsTableBody?.appendChild(row);

  const saveButton = row.querySelector(".accounts-save-btn");
  const roleSelect = row.querySelector(".accounts-role-select");
  const checkboxes = row.querySelectorAll(".permission-checkbox");
  const disableButton = row.querySelector(".accounts-disable-btn");
  const deleteButton = row.querySelector(".accounts-delete-btn");

  const markDirty = () => {
    saveButton.disabled = false;
    saveButton.textContent = "Save";
  };

  if (roleSelect) {
    roleSelect.dataset.initialRole = role;
  }

  roleSelect?.addEventListener("change", (event) => {
    const newRole = event.target.value;
    if (
      newRole === "admin" &&
      adminCount >= MAX_ADMIN_ACCOUNTS &&
      role !== "admin"
    ) {
      Swal.fire({
        icon: "warning",
        title: "Admin Limit Reached",
        text: "Only one admin account is allowed.",
      });
      roleSelect.value = role;
      return;
    }
    if (newRole === "admin") {
      checkboxes.forEach((checkbox) => {
        checkbox.checked = true;
      });
    } else {
      checkboxes.forEach((checkbox) => {
        const defaultValue = DEFAULT_USER_PERMISSIONS[checkbox.dataset.permission];
        checkbox.checked = Boolean(defaultValue);
      });
    }
    markDirty();
  });
  checkboxes.forEach((checkbox) =>
    checkbox.addEventListener("change", markDirty),
  );

  saveButton?.addEventListener("click", () =>
    persistUserChanges(uid, roleSelect, checkboxes, saveButton, email),
  );

  disableButton?.addEventListener("click", () => {
    const currentState = disableButton.dataset.disabled === "true";
    toggleUserDisabled(uid, email, !currentState);
  });

  deleteButton?.addEventListener("click", () => {
    confirmDeleteUser(uid, email);
  });

  row.classList.toggle("is-disabled", isDisabled);

  return row;
}

function renderAuthOnlyRow(uid, email) {
  if (!accountsTableBody) {
    return null;
  }

  const row = document.createElement("tr");
  row.classList.add("is-auth-only");

  row.innerHTML = `
    <td>
      <div class="accounts-user-cell">
        <span class="user-email">${escapeHtml(email)}</span>
        <span class="user-id">${escapeHtml(uid)}</span>
        <span class="user-status user-status--auth-only">Auth Only</span>
      </div>
    </td>
    <td>
      <span class="accounts-role-note">Not provisioned</span>
    </td>
    <td>
      <span class="accounts-permission-note">No directory permissions</span>
    </td>
    <td class="actions-col">
      <span class="accounts-action-note">Link this user to manage permissions</span>
    </td>
  `;

  accountsTableBody.appendChild(row);
  return row;
}

function collectAuthOnlyUsers(trailData, knownUserIds, knownEmails) {
  if (!trailData) {
    return [];
  }

  const entries = Object.values(trailData);
  const deletedUserIds = new Set();
  const deletedEmails = new Set();

  entries.forEach((entry) => {
    if (!entry) {
      return;
    }

    const action = (entry.action || "").toUpperCase();
    if (action !== "DELETE_ACCOUNT") {
      return;
    }

    const targetUid = entry.entityId || entry.details?.targetUid || null;
    if (targetUid) {
      deletedUserIds.add(targetUid);
      knownUserIds.add(targetUid);
    }

    const targetEmail =
      entry.details?.targetEmail ||
      entry.details?.userEmail ||
      (typeof entry.entityId === "string" && entry.entityId.includes("@")
        ? entry.entityId
        : null);

    if (targetEmail) {
      const normalized = targetEmail.toLowerCase();
      deletedEmails.add(normalized);
      knownEmails.add(normalized);
    }
  });

  const authOnlyMap = new Map();

  entries.forEach((entry) => {
    const uid = entry?.userId;
    let emailCandidate = entry?.userEmail || "";

    if (!uid || knownUserIds.has(uid) || deletedUserIds.has(uid)) {
      return;
    }

    if (!emailCandidate && typeof entry?.details === "object" && entry.details) {
      const detailEmail =
        entry.details.targetEmail ||
        entry.details.userEmail ||
        entry.details.email ||
        null;
      if (detailEmail) {
        emailCandidate = detailEmail;
      }
    }

    if (
      !emailCandidate &&
      typeof entry?.entityId === "string" &&
      entry.entityId.includes("@")
    ) {
      emailCandidate = entry.entityId;
    }

    if (
      !emailCandidate &&
      typeof entry?.userId === "string" &&
      entry.userId.includes("@")
    ) {
      emailCandidate = entry.userId;
    }

    if (!emailCandidate) {
      return;
    }

    const normalizedEmail = emailCandidate.toLowerCase();
    if (knownEmails.has(normalizedEmail) || deletedEmails.has(normalizedEmail)) {
      return;
    }

    if (!authOnlyMap.has(uid)) {
      authOnlyMap.set(uid, {
        uid,
        email: emailCandidate,
      });
      knownEmails.add(normalizedEmail);
    }
  });

  return Array.from(authOnlyMap.values()).sort((a, b) => {
    const aEmail = a.email.toLowerCase();
    const bEmail = b.email.toLowerCase();
    return aEmail.localeCompare(bEmail);
  });
}

async function persistUserChanges(
  uid,
  roleSelect,
  checkboxes,
  saveButton,
  email,
) {
  if (!roleSelect || !saveButton) return;

  const selectedRole = roleSelect.value;
  const initialRole = roleSelect.dataset.initialRole || "user";

  if (
    selectedRole === "admin" &&
    adminCount >= MAX_ADMIN_ACCOUNTS &&
    initialRole !== "admin"
  ) {
    await Swal.fire({
      icon: "warning",
      title: "Admin Limit Reached",
      text: "Only one admin account is allowed.",
    });
    roleSelect.value = initialRole;
    return;
  }

  if (uid === auth.currentUser?.uid && selectedRole !== "admin") {
    await Swal.fire({
      title: "Action Blocked",
      text: "You cannot remove your own administrative access.",
      icon: "warning",
    });
    roleSelect.value = "admin";
    return;
  }

  const permissionsPayload = {};
  checkboxes.forEach((checkbox) => {
    permissionsPayload[checkbox.dataset.permission] = checkbox.checked;
  });
  permissionsPayload[MANAGE_ACCOUNTS_KEY] = selectedRole === "admin";

  try {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    await update(ref(db, `users/${uid}`), {
      role: selectedRole,
      permissions: permissionsPayload,
    });

    await adminTrail.logAction(
      "UPDATE_PERMISSIONS",
      "USER",
      uid,
      {
        targetEmail: email,
        role: selectedRole,
        permissions: permissionsPayload,
      },
      "HIGH",
      "ACCOUNT_MANAGEMENT",
    );

    saveButton.textContent = "Saved";
    setTimeout(() => {
      saveButton.textContent = "Save";
      saveButton.disabled = true;
    }, 1200);

    Swal.fire({
      title: "Updated",
      text: "Account permissions saved successfully.",
      icon: "success",
      timer: 1600,
      showConfirmButton: false,
    });

    hydrateAccounts();
  } catch (error) {
    console.error("Failed to update user", error);
    saveButton.textContent = "Save";
    saveButton.disabled = false;

    Swal.fire({
      title: "Error",
      text: "Unable to save changes right now.",
      icon: "error",
    });
  }
}

async function toggleUserDisabled(uid, email, shouldDisable) {
  if (!uid) return;

  const verb = shouldDisable ? "Disable" : "Enable";
  const confirmMessage = shouldDisable
    ? `Disable access for ${email}?`
    : `Re-enable access for ${email}?`;

  const result = await Swal.fire({
    icon: "question",
    title: `${verb} Account`,
    text: confirmMessage,
    showCancelButton: true,
    confirmButtonText: verb,
    confirmButtonColor: shouldDisable ? "#f97316" : "#059669",
  });

  if (!result.isConfirmed) {
    return;
  }

  try {
    await update(ref(db, `users/${uid}`), {
      isDisabled: shouldDisable,
      updatedAt: new Date().toISOString(),
    });

    try {
      await adminTrail.logAction(
        shouldDisable ? "DISABLE_ACCOUNT" : "ENABLE_ACCOUNT",
        "USER",
        uid,
        {
          targetEmail: email,
        },
        "HIGH",
        "ACCOUNT_MANAGEMENT",
      );
    } catch (trailError) {
      console.warn("Failed to log account state change", trailError);
    }

    await Swal.fire({
      icon: "success",
      title: `Account ${shouldDisable ? "Disabled" : "Enabled"}`,
      text: `${email} ${shouldDisable ? "can no longer" : "may now"} sign in.`,
      timer: 1800,
      showConfirmButton: false,
    });
    hydrateAccounts();
  } catch (error) {
    console.error("Failed to toggle account state", error);
    await Swal.fire({
      icon: "error",
      title: "Update Failed",
      text: "Unable to change the account state right now.",
    });
  }
}

async function confirmDeleteUser(uid, email) {
  if (!uid) return;

  const result = await Swal.fire({
    icon: "warning",
    title: "Delete Account",
    html: `Removing <strong>${escapeHtml(email)}</strong> revokes their access. This does not delete their Firebase Auth credentials but prevents sign-in through this app.`,
    showCancelButton: true,
    confirmButtonText: "Delete Account",
    confirmButtonColor: "#ef4444",
  });

  if (!result.isConfirmed) {
    return;
  }

  await deleteUserAccount(uid, email);
}

async function deleteUserAccount(uid, email) {
  try {
    await remove(ref(db, `users/${uid}`));

    try {
      await adminTrail.logAction(
        "DELETE_ACCOUNT",
        "USER",
        uid,
        {
          targetEmail: email,
        },
        "HIGH",
        "ACCOUNT_MANAGEMENT",
      );
    } catch (trailError) {
      console.warn("Failed to log account deletion", trailError);
    }

    await Swal.fire({
      icon: "success",
      title: "Account Removed",
      text: `${email} can no longer access the dashboard.`,
      timer: 1800,
      showConfirmButton: false,
    });

    hydrateAccounts();
  } catch (error) {
    console.error("Failed to delete account", error);
    await Swal.fire({
      icon: "error",
      title: "Deletion Failed",
      text: "Unable to delete the account right now.",
    });
  }
}

function normalizeRole(role) {
  if (role === "admin") {
    return "admin";
  }
  return "user";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildPermissionsForRole(role) {
  if (role === "admin") {
    return { ...DEFAULT_ADMIN_PERMISSIONS };
  }
  return { ...DEFAULT_USER_PERMISSIONS };
}

let isCreatingAccount = false;

async function openCreateAccountDialog() {
  if (isCreatingAccount) {
    return;
  }

  const canCreateAdmin = adminCount < MAX_ADMIN_ACCOUNTS;
  const shouldForceAdmin = adminCount === 0;
  const roleOptionsHtml = ROLE_OPTIONS.map(({ value, label }) => {
    const isAdminOption = value === "admin";
    const disableForLimit = !canCreateAdmin && isAdminOption;
    const disableForForce = shouldForceAdmin && !isAdminOption;
    const attrs = [];
    if (shouldForceAdmin ? isAdminOption : value === "user") {
      attrs.push("selected");
    }
    if (disableForLimit || disableForForce) {
      attrs.push("disabled");
    }
    let suffix = "";
    if (disableForLimit) {
      suffix = " (limit reached)";
    } else if (shouldForceAdmin && isAdminOption) {
      suffix = " (required)";
    }
    return `<option value="${value}" ${attrs.join(" ")}>${label}${suffix}</option>`;
  }).join("");

  const forcedAdminNotice = shouldForceAdmin
    ? `<div class="swal-account-notice">First directory account will be provisioned with administrator access so you can manage other users.</div>`
    : "";

  const { value: formValues } = await Swal.fire({
    title: "Create New Account",
    html: `
      <div class="swal-account-create">
        ${forcedAdminNotice}
        <label for="swalAccountEmail">
          <span>Email address</span>
          <input type="email" id="swalAccountEmail" placeholder="example@pcu.edu.ph" autocomplete="off" />
        </label>
        <label for="swalAccountPassword">
          <span>Temporary password</span>
          <input type="password" id="swalAccountPassword" minlength="6" placeholder="At least 6 characters" autocomplete="off" />
        </label>
        <label for="swalAccountConfirm">
          <span>Confirm password</span>
          <input type="password" id="swalAccountConfirm" minlength="6" placeholder="Re-enter password" autocomplete="off" />
        </label>
        <label for="swalAccountRole">
          <span>Role</span>
          <select id="swalAccountRole">
            ${roleOptionsHtml}
          </select>
        </label>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: shouldForceAdmin ? "Create Admin Account" : "Create Account",
    preConfirm: () => {
      const emailInput = document.getElementById("swalAccountEmail");
      const passwordInput = document.getElementById("swalAccountPassword");
      const confirmInput = document.getElementById("swalAccountConfirm");
      const roleSelect = document.getElementById("swalAccountRole");

      const emailValue = emailInput?.value?.trim() || "";
      const passwordValue = passwordInput?.value || "";
      const confirmValue = confirmInput?.value || "";
      const roleValue = shouldForceAdmin ? "admin" : roleSelect?.value || "user";

      if (!shouldForceAdmin && roleValue === "admin" && !canCreateAdmin) {
        Swal.showValidationMessage("Only one admin account is allowed.");
        roleSelect?.focus();
        return false;
      }

      if (!validateEmailFormat(emailValue)) {
        Swal.showValidationMessage(
          "Please use a valid pcu.edu.ph email address.",
        );
        emailInput?.focus();
        return false;
      }

      if (!validatePassword(passwordValue)) {
        Swal.showValidationMessage(
          "Temporary password must be at least 6 characters.",
        );
        passwordInput?.focus();
        return false;
      }

      if (passwordValue !== confirmValue) {
        Swal.showValidationMessage("Passwords do not match.");
        confirmInput?.focus();
        return false;
      }

      return {
        email: emailValue.toLowerCase(),
        password: passwordValue,
        role: roleValue,
      };
    },
    didOpen: () => {
      document.getElementById("swalAccountEmail")?.focus();
    },
  });

  if (!formValues) {
    return;
  }

  await provisionAccount(formValues);
}

async function provisionAccount({ email, password, role }) {
  if (isCreatingAccount) {
    return;
  }

  if (!validateEmailFormat(email)) {
    await Swal.fire({
      icon: "error",
      title: "Invalid Email",
      text: "Please provide a valid pcu.edu.ph email address before creating an account.",
      confirmButtonText: "OK",
      customClass: { confirmButton: "btn-blue" },
    });
    return;
  }

  isCreatingAccount = true;

  try {
    Swal.fire({
      title: "Creating account...",
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const enforcedRole = adminCount === 0 ? "admin" : role;

    const userCredential = await createUserWithEmailAndPassword(
      provisioningAuth,
      email,
      password,
    );

    const newUser = userCredential.user;
    let verificationEmailSent = false;
    try {
      await sendEmailVerification(newUser);
      verificationEmailSent = true;
    } catch (verificationError) {
      console.warn("Failed to send verification email", verificationError);
    }
    const permissionsPayload = buildPermissionsForRole(enforcedRole);
    const creationPayload = {
      email,
      role: enforcedRole,
      permissions: permissionsPayload,
      createdBy: auth.currentUser?.uid || null,
      createdAt: new Date().toISOString(),
      emailVerified: Boolean(newUser.emailVerified),
    };

    await update(ref(db, `users/${newUser.uid}`), creationPayload);

    try {
      await adminTrail.logAction(
        "CREATE_ACCOUNT",
        "USER",
        newUser.uid,
        {
          targetEmail: email,
          role: enforcedRole,
          createdBy: auth.currentUser?.email || null,
        },
        "HIGH",
        "ACCOUNT_MANAGEMENT",
      );
    } catch (trailError) {
      console.warn("Failed to log account creation", trailError);
    }

    Swal.close();

    const roleLabel =
      ROLE_OPTIONS.find((option) => option.value === enforcedRole)?.label || enforcedRole;

    await Swal.fire({
      icon: verificationEmailSent ? "success" : "warning",
      title: "Account Created",
      html: `
        <p>${escapeHtml(email)} added as ${roleLabel}.</p>
        <p>${
          verificationEmailSent
            ? "A verification email has been sent. The user must verify their email before they can sign in."
            : "Account created, but the verification email could not be sent automatically. Ask the user to request a new verification link from the login screen."
        }</p>
      `,
      confirmButtonText: "Done",
    });

    hydrateAccounts();
  } catch (error) {
    console.error("Failed to create account", error);
    Swal.close();
    const enforcedRole = adminCount === 0 ? "admin" : role;
    if (error?.code === "auth/email-already-in-use") {
      try {
        const linked = await promptLinkExistingAccount(email, enforcedRole);
        if (linked) {
          hydrateAccounts();
          return;
        }
      } catch (linkError) {
        console.error("Failed to link existing auth account", linkError);
        await Swal.fire({
          icon: "error",
          title: "Linking Failed",
          text: linkError?.message || "Unable to link the existing account.",
        });
        return;
      }
    }

    const message = resolveCreateAccountError(error);
    await Swal.fire({
      icon: "error",
      title: "Creation Failed",
      text: message,
    });
  } finally {
    try {
      await signOut(provisioningAuth);
    } catch (_signOutError) {}

    isCreatingAccount = false;
  }
}

async function promptLinkExistingAccount(email, role) {
  const effectiveRole = adminCount === 0 ? "admin" : role;

  if (effectiveRole === "admin" && adminCount >= MAX_ADMIN_ACCOUNTS) {
    await Swal.fire({
      icon: "warning",
      title: "Admin Limit Reached",
      text: "Only one admin account is allowed. Downgrade an existing admin before linking.",
    });
    return false;
  }

  const permissionsPayload = buildPermissionsForRole(effectiveRole);

  const { value: providedUid } = await Swal.fire({
    title: "Link Directory Profile",
    html: `
      <p>PCU Maps already recognizes this email for sign-in. To manage permissions here, supply the account ID from your secure admin tools.</p>
      <p>Only admins with console access should perform this action.</p>
    `,
    input: "text",
    inputLabel: "Firebase UID",
    inputPlaceholder: "Paste the UID (e.g. AbCdEf123456)",
    showCancelButton: true,
    confirmButtonText: "Link Account",
    preConfirm: (value) => {
      const trimmed = (value || "").trim();
      if (!trimmed) {
        Swal.showValidationMessage("Firebase UID is required.");
        return false;
      }
      if (trimmed.length < 10) {
        Swal.showValidationMessage("UID looks too short. Please check and try again.");
        return false;
      }
      return trimmed;
    },
  });

  const uid = (providedUid || "").trim();
  if (!uid) {
    return false;
  }

  const userRef = ref(db, `users/${uid}`);
  const existingSnapshot = await get(userRef);

  if (existingSnapshot.exists()) {
    await Swal.fire({
      icon: "info",
      title: "Already Linked",
      text: "This UID is already present in the directory.",
    });
    return false;
  }

  try {
    const linkPayload = {
      email,
      role: effectiveRole,
      permissions: permissionsPayload,
      createdBy: auth.currentUser?.uid || null,
      createdAt: new Date().toISOString(),
      emailVerified: null,
      linkedFromAuthOnly: true,
    };

    await update(userRef, linkPayload);

    if (effectiveRole === "admin") {
      adminCount = Math.min(MAX_ADMIN_ACCOUNTS, adminCount + 1);
    }

    try {
      await adminTrail.logAction(
        "LINK_EXISTING_ACCOUNT",
        "USER",
        uid,
        {
          targetEmail: email,
          role: effectiveRole,
          linkedBy: auth.currentUser?.email || null,
        },
        "HIGH",
        "ACCOUNT_MANAGEMENT",
      );
    } catch (trailError) {
      console.warn("Failed to log link action", trailError);
    }

    await Swal.fire({
      icon: "success",
      title: "Account Linked",
      html: `The directory profile for <strong>${escapeHtml(email)}</strong> has been created.`,
    });

    return true;
  } catch (error) {
    throw new Error("Unable to create the directory entry. Please try again.");
  }
}

function validateEmailFormat(email) {
  if (!email) return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) {
    return false;
  }
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(trimmed)) {
    return false;
  }

  return isAllowedPcuEmail(trimmed);
}

function isAllowedPcuEmail(email) {
  if (!email) {
    return false;
  }
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith("@pcu.edu.ph");
}

function validatePassword(password) {
  if (!password) return false;
  return password.length >= 6 && password.length <= 128;
}

function resolveCreateAccountError(error) {
  const code = error?.code || "";
  if (code === "auth/email-already-in-use") {
    return "That email address is already registered.";
  }
  if (code === "auth/invalid-email") {
    return "Invalid email format.";
  }
  if (code === "auth/weak-password") {
    return "Password is too weak. Use at least 6 characters.";
  }
  return "Unable to create the account right now. Please try again.";
}
