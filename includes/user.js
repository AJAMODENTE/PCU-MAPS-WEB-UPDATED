import { firebaseConfig } from "/includes/firebaseConfig.js";
import {
  initializeApp,
  getApp,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// Initialize Firebase safely (avoids duplicate initialization)
let app;
try {
  app = initializeApp(firebaseConfig);
} catch (error) {
  app = getApp();
}

const auth = getAuth(app);
const db = getDatabase(app);
const ADMIN_ROLE_CACHE_KEY = "pcuAdminRole";
const PERMISSION_CACHE_KEY = "pcuPermissions";
let disableNoticeShown = false;

const PERMISSION_DEFAULTS = {
  manageEvents: false,
  createEvents: false,
  viewAdminTrail: false,
  manageRelocation: false,
  manageAccounts: false,
};

const PERMISSION_CONTROLS = [
  {
    key: "manageEvents",
    selectors: [
      'a[href="/pages/manage_events.html"]',
      'a[href="/pages/edit_events.html"]',
      '.manage-events-control',
    ],
  },
  {
    key: "createEvents",
    selectors: [
      'a[href="/pages/create_events.html"]',
      '.create-event-btn',
      '.create-events-control',
    ],
  },
  {
    key: "viewAdminTrail",
    selectors: ['a[href="/pages/admin_trail.html"]', '.admin-trail-control'],
  },
  {
    key: "manageRelocation",
    selectors: [
      'a[href="/relocation/location.html"]',
      'a[href="/relocation/relocation.html"]',
      '.relocation-control',
    ],
  },
  {
    key: "manageAccounts",
    selectors: ['a[href="/pages/account_management.html"]'],
  },
];

const PAGE_PERMISSION_REQUIREMENTS = [
  { path: "/pages/manage_events.html", permission: "manageEvents" },
  { path: "/pages/create_events.html", permission: "createEvents" },
  { path: "/pages/edit_events.html", permission: "manageEvents" },
  { path: "/pages/admin_trail.html", permission: "viewAdminTrail" },
  { path: "/pages/set_admin_role.html", permission: "manageAccounts" },
  { path: "/relocation/location.html", permission: "manageRelocation" },
  { path: "/relocation/relocation.html", permission: "manageRelocation" },
];

const PERMISSION_MESSAGES = {
  manageEvents: "You don't have permission to manage events.",
  createEvents: "You don't have permission to create events.",
  viewAdminTrail: "You don't have permission to view the admin trail.",
  manageRelocation: "You don't have permission to manage relocation data.",
  manageAccounts: "Only administrators can manage account records.",
};

let permissionGuardNotified = false;

// Get user email and insert it
onAuthStateChanged(auth, async (user) => {
  const sidebarUser = document.getElementById("sidebarUser");
  const adminElements = document.querySelectorAll(".admin-only");

  const setAdminVisibility = (isAdmin) => {
    adminElements.forEach((el) => {
      el.classList.toggle("is-visible-admin", isAdmin);
    });
    document.body?.classList.toggle("admin-user", isAdmin);
    document.documentElement.classList.toggle("admin-user", isAdmin);
  };

  const cacheAdminState = (isAdmin) => {
    try {
      localStorage.setItem(ADMIN_ROLE_CACHE_KEY, isAdmin ? "true" : "false");
    } catch (_error) {}
  };

  if (!user) {
    setAdminVisibility(false);
    try {
      localStorage.removeItem(ADMIN_ROLE_CACHE_KEY);
      localStorage.removeItem(PERMISSION_CACHE_KEY);
    } catch (_error) {}
    if (sidebarUser) {
      sidebarUser.textContent = "";
    }
    try {
      delete window.__pcuPermissions;
    } catch (_ex) {}
    return;
  }

  if (sidebarUser) {
    sidebarUser.textContent = user.email || "User";
  }

  try {
    const userSnapshot = await get(ref(db, `users/${user.uid}`));
    const userData = userSnapshot.exists() ? userSnapshot.val() : null;

    if (!userData || userData?.isDisabled || userData?.deletedAt) {
      setAdminVisibility(false);
      cacheAdminState(false);

      if (!disableNoticeShown) {
        disableNoticeShown = true;
        try {
          await signOut(auth);
        } catch (_signOutError) {}

        if (typeof Swal !== "undefined") {
          Swal.fire({
            icon: "error",
            title: "Account Disabled",
            text: "Your access has been revoked. Please contact an administrator.",
          }).then(() => {
            window.location.href = "/index.html";
          });
        } else {
          window.location.href = "/index.html";
        }
      }
      return;
    }

    const isAdmin = userData?.role === "admin";
    const resolvedPermissions = resolvePermissions(
      userData?.permissions,
      isAdmin,
    );

    applyPermissionVisibility(resolvedPermissions);
    cachePermissions(resolvedPermissions);

    setAdminVisibility(isAdmin);
    cacheAdminState(isAdmin);

    try {
      window.__pcuPermissions = resolvedPermissions;
    } catch (_ex) {}
  } catch (error) {
    console.error("Failed to resolve user role", error);
    setAdminVisibility(false);
    cacheAdminState(false);
  }
});

function resolvePermissions(rawPermissions, isAdmin) {
  const resolved = { ...PERMISSION_DEFAULTS };

  if (rawPermissions && typeof rawPermissions === "object") {
    Object.entries(rawPermissions).forEach(([key, value]) => {
      if (key in resolved) {
        resolved[key] = Boolean(value);
      } else {
        resolved[key] = value;
      }
    });
  }

  if (isAdmin) {
    Object.keys(PERMISSION_DEFAULTS).forEach((key) => {
      resolved[key] = true;
    });
  } else {
    resolved.manageAccounts = false;
  }

  return resolved;
}

function cachePermissions(permissions) {
  try {
    localStorage.setItem(PERMISSION_CACHE_KEY, JSON.stringify(permissions));
  } catch (_error) {}
}

function applyPermissionVisibility(permissions) {
  runWhenReady(() => {
    ensurePermissionStyleInjected();

    PERMISSION_CONTROLS.forEach(({ key, selectors }) => {
      const allow = Boolean(permissions?.[key]);
      selectors.forEach((selector) => {
        if (!selector) return;
        document.querySelectorAll(selector).forEach((element) => {
          element.classList.toggle("permission-hidden", !allow);
          if (element.tagName === "A") {
            if (!allow) {
              element.setAttribute("tabindex", "-1");
              element.setAttribute("aria-hidden", "true");
            } else {
              element.removeAttribute("tabindex");
              element.removeAttribute("aria-hidden");
            }
          }
        });
      });
    });

    enforcePagePermission(permissions);
  });
}

function enforcePagePermission(permissions) {
  if (permissionGuardNotified) {
    return;
  }

  const currentPath = window.location.pathname.toLowerCase();
  const requirement = PAGE_PERMISSION_REQUIREMENTS.find(({ path }) =>
    currentPath.endsWith(path),
  );

  if (!requirement) {
    return;
  }

  if (Boolean(permissions?.[requirement.permission])) {
    return;
  }

  permissionGuardNotified = true;
  handleUnauthorizedAccess(requirement.permission);
}

function handleUnauthorizedAccess(permissionKey) {
  const message =
    PERMISSION_MESSAGES[permissionKey] ||
    "You do not have permission to view this page.";

  const redirect = () => {
    const destinations = ["/pages/profile.html", "/pages/manage_events.html", "/index.html"];
    const current = window.location.pathname;
    const target =
      destinations.find((path) => !current.endsWith(path)) || "/index.html";
    window.location.href = target;
  };

  if (typeof Swal !== "undefined") {
    Swal.fire({
      icon: "warning",
      title: "Access Restricted",
      text: message,
      confirmButtonText: "Go Back",
      allowOutsideClick: false,
    }).then(redirect);
  } else {
    alert(message);
    redirect();
  }
}

function ensurePermissionStyleInjected() {
  if (document.getElementById("pcu-permission-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "pcu-permission-style";
  style.textContent = `
    .permission-hidden {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

function runWhenReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
}
