/**
 * SukhSafar API Server
 * Main entry point for backend services
 * 
 * Run: node api/index.js
 * Or: npm start
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// ===== IMPORT MODULES =====
const {
  createRide,
  assignDriver,
  updateRideStatus,
  getRide,
  getRides,
  getDrivers,
  getDashboardStats,
} = require('./firebase-config');

const {
  handleCreateOrder,
  handleVerifyPayment,
  processRefund,
} = require('./razorpay');

const {
  sendSMS,
  notifyBookingConfirmed,
  notifyDriverAssigned,
  notifyRideComplete,
  sendOTP,
  verifyOTP,
} = require('./sms');

// ===== HEALTH CHECK =====
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SukhSafar API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ===== RIDE MANAGEMENT ENDPOINTS =====

// Create new ride
app.post('/api/rides', async (req, res) => {
  try {
    const rideData = req.body;
    
    // Validate required fields
    if (!rideData.customerPhone || !rideData.pickup || !rideData.drop) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const rideId = await createRide(rideData);

    // Send confirmation SMS
    if (process.env.ENABLE_SMS_NOTIFICATIONS === 'true') {
      await notifyBookingConfirmed(rideData.customerPhone, {
        rideId: rideId,
        fare: rideData.fare,
        eta: 5,
      });
    }

    res.json({
      success: true,
      rideId: rideId,
      message: 'Ride created successfully',
    });
  } catch (error) {
    console.error('Create ride error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get ride details
app.get('/api/rides/:rideId', async (req, res) => {
  try {
    const ride = await getRide(req.params.rideId);
    res.json(ride);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Get all rides (with filters)
app.get('/api/rides', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      driverId: req.query.driverId,
      date: req.query.date,
      limit: parseInt(req.query.limit) || 100,
    };
    const rides = await getRides(filters);
    res.json({ rides });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update ride status
app.patch('/api/rides/:rideId/status', async (req, res) => {
  try {
    const { status, metadata } = req.body;
    await updateRideStatus(req.params.rideId, status, metadata);

    // Send appropriate notification
    if (status === 'assigned' && metadata.driverName) {
      const ride = await getRide(req.params.rideId);
      await notifyDriverAssigned(ride.customerPhone, {
        driverName: metadata.driverName,
        carNo: metadata.carNo || 'EV',
        eta: 5,
      });
    } else if (status === 'completed') {
      const ride = await getRide(req.params.rideId);
      await notifyRideComplete(ride.customerPhone, {
        fare: ride.fare,
        paymentMethod: ride.paymentMethod,
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign driver to ride
app.post('/api/rides/:rideId/assign', async (req, res) => {
  try {
    const { driverId } = req.body;
    const result = await assignDriver(req.params.rideId, driverId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== DRIVER ENDPOINTS =====

// Get all drivers
app.get('/api/drivers', async (req, res) => {
  try {
    const status = req.query.status;
    const drivers = await getDrivers(status);
    res.json({ drivers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== PAYMENT ENDPOINTS =====

// Create Razorpay order
app.post('/api/payments/create-order', handleCreateOrder);

// Verify payment
app.post('/api/payments/verify', handleVerifyPayment);

// Process refund
app.post('/api/payments/refund', async (req, res) => {
  try {
    const { paymentId, amount, reason } = req.body;
    const result = await processRefund(paymentId, amount, reason);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== SMS/OTP ENDPOINTS =====

// Send OTP
app.post('/api/otp/send', async (req, res) => {
  try {
    const { phone } = req.body;
    const result = await sendOTP(phone, 'verification');
    
    // Don't send OTP in production response (security)
    if (process.env.NODE_ENV === 'production') {
      delete result.otp;
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify OTP
app.post('/api/otp/verify', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const result = await verifyOTP(phone, otp);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send custom SMS
app.post('/api/sms/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    const result = await sendSMS(phone, message);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== ANALYTICS ENDPOINTS =====

// Dashboard stats
app.get('/api/analytics/dashboard', async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const stats = await getDashboardStats(date);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   🚕 SukhSafar API Server Running       ║
╠══════════════════════════════════════════╣
║   Port: ${PORT}                            ║
║   Environment: ${process.env.NODE_ENV || 'development'}              ║
║   Timestamp: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} ║
╚══════════════════════════════════════════╝
  `);
  
  console.log('📍 Endpoints:');
  console.log('   GET  /health');
  console.log('   POST /api/rides');
  console.log('   GET  /api/rides/:id');
  console.log('   GET  /api/drivers');
  console.log('   POST /api/payments/create-order');
  console.log('   POST /api/payments/verify');
  console.log('   POST /api/otp/send');
  console.log('   POST /api/otp/verify');
  console.log('   GET  /api/analytics/dashboard');
  console.log('');
});

module.exports = app;
