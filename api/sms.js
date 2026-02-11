/**
 * SMS Notification Service
 * Supports MSG91 (India) and Twilio (International)
 * 
 * MSG91: ₹0.15/SMS - Recommended for India
 * Twilio: $0.0079/SMS (~₹0.65/SMS) - International
 */

// ===== CONFIGURATION =====
const SMS_CONFIG = {
  provider: process.env.SMS_PROVIDER || 'msg91', // 'msg91' or 'twilio'
  
  // MSG91 Config
  msg91: {
    authKey: process.env.MSG91_AUTH_KEY,
    senderId: process.env.MSG91_SENDER_ID || 'SUKHSF',
    route: process.env.MSG91_ROUTE || '4', // 4 = Transactional
    country: '91', // India
    templates: {
      bookingConfirm: process.env.MSG91_TEMPLATE_BOOKING_CONFIRM,
      driverAssigned: process.env.MSG91_TEMPLATE_DRIVER_ASSIGNED,
      rideComplete: process.env.MSG91_TEMPLATE_RIDE_COMPLETE,
      otp: process.env.MSG91_TEMPLATE_OTP,
    },
  },

  // Twilio Config
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },
};

// ===== MSG91 IMPLEMENTATION =====

/**
 * Send SMS via MSG91
 * @param {string} phone - 10-digit phone number (without +91)
 * @param {string} message - SMS text
 * @param {string} templateId - MSG91 DLT template ID (optional)
 */
async function sendSMS_MSG91(phone, message, templateId = null) {
  const config = SMS_CONFIG.msg91;

  // Clean phone number
  phone = phone.replace(/\D/g, '').slice(-10);

  const url = 'https://api.msg91.com/api/v5/flow/';
  
  const payload = {
    template_id: templateId || config.templates.bookingConfirm,
    short_url: '0',
    recipients: [
      {
        mobiles: `91${phone}`,
        // Dynamic variables in template
        var1: message, // If using variable-based templates
      }
    ],
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'authkey': config.authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (result.type === 'success') {
      return {
        success: true,
        messageId: result.message,
        provider: 'msg91',
      };
    } else {
      throw new Error(result.message || 'SMS failed');
    }
  } catch (error) {
    console.error('MSG91 SMS Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send OTP via MSG91
 * @param {string} phone - 10-digit phone number
 * @param {string} otp - 4 or 6 digit OTP
 */
async function sendOTP_MSG91(phone, otp) {
  phone = phone.replace(/\D/g, '').slice(-10);

  const url = `https://api.msg91.com/api/v5/otp?template_id=${SMS_CONFIG.msg91.templates.otp}&mobile=91${phone}&authkey=${SMS_CONFIG.msg91.authKey}&otp=${otp}`;

  try {
    const response = await fetch(url, { method: 'GET' });
    const result = await response.json();

    return {
      success: result.type === 'success',
      message: result.message,
    };
  } catch (error) {
    console.error('MSG91 OTP Error:', error);
    return { success: false, error: error.message };
  }
}

// ===== TWILIO IMPLEMENTATION =====

/**
 * Send SMS via Twilio
 * @param {string} phone - Full phone number with country code (+919876543210)
 * @param {string} message - SMS text
 */
async function sendSMS_Twilio(phone, message) {
  const config = SMS_CONFIG.twilio;
  
  // Ensure phone has country code
  if (!phone.startsWith('+')) {
    phone = '+91' + phone.replace(/\D/g, '').slice(-10);
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  
  const params = new URLSearchParams();
  params.append('To', phone);
  params.append('From', config.phoneNumber);
  params.append('Body', message);

  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const result = await response.json();

    if (result.sid) {
      return {
        success: true,
        messageId: result.sid,
        provider: 'twilio',
      };
    } else {
      throw new Error(result.message || 'SMS failed');
    }
  } catch (error) {
    console.error('Twilio SMS Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ===== UNIFIED SMS INTERFACE =====

/**
 * Send SMS using configured provider
 * @param {string} phone - Phone number
 * @param {string} message - Message text
 * @param {string} templateId - Template ID (MSG91 only)
 */
async function sendSMS(phone, message, templateId = null) {
  if (SMS_CONFIG.provider === 'msg91') {
    return await sendSMS_MSG91(phone, message, templateId);
  } else if (SMS_CONFIG.provider === 'twilio') {
    return await sendSMS_Twilio(phone, message);
  } else {
    throw new Error('Invalid SMS provider configured');
  }
}

// ===== PRE-DEFINED MESSAGE TEMPLATES =====

const SMS_TEMPLATES = {
  /**
   * Booking confirmation
   */
  bookingConfirm: (rideId, fare, eta) => {
    return `🚕 SukhSafar Booking Confirmed!
Ride ID: ${rideId}
Fare: ₹${fare}
Driver will arrive in ${eta} mins
Track: sukhsafar.in/track/${rideId}`;
  },

  /**
   * Driver assigned
   */
  driverAssigned: (driverName, carNo, eta) => {
    return `✅ Driver Assigned!
Driver: ${driverName}
Car: ${carNo}
ETA: ${eta} mins
SukhSafar - Safe, Clean Rides`;
  },

  /**
   * Ride started
   */
  rideStarted: (driverName, rideId) => {
    return `🟢 Ride Started
Driver: ${driverName}
ID: ${rideId}
Share live location with family from app.`;
  },

  /**
   * Ride completed
   */
  rideComplete: (fare, paymentMethod) => {
    return `✅ Ride Completed
Fare: ₹${fare}
Payment: ${paymentMethod}
Thank you for choosing SukhSafar!
Rate your ride: sukhsafar.in/rate`;
  },

  /**
   * OTP for verification
   */
  otp: (otp, validMins = 5) => {
    return `Your SukhSafar OTP is: ${otp}
Valid for ${validMins} minutes.
DO NOT share with anyone.`;
  },

  /**
   * Driver: New ride request
   */
  driverRideRequest: (pickup, drop, fare) => {
    return `🔔 New Ride Request!
Pickup: ${pickup}
Drop: ${drop}
Fare: ₹${fare}
Check your app to accept.`;
  },

  /**
   * Payment reminder
   */
  paymentReminder: (rideId, amount) => {
    return `⚠️ Payment Pending
Ride: ${rideId}
Amount: ₹${amount}
Pay now: sukhsafar.in/pay/${rideId}`;
  },

  /**
   * Refund processed
   */
  refundProcessed: (amount, refundId) => {
    return `💰 Refund Processed
Amount: ₹${amount}
Refund ID: ${refundId}
Will be credited in 5-7 business days.
SukhSafar Support`;
  },
};

// ===== NOTIFICATION WORKFLOWS =====

/**
 * Send booking confirmation to customer
 */
async function notifyBookingConfirmed(customerPhone, bookingDetails) {
  const { rideId, fare, eta } = bookingDetails;
  const message = SMS_TEMPLATES.bookingConfirm(rideId, fare, eta);
  
  return await sendSMS(customerPhone, message, SMS_CONFIG.msg91.templates.bookingConfirm);
}

/**
 * Notify customer when driver is assigned
 */
async function notifyDriverAssigned(customerPhone, driverDetails) {
  const { driverName, carNo, eta } = driverDetails;
  const message = SMS_TEMPLATES.driverAssigned(driverName, carNo, eta);
  
  return await sendSMS(customerPhone, message, SMS_CONFIG.msg91.templates.driverAssigned);
}

/**
 * Notify customer when ride starts
 */
async function notifyRideStarted(customerPhone, driverName, rideId) {
  const message = SMS_TEMPLATES.rideStarted(driverName, rideId);
  return await sendSMS(customerPhone, message);
}

/**
 * Notify customer when ride completes
 */
async function notifyRideComplete(customerPhone, rideDetails) {
  const { fare, paymentMethod } = rideDetails;
  const message = SMS_TEMPLATES.rideComplete(fare, paymentMethod);
  
  return await sendSMS(customerPhone, message, SMS_CONFIG.msg91.templates.rideComplete);
}

/**
 * Send OTP to customer/driver
 */
async function sendOTP(phone, purpose = 'verification') {
  const otp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
  const message = SMS_TEMPLATES.otp(otp, 5);

  const result = await sendSMS(phone, message, SMS_CONFIG.msg91.templates.otp);

  if (result.success) {
    // Store OTP in database/cache for verification
    await storeOTP(phone, otp, purpose);
  }

  return { ...result, otp };
}

/**
 * Notify driver of new ride request
 */
async function notifyDriverNewRide(driverPhone, rideDetails) {
  const { pickup, drop, fare } = rideDetails;
  const message = SMS_TEMPLATES.driverRideRequest(pickup, drop, fare);
  
  return await sendSMS(driverPhone, message);
}

/**
 * Send payment reminder
 */
async function sendPaymentReminder(customerPhone, rideId, amount) {
  const message = SMS_TEMPLATES.paymentReminder(rideId, amount);
  return await sendSMS(customerPhone, message);
}

/**
 * Notify refund processed
 */
async function notifyRefundProcessed(customerPhone, amount, refundId) {
  const message = SMS_TEMPLATES.refundProcessed(amount, refundId);
  return await sendSMS(customerPhone, message);
}

// ===== BULK SMS =====

/**
 * Send promotional SMS to multiple customers
 * @param {Array<string>} phoneNumbers - Array of phone numbers
 * @param {string} message - Message text
 */
async function sendBulkSMS(phoneNumbers, message) {
  const results = [];

  for (const phone of phoneNumbers) {
    const result = await sendSMS(phone, message);
    results.push({ phone, ...result });
    
    // Rate limiting: Wait 100ms between messages
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return {
    total: phoneNumbers.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    details: results,
  };
}

// ===== OTP STORAGE & VERIFICATION =====

/**
 * Store OTP in cache/database
 */
async function storeOTP(phone, otp, purpose) {
  // Example: Store in Firebase/Redis with 5-minute expiry
  const { getFirestore } = require('firebase-admin/firestore');
  const db = getFirestore();

  await db.collection('otps').doc(phone).set({
    otp: otp,
    purpose: purpose,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
  });
}

/**
 * Verify OTP
 */
async function verifyOTP(phone, otp) {
  const { getFirestore } = require('firebase-admin/firestore');
  const db = getFirestore();

  const doc = await db.collection('otps').doc(phone).get();

  if (!doc.exists) {
    return { valid: false, message: 'OTP not found' };
  }

  const data = doc.data();

  if (new Date() > data.expiresAt.toDate()) {
    return { valid: false, message: 'OTP expired' };
  }

  if (data.otp !== otp) {
    return { valid: false, message: 'Invalid OTP' };
  }

  // OTP valid - delete it
  await db.collection('otps').doc(phone).delete();

  return { valid: true, message: 'OTP verified successfully' };
}

// ===== EXPORT =====
module.exports = {
  // Core functions
  sendSMS,
  sendOTP,
  verifyOTP,
  sendBulkSMS,

  // Notification workflows
  notifyBookingConfirmed,
  notifyDriverAssigned,
  notifyRideStarted,
  notifyRideComplete,
  notifyDriverNewRide,
  sendPaymentReminder,
  notifyRefundProcessed,

  // Templates
  SMS_TEMPLATES,
};

// ===== USAGE EXAMPLES =====

/*
// 1. Send booking confirmation
await notifyBookingConfirmed('9876543210', {
  rideId: 'RIDE-12345',
  fare: 120,
  eta: 5,
});

// 2. Send OTP
const result = await sendOTP('9876543210', 'login');
console.log('OTP sent:', result.otp);

// 3. Verify OTP
const verification = await verifyOTP('9876543210', '1234');
if (verification.valid) {
  console.log('Login successful!');
}

// 4. Notify driver of new ride
await notifyDriverNewRide('9876543211', {
  pickup: 'Sector 29, Gurugram',
  drop: 'Cyber City',
  fare: 120,
});

// 5. Send bulk promotional SMS
await sendBulkSMS(
  ['9876543210', '9876543211', '9876543212'],
  '🎉 SukhSafar Festival Offer! Get 20% off on your next 5 rides. Book now!'
);
*/
