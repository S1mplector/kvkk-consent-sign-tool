/**
 * Evidence Bundle Service
 * Assembles SES-grade evidence: pdf hash, otp verification, device fingerprint,
 * KVKK notice version, trusted timestamp, and hash chain anchoring. Stores
 * alongside the base submission via storageService.
 */
const crypto = require('crypto');
const storageService = require('./storageService');
const encryptionService = require('./encryptionService');
const kvkkVersionService = require('./kvkkVersionService');
const timestampService = require('./timestampService');
const hashChainService = require('./hashChainService');

class EvidenceBundleService {
  computePdfHash(pdfBuffer) {
    return crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  }

  async assembleAndStore(formData, pdfBuffer, evidenceInput, reqMeta = {}) {
    // Store base submission first
    const base = await storageService.storeSubmission(formData, pdfBuffer);

    const pdfHash = this.computePdfHash(pdfBuffer);
    const kvkkVersion = kvkkVersionService.getCurrentVersion();
    const timestampProof = await timestampService.getTimestamp({ pdfHash });

    const bundle = {
      submissionId: base.submissionId,
      createdAt: new Date().toISOString(),
      pdfHash,
      request: {
        ip: reqMeta.ip,
        userAgent: reqMeta.userAgent,
      },
      kvkkNotice: kvkkVersion,
      otpVerification: evidenceInput?.otpVerification || null,
      deviceFingerprint: evidenceInput?.deviceFingerprint || null,
      consentFlow: evidenceInput?.consentFlow || null, // UI steps timeline if provided
      timestamp: timestampProof,
    };

    // Anchor in hash chain
    const chainEntry = await hashChainService.append({
      type: 'consent-evidence',
      submissionId: base.submissionId,
      pdfHash,
      otp: bundle.otpVerification ? { recipient: bundle.otpVerification.recipient, verifiedAt: bundle.otpVerification.verifiedAt } : null,
      kvkkVersion: kvkkVersion.version,
      ts: timestampProof.createdAt,
    });

    bundle.hashChain = {
      index: chainEntry.index,
      hash: chainEntry.hash,
      prevHash: chainEntry.prevHash,
      anchoredAt: chainEntry.timestamp,
    };

    // Encrypt and store evidence bundle next to metadata
    const evidenceEnc = encryptionService.encrypt(JSON.stringify(bundle), `evidence:${base.submissionId}`);

    const evidencePath = require('path').join(
      storageService.config.dataPath,
      'metadata',
      `${base.submissionId}.evidence`
    );

    await storageService.writeSecureFile(evidencePath, evidenceEnc);

    return { success: true, submissionId: base.submissionId, evidence: { hashChain: bundle.hashChain, timestamp: bundle.timestamp } };
  }
}

module.exports = new EvidenceBundleService();
