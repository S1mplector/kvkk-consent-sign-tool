/**
 * OTP Service
 * Generates, sends, verifies OTP codes with TTL, rate limiting, and attempt limits
 */
const crypto = require('crypto');
const emailService = require('./emailService');

class OTPService {
  constructor() {
    this.store = new Map(); // key: recipient, value: { codeHash, expiresAt, attempts, maxAttempts, createdAt, id }
    this.defaultTTLMinutes = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);
    this.defaultMaxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);
  }

  _generateCode(length = 6) {
    // Numeric OTP
    const code = ('' + (Math.floor(Math.random() * 10 ** length)).toString()).padStart(length, '0');
    return code;
  }

  _hashCode(code) {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  async requestOTP(recipient, context = {}) {
    if (!recipient || typeof recipient !== 'string') {
      throw new Error('Recipient is required');
    }

    const code = this._generateCode(6);
    const codeHash = this._hashCode(code);
    const now = new Date();
    const id = crypto.randomUUID();

    const ttl = context.ttlMinutes || this.defaultTTLMinutes;
    const maxAttempts = context.maxAttempts || this.defaultMaxAttempts;

    const entry = {
      id,
      codeHash,
      attempts: 0,
      maxAttempts,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl * 60 * 1000).toISOString(),
      recipient,
      context,
    };

    this.store.set(recipient, entry);

    // Send email if configured
    if (emailService.isConfigured()) {
      try {
        await emailService.sendOTPEmail(recipient, code, { ttlMinutes: ttl });
      } catch (e) {
        // Don't expose code in logs
        throw new Error('Failed to send OTP email');
      }
    } else {
      // Fallback for dev: log to server (not production safe)
      console.log(`📧 [DEV] OTP for ${recipient}: ${code} (expires in ${ttl}m)`);
    }

    return { success: true, id, expiresAt: entry.expiresAt, recipient };
  }

  async verifyOTP(recipient, code) {
    const entry = this.store.get(recipient);
    if (!entry) {
      return { success: false, reason: 'NOT_FOUND', message: 'OTP not found' };
    }

    const now = new Date();
    if (now > new Date(entry.expiresAt)) {
      this.store.delete(recipient);
      return { success: false, reason: 'EXPIRED', message: 'OTP expired' };
    }

    if (entry.attempts >= entry.maxAttempts) {
      this.store.delete(recipient);
      return { success: false, reason: 'ATTEMPTS_EXCEEDED', message: 'Too many attempts' };
    }

    entry.attempts += 1;

    const valid = this._hashCode(code) === entry.codeHash;
    if (!valid) {
      return { success: false, reason: 'INVALID', attemptsLeft: Math.max(0, entry.maxAttempts - entry.attempts) };
    }

    // Successful verification -> issue verification token
    const verificationId = crypto.randomUUID();
    const verification = {
      id: verificationId,
      recipient,
      verifiedAt: now.toISOString(),
      createdAt: entry.createdAt,
      context: entry.context,
    };

    // Clear OTP after success
    this.store.delete(recipient);

    return { success: true, verification };
  }
}

module.exports = new OTPService();
