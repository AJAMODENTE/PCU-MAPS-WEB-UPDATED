// Admin Trail Logging Module
// File location: /includes/adminTrail.js

import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  set,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

export class AdminTrail {
  constructor(db, auth) {
    this.db = db;
    this.auth = auth;
    this.logsRef = ref(db, "adminTrail");
  }

  /**
   * Log an administrative action
   * @param {string} action - Action type (CREATE, DELETE, EDIT, etc.)
   * @param {string} entityType - Type of entity (EVENT, BUILDING, etc.)
   * @param {string} entityId - ID of the entity
   * @param {object} details - Additional details about the action
   * @param {string} severity - Log severity (HIGH, MEDIUM, LOW)
   * @param {string} category - Log category
   */
  async logAction(
    action,
    entityType,
    entityId,
    details = {},
    severity = "MEDIUM",
    category = "SYSTEM",
  ) {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        return;
      }

      const logEntry = {
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split("T")[0],
        action: action,
        entityType: entityType,
        entityId: entityId || null,
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || user.email,
        severity: severity,
        category: category,
        details: details,
        clientInfo: {
          userAgent: navigator.userAgent,
          url: window.location.href,
          sessionId: this.getSessionId(),
        },
      };

      // Push to Firebase
      const newLogRef = push(this.logsRef);
      await set(newLogRef, logEntry);

      return newLogRef.key;
    } catch (error) {
    }
  }

  /**
   * Log event creation
   */
  async logEventCreate(eventId, eventData) {
    return this.logAction(
      "CREATE",
      "EVENT",
      eventId,
      { eventTitle: eventData.event_title, location: eventData.location },
      "MEDIUM",
      "EVENT_MANAGEMENT",
    );
  }

  /**
   * Log event deletion
   */
  async logEventDelete(eventId, eventData) {
    return this.logAction(
      "DELETE",
      "EVENT",
      eventId,
      { eventTitle: eventData.event_title },
      "HIGH",
      "EVENT_MANAGEMENT",
    );
  }

  /**
   * Log event edit
   */
  async logEventEdit(eventId, changes) {
    return this.logAction(
      "EDIT",
      "EVENT",
      eventId,
      { changes: changes },
      "MEDIUM",
      "EVENT_MANAGEMENT",
    );
  }

  /**
   * Log building action
   */
  async logBuildingAction(action, buildingId, buildingName) {
    return this.logAction(
      action,
      "BUILDING",
      buildingId,
      { buildingName: buildingName },
      "MEDIUM",
      "BUILDING_MANAGEMENT",
    );
  }

  /**
   * Log user login
   */
  async logLogin(userEmail) {
    return this.logAction(
      "LOGIN",
      "USER",
      userEmail,
      { userEmail: userEmail },
      "LOW",
      "AUTHENTICATION",
    );
  }

  /**
   * Log user logout
   */
  async logLogout(userEmail) {
    return this.logAction(
      "LOGOUT",
      "USER",
      userEmail,
      { userEmail: userEmail },
      "LOW",
      "AUTHENTICATION",
    );
  }

  /**
   * Get or create session ID
   */
  getSessionId() {
    let sessionId = sessionStorage.getItem("adminTrailSessionId");
    if (!sessionId) {
      sessionId = this.generateUUID();
      sessionStorage.setItem("adminTrailSessionId", sessionId);
    }
    return sessionId;
  }

  /**
   * Generate UUID
   */
  generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
  }
}

export default AdminTrail;
