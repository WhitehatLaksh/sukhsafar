/**
 * SukhSafar Constants
 * App-wide configuration and constants
 */

// ===== PRICING =====
export const PRICING = {
  baseFare: parseInt(process.env.BASE_FARE) || 30,
  perKm: parseInt(process.env.RATE_PER_KM) || 12,
  nightSurcharge: parseInt(process.env.NIGHT_SURCHARGE_PER_KM) || 2,
  nightStartHour: parseInt(process.env.NIGHT_START_HOUR) || 22, // 10 PM
  nightEndHour: parseInt(process.env.NIGHT_END_HOUR) || 6, // 6 AM
  
  driverSharePercent: parseFloat(process.env.DRIVER_SHARE_PERCENT) || 80,
  platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT) || 20,
  
  dailyCarRent: parseInt(process.env.DAILY_CAR_RENT) || 250,
  
  minimumFare: parseInt(process.env.MINIMUM_FARE) || 50,
  maximumFare: parseInt(process.env.MAXIMUM_FARE) || 5000,
  
  // Corporate rates
  corporatePerKm: parseInt(process.env.CORPORATE_RATE_PER_KM) || 8,
  corporateBaseFare: parseInt(process.env.CORPORATE_BASE_FARE) || 20,
};

// ===== BUSINESS INFO =====
export const BUSINESS = {
  name: process.env.BUSINESS_NAME || 'SukhSafar',
  phone: process.env.BUSINESS_PHONE || '+919999999999',
  email: process.env.BUSINESS_EMAIL || 'hello@sukhsafar.in',
  address: process.env.BUSINESS_ADDRESS || 'Gurugram, Haryana, India',
  whatsappNumber: process.env.WHATSAPP_NUMBER || '919999999999',
};

// ===== OPERATIONAL SETTINGS =====
export const OPERATIONS = {
  maxPickupRadiusKm: parseInt(process.env.MAX_PICKUP_RADIUS_KM) || 15,
  rideRequestTimeoutSeconds: parseInt(process.env.RIDE_REQUEST_TIMEOUT_SECONDS) || 15,
  maxActiveRidesPerDriver: parseInt(process.env.MAX_ACTIVE_RIDES_PER_DRIVER) || 1,
  minBatteryPercentForRide: parseInt(process.env.MIN_BATTERY_PERCENT_FOR_RIDE) || 20,
};

// ===== RIDE STATUSES =====
export const RIDE_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

// ===== DRIVER STATUSES =====
export const DRIVER_STATUS = {
  OFFLINE: 'offline',
  ONLINE: 'online',
  BUSY: 'busy',
};

// ===== PAYMENT METHODS =====
export const PAYMENT_METHODS = {
  CASH: 'cash',
  ONLINE: 'online',
  UPI: 'upi',
  CARD: 'card',
};

// ===== VEHICLE INFO =====
export const VEHICLES = {
  TATA_TIGOR_EV: {
    name: 'Tata Tigor EV',
    batteryCapacity: 26, // kWh
    range: 250, // km
    chargingTime: 8.5, // hours (AC)
    fastChargingTime: 1.5, // hours (DC)
  },
  TATA_NEXON_EV: {
    name: 'Tata Nexon EV',
    batteryCapacity: 30.2, // kWh
    range: 312, // km
    chargingTime: 9, // hours (AC)
    fastChargingTime: 1, // hours (DC)
  },
};

// ===== ELECTRICITY COSTS =====
export const ELECTRICITY = {
  homeCostPerKwh: 8, // ₹6-10 typical
  publicDCCostPerKwh: 18, // ₹14-24 typical
  avgConsumptionPerKm: 0.11, // kWh/km for Tata EVs
};

// ===== FARE CALCULATOR =====
export function calculateFare(distanceKm, isNightTime = false) {
  let fare = PRICING.baseFare + (distanceKm * PRICING.perKm);
  
  if (isNightTime) {
    fare += distanceKm * PRICING.nightSurcharge;
  }
  
  // Apply min/max limits
  fare = Math.max(PRICING.minimumFare, fare);
  fare = Math.min(PRICING.maximumFare, fare);
  
  return Math.round(fare);
}

// ===== EARNINGS CALCULATOR =====
export function calculateEarnings(grossFare) {
  const driverShare = Math.round(grossFare * (PRICING.driverSharePercent / 100));
  const platformFee = grossFare - driverShare;
  const netDriverEarning = driverShare - PRICING.dailyCarRent;
  
  return {
    grossFare,
    driverShare,
    platformFee,
    dailyRent: PRICING.dailyCarRent,
    netDriverEarning,
  };
}

// ===== TIME HELPERS =====
export function isNightTime(date = new Date()) {
  const hour = date.getHours();
  return hour >= PRICING.nightStartHour || hour < PRICING.nightEndHour;
}

export function getTimeOfDay(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// ===== DISTANCE HELPERS =====
export function estimateDistance(pickup, drop) {
  // Placeholder - integrate with Google Maps Distance Matrix API
  // For now, return a random estimate between 3-20 km
  return Math.floor(Math.random() * 17) + 3;
}

export function estimateDuration(distanceKm) {
  // Avg speed: 30 km/h in city traffic
  const hours = distanceKm / 30;
  return Math.round(hours * 60); // minutes
}

// ===== BATTERY HELPERS =====
export function calculateBatteryConsumption(distanceKm) {
  return distanceKm * ELECTRICITY.avgConsumptionPerKm;
}

export function calculateChargingCost(kWh, isHomeCharging = true) {
  const costPerKwh = isHomeCharging 
    ? ELECTRICITY.homeCostPerKwh 
    : ELECTRICITY.publicDCCostPerKwh;
  return Math.round(kWh * costPerKwh);
}

export function estimateRemainingRange(batteryPercent, batteryCapacityKwh, vehicleRange) {
  return Math.round((batteryPercent / 100) * vehicleRange);
}

// ===== VALIDATION HELPERS =====
export function validatePhone(phone) {
  // Indian mobile: 10 digits starting with 6-9
  const cleaned = phone.replace(/\D/g, '');
  const regex = /^[6-9]\d{9}$/;
  return regex.test(cleaned);
}

export function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

export function sanitizePhone(phone) {
  // Extract 10-digit number
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.slice(-10);
}

// ===== DATE HELPERS =====
export function formatDate(date, format = 'DD/MM/YYYY') {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return format
    .replace('DD', day)
    .replace('MM', month)
    .replace('YYYY', year);
}

export function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

// ===== CURRENCY HELPERS =====
export function formatCurrency(amount, showSymbol = true) {
  const formatted = Math.round(amount).toLocaleString('en-IN');
  return showSymbol ? `₹${formatted}` : formatted;
}

// ===== API RATE LIMITS =====
export const RATE_LIMITS = {
  booking: { windowMs: 15 * 60 * 1000, max: 10 }, // 10 bookings per 15 min
  otp: { windowMs: 60 * 1000, max: 3 }, // 3 OTPs per minute
  general: { windowMs: 15 * 60 * 1000, max: 100 }, // 100 requests per 15 min
};

// ===== ERROR MESSAGES =====
export const ERRORS = {
  INVALID_PHONE: 'Invalid phone number format',
  INVALID_EMAIL: 'Invalid email address',
  RIDE_NOT_FOUND: 'Ride not found',
  DRIVER_NOT_AVAILABLE: 'No drivers available nearby',
  PAYMENT_FAILED: 'Payment processing failed',
  OTP_EXPIRED: 'OTP has expired',
  OTP_INVALID: 'Invalid OTP',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  UNAUTHORIZED: 'Unauthorized access',
};

// ===== SUCCESS MESSAGES =====
export const SUCCESS = {
  RIDE_CREATED: 'Ride booked successfully',
  PAYMENT_SUCCESS: 'Payment processed successfully',
  OTP_SENT: 'OTP sent successfully',
  DRIVER_ASSIGNED: 'Driver assigned to your ride',
  RIDE_COMPLETED: 'Ride completed successfully',
};

// Export all as module
module.exports = {
  PRICING,
  BUSINESS,
  OPERATIONS,
  RIDE_STATUS,
  DRIVER_STATUS,
  PAYMENT_METHODS,
  VEHICLES,
  ELECTRICITY,
  RATE_LIMITS,
  ERRORS,
  SUCCESS,
  
  // Functions
  calculateFare,
  calculateEarnings,
  isNightTime,
  getTimeOfDay,
  estimateDistance,
  estimateDuration,
  calculateBatteryConsumption,
  calculateChargingCost,
  estimateRemainingRange,
  validatePhone,
  validateEmail,
  sanitizePhone,
  formatDate,
  formatTime,
  getTodayDate,
  formatCurrency,
};
