/**
 * KVKK Version Service
 * Provides versioning for KVKK notice/policy content
 */
class KVKKVersionService {
  constructor() {
    this.currentVersion = process.env.KVKK_NOTICE_VERSION || 'v1.0.0';
    this.policyHash = process.env.KVKK_NOTICE_POLICY_HASH || null; // Optional precomputed hash of notice content
    this.locale = process.env.KVKK_NOTICE_LOCALE || 'tr-TR';
  }

  getCurrentVersion() {
    return {
      version: this.currentVersion,
      policyHash: this.policyHash,
      locale: this.locale,
      publishedAt: process.env.KVKK_NOTICE_PUBLISHED_AT || null,
    };
  }
}

module.exports = new KVKKVersionService();
