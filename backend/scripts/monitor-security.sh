#!/bin/bash
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
