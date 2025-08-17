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
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

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

  /**
   * Embed evidence metadata into the PDF as an additional page with JSON block.
   * Returns a new PDF buffer.
   * @param {Buffer} pdfBuffer
   * @param {Object} embedData - minimal evidence summary
   */
  async embedEvidenceInPdf(pdfBuffer, embedData) {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Courier);
    const title = 'KVKK SES Evidence Metadata';
    const json = JSON.stringify(embedData, null, 2);
    const text = `${title}\nGenerated: ${new Date().toISOString()}\n\n${json}`;

    const margin = 50;
    const fontSize = 10;
    const lineHeight = fontSize * 1.3;
    const maxWidth = width - margin * 2;

    // simple text wrapping
    const lines = [];
    for (const rawLine of text.split('\n')) {
      let remaining = rawLine;
      while (remaining.length > 0) {
        let cut = remaining.length;
        // shrink until it fits
        while (cut > 0 && font.widthOfTextAtSize(remaining.slice(0, cut), fontSize) > maxWidth) {
          cut--;
        }
        if (cut === 0) break;
        lines.push(remaining.slice(0, cut));
        remaining = remaining.slice(cut);
      }
      if (remaining.length === 0) lines.push('');
    }

    let y = height - margin;
    page.drawText(title, { x: margin, y, size: 12, font, color: rgb(0, 0, 0.6) });
    y -= lineHeight * 2;
    for (const line of lines.slice(2)) { // skip duplicated title lines
      if (y < margin) break;
      page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
      y -= lineHeight;
    }

    const out = await pdfDoc.save();
    return Buffer.from(out);
  }
}

module.exports = new EvidenceBundleService();
