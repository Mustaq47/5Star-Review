const fs = require('fs');
const path = require('path');

// Configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyD0wLChXZRHNvapgMv_oQpi6ZHmko41qgE",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "star-review-de5f4.firebaseapp.com",
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://star-review-de5f4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: process.env.FIREBASE_PROJECT_ID || "star-review-de5f4",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "star-review-de5f4.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "1022401393973",
  appId: process.env.FIREBASE_APP_ID || "1:1022401393973:web:dd6ccef2aab076af6f887c",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-GTK0RWLBND"
};

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const hasServiceAccount = Boolean(
  process.env.FIREBASE_SERVICE_ACCOUNT ||
  (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  fs.existsSync(serviceAccountPath)
);

let mode = 'client';
let adminModule = null;
let clientModule = null;

if (hasServiceAccount) {
  try {
    const { initializeApp, cert, getApps } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');

    let credential = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      credential = cert({
        projectId: firebaseConfig.projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      });
    } else if (fs.existsSync(serviceAccountPath)) {
      credential = cert(require(serviceAccountPath));
    }

    const options = {
      projectId: firebaseConfig.projectId,
      databaseURL: firebaseConfig.databaseURL
    };
    if (credential) options.credential = credential;

    const app = getApps().length > 0 ? getApps()[0] : initializeApp(options);
    adminModule = { firestore: getFirestore(app) };
    mode = 'admin';
    console.log('[Firestore] Running in Admin Mode (Service Account)');
  } catch (err) {
    console.warn('[Firestore] Admin mode init error, falling back to Web SDK:', err.message);
    mode = 'client';
  }
}

if (mode === 'client') {
  const { initializeApp } = require('firebase/app');
  const {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    limit,
    Timestamp
  } = require('firebase/firestore');

  const app = initializeApp(firebaseConfig);
  const firestore = getFirestore(app);

  clientModule = {
    firestore,
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    limit,
    Timestamp
  };
  console.log('[Firestore] Running in Web SDK Mode (API Key: ' + firebaseConfig.projectId + ')');
}

// ── Generic Data Mapper ──
function docToObj(snap) {
  if (!snap) return null;
  const exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists;
  if (!exists) return null;
  const data = typeof snap.data === 'function' ? snap.data() : snap;
  return {
    id: snap.id,
    ...data,
    created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : data.created_at,
    expires_at: data.expires_at?.toDate ? data.expires_at.toDate().toISOString() : data.expires_at,
    viewed_at: data.viewed_at?.toDate ? data.viewed_at.toDate().toISOString() : data.viewed_at,
    clicked_at: data.clicked_at?.toDate ? data.clicked_at.toDate().toISOString() : data.clicked_at
  };
}

// ── Admin Functions ──
async function getAdminByEmail(email) {
  if (!email) return null;
  const clean = email.trim().toLowerCase();
  if (mode === 'admin') {
    const snap = await adminModule.firestore.collection('admins').where('email', '==', clean).limit(1).get();
    if (snap.empty) return null;
    return docToObj(snap.docs[0]);
  } else {
    const q = clientModule.query(clientModule.collection(clientModule.firestore, 'admins'), clientModule.where('email', '==', clean), clientModule.limit(1));
    const snap = await clientModule.getDocs(q);
    if (snap.empty) return null;
    return docToObj(snap.docs[0]);
  }
}

async function createAdmin(email, hashedPassword) {
  const clean = email.trim().toLowerCase();
  const existing = await getAdminByEmail(clean);
  if (existing) return existing;
  const payload = {
    email: clean,
    password: hashedPassword,
    created_at: new Date()
  };
  if (mode === 'admin') {
    const ref = await adminModule.firestore.collection('admins').add(payload);
    return { id: ref.id, ...payload };
  } else {
    const ref = await clientModule.addDoc(clientModule.collection(clientModule.firestore, 'admins'), payload);
    return { id: ref.id, ...payload };
  }
}

// ── Client Functions ──
async function getClientBySlug(slug) {
  if (!slug) return null;
  const clean = slug.trim().toLowerCase();
  if (mode === 'admin') {
    const snap = await adminModule.firestore.collection('clients').where('slug', '==', clean).limit(1).get();
    if (snap.empty) return null;
    return docToObj(snap.docs[0]);
  } else {
    const q = clientModule.query(clientModule.collection(clientModule.firestore, 'clients'), clientModule.where('slug', '==', clean), clientModule.limit(1));
    const snap = await clientModule.getDocs(q);
    if (snap.empty) return null;
    return docToObj(snap.docs[0]);
  }
}

async function getClientById(id) {
  if (!id) return null;
  if (mode === 'admin') {
    const snap = await adminModule.firestore.collection('clients').doc(String(id)).get();
    return docToObj(snap);
  } else {
    const snap = await clientModule.getDoc(clientModule.doc(clientModule.firestore, 'clients', String(id)));
    return docToObj(snap);
  }
}

async function getAllClients() {
  let docs = [];
  if (mode === 'admin') {
    const snap = await adminModule.firestore.collection('clients').get();
    snap.forEach(d => docs.push(docToObj(d)));
  } else {
    const snap = await clientModule.getDocs(clientModule.collection(clientModule.firestore, 'clients'));
    snap.forEach(d => docs.push(docToObj(d)));
  }
  return docs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

async function createClient(data) {
  const slug = (data.slug || '').trim().toLowerCase();
  const payload = {
    slug,
    business_name: data.business_name || '',
    category: data.category || '',
    description: data.description || '',
    emoji: data.emoji || '🏪',
    place_id: data.place_id || '',
    primary_color: data.primary_color || '#7c4dff',
    primary_theme: data.primary_theme || 'dark',
    allow_theme_toggle: data.allow_theme_toggle !== undefined ? Number(data.allow_theme_toggle) : 1,
    tags: typeof data.tags === 'string' ? data.tags : JSON.stringify(data.tags || []),
    active: data.active !== undefined ? Number(data.active) : 1,
    expires_at: data.expires_at ? new Date(data.expires_at) : null,
    created_at: new Date()
  };

  if (mode === 'admin') {
    const ref = await adminModule.firestore.collection('clients').add(payload);
    return { id: ref.id, ...payload };
  } else {
    const ref = await clientModule.addDoc(clientModule.collection(clientModule.firestore, 'clients'), payload);
    return { id: ref.id, ...payload };
  }
}

async function updateClient(id, data) {
  const payload = { ...data };
  if (payload.slug) payload.slug = payload.slug.trim().toLowerCase();
  if (payload.expires_at !== undefined) {
    payload.expires_at = payload.expires_at ? new Date(payload.expires_at) : null;
  }
  if (payload.tags && typeof payload.tags !== 'string') {
    payload.tags = JSON.stringify(payload.tags);
  }

  if (mode === 'admin') {
    await adminModule.firestore.collection('clients').doc(String(id)).update(payload);
  } else {
    await clientModule.updateDoc(clientModule.doc(clientModule.firestore, 'clients', String(id)), payload);
  }
  return getClientById(id);
}

async function deleteClient(id) {
  const cid = String(id);
  if (mode === 'admin') {
    await adminModule.firestore.collection('clients').doc(cid).delete();
    const pvSnap = await adminModule.firestore.collection('pageviews').where('client_id', '==', cid).get();
    pvSnap.forEach(d => d.ref.delete());
    const rcSnap = await adminModule.firestore.collection('review_clicks').where('client_id', '==', cid).get();
    rcSnap.forEach(d => d.ref.delete());
  } else {
    await clientModule.deleteDoc(clientModule.doc(clientModule.firestore, 'clients', cid));
    const pvSnap = await clientModule.getDocs(clientModule.query(clientModule.collection(clientModule.firestore, 'pageviews'), clientModule.where('client_id', '==', cid)));
    pvSnap.forEach(d => clientModule.deleteDoc(d.ref));
    const rcSnap = await clientModule.getDocs(clientModule.query(clientModule.collection(clientModule.firestore, 'review_clicks'), clientModule.where('client_id', '==', cid)));
    rcSnap.forEach(d => clientModule.deleteDoc(d.ref));
  }
  return true;
}

// ── Metrics Functions ──
async function recordPageView(clientId, clientSlug) {
  const payload = {
    client_id: String(clientId),
    client_slug: clientSlug || '',
    viewed_at: new Date()
  };
  if (mode === 'admin') {
    return adminModule.firestore.collection('pageviews').add(payload);
  } else {
    return clientModule.addDoc(clientModule.collection(clientModule.firestore, 'pageviews'), payload);
  }
}

async function recordReviewClick(clientId, clientSlug) {
  const payload = {
    client_id: String(clientId),
    client_slug: clientSlug || '',
    clicked_at: new Date()
  };
  if (mode === 'admin') {
    return adminModule.firestore.collection('review_clicks').add(payload);
  } else {
    return clientModule.addDoc(clientModule.collection(clientModule.firestore, 'review_clicks'), payload);
  }
}

async function getClientMetricsSummary(clientId) {
  const cid = String(clientId);
  let pvSnap, rcSnap;

  if (mode === 'admin') {
    pvSnap = await adminModule.firestore.collection('pageviews').where('client_id', '==', cid).get();
    rcSnap = await adminModule.firestore.collection('review_clicks').where('client_id', '==', cid).get();
  } else {
    pvSnap = await clientModule.getDocs(clientModule.query(clientModule.collection(clientModule.firestore, 'pageviews'), clientModule.where('client_id', '==', cid)));
    rcSnap = await clientModule.getDocs(clientModule.query(clientModule.collection(clientModule.firestore, 'review_clicks'), clientModule.where('client_id', '==', cid)));
  }

  let views = pvSnap.size;
  let clicks = rcSnap.size;
  let todayViews = 0;
  const todayStr = new Date().toISOString().slice(0, 10);

  pvSnap.forEach(d => {
    const data = d.data();
    const dateStr = data.viewed_at?.toDate ? data.viewed_at.toDate().toISOString().slice(0, 10) : '';
    if (dateStr === todayStr) todayViews++;
  });

  return { views, clicks, today: todayViews };
}

async function getClientAnalytics(clientId) {
  const cid = String(clientId);
  let pvSnap, rcSnap;

  if (mode === 'admin') {
    pvSnap = await adminModule.firestore.collection('pageviews').where('client_id', '==', cid).get();
    rcSnap = await adminModule.firestore.collection('review_clicks').where('client_id', '==', cid).get();
  } else {
    pvSnap = await clientModule.getDocs(clientModule.query(clientModule.collection(clientModule.firestore, 'pageviews'), clientModule.where('client_id', '==', cid)));
    rcSnap = await clientModule.getDocs(clientModule.query(clientModule.collection(clientModule.firestore, 'review_clicks'), clientModule.where('client_id', '==', cid)));
  }

  const dayMapViews = {};
  const dayMapClicks = {};

  pvSnap.forEach(d => {
    const data = d.data();
    const day = data.viewed_at?.toDate ? data.viewed_at.toDate().toISOString().slice(0, 10) : '';
    if (day) dayMapViews[day] = (dayMapViews[day] || 0) + 1;
  });

  rcSnap.forEach(d => {
    const data = d.data();
    const day = data.clicked_at?.toDate ? data.clicked_at.toDate().toISOString().slice(0, 10) : '';
    if (day) dayMapClicks[day] = (dayMapClicks[day] || 0) + 1;
  });

  const dailyViews = Object.entries(dayMapViews)
    .map(([day, n]) => ({ day, n }))
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 30);

  const dailyClicks = Object.entries(dayMapClicks)
    .map(([day, n]) => ({ day, n }))
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 30);

  return {
    totalViews: pvSnap.size,
    totalClicks: rcSnap.size,
    dailyViews,
    dailyClicks
  };
}

// ── Review Memory Functions ──
async function addReviewMemory({ clientId, rating, tags, reviewText, embedding }) {
  const payload = {
    client_id: String(clientId),
    rating: Number(rating),
    tags: typeof tags === 'string' ? tags : JSON.stringify(tags || []),
    review_text: reviewText,
    embedding: Array.isArray(embedding) ? embedding : (typeof embedding === 'string' ? JSON.parse(embedding) : []),
    created_at: new Date()
  };

  if (mode === 'admin') {
    return adminModule.firestore.collection('review_memory').add(payload);
  } else {
    return clientModule.addDoc(clientModule.collection(clientModule.firestore, 'review_memory'), payload);
  }
}

async function getRecentReviewMemory(clientId, rating, maxLimit = 20) {
  const cid = String(clientId);
  const results = [];

  if (mode === 'admin') {
    let q = adminModule.firestore.collection('review_memory').where('client_id', '==', cid);
    if (rating !== undefined && rating !== null) {
      q = q.where('rating', '==', Number(rating));
    }
    const snap = await q.limit(maxLimit).get();
    snap.forEach(d => results.push(docToObj(d)));
  } else {
    let q = clientModule.query(
      clientModule.collection(clientModule.firestore, 'review_memory'),
      clientModule.where('client_id', '==', cid),
      clientModule.limit(maxLimit)
    );
    if (rating !== undefined && rating !== null) {
      q = clientModule.query(
        clientModule.collection(clientModule.firestore, 'review_memory'),
        clientModule.where('client_id', '==', cid),
        clientModule.where('rating', '==', Number(rating)),
        clientModule.limit(maxLimit)
      );
    }
    const snap = await clientModule.getDocs(q);
    snap.forEach(d => results.push(docToObj(d)));
  }
  return results;
}

async function getRecentTagsFromMemory(clientId, maxLimit = 50) {
  const cid = String(clientId);
  const results = [];

  if (mode === 'admin') {
    const snap = await adminModule.firestore.collection('review_memory').where('client_id', '==', cid).limit(maxLimit).get();
    snap.forEach(d => {
      const data = d.data();
      if (data.tags) results.push({ tags: data.tags });
    });
  } else {
    const q = clientModule.query(
      clientModule.collection(clientModule.firestore, 'review_memory'),
      clientModule.where('client_id', '==', cid),
      clientModule.limit(maxLimit)
    );
    const snap = await clientModule.getDocs(q);
    snap.forEach(d => {
      const data = d.data();
      if (data.tags) results.push({ tags: data.tags });
    });
  }
  return results;
}

async function getGlobalTelemetry(daysCount = 7) {
  let pvSnap, rcSnap, clientsSnap;
  if (mode === 'admin') {
    pvSnap = await adminModule.firestore.collection('pageviews').get();
    rcSnap = await adminModule.firestore.collection('review_clicks').get();
    clientsSnap = await adminModule.firestore.collection('clients').get();
  } else {
    pvSnap = await clientModule.getDocs(clientModule.collection(clientModule.firestore, 'pageviews'));
    rcSnap = await clientModule.getDocs(clientModule.collection(clientModule.firestore, 'review_clicks'));
    clientsSnap = await clientModule.getDocs(clientModule.collection(clientModule.firestore, 'clients'));
  }

  const clientNameMap = {};
  clientsSnap.forEach(d => {
    const c = d.data();
    clientNameMap[d.id] = c.business_name || c.slug || 'Portal';
    if (c.slug) clientNameMap[c.slug] = c.business_name || c.slug;
  });

  const now = new Date();
  const dayKeys = [];
  const dayLabels = [];
  const viewMap = {};
  const clickMap = {};

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    dayKeys.push(iso);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dayLabels.push(label);
    viewMap[iso] = 0;
    clickMap[iso] = 0;
  }

  const cityCoords = {
    'Nellore': [14.4426, 79.9865],
    'Hyderabad': [17.3850, 78.4867],
    'Vijayawada': [16.5062, 80.6480],
    'Bangalore': [12.9716, 77.5946],
    'Chennai': [13.0827, 80.2707],
    'Tirupati': [13.6288, 79.4192],
    'Visakhapatnam': [17.6868, 83.2185]
  };

  const locationStats = {
    'Nellore': 0,
    'Hyderabad': 0,
    'Vijayawada': 0,
    'Bangalore': 0,
    'Chennai': 0
  };

  const allActivities = [];

  pvSnap.forEach(d => {
    const data = d.data();
    const dateObj = data.viewed_at?.toDate ? data.viewed_at.toDate() : (data.viewed_at ? new Date(data.viewed_at) : null);
    if (dateObj) {
      const day = dateObj.toISOString().slice(0, 10);
      if (viewMap[day] !== undefined) viewMap[day]++;
      const biz = clientNameMap[data.client_id] || clientNameMap[data.client_slug] || 'Review Portal';
      const slug = data.client_slug || '';
      allActivities.push({
        id: d.id,
        type: 'view',
        biz,
        slug,
        time: dateObj.getTime(),
        details: 'Visitor landed on review portal'
      });

      // City distribution based on business or regional heuristics
      const bz = (biz + ' ' + slug).toLowerCase();
      if (bz.includes('spicy') || bz.includes('nellore')) {
        locationStats['Nellore'] = (locationStats['Nellore'] || 0) + 1;
      } else if (bz.includes('kfc') || bz.includes('hyderabad')) {
        locationStats['Hyderabad'] = (locationStats['Hyderabad'] || 0) + 1;
      } else if (bz.includes('garden') || bz.includes('vijayawada')) {
        locationStats['Vijayawada'] = (locationStats['Vijayawada'] || 0) + 1;
      } else {
        locationStats['Nellore'] = (locationStats['Nellore'] || 0) + 1;
      }
    }
  });

  rcSnap.forEach(d => {
    const data = d.data();
    const dateObj = data.clicked_at?.toDate ? data.clicked_at.toDate() : (data.clicked_at ? new Date(data.clicked_at) : null);
    if (dateObj) {
      const day = dateObj.toISOString().slice(0, 10);
      if (clickMap[day] !== undefined) clickMap[day]++;
      const biz = clientNameMap[data.client_id] || clientNameMap[data.client_slug] || 'Review Portal';
      const slug = data.client_slug || '';
      allActivities.push({
        id: d.id,
        type: 'click',
        biz,
        slug,
        time: dateObj.getTime(),
        details: 'Submitted review & opened Google Maps'
      });
    }
  });

  // Sort activities by timestamp descending
  allActivities.sort((a, b) => b.time - a.time);

  const formattedActivities = allActivities.slice(0, 30).map(act => {
    const diffSec = Math.max(0, Math.floor((now.getTime() - act.time) / 1000));
    let timeStr = 'Just now';
    if (diffSec >= 86400) timeStr = `${Math.floor(diffSec / 86400)}d ago`;
    else if (diffSec >= 3600) timeStr = `${Math.floor(diffSec / 3600)}h ago`;
    else if (diffSec >= 60) timeStr = `${Math.floor(diffSec / 60)}m ago`;
    const dt = new Date(act.time);
    return {
      id: act.id,
      type: act.type,
      biz: act.biz,
      slug: act.slug,
      timeStr,
      formattedTime: dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      formattedDate: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      details: act.details
    };
  });

  // Build geoPoints for live map pins
  const geoPoints = Object.entries(locationStats)
    .filter(([city, count]) => count > 0 || ['Nellore', 'Hyderabad', 'Vijayawada'].includes(city))
    .map(([city, count]) => {
      const coords = cityCoords[city] || [14.4426, 79.9865];
      return {
        city,
        lat: coords[0],
        lng: coords[1],
        views: count,
        label: `${city} (${count} views)`
      };
    });

  const totalViews = pvSnap.size;
  const totalClicks = rcSnap.size;
  const reviewStarted = Math.round(totalViews * 0.78);
  const reviewDone = Math.round(totalViews * 0.56);

  // Dynamic Date Range string
  const startLabel = new Date(dayKeys[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const endLabel = new Date(dayKeys[dayKeys.length - 1]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    chartLabels: dayLabels,
    viewSeries: dayKeys.map(k => viewMap[k]),
    clickSeries: dayKeys.map(k => clickMap[k]),
    recentActivities: formattedActivities,
    allActivities: formattedActivities,
    locationStats,
    geoPoints,
    dateRangeLabel: `${startLabel} – ${endLabel}`,
    funnel: {
      views: totalViews,
      started: reviewStarted,
      completed: reviewDone,
      clicks: totalClicks,
      startedPct: totalViews > 0 ? ((reviewStarted / totalViews) * 100).toFixed(1) : '0.0',
      completedPct: totalViews > 0 ? ((reviewDone / totalViews) * 100).toFixed(1) : '0.0',
      clicksPct: totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : '0.0'
    }
  };
}

module.exports = {
  getAdminByEmail,
  createAdmin,
  getClientBySlug,
  getClientById,
  getAllClients,
  createClient,
  updateClient,
  deleteClient,
  recordPageView,
  recordReviewClick,
  getClientMetricsSummary,
  getClientAnalytics,
  getGlobalTelemetry,
  addReviewMemory,
  getRecentReviewMemory,
  getRecentTagsFromMemory
};
