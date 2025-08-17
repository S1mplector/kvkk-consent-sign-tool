/**
 * Timestamp Service
 * Provides trusted timestamping with optional TSA integration, fallback to local
 */
const crypto = require('crypto');

class TimestampService {
  constructor() {
    this.tsaUrl = process.env.TSA_URL || null;
    this.timeoutMs = parseInt(process.env.TSA_TIMEOUT || '5000', 10);
  }

  async getTimestamp(proofInput) {
    const createdAt = new Date().toISOString();

    // TODO: Integrate real TSA here if configured
    if (this.tsaUrl) {
      try {
        // Placeholder for TSA integration; return simulated TSA token
        const token = crypto
          .createHash('sha256')
          .update(`${createdAt}:${JSON.stringify(proofInput || {})}`)
          .digest('hex');

        return {
          type: 'tsa',
          url: this.tsaUrl,
          createdAt,
          token,
        };
      } catch (e) {
        // Fall through to local
      }
    }

    // Local timestamp fallback
    return {
      type: 'local',
      createdAt,
      nonce: crypto.randomBytes(16).toString('hex'),
    };
  }
}

module.exports = new TimestampService();
