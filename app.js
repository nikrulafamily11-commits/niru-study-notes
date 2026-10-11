import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, updateDoc, addDoc, deleteDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDaMLePSVJvJetQsSvDDgp7XiczIfHSBQU",
  authDomain: "niru-study-portal.firebaseapp.com",
  projectId: "niru-study-portal",
  storageBucket: "niru-study-portal.firebasestorage.app",
  messagingSenderId: "476816671743",
  appId: "1:476816671743:web:f35d9f5a9e5bcb7c121dca"
};
const ADMIN_UID = "hDJFaXTLuwNB4kWx0NJpZqVgZj53";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);
$("year").textContent = new Date().getFullYear();

let activeSemester = "all";
let currentProfile = null;

function message(text, type = "") {
  $("message").textContent = text;
  $("message").className = "message " + type;
}
function errorText(e) {
  const known = {
    "auth/email-already-in-use": "This email already has an account. Please sign in.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/operation-not-allowed": "Enable Email/Password in Firebase Authentication.",
    "permission-denied": "Permission denied. Check Firestore rules and confirm the administrator UID."
  };
  return known[e.code] || e.message || "Something went wrong.";
}
const visible = (id, on) => $(id).classList.toggle("hidden", !on);
const isAdmin = user => !!user && user.uid === ADMIN_UID;

function makeEmpty(text) {
  const p = document.createElement("p");
  p.className = "empty-state";
  p.textContent = text;
  return p;
}
function safeUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch { return null; }
}

$("signup").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const name = $("name").value.trim();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      name, email, status: "pending", createdAt: serverTimestamp()
    });
    form.reset();
    message("Account created. Your account is waiting for administrator approval.", "success");
  } catch (err) {
    message(errorText(err), "error");
  } finally {
    btn.disabled = false;
  }
});

$("login").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.currentTarget.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, $("loginEmail").value.trim(), $("loginPassword").value);
    $("login").reset();
    message("Signed in successfully.", "success");
  } catch (err) {
    message(errorText(err), "error");
  } finally {
    btn.disabled = false;
  }
});

$("logout").addEventListener("click", async () => {
  try { await signOut(auth); message("Signed out."); }
  catch (e) { message(errorText(e), "error"); }
});
$("refresh").addEventListener("click", async () => {
  await loadUsers();
  await loadAdminNotes();
});
$("addNoteForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!isAdmin(auth.currentUser)) {
    $("noteAdminMessage").textContent = "Only the administrator can add PDFs.";
    $("noteAdminMessage").className = "message error";
    return;
  }
  const btn = e.currentTarget.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const title = $("noteTitle").value.trim();
    const semester = Number($("noteSemester").value);
    const url = safeUrl($("noteUrl").value.trim());
    if (!url) throw new Error("Enter a valid http or https PDF link.");
    if (!Number.isInteger(semester) || semester < 1 || semester > 6) throw new Error("Choose a semester from 1 to 6.");
    await addDoc(collection(db, "notes"), {
      title, semester, url, createdAt: serverTimestamp(), createdBy: auth.currentUser.uid
    });
    e.currentTarget.reset();
    $("noteAdminMessage").textContent = "PDF added to the study library.";
    $("noteAdminMessage").className = "message success";
    await loadAdminNotes();
  } catch (err) {
    $("noteAdminMessage").textContent = errorText(err);
    $("noteAdminMessage").className = "message error";
  } finally {
    btn.disabled = false;
  }
});

$("semesterFilters").addEventListener("click", async e => {
  const btn = e.target.closest("button[data-semester]");
  if (!btn) return;
  activeSemester = btn.dataset.semester;
  $("semesterFilters").querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
  await loadStudentNotes();
});

async function loadUsers() {
  if (!isAdmin(auth.currentUser)) {
    message("Only the configured administrator can see student accounts.", "error");
    return;
  }
  const root = $("users");
  root.replaceChildren(document.createTextNode("Loading accounts…"));
  try {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    root.replaceChildren();
    $("count").textContent = `${snap.size} account(s)`;
    if (snap.empty) { root.append(makeEmpty("No student accounts yet.")); return; }
    snap.forEach(s => {
      const u = s.data();
      const row = document.createElement("div"); row.className = "user-row";
      const info = document.createElement("div"); info.className = "user-info";
      const name = document.createElement("strong"); name.textContent = u.name || "Student";
      const email = document.createElement("span"); email.textContent = u.email || "";
      const state = document.createElement("span");
      const status = ["approved", "rejected", "pending"].includes(u.status) ? u.status : "pending";
      state.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      state.className = "pill " + (status === "approved" ? "approved" : status === "rejected" ? "rejected" : "");
      info.append(name, email, state);
      const actions = document.createElement("div"); actions.className = "user-actions";
      const approve = document.createElement("button");
      approve.textContent = status === "approved" ? "Revoke access" : "Approve";
      approve.className = status === "approved" ? "secondary" : "";
      approve.addEventListener("click", async () => {
        approve.disabled = true;
        try {
          const next = status === "approved" ? "pending" : "approved";
          await updateDoc(doc(db, "users", s.id), { status: next, reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser.uid });
          message(`${u.name || u.email}: ${next}.`, "success");
          await loadUsers();
        } catch (err) { message(errorText(err), "error"); approve.disabled = false; }
      });
      const reject = document.createElement("button");
      reject.textContent = "Reject";
      reject.className = "danger";
      reject.disabled = status === "rejected";
      reject.addEventListener("click", async () => {
        reject.disabled = true;
        try {
          await updateDoc(doc(db, "users", s.id), { status: "rejected", reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser.uid });
          message(`${u.name || u.email}: rejected.`, "success");
          await loadUsers();
        } catch (err) { message(errorText(err), "error"); reject.disabled = false; }
      });
      actions.append(approve, reject);
      row.append(info, actions);
      root.append(row);
    });
  } catch (e) {
    root.replaceChildren(makeEmpty("Could not load accounts. Check your Firestore security rules."));
    message(errorText(e), "error");
  }
}

function buildPdfCard(note) {
  const card = document.createElement("article"); card.className = "pdf-card";
  const icon = document.createElement("div"); icon.className = "pdf-icon"; icon.textContent = "PDF";
  const info = document.createElement("div"); info.className = "pdf-info";
  const title = document.createElement("h3"); title.textContent = note.title || "Study PDF";
  const semester = document.createElement("p"); semester.textContent = `Semester ${note.semester}`;
  const url = safeUrl(note.url || "");
  info.append(title, semester);
  if (url) {
    const link = document.createElement("a"); link.className = "pdf-link"; link.href = url;
    link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Open PDF ↗";
    info.append(link);
  } else {
    const invalid = document.createElement("p"); invalid.textContent = "PDF link unavailable."; info.append(invalid);
  }
  card.append(icon, info);
  return card;
}

async function getNotes() {
  const snap = await getDocs(query(collection(db, "notes"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function loadStudentNotes() {
  const root = $("notesList");
  root.replaceChildren(document.createTextNode("Loading study PDFs…"));
  try {
    if (!auth.currentUser || (!isAdmin(auth.currentUser) && currentProfile?.status !== "approved")) {
      root.replaceChildren(makeEmpty("Your library will be available after administrator approval."));
      return;
    }
    const notes = await getNotes();
    const filtered = activeSemester === "all" ? notes : notes.filter(n => String(n.semester) === activeSemester);
    root.replaceChildren();
    if (!filtered.length) { root.append(makeEmpty("No PDFs have been added for this semester yet.")); return; }
    const grid = document.createElement("div"); grid.className = "pdf-grid";
    filtered.forEach(n => grid.append(buildPdfCard(n)));
    root.append(grid);
  } catch (e) {
    root.replaceChildren(makeEmpty("Could not load PDFs. Please check the Firestore rules."));
    message(errorText(e), "error");
  }
}
async function loadAdminNotes() {
  const root = $("adminNotes");
  if (!isAdmin(auth.currentUser)) return;
  root.replaceChildren(document.createTextNode("Loading PDFs…"));
  try {
    const notes = await getNotes();
    root.replaceChildren();
    if (!notes.length) { root.append(makeEmpty("No PDFs have been added yet.")); return; }
    notes.forEach(note => {
      const row = document.createElement("div"); row.className = "note-admin-row";
      const info = document.createElement("div"); info.className = "note-row-info";
      const title = document.createElement("strong"); title.textContent = note.title || "Study PDF";
      const meta = document.createElement("small"); meta.textContent = `Semester ${note.semester}`;
      info.append(title, meta);
      const actions = document.createElement("div"); actions.className = "user-actions";
      const url = safeUrl(note.url || "");
      if (url) {
        const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Open PDF"; actions.append(link);
      }
      const del = document.createElement("button"); del.className = "danger"; del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (!confirm(`Delete "${note.title || "this PDF"}" from the library?`)) return;
        del.disabled = true;
        try { await deleteDoc(doc(db, "notes", note.id)); message("PDF removed from the library.", "success"); await loadAdminNotes(); await loadStudentNotes(); }
        catch (err) { message(errorText(err), "error"); del.disabled = false; }
      });
      actions.append(del); row.append(info, actions); root.append(row);
    });
  } catch (e) {
    root.replaceChildren(makeEmpty("Could not load PDFs. Check Firestore rules."));
    message(errorText(e), "error");
  }
}

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
  $("welcome").textContent = isAdmin(user) ? "Administrator account" : "Your student account";
  try {
    // Admin access is identified by the configured UID; an admin profile document is not required.
    if (isAdmin(user)) {
      $("studentStatus").textContent = "Administrator access configured.";
      message("Signed in as administrator.", "success");
      visible("materials", true);
      await loadUsers();
      await loadAdminNotes();
      await loadStudentNotes();
      return;
    }
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) {
      $("studentStatus").textContent = "Your account profile was not found. Please contact the administrator.";
      message("Profile not found. If you just registered, check Firestore permissions.", "error");
      return;
    }
    currentProfile = snap.data();
    if (currentProfile.status === "approved") {
      $("studentStatus").textContent = "Your account is approved. You can access the study library below.";
      visible("materials", true);
      message("Your account is approved.", "success");
      await loadStudentNotes();
    } else if (currentProfile.status === "rejected") {
      $("studentStatus").textContent = "Your registration was not approved. Please contact the administrator if you think this is a mistake.";
      message("Registration not approved.", "error");
    } else {
      $("studentStatus").textContent = "Your account is waiting for administrator approval.";
      message("Signed in. Waiting for approval.");
    }
  } catch (e) {
    message(errorText(e), "error");
  }
}
onAuthStateChanged(auth, user => render(user).catch(e => message(errorText(e), "error")));

// Accessible show/hide controls for both password fields.
document.querySelectorAll("[data-password]").forEach(button => {
  button.addEventListener("click", () => {
    const field = document.getElementById(button.dataset.password);
    const showing = field.type === "password";
    field.type = showing ? "text" : "password";
    button.textContent = showing ? "Hide" : "Show";
    button.setAttribute("aria-label", `${showing ? "Hide" : "Show"} ${button.dataset.password === "signupPassword" ? "registration" : "login"} password`);
  });
});


// Switch between the login and registration forms without changing Firebase logic.
const showSignupButton = $("showSignup");
const showLoginButton = $("showLogin");
const loginForm = $("login");
const signupForm = $("signup");
showSignupButton?.addEventListener("click", () => {
  loginForm.classList.add("hidden");
  signupForm.classList.remove("hidden");
  $("message").textContent = "Create your free student account.";
  $("message").className = "message";
});
showLoginButton?.addEventListener("click", () => {
  signupForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
  $("message").textContent = "Not signed in.";
  $("message").className = "message";
});
