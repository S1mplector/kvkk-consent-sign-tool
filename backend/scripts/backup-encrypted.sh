#!/bin/bash
# Encrypted Backup Script

BACKUP_DIR="storage/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/kvkk_backup_$TIMESTAMP.tar.gz.enc"

echo "🔐 Starting encrypted backup..."

# Create backup directory
mkdir -p $BACKUP_DIR

# Create tar archive
tar -czf - storage/encrypted storage/logs | \
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
