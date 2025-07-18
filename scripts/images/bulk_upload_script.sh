#!/bin/bash

# Bulk Product Upload Script
# Usage: ./bulk_upload_script.sh [JWT_TOKEN] [BASE_URL]

JWT_TOKEN=${1:-"YOUR_JWT_TOKEN_HERE"}
BASE_URL=${2:-"http://localhost:3000"}

echo "🚀 Starting bulk product upload..."
echo "📍 Server: $BASE_URL"
echo "🔑 Token: ${JWT_TOKEN:0:20}..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if file exists
check_file() {
    if [ ! -f "$1" ]; then
        echo -e "${RED}❌ File not found: $1${NC}"
        exit 1
    fi
}

# Function to make API request
api_request() {
    local endpoint=$1
    local method=${2:-GET}
    local form_data=${3:-""}
    
    echo -e "${YELLOW}📡 $method $endpoint${NC}"
    
    if [ -n "$form_data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method \
            -H "Authorization: Bearer $JWT_TOKEN" \
            $form_data \
            "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method \
            -H "Authorization: Bearer $JWT_TOKEN" \
            "$BASE_URL$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
        echo -e "${GREEN}✅ Success ($http_code)${NC}"
        echo "$response_body" | jq '.' 2>/dev/null || echo "$response_body"
    else
        echo -e "${RED}❌ Failed ($http_code)${NC}"
        echo "$response_body"
        return 1
    fi
}

# Test health endpoint
echo -e "\n${YELLOW}1. Testing server health...${NC}"
api_request "/health"

# Option 1: Upload images first, then CSV
upload_images_then_csv() {
    echo -e "\n${YELLOW}2. Uploading multiple images...${NC}"
    
    # Check if image files exist (create dummy files for demo)
    mkdir -p temp_images
    echo "dummy" > temp_images/tshirt-red-1.jpg
    echo "dummy" > temp_images/jeans-blue-1.jpg
    echo "dummy" > temp_images/sneakers-white-1.jpg
    
    api_request "/api/v1/upload-multiple-files" "POST" \
        "-F \"images=@temp_images/tshirt-red-1.jpg\" -F \"images=@temp_images/jeans-blue-1.jpg\" -F \"images=@temp_images/sneakers-white-1.jpg\""
    
    if [ $? -eq 0 ]; then
        echo -e "\n${YELLOW}3. Uploading CSV with image URLs...${NC}"
        check_file "sample_products.csv"
        api_request "/api/v1/bulk/products/csv" "POST" "-F \"csv=@sample_products.csv\""
    fi
    
    # Cleanup
    rm -rf temp_images
}

# Option 2: Upload CSV and images together
upload_csv_with_images() {
    echo -e "\n${YELLOW}2. Uploading CSV with images (all-in-one)...${NC}"
    
    check_file "sample_products_with_images.csv"
    
    # Create dummy image files for demo
    mkdir -p temp_images
    echo "dummy image data" > temp_images/tshirt-red-1.jpg
    echo "dummy image data" > temp_images/tshirt-red-2.jpg
    echo "dummy image data" > temp_images/jeans-blue-1.jpg
    echo "dummy image data" > temp_images/sneakers-white-1.jpg
    
    api_request "/api/v1/bulk/products/with-images" "POST" \
        "-F \"csv=@sample_products_with_images.csv\" -F \"images=@temp_images/tshirt-red-1.jpg\" -F \"images=@temp_images/tshirt-red-2.jpg\" -F \"images=@temp_images/jeans-blue-1.jpg\" -F \"images=@temp_images/sneakers-white-1.jpg\""
    
    # Cleanup
    rm -rf temp_images
}

# Menu selection
echo -e "\n${YELLOW}Choose upload method:${NC}"
echo "1) Upload images first, then CSV separately"
echo "2) Upload CSV and images together (recommended)"
echo "3) Exit"

read -p "Enter choice (1-3): " choice

case $choice in
    1)
        upload_images_then_csv
        ;;
    2)
        upload_csv_with_images
        ;;
    3)
        echo -e "${YELLOW}👋 Goodbye!${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}❌ Invalid choice${NC}"
        exit 1
        ;;
esac

echo -e "\n${GREEN}🎉 Bulk upload completed!${NC}"