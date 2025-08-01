/**
 * Security Test Script
 * Tests all security features of the KVKK consent application
 */

const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Test configuration
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api`;

// Create axios instance with self-signed cert support for dev
const client = axios.create({
    httpsAgent: new https.Agent({
        rejectUnauthorized: false // For self-signed certs in dev
    }),
    validateStatus: () => true // Don't throw on any status
});

// Test results
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

// Helper function to run a test
async function runTest(name, testFn) {
    console.log(`\n🧪 Testing: ${name}`);
    try {
        const result = await testFn();
        if (result.success) {
            console.log(`✅ PASSED: ${result.message}`);
            results.passed++;
        } else {
            console.log(`❌ FAILED: ${result.message}`);
            results.failed++;
        }
        results.tests.push({ name, ...result });
    } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
        results.failed++;
        results.tests.push({ name, success: false, message: error.message });
    }
}

// Security Tests

async function testHealthEndpoint() {
    const response = await client.get(`${API_URL}/health`);
    return {
        success: response.status === 200 && response.data.status === 'OK',
        message: `Health check returned ${response.status}`,
        details: response.data
    };
}

async function testSecurityHeaders() {
    const response = await client.get(`${API_URL}/health`);
    const headers = response.headers;
    
    const requiredHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection',
        'strict-transport-security',
        'content-security-policy',
        'referrer-policy'
    ];
    
    const missingHeaders = requiredHeaders.filter(h => !headers[h]);
    
    return {
        success: missingHeaders.length === 0,
        message: missingHeaders.length === 0 
            ? 'All security headers present' 
            : `Missing headers: ${missingHeaders.join(', ')}`,
        headers: Object.fromEntries(requiredHeaders.map(h => [h, headers[h] || 'missing']))
    };
}

async function testRateLimiting() {
    const requests = [];
    for (let i = 0; i < 110; i++) {
        requests.push(client.get(`${API_URL}/health`));
    }
    
    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 429);
    
    return {
        success: rateLimited.length > 0,
        message: `Rate limiting triggered after ${110 - rateLimited.length} requests`,
        rateLimitedCount: rateLimited.length
    };
}

async function testCSRFProtection() {
    // First, get a CSRF token
    const getResponse = await client.get(`${API_URL}/config`);
    const cookies = getResponse.headers['set-cookie'];
    
    // Try to submit without CSRF token
    const postResponse = await client.post(`${API_URL}/consent/validate`, {
        formData: JSON.stringify({ test: true })
    }, {
        headers: cookies ? { 'Cookie': cookies.join('; ') } : {}
    });
    
    return {
        success: postResponse.status === 403 && postResponse.data.code === 'CSRF_INVALID',
        message: postResponse.status === 403 
            ? 'CSRF protection is working' 
            : `CSRF protection not working (status: ${postResponse.status})`,
        response: postResponse.data
    };
}

async function testInputValidation() {
    const maliciousInput = {
        patientName: '<script>alert("XSS")</script>',
        email: 'invalid-email',
        role: 'invalid-role',
        timestamp: 'invalid-date'
    };
    
    const response = await client.post(`${API_URL}/consent/validate`, {
        formData: JSON.stringify(maliciousInput)
    });
    
    return {
        success: response.status === 400 && response.data.valid === false,
        message: response.status === 400 
            ? 'Input validation is working' 
            : `Input validation failed (status: ${response.status})`,
        errors: response.data.errors
    };
}

async function testFileUploadSecurity() {
    // Try to upload a non-PDF file
    const formData = new FormData();
    formData.append('file', Buffer.from('test'), {
        filename: 'test.txt',
        contentType: 'text/plain'
    });
    
    const response = await client.post(`${API_URL}/consent/submit`, formData, {
        headers: formData.getHeaders()
    });
    
    return {
        success: response.status === 400,
        message: response.status === 400 
            ? 'File type validation is working' 
            : `File validation failed (status: ${response.status})`,
        response: response.data
    };
}

async function testEncryptionService() {
    if (process.env.NODE_ENV !== 'production') {
        const response = await client.get(`${API_URL}/security/test`);
        const encryptionTest = response.data?.encryption;
        
        return {
            success: encryptionTest?.success === true,
            message: encryptionTest?.success 
                ? 'Encryption service is working' 
                : 'Encryption service test failed',
            details: encryptionTest
        };
    }
    
    return {
        success: true,
        message: 'Encryption test skipped in production',
        details: null
    };
}

async function testTokenService() {
    if (process.env.NODE_ENV !== 'production') {
        const response = await client.get(`${API_URL}/security/test`);
        const tokenStats = response.data?.tokens;
        
        return {
            success: tokenStats !== undefined,
            message: 'Token service is operational',
            details: tokenStats
        };
    }
    
    return {
        success: true,
        message: 'Token test skipped in production',
        details: null
    };
}

async function testHTTPSRedirect() {
    if (BASE_URL.startsWith('https://')) {
        try {
            // Try HTTP version
            const httpUrl = BASE_URL.replace('https://', 'http://');
            const response = await client.get(httpUrl, {
                maxRedirects: 0
            });
            
            return {
                success: response.status === 301 || response.status === 302,
                message: response.status === 301 || response.status === 302
                    ? 'HTTPS redirect is working'
                    : `No HTTPS redirect (status: ${response.status})`,
                location: response.headers.location
            };
        } catch (error) {
            return {
                success: false,
                message: `HTTPS redirect test failed: ${error.message}`
            };
        }
    }
    
    return {
        success: true,
        message: 'HTTPS redirect test skipped (not using HTTPS)',
        details: null
    };
}

async function testSessionSecurity() {
    const response = await client.get(`${API_URL}/health`);
    const cookies = response.headers['set-cookie'] || [];
    
    const sessionCookie = cookies.find(c => c.includes('kvkk.sid'));
    if (!sessionCookie) {
        return {
            success: true,
            message: 'No session cookie found (stateless)',
            details: null
        };
    }
    
    const hasHttpOnly = sessionCookie.includes('HttpOnly');
    const hasSecure = sessionCookie.includes('Secure') || process.env.NODE_ENV !== 'production';
    const hasSameSite = sessionCookie.includes('SameSite=Strict');
    
    return {
        success: hasHttpOnly && hasSecure && hasSameSite,
        message: `Session cookie security: HttpOnly=${hasHttpOnly}, Secure=${hasSecure}, SameSite=${hasSameSite}`,
        cookie: sessionCookie
    };
}

// Run all tests
async function runAllTests() {
    console.log('🔒 KVKK Sign Tool Security Test Suite');
    console.log('=====================================');
    console.log(`Testing: ${BASE_URL}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Run tests
    await runTest('Health Endpoint', testHealthEndpoint);
    await runTest('Security Headers', testSecurityHeaders);
    await runTest('Rate Limiting', testRateLimiting);
    await runTest('CSRF Protection', testCSRFProtection);
    await runTest('Input Validation', testInputValidation);
    await runTest('File Upload Security', testFileUploadSecurity);
    await runTest('Encryption Service', testEncryptionService);
    await runTest('Token Service', testTokenService);
    await runTest('HTTPS Redirect', testHTTPSRedirect);
    await runTest('Session Security', testSessionSecurity);
    
    // Summary
    console.log('\n📊 Test Summary');
    console.log('================');
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📋 Total: ${results.passed + results.failed}`);
    
    // Security Score
    const score = Math.round((results.passed / (results.passed + results.failed)) * 100);
    console.log(`\n🎯 Security Score: ${score}%`);
    
    if (score === 100) {
        console.log('🏆 Perfect security score! All tests passed.');
    } else if (score >= 80) {
        console.log('👍 Good security posture, but some improvements needed.');
    } else {
        console.log('⚠️  Security issues detected. Please review failed tests.');
    }
    
    // Save results
    const reportPath = path.join(__dirname, 'security-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    
    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
});