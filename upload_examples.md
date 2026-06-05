# Image Upload Management Guide

## 🖼️ 4 Ways to Manage Images for Bulk Products

### **Option 1: Upload Multiple Images at Once** ⭐ Recommended
```bash
# Upload up to 10 images at once
curl -X POST http://localhost:3000/api/v1/upload-multiple-files \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "images=@image1.jpg" \
  -F "images=@image2.jpg" \
  -F "images=@image3.jpg"

# Response:
{
  "count": 3,
  "files": [
    {
      "originalName": "image1.jpg",
      "url": "https://bucket.s3.amazonaws.com/product-images/123-image1.jpg",
      "key": "product-images/123-image1.jpg"
    }
  ]
}
```

### **Option 2: Upload Product Images with Names**
```bash
# Upload images for specific products
curl -X POST http://localhost:3000/api/v1/upload-product-images \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "images=@tshirt-red-1.jpg" \
  -F "images=@tshirt-red-2.jpg" \
  -F "productName=Cotton T-Shirt"

# Response:
{
  "productName": "Cotton T-Shirt",
  "imageCount": 2,
  "imageUrls": [
    "https://bucket.s3.amazonaws.com/product-images/123-tshirt-red-1.jpg",
    "https://bucket.s3.amazonaws.com/product-images/124-tshirt-red-2.jpg"
  ]
}
```

### **Option 3: Integrated CSV + Images Upload** ⭐ Most Efficient
```bash
# Upload CSV with images in a single request
curl -X POST http://localhost:3000/api/v1/bulk/products/with-images \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "csv=@sample_products_with_images.csv" \
  -F "images=@tshirt-red-1.jpg" \
  -F "images=@tshirt-red-2.jpg" \
  -F "images=@jeans-blue-1.jpg" \
  -F "images=@sneakers-white-1.jpg"
```

### **Option 4: Single Image Upload** (For testing)
```bash
curl -X POST http://localhost:3000/api/v1/upload-single-file \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@product-image.jpg"
```

## 📁 S3 Folder Organization
Images are automatically organized in S3:
```
your-bucket/
├── product-images/     # Product images
├── profile-images/     # User profile images  
├── bulk-uploads/       # CSV files
└── general/           # Other files
```

## 🔄 Workflow Examples

### **Workflow 1: Upload Images First, Then CSV**
```bash
# Step 1: Upload all images
curl -X POST http://localhost:3000/api/v1/upload-multiple-files \
  -F "images=@tshirt1.jpg" -F "images=@jeans1.jpg"

# Step 2: Copy URLs from response to CSV
# Step 3: Upload CSV with image URLs
curl -X POST http://localhost:3000/api/v1/bulk/products/csv \
  -F "csv=@products.csv"
```

### **Workflow 2: All-in-One Upload** ⭐ Recommended
```bash
# Upload CSV + Images together (automatic mapping)
curl -X POST http://localhost:3000/api/v1/bulk/products/with-images \
  -F "csv=@sample_products_with_images.csv" \
  -F "images=@tshirt-red-1.jpg" \
  -F "images=@jeans-blue-1.jpg"
```

## 📋 CSV Format for Image Mapping

**With imageFiles column:**
```csv
name,description,productType,category,brand,condition,price,quantityAvailable,imageFiles
"T-Shirt","Cotton tshirt",simple,CAT123,Brand,"Brand New",25.99,50,"tshirt-red-1.jpg,tshirt-red-2.jpg"
```

**With direct URLs:**
```csv
name,description,productType,category,brand,condition,price,quantityAvailable,images
"T-Shirt","Cotton tshirt",simple,CAT123,Brand,"Brand New",25.99,50,"https://bucket.s3.amazonaws.com/img1.jpg,https://bucket.s3.amazonaws.com/img2.jpg"
```

## 🛠️ Image Naming Convention
- **Descriptive names**: `tshirt-red-1.jpg`, `sneakers-white-main.jpg`
- **Multiple images**: `product-1.jpg`, `product-2.jpg`, `product-3.jpg`
- **Avoid spaces**: Use hyphens or underscores
- **Supported formats**: JPG, JPEG, PNG

## 📊 Limits & Features
- **Max images per request**: 50 images
- **Max file size**: 250MB total
- **Auto-organized**: Files automatically sorted into folders
- **Filename cleaning**: Special characters automatically replaced
- **Duplicate handling**: Timestamps prevent conflicts

## 🔑 Authentication Required
All endpoints require:
- Valid JWT token in Authorization header
- Seller role permissions

## 📱 Testing Endpoints
1. **Health check**: `GET /health`
2. **Single upload**: `POST /api/v1/upload-single-file`
3. **Multiple upload**: `POST /api/v1/upload-multiple-files`
4. **Product images**: `POST /api/v1/upload-product-images`
5. **CSV only**: `POST /api/v1/bulk/products/csv`
6. **CSV + Images**: `POST /api/v1/bulk/products/with-images`