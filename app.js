// app.js — main application logic (modular Firebase v9)
import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';

import {
  collection,
  addDoc,
  setDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  orderBy,
  serverTimestamp,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

// --- Utility / UI helpers ---
const $ = id => document.getElementById(id);
const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

// DOM refs
const connectivity = $('connectivity');
const userStatus = $('user-status');
const themeToggle = $('theme-toggle');
const langSelect = $('lang-select');

// Login and role switching
let currentRole = 'admin';
let currentUser = null;

document.querySelectorAll('.role-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.role-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentRole = btn.dataset.role;
  });
});

// Connectivity monitoring
function updateConnectivity(){
  connectivity.textContent = navigator.onLine ? 'Connected' : 'No Internet';
}
window.addEventListener('online', updateConnectivity);
window.addEventListener('offline', updateConnectivity);
updateConnectivity();

// Theme toggle
themeToggle.addEventListener('change', () => {
  document.documentElement.setAttribute('data-theme', themeToggle.checked ? 'dark' : 'light');
});

// Language stub (simple labels change)
langSelect.addEventListener('change', () => {
  // Placeholder for multilingual text replacement
  console.log('Language changed to', langSelect.value);
});

// Login
$('login-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $('login-email').value.trim();
  const pass = $('login-password').value;
  try{
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    // verify role from Firestore users collection
    const udoc = await getDoc(doc(db, 'users', cred.user.uid));
    if(!udoc.exists()){
      $('login-error').textContent = 'No user document found.'; return;
    }
    const data = udoc.data();
    if(data.blocked){
      $('login-error').textContent = 'Account is blocked.'; return; }
    if(data.role !== currentRole){
      $('login-error').textContent = `Logged-in role mismatch (expected ${currentRole}).`; return; }
    // Show dashboard for that role
    currentUser = { uid: cred.user.uid, ...data };
    $('user-status').textContent = 'Online';
    showDashboardFor(currentRole);
  }catch(err){
    $('login-error').textContent = err.message;
  }
});

function showDashboardFor(role){
  hide($('login-section'));
  if(role === 'admin'){ show($('admin-dashboard')); hide($('supervisor-dashboard')); hide($('clinic-dashboard')); loadAdminUsers(); loadAdminChatList(); }
  if(role === 'supervisor'){ show($('supervisor-dashboard')); hide($('admin-dashboard')); hide($('clinic-dashboard')); loadStations(); loadSupChatList(); }
  if(role === 'clinic'){ show($('clinic-dashboard')); hide($('admin-dashboard')); hide($('supervisor-dashboard')); }
}

// Logout
$('admin-logout').addEventListener('click', async ()=>{ await signOut(auth); resetToLogin(); });
$('sup-logout').addEventListener('click', async ()=>{ await signOut(auth); resetToLogin(); });
$('clinic-logout').addEventListener('click', async ()=>{ await signOut(auth); resetToLogin(); });

function resetToLogin(){
  currentUser = null; $('user-status').textContent = 'Offline';
  hide($('admin-dashboard')); hide($('supervisor-dashboard')); hide($('clinic-dashboard'));
  show($('login-section'));
}

// Admin — Register Supervisor / Clinic / Student
$('register-supervisor').addEventListener('click', async ()=>{
  const name = $('sup-name').value.trim();
  const sid = $('sup-id').value.trim();
  const email = $('sup-email').value.trim();
  const pass = $('sup-pass').value;
  const secQ = $('sup-sec-q').value.trim();
  const secA = $('sup-sec-a').value.trim();
  if(!name||!sid||!email||!pass) return alert('Fill required');
  // Create auth user then save profile
  try{
    const cu = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db,'users', cu.user.uid), {
      name, id: sid, email, role: 'supervisor', blocked:false, secQ, secA, createdAt: serverTimestamp()
    });
    alert('Supervisor registered');
    loadAdminUsers();
  }catch(e){ alert(e.message); }
});

$('register-clinic').addEventListener('click', async ()=>{
  const name = $('clinic-name').value.trim();
  const role = $('clinic-role').value.trim();
  const idv = $('clinic-id').value.trim();
  const email = $('clinic-email').value.trim();
  const pass = $('clinic-pass').value;
  if(!name||!role||!idv||!email||!pass) return alert('Fill required');
  try{
    const cu = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db,'users', cu.user.uid), {
      name, id: idv, email, role: 'clinic', jobRole: role, blocked:false, createdAt: serverTimestamp()
    });
    alert('Clinic staff registered'); loadAdminUsers();
  }catch(e){ alert(e.message); }
});

$('register-student').addEventListener('click', async ()=>{
  const obj = {
    name: $('stu-name').value.trim(),
    studentId: $('stu-id').value.trim(),
    program: $('stu-program').value.trim(),
    year: $('stu-year').value.trim(),
    hostel: $('stu-hostel').value.trim(),
    clinicCard: $('stu-cliniccard').value.trim(),
    age: $('stu-age').value.trim(),
    phone: $('stu-phone').value.trim(),
    createdAt: serverTimestamp()
  };
  if(!obj.name||!obj.studentId) return alert('Provide name and ID');
  await setDoc(doc(db,'students', obj.studentId), obj);
  alert('Student Registered');
});

// Load admin users
async function loadAdminUsers(){
  const list = $('users-list'); list.innerHTML='Loading...';
  const q = query(collection(db,'users'), orderBy('createdAt','desc'));
  const snap = await getDocs(q);
  list.innerHTML='';
  snap.forEach(docu=>{
    const d = docu.data();
    const wrapper = document.createElement('div'); wrapper.className='user-card';
    wrapper.innerHTML = `
      <strong>${d.name||d.email}</strong> <small>${d.role}</small>
      <div>ID: ${d.id||''}</div>
      <div>
        <button data-uid='${docu.id}' class='block-btn'>${d.blocked? 'Unblock':'Block'}</button>
        <button data-uid='${docu.id}' class='delete-btn'>Delete</button>
      </div>
    `;
    list.appendChild(wrapper);
  });
  // attach events
  list.querySelectorAll('.block-btn').forEach(b=>b.addEventListener('click', async ()=>{
    const uid = b.dataset.uid; const uref = doc(db,'users',uid);
    const ud = await getDoc(uref); if(!ud.exists()) return;
    await updateDoc(uref, { blocked: !ud.data().blocked }); loadAdminUsers();
  }));
  list.querySelectorAll('.delete-btn').forEach(b=>b.addEventListener('click', async ()=>{
    const uid = b.dataset.uid; if(!confirm('Delete user?')) return; await deleteDoc(doc(db,'users',uid)); loadAdminUsers();
  }));
}

// --- Chat (simple rooms) ---
async function createOrOpenRoom(participants){
  // participants: ['admin_uid','other_uid']
  const roomId = participants.sort().join('_');
  return roomId;
}

async function loadAdminChatList(){
  const list = $('admin-chat-list'); list.innerHTML='';
  const usersSnap = await getDocs(collection(db,'users'));
  usersSnap.forEach(u=>{
    const d=u.data(); if(d.role==='supervisor' || d.role==='clinic'){
      const b=document.createElement('button'); b.textContent = `${d.name||d.email} (${d.role})`;
      b.addEventListener('click', ()=>openAdminChat(u.id)); list.appendChild(b);
    }
  });
}

let activeAdminRoom = null;
async function openAdminChat(otherUid){
  const room = createOrOpenRoom([currentUser.uid, otherUid]);
  activeAdminRoom = room; show($('admin-chat-box'));
  $('admin-messages').innerHTML='';
  // listen to messages
  const msgsRef = collection(db,'rooms',room,'messages');
  onSnapshot(msgsRef, snap=>{
    $('admin-messages').innerHTML = '';
    snap.forEach(m=>{
      const md=m.data(); const el = document.createElement('div'); el.className='msg'; el.textContent = `${md.from}: ${md.text}`; $('admin-messages').appendChild(el);
    });
  });
}
$('admin-send').addEventListener('click', async ()=>{
  const text = $('admin-chat-input').value.trim(); if(!text||!activeAdminRoom) return;
  await addDoc(collection(db,'rooms',activeAdminRoom,'messages'), { from: currentUser.name||currentUser.email, text, ts: serverTimestamp() });
  $('admin-chat-input').value='';
});

// Supervisor — stations
async function loadStations(){
  // ensure some stations exist (create up to 10 for demo)
  const stationsRef = collection(db,'stations');
  const snap = await getDocs(stationsRef);
  if(snap.empty){
    for(let i=1;i<=10;i++){
      await setDoc(doc(db,'stations','S'+i), { stationId:'S'+i, status:'available', assignedTo:null });
    }
  }
  renderStations();
}

async function renderStations(){
  const list = $('stations-list'); list.innerHTML='';
  const snap = await getDocs(collection(db,'stations'));
  $('station-select').innerHTML='';
  snap.forEach(snapdoc=>{
    const d=snapdoc.data(); const card=document.createElement('div'); card.className='station-card';
    card.innerHTML = `<strong>${d.stationId}</strong><div>Status: <span class='status ${d.status}'>${d.status}</span></div>
      <div>Assigned: ${d.assignedTo||'-'}</div>
      <div><button data-id='${snapdoc.id}' class='release-btn'>Release</button></div>`;
    list.appendChild(card);
    const opt = document.createElement('option'); opt.value=snapdoc.id; opt.text = d.stationId + ' ('+d.status+')'; $('station-select').appendChild(opt);
  });
  list.querySelectorAll('.release-btn').forEach(b=>b.addEventListener('click', async ()=>{
    const id=b.dataset.id; await updateDoc(doc(db,'stations',id), { status:'available', assignedTo:null }); renderStations();
  }));
}

$('assign-station').addEventListener('click', async ()=>{
  const stuId = $('assign-stu-id').value.trim(); const stationId = $('station-select').value; if(!stuId||!stationId) return alert('Provide student ID and station');
  const stuDoc = await getDoc(doc(db,'students',stuId)); if(!stuDoc.exists()){ return alert('Student not found'); }
  const code = Math.random().toString(36).substring(2,8).toUpperCase();
  await updateDoc(doc(db,'stations',stationId), { status:'occupied', assignedTo:stuId, sessionCode:code, assignedAt: serverTimestamp() });
  await addDoc(collection(db,'sessionCodes'), { station: stationId, student: stuId, code, ts: serverTimestamp(), by: currentUser.uid });
  alert('Assigned with session code: ' + code);
  renderStations();
});

// show session codes history
async function loadCodesHistory(){
  const snap = await getDocs(collection(db,'sessionCodes'));
  const el = $('codes-history'); el.innerHTML='';
  snap.forEach(d=>{ const dt=d.data(); const div=document.createElement('div'); div.textContent=`${dt.station} — ${dt.student} — ${dt.code}`; el.appendChild(div); });
}

// Supervisor chat list & open chat
async function loadSupChatList(){
  const list = $('sup-chat-list'); list.innerHTML='';
  const admins = await getDocs(query(collection(db,'users'), where('role','==','admin')));
  admins.forEach(a=>{ const btn=document.createElement('button'); btn.textContent = a.data().name||a.data().email; btn.addEventListener('click', ()=>openSupChat(a.id)); list.appendChild(btn); });
}
let activeSupRoom=null;
async function openSupChat(adminUid){
  const room = createOrOpenRoom([currentUser.uid, adminUid]); activeSupRoom = room; show($('sup-chat-box'));
  onSnapshot(collection(db,'rooms',room,'messages'), snap=>{ $('sup-messages').innerHTML=''; snap.forEach(m=>{ const md=m.data(); const el=document.createElement('div'); el.textContent = `${md.from}: ${md.text}`; $('sup-messages').appendChild(el); }); });
}
$('sup-send').addEventListener('click', async ()=>{ const t=$('sup-chat-input').value.trim(); if(!t||!activeSupRoom) return; await addDoc(collection(db,'rooms',activeSupRoom,'messages'),{ from: currentUser.name||currentUser.email, text:t, ts: serverTimestamp() }); $('sup-chat-input').value=''; });

// Clinic — fetch student
$('fetch-student').addEventListener('click', async ()=>{
  const q = $('fetch-stu').value.trim(); if(!q) return alert('Enter student ID or name');
  // try id first
  const docRef = doc(db,'students',q);
  const sdoc = await getDoc(docRef);
  const out = $('patient-details'); out.innerHTML='';
  if(sdoc.exists()){
    const data = sdoc.data(); out.innerHTML = `<pre>${JSON.stringify(data,null,2)}</pre>`; return;
  }
  // fallback: search by name
  const snaps = await getDocs(query(collection(db,'students'), where('name','==',q)));
  if(snaps.empty) return out.textContent='Not found';
  snaps.forEach(s=> out.innerHTML += `<pre>${JSON.stringify(s.data(),null,2)}</pre>`);
});

// Simple nav show/hide
document.querySelectorAll('.dash-nav .nav-btn').forEach(b=>{
  b.addEventListener('click', ()=>{
    const view = b.dataset.show; const container = b.closest('.dashboard');
    container.querySelectorAll('.dash-view').forEach(v=>v.classList.add('hidden'));
    container.querySelector('#'+view).classList.remove('hidden');
  });
});

// Session timeout (15 minutes inactivity)
let inactivityTimer;
function resetInactivity(){ clearTimeout(inactivityTimer); inactivityTimer = setTimeout(()=>{ alert('Session timed out.'); signOut(auth).then(()=>resetToLogin()); }, 15*60*1000); }
['click','mousemove','keydown','touchstart'].forEach(evt=>document.addEventListener(evt, resetInactivity)); resetInactivity();

// On auth state change — keep UI consistent
onAuthStateChanged(auth, (user)=>{ if(!user){ resetToLogin(); } else { /* could refresh currentUser */ } });

// boot
(async function boot(){ updateConnectivity(); await loadStations(); await loadCodesHistory(); })();
