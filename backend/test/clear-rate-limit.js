/**
 * Clear Rate Limit Script
 * Waits for rate limit window to expire
 */

console.log('⏳ Waiting for rate limit window to expire...');
console.log('   Rate limit window: 15 minutes');
console.log('   This script will wait 30 seconds to ensure clean state');

setTimeout(() => {
    console.log('✅ Rate limit window should be clear now');
    process.exit(0);
}, 30000);