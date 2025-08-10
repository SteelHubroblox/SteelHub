#!/bin/bash

# Keep Cloudflare tunnel alive permanently
echo "Starting permanent Cloudflare tunnel..."

while true; do
    echo "$(date): Starting tunnel..."
    /workspace/cloudflared tunnel --url http://localhost:3001 >> tunnel.log 2>&1
    
    echo "$(date): Tunnel stopped, restarting in 5 seconds..."
    sleep 5
done