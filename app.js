import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import {
  getDatabase,
  ref,
  onValue,
  onDisconnect,
  set,
  serverTimestamp as rtdbServerTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

// ========================================
// FIREBASE CONFIGURATION
// ========================================

const firebaseConfig = {
  apiKey: "AIzaSyDaMLePSVjVJetQsSvDDgp7XiczIfHSBQU",
  authDomain: "niru-study-portal.firebaseapp.com",
  projectId: "niru-study-portal",
  storageBucket: "niru-study-portal.firebasestorage.app",
  messagingSenderId: "476816671743",
  appId: "1:476816671743:web:f35d9f5a9e5bcb7c121dca"
};

// Administrator UID
const ADMIN_UID = "SxD4BLFzpiVkI53GE8brNioNfKx2";

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const rtdb = getDatabase(
  app,
  "https://niru-study-portal-default-rtdb.asia-southeast1.firebasedatabase.app"
);

// ========================================
// GENERAL HELPERS
// ========================================

const $ = id => document.getElementById(id);

$("year").textContent = new Date().getFullYear();

let activeSemester = "all";
let activeUserStatus = "pending";
let currentProfile = null;

function message(text, type = "") {
  $("message").textContent = text;
  $("message").className = "message " + type;
}

function errorText(e) {
  const known = {
    "auth/email-already-in-use":
      "This email already has an account. Please sign in.",

    "auth/invalid-email":
      "Enter a valid email address.",

    "auth/weak-password":
      "Use a password with at least 6 characters.",

    "auth/invalid-credential":
      "Email or password is incorrect.",

    "auth/operation-not-allowed":
      "Enable Email/Password in Firebase Authentication.",

    "permission-denied":
      "Permission denied. Check Firebase security rules and confirm the administrator UID."
  };

  return known[e.code] || e.message || "Something went wrong.";
}

const visible = (id, on) =>
  $(id).classList.toggle("hidden", !on);

const isAdmin = user =>
  !!user && user.uid === ADMIN_UID;

function makeEmpty(text) {
  const p = document.createElement("p");
  p.className = "empty-state";
  p.textContent = text;
  return p;
}

function safeUrl(raw) {
  try {
    const u = new URL(raw);

    return u.protocol === "https:" || u.protocol === "http:"
      ? u.href
      : null;
  } catch {
    return null;
  }
}

// ========================================
// ONLINE PRESENCE TRACKING
// ========================================

let presenceUnsubscribe = null;

function startPresenceTracking(user) {
  // Remove the previous connection listener, if any.
  if (presenceUnsubscribe) {
    presenceUnsubscribe();
    presenceUnsubscribe = null;
  }

  if (!user) return;

  const presenceRef = ref(rtdb, `presence/${user.uid}`);
  const connectedRef = ref(rtdb, ".info/connected");

  presenceUnsubscribe = onValue(
    connectedRef,
    async snapshot => {
      // Firebase reports whether this browser is connected.
      if (snapshot.val() !== true) return;

      try {
        // Register an offline update in case this connection drops.
        await onDisconnect(presenceRef).set({
          state: "offline",
          lastChanged: rtdbServerTimestamp()
        });

        // Mark this account online.
        await set(presenceRef, {
          state: "online",
          lastChanged: rtdbServerTimestamp()
        });
      } catch (error) {
        console.error("Presence update failed:", error);
      }
    },
    error => {
      console.error("Presence connection listener failed:", error);
    }
  );
}

// ========================================
// STUDENT REGISTRATION
// ========================================

$("signup").addEventListener("submit", async e => {
  e.preventDefault();

  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');

  btn.disabled = true;

  try {
    const name = $("name").value.trim();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;

    const cred = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await setDoc(doc(db, "users", cred.user.uid), {
      name,
      email,
      status: "pending",
      createdAt: serverTimestamp()
    });

    form.reset();

    message(
      "Account created. Your account is waiting for administrator approval.",
      "success"
    );
  } catch (err) {
    message(errorText(err), "error");
  } finally {
    btn.disabled = false;
  }
});

// ========================================
// STUDENT LOGIN + LOGIN HISTORY
// ========================================

$("login").addEventListener("submit", async e => {
  e.preventDefault();

  const btn = e.currentTarget.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      $("loginEmail").value.trim(),
      $("loginPassword").value
    );

    // Record each successful login in Firestore.
    try {
      await addDoc(collection(db, "loginHistory"), {
        userId: credential.user.uid,
        loginAt: serverTimestamp()
      });

      $("login").reset();

      message(
        "Signed in successfully. Login time recorded.",
        "success"
      );
    } catch (historyError) {
      console.error(
        "Could not save login history:",
        historyError
      );

      $("login").reset();

      message(
        "Signed in successfully, but login time could not be saved. Check Firestore rules.",
        "error"
      );
    }
  } catch (err) {
    message(errorText(err), "error");
  } finally {
    btn.disabled = false;
  }
});

// ========================================
// LOGOUT
// ========================================

$("logout").addEventListener("click", async () => {
  try {
    const user = auth.currentUser;

    // Mark the user offline when they deliberately sign out.
    if (user) {
      await set(ref(rtdb, `presence/${user.uid}`), {
        state: "offline",
        lastChanged: rtdbServerTimestamp()
      });
    }

    await signOut(auth);
    message("Signed out.");
  } catch (e) {
    message(errorText(e), "error");
  }
});

// ========================================
// ADMIN REFRESH
// ========================================

$("refresh").addEventListener("click", async () => {
  if (!isAdmin(auth.currentUser)) {
    message("Administrator access required.", "error");
    return;
  }

  await loadUsers();
  await loadAdminNotes();
});

// ========================================
// STUDENT STATUS TABS
// ========================================

document.querySelectorAll("[data-user-status]").forEach(button => {
  button.addEventListener("click", async () => {
    if (!isAdmin(auth.currentUser)) {
      message("Administrator access required.", "error");
      return;
    }

    activeUserStatus = button.dataset.userStatus;

    document.querySelectorAll("[data-user-status]").forEach(tab => {
      tab.classList.toggle("active", tab === button);

      tab.setAttribute(
        "aria-pressed",
        tab === button ? "true" : "false"
      );
    });

    await loadUsers();
  });
});

// ========================================
// ADD A STUDY PDF
// ========================================

$("addNoteForm").addEventListener("submit", async e => {
  e.preventDefault();

  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');

  if (!isAdmin(auth.currentUser)) {
    $("noteAdminMessage").textContent =
      "Only the administrator can add PDFs.";

    $("noteAdminMessage").className = "message error";
    return;
  }

  btn.disabled = true;

  try {
    const title = $("noteTitle").value.trim();
    const semester = Number($("noteSemester").value);
    const url = safeUrl($("noteUrl").value.trim());

    if (!url) {
      throw new Error("Enter a valid http or https PDF link.");
    }

    if (!Number.isInteger(semester) || semester < 1 || semester > 6) {
      throw new Error("Choose a semester from 1 to 6.");
    }

    await addDoc(collection(db, "notes"), {
      title,
      semester,
      url,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid
    });

    form.reset();

    $("noteAdminMessage").textContent =
      "PDF added to the study library.";

    $("noteAdminMessage").className = "message success";

    await loadAdminNotes();
    await loadStudentNotes();
  } catch (err) {
    $("noteAdminMessage").textContent = errorText(err);
    $("noteAdminMessage").className = "message error";
  } finally {
    btn.disabled = false;
  }
});

// ========================================
// SEMESTER FILTERS
// ========================================

$("semesterFilters").addEventListener("click", async e => {
  const btn = e.target.closest("button[data-semester]");

  if (!btn) return;

  activeSemester = btn.dataset.semester;

  $("semesterFilters").querySelectorAll("button").forEach(b => {
    b.classList.toggle("active", b === btn);
  });

  await loadStudentNotes();
});

// ========================================
// ADMIN: LOAD AND MANAGE STUDENTS
// ========================================

async function loadUsers() {
  if (!isAdmin(auth.currentUser)) {
    message(
      "Only the configured administrator can see student accounts.",
      "error"
    );
    return;
  }

  const root = $("users");

  root.replaceChildren(
    document.createTextNode("Loading accounts…")
  );

  try {
    const snap = await getDocs(
      query(
        collection(db, "users"),
        orderBy("createdAt", "desc")
      )
    );

    const students = snap.docs.map(s => {
      const u = s.data();

      return {
        id: s.id,
        ...u,
        status: ["approved", "rejected", "pending"].includes(u.status)
          ? u.status
          : "pending"
      };
    });

    const counts = {
      pending: students.filter(u => u.status === "pending").length,
      approved: students.filter(u => u.status === "approved").length,
      rejected: students.filter(u => u.status === "rejected").length
    };

    // Update tab labels and counts.
    document.querySelectorAll("[data-user-status]").forEach(button => {
      const status = button.dataset.userStatus;

      if (Object.hasOwn(counts, status)) {
        const label =
          status.charAt(0).toUpperCase() + status.slice(1);

        button.textContent = `${label} (${counts[status]})`;

        button.classList.toggle(
          "active",
          status === activeUserStatus
        );

        button.setAttribute(
          "aria-pressed",
          status === activeUserStatus ? "true" : "false"
        );
      }
    });

    $("count").textContent =
      `Pending: ${counts.pending} · Approved: ${counts.approved} · Rejected: ${counts.rejected}`;

    root.replaceChildren();

    const filtered = students.filter(
      student => student.status === activeUserStatus
    );

    if (!filtered.length) {
      const emptyMessages = {
        pending: "No students are waiting for approval.",
        approved: "No approved students yet.",
        rejected: "No rejected students."
      };

      root.append(makeEmpty(emptyMessages[activeUserStatus]));
      return;
    }

    filtered.forEach(u => {
      const row = document.createElement("div");
      row.className = "user-row";

      const info = document.createElement("div");
      info.className = "user-info";

      const name = document.createElement("strong");
      name.textContent = u.name || "Student";

      const email = document.createElement("span");
      email.textContent = u.email || "";

      const state = document.createElement("span");

      state.textContent =
        u.status.charAt(0).toUpperCase() + u.status.slice(1);

      state.className =
        "pill " +
        (u.status === "approved"
          ? "approved"
          : u.status === "rejected"
            ? "rejected"
            : "");

      info.append(name, email, state);

      const actions = document.createElement("div");
      actions.className = "user-actions";

      // Approve or revoke access.
      if (u.status !== "rejected") {
        const approve = document.createElement("button");

        approve.textContent =
          u.status === "approved" ? "Revoke access" : "Approve";

        approve.className =
          u.status === "approved" ? "secondary" : "";

        approve.addEventListener("click", async () => {
          if (!isAdmin(auth.currentUser)) {
            message("Administrator access required.", "error");
            return;
          }

          approve.disabled = true;

          try {
            const next =
              u.status === "approved" ? "pending" : "approved";

            await updateDoc(doc(db, "users", u.id), {
              status: next,
              reviewedAt: serverTimestamp(),
              reviewedBy: auth.currentUser.uid
            });

            activeUserStatus = next;

            message(
              `${u.name || u.email}: ${next}.`,
              "success"
            );

            await loadUsers();
          } catch (err) {
            message(errorText(err), "error");
            approve.disabled = false;
          }
        });

        actions.append(approve);
      }

      // Reject a student.
      if (u.status !== "rejected") {
        const reject = document.createElement("button");

        reject.textContent = "Reject";
        reject.className = "danger";

        reject.addEventListener("click", async () => {
          if (!isAdmin(auth.currentUser)) {
            message("Administrator access required.", "error");
            return;
          }

          reject.disabled = true;

          try {
            await updateDoc(doc(db, "users", u.id), {
              status: "rejected",
              reviewedAt: serverTimestamp(),
              reviewedBy: auth.currentUser.uid
            });

            activeUserStatus = "rejected";

            message(
              `${u.name || u.email}: rejected.`,
              "success"
            );

            await loadUsers();
          } catch (err) {
            message(errorText(err), "error");
            reject.disabled = false;
          }
        });

        actions.append(reject);
      } else {
        // Restore rejected student to pending.
        const restore = document.createElement("button");

        restore.textContent = "Move to Pending";
        restore.className = "secondary";

        restore.addEventListener("click", async () => {
          if (!isAdmin(auth.currentUser)) {
            message("Administrator access required.", "error");
            return;
          }

          restore.disabled = true;

          try {
            await updateDoc(doc(db, "users", u.id), {
              status: "pending",
              reviewedAt: serverTimestamp(),
              reviewedBy: auth.currentUser.uid
            });

            activeUserStatus = "pending";

            message(
              `${u.name || u.email}: moved to pending.`,
              "success"
            );

            await loadUsers();
          } catch (err) {
            message(errorText(err), "error");
            restore.disabled = false;
          }
        });

        actions.append(restore);
      }

      row.append(info, actions);
      root.append(row);
    });
  } catch (e) {
    root.replaceChildren(
      makeEmpty(
        "Could not load accounts. Check your Firestore security rules."
      )
    );

    message(errorText(e), "error");
  }
}

// ========================================
// BUILD A PDF CARD
// ========================================

function buildPdfCard(note) {
  const card = document.createElement("article");
  card.className = "pdf-card";

  const icon = document.createElement("div");
  icon.className = "pdf-icon";
  icon.textContent = "PDF";

  const info = document.createElement("div");
  info.className = "pdf-info";

  const title = document.createElement("h3");
  title.textContent = note.title || "Study PDF";

  const semester = document.createElement("p");
  semester.textContent = `Semester ${note.semester}`;

  const url = safeUrl(note.url || "");

  info.append(title, semester);

  if (url) {
    const link = document.createElement("a");

    link.className = "pdf-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open PDF ↗";

    info.append(link);
  } else {
    const invalid = document.createElement("p");

    invalid.textContent = "PDF link unavailable.";

    info.append(invalid);
  }

  card.append(icon, info);

  return card;
}

// ========================================
// GET STUDY NOTES
// ========================================

async function getNotes() {
  const snap = await getDocs(
    query(
      collection(db, "notes"),
      orderBy("createdAt", "desc")
    )
  );

  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

// ========================================
// STUDENT LIBRARY
// ========================================

async function loadStudentNotes() {
  const root = $("notesList");

  root.replaceChildren(
    document.createTextNode("Loading study PDFs…")
  );

  try {
    if (
      !auth.currentUser ||
      (
        !isAdmin(auth.currentUser) &&
        currentProfile?.status !== "approved"
      )
    ) {
      root.replaceChildren(
        makeEmpty(
          "Your library will be available after administrator approval."
        )
      );

      return;
    }

    const notes = await getNotes();

    const filtered =
      activeSemester === "all"
        ? notes
        : notes.filter(
            n => String(n.semester) === activeSemester
          );

    root.replaceChildren();

    if (!filtered.length) {
      root.append(
        makeEmpty(
          "No PDFs have been added for this semester yet."
        )
      );

      return;
    }

    const grid = document.createElement("div");
    grid.className = "pdf-grid";

    filtered.forEach(n => {
      grid.append(buildPdfCard(n));
    });

    root.append(grid);
  } catch (e) {
    root.replaceChildren(
      makeEmpty(
        "Could not load PDFs. Please check the Firestore rules."
      )
    );

    message(errorText(e), "error");
  }
}

// ========================================
// ADMIN: PDF MANAGEMENT
// ========================================

async function loadAdminNotes() {
  const root = $("adminNotes");

  if (!isAdmin(auth.currentUser)) {
    root.replaceChildren();
    return;
  }

  root.replaceChildren(
    document.createTextNode("Loading PDFs…")
  );

  try {
    const notes = await getNotes();

    root.replaceChildren();

    if (!notes.length) {
      root.append(
        makeEmpty("No PDFs have been added yet.")
      );

      return;
    }

    notes.forEach(note => {
      const row = document.createElement("div");
      row.className = "note-admin-row";

      const info = document.createElement("div");
      info.className = "note-row-info";

      const title = document.createElement("strong");
      title.textContent = note.title || "Study PDF";

      const meta = document.createElement("small");
      meta.textContent = `Semester ${note.semester}`;

      info.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "user-actions";

      const url = safeUrl(note.url || "");

      if (url) {
        const link = document.createElement("a");

        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open PDF";

        actions.append(link);
      }

      const del = document.createElement("button");

      del.className = "danger";
      del.textContent = "Delete";

      del.addEventListener("click", async () => {
        if (!isAdmin(auth.currentUser)) {
          message("Administrator access required.", "error");
          return;
        }

        if (
          !confirm(
            `Delete "${note.title || "this PDF"}" from the library?`
          )
        ) {
          return;
        }

        del.disabled = true;

        try {
          await deleteDoc(doc(db, "notes", note.id));

          message(
            "PDF removed from the library.",
            "success"
          );

          await loadAdminNotes();
          await loadStudentNotes();
        } catch (err) {
          message(errorText(err), "error");
          del.disabled = false;
        }
      });

      actions.append(del);

      row.append(info, actions);

      root.append(row);
    });
  } catch (e) {
    root.replaceChildren(
      makeEmpty(
        "Could not load PDFs. Check Firestore rules."
      )
    );

    message(errorText(e), "error");
  }
}

// ========================================
// SHOW THE CORRECT PAGE FOR EACH USER
// ========================================

async function render(user) {
  visible("auth", !user);
  visible("account", !!user);
  visible("admin", isAdmin(user));
  visible("materials", false);

  currentProfile = null;

  if (!user) {
    $("users").replaceChildren();
    $("adminNotes").replaceChildren();
    $("count").textContent = "";
    $("studentStatus").textContent = "";
    return;
  }

  $("email").textContent = user.email || "";

  $("welcome").textContent = isAdmin(user)
    ? "Administrator account"
    : "Your student account";

  try {
    // Administrator account.
    if (isAdmin(user)) {
      $("studentStatus").textContent =
        "Administrator access configured.";

      message(
        "Signed in as administrator.",
        "success"
      );

      visible("materials", true);

      await loadUsers();
      await loadAdminNotes();
      await loadStudentNotes();

      return;
    }

    // Student account.
    const snap = await getDoc(
      doc(db, "users", user.uid)
    );

    if (!snap.exists()) {
      $("studentStatus").textContent =
        "Your account profile was not found. Please contact the administrator.";

      message(
        "Profile not found. If you just registered, check Firestore permissions.",
        "error"
      );

      return;
    }

    currentProfile = snap.data();

    if (currentProfile.status === "approved") {
      $("studentStatus").textContent =
        "Your account is approved. You can access the study library below.";

      visible("materials", true);

      message(
        "Your account is approved.",
        "success"
      );

      await loadStudentNotes();
    } else if (currentProfile.status === "rejected") {
      $("studentStatus").textContent =
        "Your registration was not approved. Please contact the administrator if you think this is a mistake.";

      message(
        "Registration not approved.",
        "error"
      );
    } else {
      $("studentStatus").textContent =
        "Your account is waiting for administrator approval.";

      message(
        "Signed in. Waiting for approval."
      );
    }
  } catch (e) {
    message(errorText(e), "error");
  }
}

// ========================================
// AUTHENTICATION LISTENER
// ========================================

// Start presence tracking whenever Firebase reports a signed-in user.
// This also handles restored login sessions after page reload.
onAuthStateChanged(auth, user => {
  startPresenceTracking(user);

  render(user).catch(e => {
    message(errorText(e), "error");
  });
});

// ========================================
// LOGIN TIME BUTTON
// ========================================

const loginTimeButton =
  document
