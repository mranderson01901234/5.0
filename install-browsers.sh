#!/bin/bash

# Script to install Chrome and Brave browsers on Ubuntu

set -e

echo "=========================================="
echo "  Browser Installation Script"
echo "=========================================="
echo ""

# Install Chrome
if [ -f "google-chrome-stable.deb" ]; then
    echo "📦 Installing Google Chrome..."
    sudo apt-get update
    sudo apt-get install -y ./google-chrome-stable.deb
    echo "✅ Chrome installed successfully!"
else
    echo "⚠️  Chrome .deb file not found. Downloading..."
    cd /tmp
    wget -q -O chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    sudo apt-get update
    sudo apt-get install -y ./chrome.deb
    echo "✅ Chrome installed successfully!"
fi

echo ""

# Install Brave Browser
echo "📦 Installing Brave Browser..."
echo "Adding Brave repository..."

# Install required dependencies
sudo apt-get update
sudo apt-get install -y apt-transport-https curl

# Add Brave repository
curl -fsSL https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg | sudo gpg --dearmor -o /usr/share/keyrings/brave-browser-archive-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/brave-browser-archive-keyring.gpg arch=amd64] https://brave-browser-apt-release.s3.brave.com/ stable main" | sudo tee /etc/apt/sources.list.d/brave-browser-release.list

# Update and install Brave
sudo apt-get update
sudo apt-get install -y brave-browser

echo "✅ Brave Browser installed successfully!"
echo ""
echo "=========================================="
echo "  Installation Complete!"
echo "=========================================="
echo ""
echo "You can now launch:"
echo "  - Google Chrome: google-chrome"
echo "  - Brave Browser: brave-browser"
echo ""

