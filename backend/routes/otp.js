/**
 * OTP Routes
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const otpService = require('../services/otpService');

const router = express.Router();

// Simple ping to verify router is mounted
router.get('/ping', (req, res) => {
  console.log('🔔 [/api/otp/ping] hit');
  res.json({ ok: true, route: 'otp', timestamp: new Date().toISOString() });
});

router.post('/request', [
  body('recipient').isString().isLength({ min: 5 }).withMessage('Valid recipient is required'),
], async (req, res) => {
  try {
    console.log('➡️  [/api/otp/request] body:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('⚠️  [/api/otp/request] validation error:', errors.array());
      return res.status(400).json({ error: 'Validation failed', details: errors.array(), code: 'VALIDATION_ERROR' });
    }

    const { recipient } = req.body;
    const result = await otpService.requestOTP(recipient);
    const payload = { success: true, id: result.id, expiresAt: result.expiresAt, recipient: result.recipient };
    console.log('✅ [/api/otp/request] response:', payload);
    res.json(payload);
  } catch (error) {
    console.error('❌ OTP request error:', error);
    res.status(500).json({ error: 'Failed to request OTP', code: 'OTP_REQUEST_FAILED' });
  }
});

router.post('/verify', [
  body('recipient').isString().withMessage('Recipient is required'),
  body('code').isString().isLength({ min: 4, max: 10 }).withMessage('Code is required')
], async (req, res) => {
  try {
    console.log('➡️  [/api/otp/verify] body:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('⚠️  [/api/otp/verify] validation error:', errors.array());
      return res.status(400).json({ error: 'Validation failed', details: errors.array(), code: 'VALIDATION_ERROR' });
    }

    const { recipient, code } = req.body;
    const result = await otpService.verifyOTP(recipient, code);
    if (!result.success) {
      console.warn('⚠️  [/api/otp/verify] failed:', result);
      return res.status(400).json({ success: false, ...result });
    }
    const payload = { success: true, verification: result.verification };
    console.log('✅ [/api/otp/verify] response:', payload);
    res.json(payload);
  } catch (error) {
    console.error('❌ OTP verify error:', error);
    res.status(500).json({ error: 'Failed to verify OTP', code: 'OTP_VERIFY_FAILED' });
  }
});

module.exports = router;
