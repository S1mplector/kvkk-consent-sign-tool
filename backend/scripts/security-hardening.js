/**
 * Security Hardening Script
 * Additional security measures and configuration validation
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Color codes for output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

// Helper functions
function info(message) {
    console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function success(message) {
    console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function warn(message) {
    console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function error(message) {
    console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

// Security hardening functions

async function createSecurityDirectories() {
    info('Creating security directories...');
    
    const directories = [
        'storage/encrypted/submissions',
        'storage/encrypted/pdfs',
        'storage/encrypted/metadata',
        'storage/temp',
        'storage/logs',
        'storage/backups',
        'config/certificates',
        'scripts'
    ];
    
    for (const dir of directories) {
        const fullPath = path.join(__dirname, '..', dir);
        try {
            await fs.mkdir(fullPath, { recursive: true, mode: 0o700 });
            success(`Created ${dir} with secure permissions`);
        } catch (err) {
            if (err.code !== 'EEXIST') {
                error(`Failed to create ${dir}: ${err.message}`);
            }
        }
    }
}

async function generateSecurityKeys() {
    info('Checking security keys...');
    
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = '';
    
    try {
        envContent = await fs.readFile(envPath, 'utf8');
    } catch (err) {
        warn('.env file not found, creating new one');
    }
    
    const keys = {
        SESSION_SECRET: process.env.SESSION_SECRET,
        JWT_SECRET: process.env.JWT_SECRET,
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY
    };
    
    let updated = false;
    
    for (const [key, value] of Object.entries(keys)) {
        if (!value || value.length < 32) {
            const newValue = crypto.randomBytes(32).toString('hex');
            envContent += `\n${key}=${newValue}`;
            updated = true;
            success(`Generated new ${key}`);
        } else {
            info(`${key} already configured`);
        }
    }
    
    if (updated) {
        await fs.writeFile(envPath, envContent.trim() + '\n', { mode: 0o600 });
        success('Updated .env file with secure permissions');
    }
}

async function createSecurityHeaders() {
    info('Creating additional security headers configuration...');
    
    const headersConfig = `
# Additional Security Headers for Production

# Nginx Configuration
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" always;

# Apache Configuration
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
Header always set X-Frame-Options "DENY"
Header always set X-Content-Type-Options "nosniff"
Header always set X-XSS-Protection "1; mode=block"
Header always set Referrer-Policy "no-referrer"
Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
`;
    
    const configPath = path.join(__dirname, '..', 'config', 'security-headers.conf');
    await fs.writeFile(configPath, headersConfig.trim());
    success('Created security headers configuration');
}

async function createProductionConfig() {
    info('Creating production configuration template...');
    
    const prodConfig = {
        NODE_ENV: 'production',
        PORT: 3000,
        
        // Security
        SESSION_SECRET: '<generate-with-openssl-rand-hex-32>',
        JWT_SECRET: '<generate-with-openssl-rand-hex-32>',
        ENCRYPTION_KEY: '<generate-with-openssl-rand-hex-32>',
        
        // TLS
        SSL_CERT: '/path/to/certificate.crt',
        SSL_KEY: '/path/to/private.key',
        
        // Redis
        REDIS_URL: 'redis://localhost:6379',
        
        // Email
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        SMTP_USER: 'your-email@gmail.com',
        SMTP_PASS: 'your-app-password',
        
        // Frontend
        FRONTEND_URL: 'https://your-domain.com',
        
        // Data Retention
        DATA_RETENTION_DAYS: 30,
        CLEANUP_SCHEDULE: '0 2 * * *',
        
        // Paths
        DATA_PATH: './storage/encrypted',
        TEMP_PATH: './storage/temp',
        LOG_PATH: './storage/logs'
    };
    
    const configPath = path.join(__dirname, '..', '.env.production.template');
    const content = Object.entries(prodConfig)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    
    await fs.writeFile(configPath, content + '\n');
    success('Created production configuration template');
}

async function hardenFilePermissions() {
    info('Hardening file permissions...');
    
    const securePaths = [
        { path: '.env', mode: 0o600 },
        { path: '.env.production', mode: 0o600 },
        { path: 'storage', mode: 0o700 },
        { path: 'storage/encrypted', mode: 0o700 },
        { path: 'storage/logs', mode: 0o700 },
        { path: 'config/certificates', mode: 0o700 }
    ];
    
    for (const { path: filePath, mode } of securePaths) {
        const fullPath = path.join(__dirname, '..', filePath);
        try {
            await fs.chmod(fullPath, mode);
            success(`Set permissions ${mode.toString(8)} for ${filePath}`);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                warn(`Could not set permissions for ${filePath}: ${err.message}`);
            }
        }
    }
}

async function createSecurityChecklist() {
    info('Creating security deployment checklist...');
    
    const checklist = `# Production Security Deployment Checklist

## Pre-Deployment Security Checks

### 1. Environment Configuration
- [ ] All environment variables set in production
- [ ] Strong SESSION_SECRET (min 64 chars)
- [ ] Strong JWT_SECRET (min 64 chars)
- [ ] Strong ENCRYPTION_KEY (64 hex chars)
- [ ] SMTP credentials configured
- [ ] Redis connection configured
- [ ] SSL certificates installed

### 2. File Permissions
- [ ] .env file: 600 permissions
- [ ] Storage directories: 700 permissions
- [ ] Certificate files: 600 permissions
- [ ] Log files: 640 permissions

### 3. Network Security
- [ ] Firewall configured (only 80, 443, 22)
- [ ] SSH key-only authentication
- [ ] Fail2ban installed and configured
- [ ] DDoS protection enabled

### 4. Application Security
- [ ] NODE_ENV=production
- [ ] Debug mode disabled
- [ ] Error messages sanitized
- [ ] HTTPS enforced
- [ ] Security headers verified

### 5. Database/Storage Security
- [ ] Redis password set
- [ ] Redis bind to localhost only
- [ ] Backup encryption enabled
- [ ] Backup retention policy set

### 6. Monitoring & Logging
- [ ] Security event logging enabled
- [ ] Log rotation configured
- [ ] Monitoring alerts set up
- [ ] Intrusion detection active

### 7. Testing
- [ ] Security verification passed
- [ ] SSL Labs test: A+ grade
- [ ] Mozilla Observatory: A+ grade
- [ ] Penetration testing completed

### 8. Documentation
- [ ] Incident response plan ready
- [ ] Security contacts documented
- [ ] Recovery procedures tested
- [ ] Team security training completed

## Post-Deployment Verification

\`\`\`bash
# Run security verification
node backend/security-verification.js

# Test SSL configuration
curl -I https://your-domain.com

# Check security headers
curl -I https://your-domain.com/api/health | grep -E "(Strict-Transport|X-Frame|X-Content-Type|Content-Security)"

# Verify rate limiting
for i in {1..110}; do curl https://your-domain.com/api/health; done
\`\`\`

## Security Maintenance

- Weekly: Review security logs
- Monthly: Update dependencies
- Quarterly: Security audit
- Annually: Penetration testing

---
Generated: ${new Date().toISOString()}
`;
    
    const checklistPath = path.join(__dirname, '..', '..', 'SECURITY_DEPLOYMENT_CHECKLIST.md');
    await fs.writeFile(checklistPath, checklist);
    success('Created security deployment checklist');
}

async function createMonitoringScript() {
    info('Creating security monitoring script...');
    
    const monitoringScript = `#!/bin/bash
# Security Monitoring Script

echo "🔍 KVKK Sign Tool Security Monitor"
echo "=================================="
echo "Time: $(date)"
echo ""

# Check running processes
echo "📊 Application Status:"
if pgrep -f "node.*server.js" > /dev/null; then
    echo "✅ Backend server is running"
else
    echo "❌ Backend server is NOT running"
fi

# Check disk usage
echo ""
echo "💾 Storage Usage:"
du -sh storage/encrypted 2>/dev/null || echo "Storage directory not found"

# Check recent logs
echo ""
echo "📋 Recent Security Events:"
tail -n 10 storage/logs/storage-*.log 2>/dev/null | grep -E "(DELETE|CLEANUP|RETRIEVE)" || echo "No recent events"

# Check SSL certificate expiry
echo ""
echo "🔒 SSL Certificate Status:"
if [ -f "$SSL_CERT" ]; then
    openssl x509 -enddate -noout -in "$SSL_CERT"
else
    echo "SSL certificate not configured"
fi

# Check for failed login attempts
echo ""
echo "🚨 Failed Access Attempts:"
grep -c "BRUTE_FORCE_DETECTED" storage/logs/*.log 2>/dev/null || echo "0"

# Check system resources
echo ""
echo "💻 System Resources:"
echo "CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}')%"
echo "Memory: $(free -m | awk 'NR==2{printf "%.2f%%", $3*100/$2}')"
echo "Disk: $(df -h / | awk 'NR==2{print $5}')"

echo ""
echo "✅ Security monitoring complete"
`;
    
    const scriptPath = path.join(__dirname, 'monitor-security.sh');
    await fs.writeFile(scriptPath, monitoringScript, { mode: 0o755 });
    success('Created security monitoring script');
}

async function createBackupScript() {
    info('Creating encrypted backup script...');
    
    const backupScript = `#!/bin/bash
# Encrypted Backup Script

BACKUP_DIR="storage/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/kvkk_backup_$TIMESTAMP.tar.gz.enc"

echo "🔐 Starting encrypted backup..."

# Create backup directory
mkdir -p $BACKUP_DIR

# Create tar archive
tar -czf - storage/encrypted storage/logs | \\
    openssl enc -aes-256-cbc -salt -pbkdf2 -in - -out "$BACKUP_FILE" -k "$ENCRYPTION_KEY"

if [ $? -eq 0 ]; then
    echo "✅ Backup created: $BACKUP_FILE"
    
    # Remove old backups (keep last 7)
    ls -t $BACKUP_DIR/*.enc | tail -n +8 | xargs rm -f 2>/dev/null
    
    echo "✅ Old backups cleaned up"
else
    echo "❌ Backup failed"
    exit 1
fi
`;
    
    const scriptPath = path.join(__dirname, 'backup-encrypted.sh');
    await fs.writeFile(scriptPath, backupScript, { mode: 0o755 });
    success('Created encrypted backup script');
}

// Main execution
async function runSecurityHardening() {
    console.log('🔒 KVKK Sign Tool Security Hardening');
    console.log('====================================\n');
    
    try {
        await createSecurityDirectories();
        await generateSecurityKeys();
        await createSecurityHeaders();
        await createProductionConfig();
        await hardenFilePermissions();
        await createSecurityChecklist();
        await createMonitoringScript();
        await createBackupScript();
        
        console.log('\n✅ Security hardening complete!');
        console.log('\n📋 Next steps:');
        console.log('1. Review .env.production.template and configure for your environment');
        console.log('2. Set up SSL certificates in config/certificates/');
        console.log('3. Configure your web server with security-headers.conf');
        console.log('4. Run security verification: node security-verification.js');
        console.log('5. Follow SECURITY_DEPLOYMENT_CHECKLIST.md');
        
    } catch (err) {
        error(`Security hardening failed: ${err.message}`);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    runSecurityHardening();
}

module.exports = { runSecurityHardening };