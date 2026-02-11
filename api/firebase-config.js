/**
 * Firebase Backend Configuration
 * Handles real-time database, authentication, and cloud functions
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require('./service-account-key.json'); // Download from Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

// ===== DATABASE COLLECTIONS =====

const collections = {
  rides: db.collection('rides'),
  drivers: db.collection('drivers'),
  customers: db.collection('customers'),
  vehicles: db.collection('vehicles'),
  payments: db.collection('payments'),
  earnings: db.collection('earnings'),
  otps: db.collection('otps'),
  settings: db.collection('settings'),
};

// ===== RIDE MANAGEMENT =====

/**
 * Create new ride
 */
async function createRide(rideData) {
  const rideId = `RIDE-${Date.now()}`;
  
  const ride = {
    id: rideId,
    customerId: rideData.customerId,
    customerName: rideData.customerName,
    customerPhone: rideData.customerPhone,
    pickup: rideData.pickup,
    drop: rideData.drop,
    distance: rideData.distance,
    fare: rideData.fare,
    paymentMethod: rideData.paymentMethod || 'cash',
    status: 'pending', // pending, assigned, active, completed, cancelled
    driverId: null,
    driverName: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await collections.rides.doc(rideId).set(ride);
  return rideId;
}

/**
 * Assign driver to ride
 */
async function assignDriver(rideId, driverId) {
  const driverDoc = await collections.drivers.doc(driverId).get();
  const driver = driverDoc.data();

  await collections.rides.doc(rideId).update({
    driverId: driverId,
    driverName: driver.name,
    driverPhone: driver.phone,
    status: 'assigned',
    assignedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Update driver status
  await collections.drivers.doc(driverId).update({
    status: 'busy',
    currentRide: rideId,
  });

  return { success: true, driver: driver.name };
}

/**
 * Update ride status
 */
async function updateRideStatus(rideId, status, metadata = {}) {
  const update = {
    status: status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...metadata,
  };

  if (status === 'active') {
    update.startedAt = admin.firestore.FieldValue.serverTimestamp();
  } else if (status === 'completed') {
    update.completedAt = admin.firestore.FieldValue.serverTimestamp();
  }

  await collections.rides.doc(rideId).update(update);

  // If completed, free up driver
  if (status === 'completed') {
    const ride = (await collections.rides.doc(rideId).get()).data();
    if (ride.driverId) {
      await collections.drivers.doc(ride.driverId).update({
        status: 'online',
        currentRide: null,
      });

      // Record earnings
      await recordEarnings(ride);
    }
  }
}

/**
 * Get ride details
 */
async function getRide(rideId) {
  const doc = await collections.rides.doc(rideId).get();
  if (!doc.exists) {
    throw new Error('Ride not found');
  }
  return { id: doc.id, ...doc.data() };
}

/**
 * Get all rides (with filters)
 */
async function getRides(filters = {}) {
  let query = collections.rides;

  if (filters.status) {
    query = query.where('status', '==', filters.status);
  }
  if (filters.driverId) {
    query = query.where('driverId', '==', filters.driverId);
  }
  if (filters.date) {
    const startOfDay = new Date(filters.date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(filters.date);
    endOfDay.setHours(23, 59, 59, 999);
    
    query = query
      .where('createdAt', '>=', startOfDay)
      .where('createdAt', '<=', endOfDay);
  }

  query = query.orderBy('createdAt', 'desc').limit(filters.limit || 100);

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ===== DRIVER MANAGEMENT =====

/**
 * Register new driver
 */
async function registerDriver(driverData) {
  const driverId = `SS-GGN-${String(Date.now()).slice(-3)}`;

  const driver = {
    id: driverId,
    name: driverData.name,
    phone: driverData.phone,
    email: driverData.email || '',
    licenseNumber: driverData.licenseNumber,
    vehicleId: driverData.vehicleId,
    status: 'offline', // offline, online, busy
    rating: 0,
    totalRides: 0,
    totalEarnings: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await collections.drivers.doc(driverId).set(driver);

  // Create auth account
  const userRecord = await auth.createUser({
    phoneNumber: `+91${driverData.phone}`,
    displayName: driverData.name,
  });

  return { driverId, authUid: userRecord.uid };
}

/**
 * Update driver status
 */
async function updateDriverStatus(driverId, status) {
  await collections.drivers.doc(driverId).update({
    status: status,
    lastOnline: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Get all drivers
 */
async function getDrivers(status = null) {
  let query = collections.drivers;
  
  if (status) {
    query = query.where('status', '==', status);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ===== EARNINGS MANAGEMENT =====

/**
 * Record earnings for completed ride
 */
async function recordEarnings(ride) {
  const grossFare = ride.fare;
  const platformShare = Math.round(grossFare * 0.20);
  const driverShare = grossFare - platformShare;

  const earning = {
    rideId: ride.id,
    driverId: ride.driverId,
    date: new Date(ride.completedAt.toDate()).toISOString().split('T')[0],
    grossFare: grossFare,
    platformShare: platformShare,
    driverShare: driverShare,
    dailyRent: 250,
    netDriverEarning: driverShare - 250,
    paymentMethod: ride.paymentMethod,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await collections.earnings.add(earning);

  // Update driver totals
  await collections.drivers.doc(ride.driverId).update({
    totalRides: admin.firestore.FieldValue.increment(1),
    totalEarnings: admin.firestore.FieldValue.increment(driverShare),
  });
}

/**
 * Get earnings report
 */
async function getEarnings(filters = {}) {
  let query = collections.earnings;

  if (filters.driverId) {
    query = query.where('driverId', '==', filters.driverId);
  }
  if (filters.startDate && filters.endDate) {
    query = query
      .where('date', '>=', filters.startDate)
      .where('date', '<=', filters.endDate);
  }

  const snapshot = await query.orderBy('date', 'desc').get();
  const earnings = snapshot.docs.map(doc => doc.data());

  // Calculate totals
  const summary = {
    totalRides: earnings.length,
    grossRevenue: earnings.reduce((sum, e) => sum + e.grossFare, 0),
    platformRevenue: earnings.reduce((sum, e) => sum + e.platformShare, 0),
    driverPayouts: earnings.reduce((sum, e) => sum + e.driverShare, 0),
    rentIncome: earnings.reduce((sum, e) => sum + e.dailyRent, 0),
    earnings: earnings,
  };

  return summary;
}

// ===== REAL-TIME LISTENERS =====

/**
 * Listen to driver status changes
 */
function onDriverStatusChange(callback) {
  return collections.drivers.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'modified') {
        const driver = { id: change.doc.id, ...change.doc.data() };
        callback(driver);
      }
    });
  });
}

/**
 * Listen to ride updates
 */
function onRideUpdate(rideId, callback) {
  return collections.rides.doc(rideId).onSnapshot(doc => {
    if (doc.exists) {
      callback({ id: doc.id, ...doc.data() });
    }
  });
}

/**
 * Listen to new ride requests for specific driver
 */
function onNewRideRequest(driverId, callback) {
  return collections.rides
    .where('status', '==', 'pending')
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const ride = { id: change.doc.id, ...change.doc.data() };
          callback(ride);
        }
      });
    });
}

// ===== ANALYTICS =====

/**
 * Get dashboard statistics
 */
async function getDashboardStats(date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Today's rides
  const todayRides = await collections.rides
    .where('createdAt', '>=', startOfDay)
    .where('createdAt', '<=', endOfDay)
    .get();

  // Active rides
  const activeRides = await collections.rides
    .where('status', 'in', ['pending', 'assigned', 'active'])
    .get();

  // Online drivers
  const onlineDrivers = await collections.drivers
    .where('status', '==', 'online')
    .get();

  // Calculate revenue
  const completedToday = todayRides.docs
    .filter(doc => doc.data().status === 'completed')
    .map(doc => doc.data());

  const todayRevenue = completedToday.reduce((sum, ride) => sum + ride.fare, 0);

  return {
    todayRides: todayRides.size,
    completedRides: completedToday.length,
    todayRevenue: todayRevenue,
    activeRides: activeRides.size,
    onlineDrivers: onlineDrivers.size,
    totalDrivers: (await collections.drivers.get()).size,
  };
}

// ===== EXPORT =====
module.exports = {
  db,
  auth,
  storage,
  collections,

  // Ride functions
  createRide,
  assignDriver,
  updateRideStatus,
  getRide,
  getRides,

  // Driver functions
  registerDriver,
  updateDriverStatus,
  getDrivers,

  // Earnings
  recordEarnings,
  getEarnings,

  // Real-time
  onDriverStatusChange,
  onRideUpdate,
  onNewRideRequest,

  // Analytics
  getDashboardStats,
};

// ===== FIRESTORE SECURITY RULES =====
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Rides
    match /rides/{rideId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null && 
        (request.auth.uid == resource.data.driverId || 
         request.auth.uid == resource.data.customerId);
    }
    
    // Drivers
    match /drivers/{driverId} {
      allow read: if request.auth != null;
      allow update: if request.auth != null && 
        request.auth.uid == resource.data.authUid;
    }
    
    // Customers
    match /customers/{customerId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == customerId;
    }
    
    // Earnings (admin only)
    match /earnings/{earningId} {
      allow read: if request.auth != null;
      allow write: if false; // Only via Cloud Functions
    }
  }
}
*/
