#!/bin/bash

###############################################################################
# Setup Script for Hotel Price Tracker Subscription System
# 
# This script automates:
# 1. Installing dependencies
# 2. Creating Cloudflare KV namespace
# 3. Setting up environment variables
# 4. Initializing GitHub repository
# 5. Deploying to Cloudflare
#
# Run this with: bash setup.sh
###############################################################################

set -e  # Exit on error

echo "=========================================="
echo "Hotel Price Tracker - Subscription Setup"
echo "=========================================="
echo ""

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# STEP 1: Check prerequisites
# ============================================================================
echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Install from: https://nodejs.org/"
    exit 1
fi
echo -e "${GREEN}✓ Node.js found: $(node --version)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm found: $(npm --version)${NC}"

# Check Git
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git is not installed${NC}"
    echo "Install from: https://git-scm.com/"
    exit 1
fi
echo -e "${GREEN}✓ Git found: $(git --version)${NC}"

echo ""

# ============================================================================
# STEP 2: Install npm dependencies
# ============================================================================
echo -e "${YELLOW}Step 2: Installing npm dependencies...${NC}"

if [ ! -d "worker" ]; then
    echo -e "${RED}❌ worker/ directory not found${NC}"
    exit 1
fi

cd worker
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"
cd ..

echo ""

# ============================================================================
# STEP 3: Install Wrangler CLI
# ============================================================================
echo -e "${YELLOW}Step 3: Setting up Wrangler CLI...${NC}"

# Check if wrangler is installed globally or locally
if ! npx wrangler --version &> /dev/null; then
    echo -e "${YELLOW}Installing wrangler globally...${NC}"
    npm install -g @cloudflare/wrangler
fi
echo -e "${GREEN}✓ Wrangler CLI ready${NC}"

echo ""

# ============================================================================
# STEP 4: Create KV Namespace (requires manual Cloudflare login)
# ============================================================================
echo -e "${YELLOW}Step 4: Cloudflare KV Namespace Setup${NC}"
echo ""
echo "⚠️  You need to be logged in to Cloudflare for this step"
echo ""

read -p "Are you already logged in to Cloudflare with 'wrangler login'? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Creating KV namespace...${NC}"
    
    # Create development KV namespace
    DEV_NAMESPACE=$(cd worker && npx wrangler kv:namespace create "SUBSCRIPTIONS" --preview false 2>&1 | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$DEV_NAMESPACE" ]; then
        echo -e "${YELLOW}⚠️  Could not create namespace automatically${NC}"
        echo "Run manually: cd worker && wrangler kv:namespace create SUBSCRIPTIONS"
        echo "Then copy the ID into wrangler.toml"
    else
        echo -e "${GREEN}✓ Development KV namespace created: $DEV_NAMESPACE${NC}"
    fi
    
    # Create production KV namespace
    PROD_NAMESPACE=$(cd worker && npx wrangler kv:namespace create "SUBSCRIPTIONS" --preview false 2>&1 | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$PROD_NAMESPACE" ]; then
        echo -e "${YELLOW}⚠️  Could not create production namespace${NC}"
    else
        echo -e "${GREEN}✓ Production KV namespace created: $PROD_NAMESPACE${NC}"
    fi
else
    echo -e "${YELLOW}Please login first: wrangler login${NC}"
fi

echo ""

# ============================================================================
# STEP 5: Configure environment variables
# ============================================================================
echo -e "${YELLOW}Step 5: Environment Configuration${NC}"
echo ""
echo "You need to add these secrets to wrangler.toml:"
echo "  1. STRIPE_SECRET_KEY (from Stripe Dashboard)"
echo "  2. STRIPE_WEBHOOK_SECRET (from Stripe Webhook Settings)"
echo "  3. STRIPE_PRICE_ID (from Stripe Products)"
echo ""
echo "Edit worker/wrangler.toml and fill in the placeholders"
echo ""

read -p "Have you updated wrangler.toml with your values? (y/n) " -n 1 -r
echo

echo ""

# ============================================================================
# STEP 6: Test local worker
# ============================================================================
echo -e "${YELLOW}Step 6: Testing Worker Locally${NC}"
echo ""

read -p "Do you want to test the worker locally first? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Starting local worker (Ctrl+C to stop)...${NC}"
    echo "Test endpoint: http://localhost:8787/status"
    echo ""
    cd worker
    npx wrangler dev || true
    cd ..
fi

echo ""

# ============================================================================
# STEP 7: Deploy to Cloudflare
# ============================================================================
echo -e "${YELLOW}Step 7: Deploying to Cloudflare${NC}"
echo ""

read -p "Deploy worker to Cloudflare now? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Deploying...${NC}"
    cd worker
    npx wrangler deploy
    echo -e "${GREEN}✓ Worker deployed!${NC}"
    cd ..
else
    echo -e "${YELLOW}Deploy later with: cd worker && wrangler deploy${NC}"
fi

echo ""

# ============================================================================
# STEP 8: GitHub setup
# ============================================================================
echo -e "${YELLOW}Step 8: GitHub Setup (Optional)${NC}"
echo ""

read -p "Do you want to set up GitHub for auto-deployment? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Follow these steps:"
    echo "1. Create a new repository on github.com"
    echo "2. Initialize git locally:"
    echo "   git init"
    echo "   git remote add origin https://github.com/YOUR_USERNAME/repo-name.git"
    echo "   git add ."
    echo "   git commit -m 'Initial commit'"
    echo "   git push -u origin main"
    echo ""
    echo "3. Add GitHub Actions secrets:"
    echo "   - CLOUDFLARE_API_TOKEN (from Cloudflare > My Profile > API Tokens)"
    echo "   - CLOUDFLARE_ACCOUNT_ID (from Cloudflare > Workers > Overview)"
    echo ""
    echo "The .github/workflows/deploy.yml will auto-deploy on push"
fi

echo ""

# ============================================================================
# STEP 9: Chrome Extension setup
# ============================================================================
echo -e "${YELLOW}Step 9: Update Chrome Extension${NC}"
echo ""
echo "Next steps:"
echo "1. Update manifest.json with your worker URL"
echo "2. Update popup.js with your user ID generation logic"
echo "3. Update background.js with payment verification"
echo "4. Load extension in Chrome (chrome://extensions > Load unpacked)"
echo ""

# ============================================================================
# Complete
# ============================================================================
echo ""
echo -e "${GREEN}=========================================="
echo "Setup Complete!"
echo "=========================================${NC}"
echo ""
echo "📋 Checklist:"
echo "  ✓ Dependencies installed"
echo "  ✓ Wrangler CLI configured"
echo "  ✓ KV namespace created (manual if needed)"
echo ""
echo "⚠️  Still needed (manual steps):"
echo "  [ ] Update wrangler.toml with Stripe keys"
echo "  [ ] Create GitHub repository"
echo "  [ ] Add GitHub Actions secrets"
echo "  [ ] Update Chrome Extension manifest"
echo "  [ ] Test in development mode"
echo ""
echo "📚 See SUBSCRIPTION_GUIDE.md for detailed steps"
echo ""
