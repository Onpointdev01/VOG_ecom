import { PayoutService } from '../../../services/PayoutService';
import { Model } from 'mongoose';
import { IPayout, IOrder } from '../../../models';
import AppError from '../../../utils/errors/AppError';

describe('PayoutService', () => {
  let payoutService: PayoutService;
  let mockPayout: Model<IPayout>;
  let mockOrder: Model<IOrder>;

  beforeEach(() => {
    jest.clearAllMocks();
    payoutService = new PayoutService(mockPayout as any, mockOrder as any);
  });

  describe('createPayoutForOrder', () => {
    it('should create payouts for completed orders', async () => {
      const orderId = '507f1f77bcf86cd799439011';
      const mockOrderData = {
        _id: orderId,
        orderStatus: 'COMPLETE',
        items: [
          {
            _id: 'item1',
            product: {
              _id: 'product1',
              owner: { _id: 'seller1' },
            },
            price: 100,
            quantity: 2,
          },
        ],
      };

      (mockOrder.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrderData),
      });
      (mockPayout.find as jest.Mock).mockResolvedValue([]);
      (mockPayout.create as jest.Mock).mockResolvedValue({
        _id: 'payout1',
        seller_id: 'seller1',
        order_id: orderId,
        amount_paid: 200,
      });

      const result = await payoutService.createPayoutForOrder(orderId);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('seller_id', 'seller1');
      expect(result[0]).toHaveProperty('amount_paid', 200);
    });

    it('should not create payouts for non-completed orders', async () => {
      const orderId = '507f1f77bcf86cd799439011';
      const mockOrderData = {
        _id: orderId,
        orderStatus: 'PENDING',
      };

      (mockOrder.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockOrderData),
      });

      await expect(
        payoutService.createPayoutForOrder(orderId)
      ).rejects.toThrow(AppError);
    });

    it('should return existing payouts if already created', async () => {
      const orderId = '507f1f77bcf86cd799439011';
      const existingPayouts = [{ _id: 'payout1', order_id: orderId }];

      (mockOrder.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          _id: orderId,
          orderStatus: 'COMPLETE',
        }),
      });
      (mockPayout.find as jest.Mock).mockResolvedValue(existingPayouts);

      const result = await payoutService.createPayoutForOrder(orderId);

      expect(result).toEqual(existingPayouts);
      expect(mockPayout.create).not.toHaveBeenCalled();
    });
  });

  describe('getSellerEarnings', () => {
    it('should return paginated earnings', async () => {
      const sellerId = 'seller1';
      const mockPayouts = [
        {
          _id: 'payout1',
          seller_id: sellerId,
          amount_paid: 100,
          payout_date: new Date(),
        },
      ];

      (mockPayout.countDocuments as jest.Mock).mockResolvedValue(1);
      (mockPayout.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              populate: jest.fn().mockResolvedValue(mockPayouts),
            }),
          }),
        }),
      });
      (mockPayout.aggregate as jest.Mock).mockResolvedValue([
        { _id: null, total: 100 },
      ]);

      const result = await payoutService.getSellerEarnings(sellerId, {}, 1, 20);

      expect(result).toHaveProperty('payouts');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('totalEarnings', 100);
    });
  });
});

