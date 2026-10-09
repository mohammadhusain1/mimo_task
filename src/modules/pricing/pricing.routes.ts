import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response';
import { optionalAuthenticate } from '../../middleware/auth.middleware';

const router = Router();

router.get('/', optionalAuthenticate, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rules = await prisma.pricingRule.findMany({
      orderBy: [{ paperSize: 'asc' }, { colorMode: 'asc' }],
    });
    sendSuccess(res, rules, 'Pricing rules retrieved successfully');
  } catch (error) {
    next(error);
  }
});

export default router;
