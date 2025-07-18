import { PaymentOption } from '../src/models/PaymentOption';
import connectToDB from '../src/db/connect';

async function seedCashOnDelivery() {
  try {
    await connectToDB();
    
    // Check if Cash on Delivery already exists
    const existing = await PaymentOption.findOne({ code: 'CASH_ON_DELIVERY' });
    
    if (!existing) {
      const codPayment = new PaymentOption({
        name: 'Cash on Delivery',
        code: 'CASH_ON_DELIVERY',
        isEnabled: true,
      });
      
      await codPayment.save();
      console.log('Cash on Delivery payment option created successfully');
    } else {
      console.log('Cash on Delivery payment option already exists');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding Cash on Delivery:', error);
    process.exit(1);
  }
}

seedCashOnDelivery();