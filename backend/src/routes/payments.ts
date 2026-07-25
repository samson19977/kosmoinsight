import { Router, Request, Response } from 'express';
import { MomoService } from '../services/momo.service';
import { validate } from '../middleware/validate';
import { momoPaymentSchema } from '../lib/validation/schemas';

const router = Router();

// POST /api/payments/momo/initiate
router.post('/momo/initiate', validate(momoPaymentSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, amount, reference, description } = req.body;

    const result = await MomoService.initiatePayment({ phone, amount, reference, description });

    if (result.success) {
      res.json({
        success: true,
        transactionId: result.transactionId,
        status: result.status,
        message: result.message,
        paymentInstructions: MomoService.generatePaymentInstructions(reference),
      });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (error) {
    console.error('MoMo initiate error:', error);
    res.status(500).json({ error: 'Failed to initiate payment' });
  }
});

// GET /api/payments/momo/status/:referenceId
router.get('/momo/status/:referenceId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { referenceId } = req.params;
    const status = await MomoService.checkPaymentStatus(referenceId);
    res.json({ success: true, referenceId, ...status });
  } catch (error) {
    console.error('MoMo status error:', error);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// POST /api/payments/instructions — get manual payment instructions without initiating
router.post('/instructions', (req: Request, res: Response): void => {
  const { reference } = req.body;
  if (!reference) {
    res.status(400).json({ error: 'Reference is required' });
    return;
  }
  const instructions = MomoService.generatePaymentInstructions(reference);
  res.json({ success: true, ...instructions });
});

export default router;
