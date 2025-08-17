/**
 * Timestamp Service
 * Provides trusted timestamping with optional TSA integration, fallback to local
 */
const crypto = require('crypto');
const { execFile } = require('child_process');
const https = require('https');
const http = require('http');
const { URL } = require('url');

class TimestampService {
  constructor() {
    this.tsaUrl = process.env.TSA_URL || null;
    this.timeoutMs = parseInt(process.env.TSA_TIMEOUT || '8000', 10);
    this.mode = process.env.TSA_MODE || 'rfc3161-openssl'; // future modes: direct-lib
    this.username = process.env.TSA_USERNAME || null; // optional basic auth
    this.password = process.env.TSA_PASSWORD || null; // optional basic auth
  }

  // Create RFC3161 timestamp query (TSQ) using OpenSSL for the given SHA-256 hash (hex)
  createTsqOpenSSL(hashHex) {
    return new Promise((resolve, reject) => {
      const args = ['ts', '-query', '-sha256', '-cert', '-digest', hashHex];
      const child = execFile('openssl', args, { timeout: this.timeoutMs }, (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(`OpenSSL TSQ failed: ${err.message}\n${stderr || ''}`));
        }
        // stdout is DER-encoded TSQ
        return resolve(Buffer.from(stdout, 'binary'));
      });
      // Ensure no stdin usage
      if (child.stdin) child.stdin.end();
    });
  }

  // POST binary body to TSA and return binary response body
  postToTSA(urlString, bodyBuffer) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlString);
      const headers = {
        'Content-Type': 'application/timestamp-query',
        'Content-Length': Buffer.byteLength(bodyBuffer)
      };
      if (this.username && this.password) {
        const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }

      const options = {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'http:' ? 80 : 443),
        path: url.pathname + (url.search || ''),
        headers,
        timeout: this.timeoutMs,
        rejectUnauthorized: url.protocol === 'https:' ? (process.env.TSA_REJECT_UNAUTHORIZED !== 'false') : undefined
      };

      const requester = url.protocol === 'http:' ? http.request : https.request;
      const req = requester(options, (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            return resolve(buf);
          }
          return reject(new Error(`TSA HTTP ${res.statusCode}: ${buf.toString('utf8')}`));
        });
      });

      req.on('error', (e) => reject(e));
      req.on('timeout', () => {
        req.destroy(new Error('TSA request timed out'));
      });
      req.write(bodyBuffer);
      req.end();
    });
  }

  async getTimestamp(proofInput) {
    const createdAt = new Date().toISOString();
    const subject = JSON.stringify(proofInput || {});
    const hashHex = crypto.createHash('sha256').update(subject).digest('hex');

    if (this.tsaUrl) {
      try {
        if (this.mode === 'rfc3161-openssl') {
          const tsq = await this.createTsqOpenSSL(hashHex);
          const tsr = await this.postToTSA(this.tsaUrl, tsq);
          return {
            type: 'tsa',
            url: this.tsaUrl,
            mode: this.mode,
            createdAt,
            algorithm: 'sha256',
            inputHash: hashHex,
            token: tsr.toString('base64'), // DER-encoded TimeStampResp
          };
        }

        // Future: other modes could be implemented here
      } catch (e) {
        console.warn('⚠️  TSA integration failed, falling back to local timestamp:', e.message);
        // fall through to local
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
