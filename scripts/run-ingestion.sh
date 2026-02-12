#!/bin/bash

# Data Ingestion Script Runner
# This script loads environment variables and runs the data ingestion

set -e  # Exit on error

echo "🚀 DORA Metrics Data Ingestion"
echo "========================================"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found"
    echo "Please create a .env file with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    exit 1
fi

# Load environment variables
echo "📝 Loading environment variables..."
export $(cat .env | grep -v '^#' | xargs)

# Verify required environment variables
if [ -z "$SUPABASE_URL" ]; then
    echo "❌ Error: SUPABASE_URL is not set in .env"
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: SUPABASE_SERVICE_ROLE_KEY is not set in .env"
    exit 1
fi

echo "✅ Environment variables loaded"
echo ""

# Check if response.json exists
if [ ! -f "response.json" ]; then
    echo "❌ Error: response.json file not found"
    echo "Please ensure response.json is in the project root directory"
    exit 1
fi

echo "✅ response.json found"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "⚠️  node_modules not found. Running npm install..."
    npm install
fi

echo "🔧 Starting data ingestion..."
echo ""

# Run the ingestion script
node scripts/ingest-response-data.mjs

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Ingestion completed successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Check your Supabase dashboard to verify the data"
    echo "  2. Test the frontend to ensure data displays correctly"
    echo "  3. Configure teams to organize your repositories"
else
    echo ""
    echo "❌ Ingestion failed. Please check the errors above."
    exit 1
fi
