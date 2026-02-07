import mongoose from 'mongoose';
import { Attribute, AttributeValue } from '../models';
import { env } from '../config';

const { MONGO_URL } = env;

interface ColorData {
  value: string;
  colorHex: string;
}

const seedAttributes = async () => {
  try {
    console.log('🌱 Starting attribute seeding...');

    // Connect to database
    await mongoose.connect(MONGO_URL, {
      serverSelectionTimeoutMS: 5000, // fail fast if DNS fails
    });
    console.log('✅ Connected to MongoDB');

    // 1. Create Size Attribute for Clothing
    let sizeAttribute = await Attribute.findOne({ name: 'size' });
    if (!sizeAttribute) {
      sizeAttribute = await Attribute.create({
        name: 'size',
        displayName: 'Choose Size',
        type: 'select',
        description: 'Product size selection',
        isRequired: true,
        isActive: true,
        displayOrder: 1,
      });
      console.log('✅ Created "Size" attribute');
    } else {
      console.log('ℹ️  "Size" attribute already exists, skipping...');
    }

    // 2. Create Size Values for Clothing (XS, S, M, L, XL, XXL, XXXL)
    const clothingSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
    let sizeValuesCreated = 0;
    for (let i = 0; i < clothingSizes.length; i++) {
      const sizeValue = clothingSizes[i];
      const existing = await AttributeValue.findOne({
        attribute: sizeAttribute._id,
        value: sizeValue,
      });
      if (!existing) {
        await AttributeValue.create({
          attribute: sizeAttribute._id,
          value: sizeValue,
          displayOrder: i + 1,
          isActive: true,
        });
        sizeValuesCreated++;
      }
    }
    console.log(`✅ Created ${sizeValuesCreated} clothing size values`);

    // 3. Create Shoe Size Attribute
    let shoeSizeAttribute = await Attribute.findOne({ name: 'shoe_size' });
    if (!shoeSizeAttribute) {
      shoeSizeAttribute = await Attribute.create({
        name: 'shoe_size',
        displayName: 'Shoe Size (EU)',
        type: 'select',
        description: 'European shoe size',
        isRequired: true,
        isActive: true,
        displayOrder: 2,
      });
      console.log('✅ Created "Shoe Size" attribute');
    } else {
      console.log('ℹ️  "Shoe Size" attribute already exists, skipping...');
    }

    // 4. Create Shoe Size Values (36-46)
    let shoeSizeValuesCreated = 0;
    for (let size = 36; size <= 46; size++) {
      const existing = await AttributeValue.findOne({
        attribute: shoeSizeAttribute._id,
        value: size.toString(),
      });
      if (!existing) {
        await AttributeValue.create({
          attribute: shoeSizeAttribute._id,
          value: size.toString(),
          displayOrder: size - 35,
          isActive: true,
        });
        shoeSizeValuesCreated++;
      }
    }
    console.log(`✅ Created ${shoeSizeValuesCreated} shoe size values`);

    // 5. Create Color Attribute
    let colorAttribute = await Attribute.findOne({ name: 'color' });
    if (!colorAttribute) {
      colorAttribute = await Attribute.create({
        name: 'color',
        displayName: 'Choose Color',
        type: 'color',
        description: 'Product color selection',
        isRequired: true,
        isActive: true,
        displayOrder: 3,
      });
      console.log('✅ Created "Color" attribute');
    } else {
      console.log('ℹ️  "Color" attribute already exists, skipping...');
    }

    // 6. Create Common Color Values with Hex Codes
    const colors: ColorData[] = [
      { value: 'Black', colorHex: '#000000' },
      { value: 'White', colorHex: '#FFFFFF' },
      { value: 'Red', colorHex: '#FF0000' },
      { value: 'Blue', colorHex: '#0000FF' },
      { value: 'Green', colorHex: '#00FF00' },
      { value: 'Yellow', colorHex: '#FFFF00' },
      { value: 'Orange', colorHex: '#FFA500' },
      { value: 'Purple', colorHex: '#800080' },
      { value: 'Pink', colorHex: '#FFC0CB' },
      { value: 'Brown', colorHex: '#A52A2A' },
      { value: 'Gray', colorHex: '#808080' },
      { value: 'Navy', colorHex: '#000080' },
      { value: 'Beige', colorHex: '#F5F5DC' },
      { value: 'Maroon', colorHex: '#800000' },
      { value: 'Gold', colorHex: '#FFD700' },
    ];

    let colorValuesCreated = 0;
    for (let i = 0; i < colors.length; i++) {
      const color = colors[i];
      const existing = await AttributeValue.findOne({
        attribute: colorAttribute._id,
        value: color.value,
      });
      if (!existing) {
        await AttributeValue.create({
          attribute: colorAttribute._id,
          value: color.value,
          colorHex: color.colorHex,
          displayOrder: i + 1,
          isActive: true,
        });
        colorValuesCreated++;
      }
    }
    console.log(`✅ Created ${colorValuesCreated} color values`);

    // 7. Create Storage Attribute for Electronics
    let storageAttribute = await Attribute.findOne({ name: 'storage' });
    if (!storageAttribute) {
      storageAttribute = await Attribute.create({
        name: 'storage',
        displayName: 'Storage Capacity',
        type: 'select',
        description: 'Device storage capacity',
        isRequired: false,
        isActive: true,
        displayOrder: 4,
      });
      console.log('✅ Created "Storage" attribute');
    } else {
      console.log('ℹ️  "Storage" attribute already exists, skipping...');
    }

    // 8. Create Storage Values (64GB, 128GB, 256GB, 512GB, 1TB)
    const storageValues = ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];
    let storageValuesCreated = 0;
    for (let i = 0; i < storageValues.length; i++) {
      const storage = storageValues[i];
      const existing = await AttributeValue.findOne({
        attribute: storageAttribute._id,
        value: storage,
      });
      if (!existing) {
        await AttributeValue.create({
          attribute: storageAttribute._id,
          value: storage,
          displayOrder: i + 1,
          isActive: true,
        });
        storageValuesCreated++;
      }
    }
    console.log(`✅ Created ${storageValuesCreated} storage values`);

    console.log('\n🎉 Attribute seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Attributes: 4 (Size, Shoe Size, Color, Storage)`);
    console.log(`   - Total values created this run: ${sizeValuesCreated + shoeSizeValuesCreated + colorValuesCreated + storageValuesCreated}`);

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding attributes:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the seed function
seedAttributes();
