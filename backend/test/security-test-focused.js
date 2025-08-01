/**
 * Focused Security Test Suite
 * Tests security features without exhausting rate limits
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Test configuration
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api`;

// Test results
const testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

// Color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

// Helper functions
async function runTest(category, name, testFn) {
    process.stdout.write(`${colors.blue}[${category}]${colors.reset} ${name}... `);
    
    try {
        const start = Date.now();
        const result = await testFn();
        const duration = Date.now() - start;
        
        if (result.success) {
            console.log(`${colors.green}✅ PASS${colors.reset} (${duration}ms)`);
            testResults.passed++;
        } else {
            console.log(`${colors.red}❌ FAIL${colors.reset} - ${result.message}`);
            testResults.failed++;
        }
        
        testResults.tests.push({
            category,
            name,
            ...result,
            duration
        });
        
    } catch (error) {
        console.log(`${colors.red}❌ ERROR${colors.reset} - ${error.message}`);
        testResults.failed++;
        testResults.tests.push({
            category,
            name,
            success: false,
            message: error.message,
            error: error.stack
        });
    }
}

// Test Categories

// 1. API Health & Basic Functionality
async function testHealthEndpoint() {
    const client = axios.create({
        validateStatus: () => true,
        timeout: 30000
    });
    
    const response = await client.get(`${API_URL}/health`);
    
    return {
        success: response.status === 200 && 
                response.data.status === 'OK' &&
                response.data.services.encryption === 'Ready',
        message: response.status === 200 ? 'Health check passed' : `Status: ${response.status}`,
        data: response.data
    };
}

// 2. Security Headers
async function testSecurityHeaders() {
    const client = axios.create({
        validateStatus: () => true,
        timeout: 30000
    });
    
    const response = await client.get(`${API_URL}/health`);
    const headers = response.headers;
    
    const requiredHeaders = {
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'x-xss-protection': '1; mode=block',
        'strict-transport-security': /max-age=\d+/,
        'content-security-policy': /default-src/
    };
    
    const missing = [];
    const invalid = [];
    
    for (const [header, expected] of Object.entries(requiredHeaders)) {
        const value = headers[header];
        if (!value) {
            missing.push(header);
        } else if (expected instanceof RegExp && !expected.test(value)) {
            invalid.push(`${header}: ${value}`);
        } else if (typeof expected === 'string' && value !== expected) {
            invalid.push(`${header}: ${value} (expected: ${expected})`);
        }
    }
    
    return {
        success: missing.length === 0 && invalid.length === 0,
        message: missing.length > 0 ? `Missing: ${missing.join(', ')}` : 
                invalid.length > 0 ? `Invalid: ${invalid.join(', ')}` : 
                'All security headers present',
        headers: Object.fromEntries(
            Object.keys(requiredHeaders).map(h => [h, headers[h] || 'missing'])
        )
    };
}

// 3. CSRF Protection (without exhausting rate limit)
async function testCSRFProtection() {
    const csrfClient = axios.create({
        validateStatus: () => true,
        timeout: 30000
    });
    
    // First, get a session
    const getResponse = await csrfClient.get(`${API_URL}/config`);
    const cookies = getResponse.headers['set-cookie'];
    
    // Try POST without CSRF token
    const postResponse = await csrfClient.post(
        `${API_URL}/consent/validate`,
        { formData: JSON.stringify({ test: true }) },
        { headers: cookies ? { 'Cookie': cookies.join('; ') } : {} }
    );
    
    return {
        success: postResponse.status === 403 && postResponse.data.code === 'CSRF_INVALID',
        message: postResponse.status === 403 && postResponse.data.code === 'CSRF_INVALID' ? 
                'CSRF protection active' : 
                `Unexpected response: ${postResponse.status} - ${JSON.stringify(postResponse.data)}`,
        status: postResponse.status,
        response: postResponse.data
    };
}

// 4. Encryption Testing
async function testEncryption() {
    try {
        // Test encryption service directly
        const encryptionService = require('../services/encryptionService');
        const testResult = await encryptionService.testEncryption();
        
        return {
            success: testResult.success,
            message: testResult.message,
            tests: testResult.tests
        };
    } catch (error) {
        return {
            success: false,
            message: `Encryption test failed: ${error.message}`
        };
    }
}

// 5. Token Security
async function testTokenSecurity() {
    // Generate a test token
    const tokenService = require('../services/tokenService');
    const testSubmissionId = crypto.randomUUID();
    
    const tokenData = tokenService.generateDownloadToken(testSubmissionId, {
        maxDownloads: 1,
        expiresIn: '1m'
    });
    
    // Verify token
    try {
        const verification = tokenService.verifyDownloadToken(tokenData.token);
        
        return {
            success: verification.success && verification.submissionId === testSubmissionId,
            message: 'Token generation and verification working',
            tokenId: tokenData.tokenId
        };
    } catch (error) {
        return {
            success: false,
            message: `Token verification failed: ${error.message}`
        };
    }
}

// Main test runner
async function runFocusedTests() {
    console.log('🧪 KVKK Sign Tool Focused Security Test');
    console.log('=======================================');
    console.log(`Testing: ${BASE_URL}`);
    console.log(`Time: ${new Date().toISOString()}\n`);
    
    // Wait a moment to let any rate limits cool down
    console.log('⏳ Waiting 5 seconds for rate limits to cool down...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Run focused tests
    await runTest('API', 'Health Endpoint', testHealthEndpoint);
    await runTest('Security', 'Security Headers', testSecurityHeaders);
    await runTest('Security', 'CSRF Protection', testCSRFProtection);
    await runTest('Security', 'Encryption Service', testEncryption);
    await runTest('Security', 'Token Security', testTokenSecurity);
    
    // Summary
    console.log('\n📊 Test Summary');
    console.log('===============');
    console.log(`${colors.green}✅ Passed: ${testResults.passed}${colors.reset}`);
    console.log(`${colors.red}❌ Failed: ${testResults.failed}${colors.reset}`);
    console.log(`📋 Total: ${testResults.passed + testResults.failed}`);
    
    // Calculate score
    const total = testResults.passed + testResults.failed;
    const score = total > 0 ? Math.round((testResults.passed / total) * 100) : 0;
    
    console.log(`\n🎯 Test Score: ${score}%`);
    
    if (score === 100) {
        console.log(`${colors.green}🏆 All focused tests passed! Core security features are working.${colors.reset}`);
    } else {
        console.log(`${colors.red}⚠️  Some security features need attention.${colors.reset}`);
    }
    
    // Save detailed report
    const report = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        baseUrl: BASE_URL,
        testType: 'focused',
        summary: {
            passed: testResults.passed,
            failed: testResults.failed,
            total: total,
            score: score
        },
        tests: testResults.tests
    };
    
    fs.writeFileSync(
        path.join(__dirname, '..', 'focused-test-report.json'),
        JSON.stringify(report, null, 2)
    );
    
    console.log('\n📄 Detailed report saved to: focused-test-report.json');
    
    // Exit with appropriate code
    process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runFocusedTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
});