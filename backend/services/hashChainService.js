/**
 * Hash Chain Service
 * Maintains an append-only hash chain for tamper-evident logging
 */
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;
const storageService = require('./storageService');

class HashChainService {
  constructor() {
    this.chainFile = path.join(storageService.config.dataPath, 'metadata', 'hashchain.json');
    this._init = this.initialize();
  }

  async initialize() {
    try {
      await fs.access(this.chainFile);
    } catch (_) {
      const genesis = {
        index: 0,
        timestamp: new Date().toISOString(),
        prevHash: null,
        data: { type: 'genesis' },
        hash: this.computeHash(0, null, { type: 'genesis' })
      };
      await storageService.writeSecureFile(this.chainFile, { entries: [genesis] });
    }
  }

  computeHash(index, prevHash, data) {
    const h = crypto.createHash('sha256');
    h.update(String(index));
    h.update(prevHash || '');
    h.update(JSON.stringify(data));
    return h.digest('hex');
  }

  async append(data) {
    await this._init;
    const file = await storageService.readSecureFile(this.chainFile);
    const entries = file.entries || [];
    const last = entries[entries.length - 1];
    const index = (last?.index || 0) + 1;
    const prevHash = last?.hash || null;
    const hash = this.computeHash(index, prevHash, data);
    const entry = { index, timestamp: new Date().toISOString(), prevHash, data, hash };
    entries.push(entry);
    await storageService.writeSecureFile(this.chainFile, { entries });
    return entry;
  }

  async getLatest() {
    await this._init;
    const file = await storageService.readSecureFile(this.chainFile);
    const entries = file.entries || [];
    return entries[entries.length - 1] || null;
  }
}

module.exports = new HashChainService();
