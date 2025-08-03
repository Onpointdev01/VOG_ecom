// Database migration script to create text index for product search
// Run this script once to create the text index on existing database

const { MongoClient } = require('mongodb');

const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vog-ecommerce';

async function createTextIndex() {
  const client = new MongoClient(DB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    const collection = db.collection('products');
    
    // Check if text index already exists
    const indexes = await collection.listIndexes().toArray();
    const textIndexExists = indexes.some(index => index.name === 'product_text_index');
    
    if (textIndexExists) {
      console.log('✅ Text index already exists');
      return;
    }
    
    // Create text index
    const result = await collection.createIndex(
      { 
        name: 'text', 
        description: 'text', 
        brand: 'text' 
      },
      {
        weights: {
          name: 10,        // Name is most important
          brand: 5,        // Brand is moderately important  
          description: 1   // Description is least important
        },
        name: 'product_text_index'
      }
    );
    
    console.log('✅ Text index created successfully:', result);
    
    // Test the index with a sample search
    const testResults = await collection.find(
      { $text: { $search: 'apple' } },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(5).toArray();
    
    console.log(`✅ Test search found ${testResults.length} products with 'apple'`);
    
  } catch (error) {
    console.error('❌ Error creating text index:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

// Run the migration
createTextIndex()
  .then(() => {
    console.log('🎉 Text index migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });