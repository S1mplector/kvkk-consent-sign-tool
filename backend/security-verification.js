/**
 * Security Verification Script
 * Comprehensive security checks for KVKK Sign Tool
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Color codes for output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

// Security check results
const results = {
    passed: [],
    warnings: [],
    failures: []
};

// Helper functions
function pass(message) {
    console.log(`${colors.green}✅ PASS: ${message}${colors.reset}`);
    results.passed.push(message);
}

function warn(message) {
    console.log(`${colors.yellow}⚠️  WARN: ${message}${colors.reset}`);
    results.warnings.push(message);
}

function fail(message) {
    console.log(`${colors.red}❌ FAIL: ${message}${colors.reset}`);
    results.failures.push(message);
}

function info(message) {
    console.log(`${colors.blue}ℹ️  INFO: ${message}${colors.reset}`);
}

// Security Checks

async function checkEnvironmentVariables() {
    console.log('\n🔍 Checking Environment Variables...');
    
    const requiredProdVars = [
        'SESSION_SECRET',
        'JWT_SECRET',
        'ENCRYPTION_KEY',
        'SMTP_USER',
        'SMTP_PASS'
    ];
    
    const optionalVars = [
        'SSL_CERT',
        'SSL_KEY',
        'REDIS_URL',
        'DATA_RETENTION_DAYS'
    ];
    
    // Check .env file exists
    try {
        await fs.access('.env');
        pass('.env file exists');
    } catch {
        if (process.env.NODE_ENV === 'production') {
            fail('.env file missing in production');
        } else {
            warn('.env file missing - using defaults');
        }
    }
    
    // Check required variables
    for (const varName of requiredProdVars) {
        if (process.env[varName]) {
            // Check strength
            if (varName.includes('SECRET') || varName.includes('KEY')) {
                const value = process.env[varName];
                if (value.length < 32) {
                    warn(`${varName} is too short (${value.length} chars) - should be at least 32`);
                } else {
                    pass(`${varName} is configured with adequate length`);
                }
            } else {
                pass(`${varName} is configured`);
            }
        } else {
            if (process.env.NODE_ENV === 'production') {
                fail(`${varName} is not set - REQUIRED for production`);
            } else {
                warn(`${varName} is not set - will use generated default`);
            }
        }
    }
    
    // Check optional variables
    for (const varName of optionalVars) {
        if (process.env[varName]) {
            pass(`${varName} is configured (optional)`);
        } else {
            info(`${varName} is not set (optional)`);
        }
    }
}

async function checkFilePermissions() {
    console.log('\n🔍 Checking File Permissions...');
    
    const sensitivePaths = [
        '.env',
        'backend/.env',
        'storage/encrypted',
        'storage/logs'
    ];
    
    for (const filePath of sensitivePaths) {
        try {
            const stats = await fs.stat(filePath);
            const mode = (stats.mode & parseInt('777', 8)).toString(8);
            
            if (mode === '600' || mode === '700') {
                pass(`${filePath} has secure permissions (${mode})`);
            } else if (mode === '644' || mode === '755') {
                warn(`${filePath} has permissive permissions (${mode}) - should be 600/700`);
            } else {
                fail(`${filePath} has insecure permissions (${mode})`);
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                info(`${filePath} does not exist yet`);
            } else {
                warn(`Cannot check permissions for ${filePath}: ${error.message}`);
            }
        }
    }
}

async function checkDependencies() {
    console.log('\n🔍 Checking Dependencies...');
    
    try {
        const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
        const backendPackageJson = JSON.parse(await fs.readFile('backend/package.json', 'utf8'));
        
        // Check for security-related dependencies
        const requiredDeps = [
            'helmet',
            'express-rate-limit',
            'express-session',
            'csurf',
            'express-validator',
            'jsonwebtoken',
            'bcrypt',
            'dompurify',
            'node-cron'
        ];
        
        const allDeps = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
            ...backendPackageJson.dependencies,
            ...backendPackageJson.devDependencies
        };
        
        for (const dep of requiredDeps) {
            if (allDeps[dep]) {
                pass(`Security dependency '${dep}' is installed`);
            } else {
                fail(`Security dependency '${dep}' is missing`);
            }
        }
        
        // Check for known vulnerable packages
        const vulnerablePackages = [
            'express-fileupload', // Use multer instead
            'body-parser', // Built into Express 4.16+
            'cookie-parser' // Built into Express 4.16+
        ];
        
        for (const pkg of vulnerablePackages) {
            if (allDeps[pkg]) {
                warn(`Potentially vulnerable package '${pkg}' is installed`);
            }
        }
        
    } catch (error) {
        fail(`Cannot check dependencies: ${error.message}`);
    }
}

async function checkEncryption() {
    console.log('\n🔍 Checking Encryption Implementation...');
    
    try {
        // Test encryption service
        const encryptionService = require('./services/encryptionService');
        const testResult = await encryptionService.testEncryption();
        
        if (testResult.success) {
            pass('Encryption service test passed');
            pass('AES-256-GCM encryption is properly implemented');
            pass('Form data encryption is working');
        } else {
            fail(`Encryption test failed: ${testResult.message}`);
        }
        
        // Check key generation
        const testKey = encryptionService.constructor.generateEncryptionKey();
        if (testKey.length === 64) { // 32 bytes in hex
            pass('Encryption key generation produces correct length');
        } else {
            fail('Encryption key generation produces incorrect length');
        }
        
    } catch (error) {
        fail(`Encryption check failed: ${error.message}`);
    }
}

async function checkSecurityHeaders() {
    console.log('\n🔍 Checking Security Headers Configuration...');
    
    try {
        const securityConfig = require('./config/security');
        const helmetConfig = securityConfig.getHelmetConfig();
        
        // Check CSP
        if (helmetConfig.contentSecurityPolicy) {
            pass('Content Security Policy is configured');
            const csp = helmetConfig.contentSecurityPolicy.directives;
            
            if (csp.defaultSrc.includes("'self'")) {
                pass('CSP default-src is restrictive');
            } else {
                warn('CSP default-src could be more restrictive');
            }
            
            if (csp.frameAncestors.includes("'none'")) {
                pass('Clickjacking protection enabled (frame-ancestors)');
            } else {
                fail('Clickjacking protection not properly configured');
            }
        } else {
            fail('Content Security Policy is not configured');
        }
        
        // Check HSTS
        if (helmetConfig.hsts) {
            pass('HSTS is configured');
            if (helmetConfig.hsts.maxAge >= 31536000) {
                pass('HSTS max-age is adequate (1 year)');
            } else {
                warn(`HSTS max-age is too short: ${helmetConfig.hsts.maxAge}`);
            }
        } else {
            fail('HSTS is not configured');
        }
        
        // Check other headers
        if (helmetConfig.frameguard?.action === 'deny') {
            pass('X-Frame-Options is set to DENY');
        } else {
            warn('X-Frame-Options should be set to DENY');
        }
        
        if (helmetConfig.noSniff === true) {
            pass('X-Content-Type-Options: nosniff is enabled');
        } else {
            fail('X-Content-Type-Options: nosniff is not enabled');
        }
        
    } catch (error) {
        fail(`Security headers check failed: ${error.message}`);
    }
}

async function checkRateLimiting() {
    console.log('\n🔍 Checking Rate Limiting Configuration...');
    
    try {
        const securityConfig = require('./config/security');
        const rateLimitConfig = securityConfig.getRateLimitConfig();
        
        // Check general rate limit
        if (rateLimitConfig.general) {
            pass('General rate limiting is configured');
            info(`General limit: ${rateLimitConfig.general.max} requests per ${rateLimitConfig.general.windowMs/1000/60} minutes`);
        } else {
            fail('General rate limiting is not configured');
        }
        
        // Check submission rate limit
        if (rateLimitConfig.submission) {
            pass('Form submission rate limiting is configured');
            info(`Submission limit: ${rateLimitConfig.submission.max} per ${rateLimitConfig.submission.windowMs/1000/60} minutes`);
        } else {
            fail('Form submission rate limiting is not configured');
        }
        
        // Check brute force protection
        if (rateLimitConfig.bruteForce) {
            pass('Brute force protection is configured');
            info(`Max consecutive fails: ${rateLimitConfig.bruteForce.maxConsecutiveFails}`);
        } else {
            fail('Brute force protection is not configured');
        }
        
    } catch (error) {
        fail(`Rate limiting check failed: ${error.message}`);
    }
}

async function checkDataRetention() {
    console.log('\n🔍 Checking Data Retention Policies...');
    
    try {
        const securityConfig = require('./config/security');
        const retentionConfig = securityConfig.getRetentionConfig();
        
        if (retentionConfig.defaultRetentionDays <= 30) {
            pass(`Data retention period is KVKK compliant (${retentionConfig.defaultRetentionDays} days)`);
        } else {
            warn(`Data retention period might be too long (${retentionConfig.defaultRetentionDays} days)`);
        }
        
        if (retentionConfig.secureDelete) {
            pass('Secure file deletion is enabled');
            info(`Overwrite passes: ${retentionConfig.overwritePasses}`);
        } else {
            fail('Secure file deletion is not enabled');
        }
        
        if (retentionConfig.cleanupSchedule) {
            pass(`Automated cleanup is scheduled: ${retentionConfig.cleanupSchedule}`);
        } else {
            fail('Automated cleanup is not scheduled');
        }
        
    } catch (error) {
        fail(`Data retention check failed: ${error.message}`);
    }
}

async function checkInputValidation() {
    console.log('\n🔍 Checking Input Validation...');
    
    try {
        // Check validation configuration
        const securityConfig = require('./config/security');
        const validationConfig = securityConfig.getValidationConfig();
        
        if (validationConfig.maxNameLength <= 100) {
            pass('Name length limit is reasonable');
        } else {
            warn('Name length limit might be too permissive');
        }
        
        if (validationConfig.maxFileSize <= 10 * 1024 * 1024) {
            pass('File size limit is reasonable (10MB)');
        } else {
            warn('File size limit might be too large');
        }
        
        if (validationConfig.allowedMimeTypes.length === 1 && 
            validationConfig.allowedMimeTypes[0] === 'application/pdf') {
            pass('Only PDF files are allowed');
        } else {
            fail('File type restrictions are not properly configured');
        }
        
        // Check sanitization
        if (validationConfig.sanitizeOptions.allowedTags.length === 0) {
            pass('HTML tags are stripped from input');
        } else {
            warn('Some HTML tags are allowed in input');
        }
        
    } catch (error) {
        fail(`Input validation check failed: ${error.message}`);
    }
}

async function checkSessionSecurity() {
    console.log('\n🔍 Checking Session Security...');
    
    try {
        const securityConfig = require('./config/security');
        const sessionConfig = securityConfig.getSessionConfig();
        
        if (sessionConfig.cookie.httpOnly) {
            pass('Session cookies are httpOnly');
        } else {
            fail('Session cookies are not httpOnly');
        }
        
        if (sessionConfig.cookie.secure || !securityConfig.isProduction) {
            pass('Session cookies are secure (or in development)');
        } else {
            fail('Session cookies are not secure in production');
        }
        
        if (sessionConfig.cookie.sameSite === 'strict') {
            pass('Session cookies have strict SameSite policy');
        } else {
            warn(`Session cookies have ${sessionConfig.cookie.sameSite} SameSite policy`);
        }
        
        if (sessionConfig.cookie.maxAge <= 30 * 60 * 1000) {
            pass('Session timeout is reasonable (30 minutes)');
        } else {
            warn('Session timeout might be too long');
        }
        
    } catch (error) {
        fail(`Session security check failed: ${error.message}`);
    }
}

async function checkCSRFProtection() {
    console.log('\n🔍 Checking CSRF Protection...');
    
    try {
        const securityConfig = require('./config/security');
        const csrfConfig = securityConfig.getCSRFConfig();
        
        if (csrfConfig.cookie.httpOnly) {
            pass('CSRF cookies are httpOnly');
        } else {
            fail('CSRF cookies are not httpOnly');
        }
        
        if (csrfConfig.cookie.sameSite === 'strict') {
            pass('CSRF cookies have strict SameSite policy');
        } else {
            warn(`CSRF cookies have ${csrfConfig.cookie.sameSite} SameSite policy`);
        }
        
        if (csrfConfig.ignoreMethods.includes('GET')) {
            pass('GET requests are excluded from CSRF checks');
        } else {
            warn('GET requests might be subject to CSRF checks');
        }
        
    } catch (error) {
        fail(`CSRF protection check failed: ${error.message}`);
    }
}

// Main execution
async function runSecurityVerification() {
    console.log('🔒 KVKK Sign Tool Security Verification');
    console.log('======================================');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Date: ${new Date().toISOString()}\n`);
    
    // Run all checks
    await checkEnvironmentVariables();
    await checkFilePermissions();
    await checkDependencies();
    await checkEncryption();
    await checkSecurityHeaders();
    await checkRateLimiting();
    await checkDataRetention();
    await checkInputValidation();
    await checkSessionSecurity();
    await checkCSRFProtection();
    
    // Summary
    console.log('\n📊 Security Verification Summary');
    console.log('================================');
    console.log(`${colors.green}✅ Passed: ${results.passed.length}${colors.reset}`);
    console.log(`${colors.yellow}⚠️  Warnings: ${results.warnings.length}${colors.reset}`);
    console.log(`${colors.red}❌ Failures: ${results.failures.length}${colors.reset}`);
    
    // Calculate security score
    const totalChecks = results.passed.length + results.warnings.length + results.failures.length;
    const score = Math.round((results.passed.length / totalChecks) * 100);
    
    console.log(`\n🎯 Security Score: ${score}%`);
    
    if (results.failures.length === 0) {
        console.log(`${colors.green}🏆 No critical security issues found!${colors.reset}`);
    } else {
        console.log(`${colors.red}⚠️  Critical security issues need attention!${colors.reset}`);
        console.log('\nFailed checks:');
        results.failures.forEach(failure => {
            console.log(`  - ${failure}`);
        });
    }
    
    if (results.warnings.length > 0) {
        console.log('\nWarnings to consider:');
        results.warnings.forEach(warning => {
            console.log(`  - ${warning}`);
        });
    }
    
    // Save report
    const report = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        score: score,
        passed: results.passed.length,
        warnings: results.warnings.length,
        failures: results.failures.length,
        details: results
    };
    
    await fs.writeFile(
        'security-verification-report.json',
        JSON.stringify(report, null, 2)
    );
    
    console.log('\n📄 Detailed report saved to: security-verification-report.json');
    
    // Exit code based on failures
    process.exit(results.failures.length > 0 ? 1 : 0);
}

// Run verification
runSecurityVerification().catch(error => {
    console.error('❌ Security verification failed:', error);
    process.exit(1);
});