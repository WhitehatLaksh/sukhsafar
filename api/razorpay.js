/**
 * Razorpay Payment Gateway Integration
 * Handles payment processing for ride bookings
 * 
 * Required: Razorpay account at https://razorpay.com/
 * Cost: 2% + GST = 2.36% per transaction
 */

// ===== CONFIGURATION =====
const RAZORPAY_CONFIG = {
  keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_xxxxxxxxxxxxxxxx',
  keySecret: process.env.RAZORPAY_KEY_SECRET || 'your_secret_here',
  currency: 'INR',
  company: {
    name: 'SukhSafar',
    logo: 'https://sukhsafar.in/logo.png',
    theme: '#0a3d2e',
  }
};

// ===== CLIENT-SIDE: Razorpay Checkout =====

/**
 * Initialize Razorpay payment for a ride
 * @param {Object} rideDetails - { rideId, fare, customerName, customerPhone, customerEmail }
 * @returns {Promise<Object>} Payment response
 */
async function initiatePayment(rideDetails) {
  const { rideId, fare, customerName, customerPhone, customerEmail } = rideDetails;

  // Create order on backend first
  const order = await createRazorpayOrder(rideId, fare);

  return new Promise((resolve, reject) => {
    const options = {
      key: RAZORPAY_CONFIG.keyId,
      amount: order.amount, // Amount in paise (₹100 = 10000 paise)
      currency: order.currency,
      name: RAZORPAY_CONFIG.company.name,
      description: `Ride Payment - ${rideId}`,
      image: RAZORPAY_CONFIG.company.logo,
      order_id: order.id,
      
      // Pre-fill customer details
      prefill: {
        name: customerName,
        contact: customerPhone,
        email: customerEmail || 'customer@sukhsafar.in',
      },

      // Theme
      theme: {
        color: RAZORPAY_CONFIG.company.theme,
      },

      // Payment methods
      config: {
        display: {
          blocks: {
            banks: {
              name: 'Pay via UPI',
              instruments: [
                { method: 'upi' },
              ],
            },
            card: {
              name: 'Credit/Debit Card',
              instruments: [
                { method: 'card' },
              ],
            },
            netbanking: {
              name: 'Netbanking',
              instruments: [
                { method: 'netbanking' },
              ],
            },
          },
          sequence: ['block.banks', 'block.card', 'block.netbanking'],
          preferences: {
            show_default_blocks: true,
          },
        },
      },

      // Handlers
      handler: async function (response) {
        // Payment successful
        const verification = await verifyPayment({
          orderId: order.id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
          rideId: rideId,
        });

        if (verification.success) {
          resolve({
            success: true,
            paymentId: response.razorpay_payment_id,
            orderId: order.id,
            amount: fare,
          });
        } else {
          reject(new Error('Payment verification failed'));
        }
      },

      modal: {
        ondismiss: function() {
          reject(new Error('Payment cancelled by user'));
        },
      },
    };

    // Open Razorpay checkout
    const rzp = new Razorpay(options);
    rzp.on('payment.failed', function (response) {
      reject({
        error: response.error.code,
        description: response.error.description,
        reason: response.error.reason,
      });
    });
    rzp.open();
  });
}

// ===== SERVER-SIDE: Order Creation =====

/**
 * Create Razorpay order (Backend API call)
 * @param {string} rideId 
 * @param {number} fare - Amount in rupees
 * @returns {Promise<Object>} Order object
 */
async function createRazorpayOrder(rideId, fare) {
  const response = await fetch('/api/payments/create-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      rideId: rideId,
      amount: fare,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to create payment order');
  }

  return await response.json();
}

/**
 * Verify payment signature (Backend API call)
 * @param {Object} paymentData 
 * @returns {Promise<Object>}
 */
async function verifyPayment(paymentData) {
  const response = await fetch('/api/payments/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(paymentData),
  });

  return await response.json();
}

// ===== BACKEND API ENDPOINTS (Node.js/Express) =====

/**
 * Backend: Create Order Endpoint
 * POST /api/payments/create-order
 */
async function handleCreateOrder(req, res) {
  const Razorpay = require('razorpay');
  const { rideId, amount } = req.body;

  const razorpay = new Razorpay({
    key_id: RAZORPAY_CONFIG.keyId,
    key_secret: RAZORPAY_CONFIG.keySecret,
  });

  try {
    const order = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: `ride_${rideId}`,
      notes: {
        rideId: rideId,
        platform: 'SukhSafar',
      },
    });

    res.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
    });
  } catch (error) {
    console.error('Razorpay order creation failed:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
}

/**
 * Backend: Verify Payment Endpoint
 * POST /api/payments/verify
 */
async function handleVerifyPayment(req, res) {
  const crypto = require('crypto');
  const { orderId, paymentId, signature, rideId } = req.body;

  // Generate signature
  const generatedSignature = crypto
    .createHmac('sha256', RAZORPAY_CONFIG.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (generatedSignature === signature) {
    // Payment verified successfully
    // Update ride status in database
    await updateRidePaymentStatus(rideId, {
      paymentId: paymentId,
      orderId: orderId,
      status: 'paid',
      paidAt: new Date(),
    });

    res.json({ success: true, message: 'Payment verified' });
  } else {
    res.status(400).json({ success: false, message: 'Invalid signature' });
  }
}

// ===== HELPER: Update Ride Payment Status =====
async function updateRidePaymentStatus(rideId, paymentData) {
  // Firebase example
  const { getFirestore } = require('firebase-admin/firestore');
  const db = getFirestore();

  await db.collection('rides').doc(rideId).update({
    payment: paymentData,
    paymentStatus: 'completed',
    updatedAt: new Date(),
  });
}

// ===== REFUND HANDLING =====

/**
 * Process refund for cancelled ride
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Amount to refund (in rupees)
 * @param {string} reason - Refund reason
 */
async function processRefund(paymentId, amount, reason = 'Ride cancelled') {
  const Razorpay = require('razorpay');
  
  const razorpay = new Razorpay({
    key_id: RAZORPAY_CONFIG.keyId,
    key_secret: RAZORPAY_CONFIG.keySecret,
  });

  try {
    const refund = await razorpay.payments.refund(paymentId, {
      amount: amount * 100, // Convert to paise
      notes: {
        reason: reason,
        processedBy: 'SukhSafar',
      },
    });

    return {
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status,
    };
  } catch (error) {
    console.error('Refund failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ===== WEBHOOK HANDLER =====

/**
 * Handle Razorpay webhooks for payment events
 * POST /api/webhooks/razorpay
 */
async function handleRazorpayWebhook(req, res) {
  const crypto = require('crypto');
  const webhookSecret = 'your_webhook_secret'; // Get from Razorpay dashboard
  
  const signature = req.headers['x-razorpay-signature'];
  const body = JSON.stringify(req.body);

  // Verify webhook signature
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = req.body;

  // Handle different event types
  switch (event.event) {
    case 'payment.captured':
      // Payment successful
      console.log('Payment captured:', event.payload.payment.entity);
      break;

    case 'payment.failed':
      // Payment failed
      console.log('Payment failed:', event.payload.payment.entity);
      break;

    case 'refund.processed':
      // Refund completed
      console.log('Refund processed:', event.payload.refund.entity);
      break;

    default:
      console.log('Unhandled event:', event.event);
  }

  res.json({ status: 'ok' });
}

// ===== USAGE EXAMPLE IN BOOKING FLOW =====

async function completeBooking(rideDetails) {
  try {
    // 1. Create ride in database
    const rideId = await createRide(rideDetails);

    // 2. If payment required, initiate payment
    if (rideDetails.paymentMethod === 'online') {
      const paymentResult = await initiatePayment({
        rideId: rideId,
        fare: rideDetails.fare,
        customerName: rideDetails.customerName,
        customerPhone: rideDetails.customerPhone,
        customerEmail: rideDetails.customerEmail,
      });

      if (paymentResult.success) {
        // Payment successful
        console.log('Payment successful:', paymentResult.paymentId);
        
        // 3. Assign driver
        await assignDriver(rideId);

        // 4. Send confirmation SMS
        await sendSMS(rideDetails.customerPhone, 'Booking confirmed! Driver will reach you soon.');

        return {
          success: true,
          rideId: rideId,
          message: 'Booking confirmed and payment received',
        };
      }
    } else {
      // Cash payment
      await assignDriver(rideId);
      return {
        success: true,
        rideId: rideId,
        message: 'Booking confirmed. Pay cash to driver.',
      };
    }
  } catch (error) {
    console.error('Booking failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ===== EXPORT =====
module.exports = {
  initiatePayment,
  createRazorpayOrder,
  verifyPayment,
  processRefund,
  handleCreateOrder,
  handleVerifyPayment,
  handleRazorpayWebhook,
  completeBooking,
};

// ===== HTML INTEGRATION =====
/*
<!-- Add Razorpay Checkout script to your HTML -->
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>

<!-- Example: Pay button -->
<button onclick="handlePayment()">Pay ₹120</button>

<script>
async function handlePayment() {
  try {
    const result = await initiatePayment({
      rideId: 'RIDE-12345',
      fare: 120,
      customerName: 'Rahul Kumar',
      customerPhone: '9876543210',
      customerEmail: 'rahul@example.com',
    });
    
    if (result.success) {
      alert('Payment successful! Ride confirmed.');
      // Redirect to ride tracking page
      window.location.href = '/track-ride?id=' + result.rideId;
    }
  } catch (error) {
    alert('Payment failed: ' + error.message);
  }
}
</script>
*/
