import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response';
import { NotFoundError } from '../../utils/errors';
import { optionalAuthenticate } from '../../middleware/auth.middleware';

const router = Router();

router.get('/', optionalAuthenticate, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const kiosks = await prisma.kiosk.findMany({
      include: {
        operator: { select: { id: true, name: true, email: true } },
      },
      orderBy: { id: 'asc' },
    });
    sendSuccess(res, kiosks, 'Kiosks retrieved successfully');
  } catch (error) {
    next(error);
  }
});

router.get('/:id', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const kiosk = await prisma.kiosk.findUnique({
      where: { id: req.params.id },
      include: {
        operator: { select: { id: true, name: true, email: true } },
      },
    });

    if (!kiosk) {
      throw new NotFoundError(`Kiosk '${req.params.id}' not found`);
    }

    sendSuccess(res, kiosk, 'Kiosk details retrieved successfully');
  } catch (error) {
    next(error);
  }
});

export default router;
