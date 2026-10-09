import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, updateDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// Paste the web app config from Firebase Console here.
const firebaseConfig = {
  apiKey: "AIzaSyDaMLePSVJvJetQsSvDDgp7XiczIfHSBQU",
  authDomain: "niru-study-portal.firebaseapp.com",
  projectId: "niru-study-portal",
  storageBucket: "niru-study-portal.firebasestorage.app",
  messagingSenderId: "476816671743",
  appId: "1:476816671743:web:f35d9f5a9e5bcb7c121dca"
};
// Replace this in BOTH app.js and firestore.rules with your own user UID.
const ADMIN_UID = "hDJFaXTLuwNB4kWx0NJpZqVgZj53";
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
const $ = id => document.getElementById(id);
$("year").textContent = new Date().getFullYear();

function message(text, type=""){ $("message").textContent=text; $("message").className="message "+type; }
function errorText(e){
 const known={"auth/email-already-in-use":"This email already has an account. Please sign in.","auth/invalid-email":"Enter a valid email address.","auth/weak-password":"Use a password with at least 6 characters.","auth/invalid-credential":"Email or password is incorrect.","auth/operation-not-allowed":"Enable Email/Password in Firebase Authentication.","permission-denied":"Permission denied. Check the Firestore rules and admin UID."};
 return known[e.code] || e.message || "Something went wrong.";
}
const visible=(id,on)=>$(id).classList.toggle("hidden",!on);


$("signup").addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = e.currentTarget;
const btn = form.querySelector('button');
if (btn) btn.disabled = true;

  try {
    const name = $("name").value.trim();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;

    const cred = await createUserWithEmailAndPassword(
      auth, email, password
    );

    await setDoc(doc(db, "users", cred.user.uid), {
      name: name,
      email: email,
      status: "pending",
      createdAt: new Date().toISOString()
    });

    form.reset();
    message(
      "Account created. Waiting for administrator approval.",
      "success"
    );
  } catch (err) {
    message(errorText(err), "error");
  } finally {
    btn.disabled = false;
  }
});

$("login").addEventListener("submit",async e=>{
 e.preventDefault();const btn=e.submitter;btn.disabled=true;
 try{await signInWithEmailAndPassword(auth,$("loginEmail").value.trim(),$("loginPassword").value);$("login").reset();message("Signed in.","success")}
 catch(err){message(errorText(err),"error")}finally{if (btn) btn.disabled=false}
});
$("logout").addEventListener("click",async()=>{try{await signOut(auth);message("Signed out.")}catch(e){message(errorText(e),"error")}});
$("refresh").addEventListener("click",loadUsers);

async function loadUsers(){
 if(!auth.currentUser||auth.currentUser.uid!==ADMIN_UID){message("Only the configured administrator can see this list.","error");return}
 const root=$("users");root.textContent="Loading…";
 try{
  const snap=await getDocs(query(collection(db,"users"),orderBy("createdAt","desc")));
  root.replaceChildren();$("count").textContent=` ${snap.size} account(s)`;
  if(snap.empty){root.textContent="No student accounts yet.";return}
  snap.forEach(s=>{
   const u=s.data(),row=document.createElement("div");row.className="user-row";
   const info=document.createElement("div"),name=document.createElement("strong"),email=document.createElement("span"),state=document.createElement("span");
   name.textContent=u.name||"Student";email.textContent=u.email||"";state.textContent=u.status==="approved"?"Approved":"Pending";state.className="pill "+(u.status==="approved"?"approved":"");info.append(name,email,state);
   const actions=document.createElement("div");actions.className="user-actions";const btn=document.createElement("button");btn.className="secondary";btn.textContent=u.status==="approved"?"Revoke access":"Approve";
   btn.addEventListener("click",async()=>{btn.disabled=true;try{const next=u.status==="approved"?"pending":"approved";await updateDoc(doc(db,"users",s.id),{status:next,reviewedAt:serverTimestamp(),reviewedBy:auth.currentUser.uid});message(`${u.name||u.email}: ${next}.`,"success");await loadUsers()}catch(err){message(errorText(err),"error");btn.disabled=false}});
   actions.append(btn);row.append(info,actions);root.append(row);
  });
 }catch(e){root.replaceChildren();message(errorText(e),"error")}
}
async function render(user){
 visible("auth",!user);visible("account",!!user);visible("admin",!!user&&user.uid===ADMIN_UID);visible("materials",false);
 if(!user){$("users").replaceChildren();$("count").textContent="";return}
 $("email").textContent=user.email||"";
 try{
  const snap=await getDoc(doc(db,"users",user.uid));
  if(!snap.exists()){$("studentStatus").textContent="Profile not found. Contact the administrator.";return}
  const profile=snap.data();
  if(user.uid===ADMIN_UID){$("studentStatus").textContent="Administrator access configured.";message("Signed in as administrator.","success");await loadUsers()}
  else if(profile.status==="approved"){$("studentStatus").textContent="Your account is approved. Protected notes can be connected next.";visible("materials",true);message("Your account is approved.","success")}
  else{$("studentStatus").textContent="Your account is pending approval.";message("Signed in. Waiting for approval.")}
 }catch(e){message(errorText(e),"error")}
}
onAuthStateChanged(auth,user=>render(user).catch(e=>message(errorText(e),"error")));
