import { PaperSize, ColorMode } from '@prisma/client';
import { prisma } from '../config/database';
import { BadRequestError } from '../utils/errors';

export interface PriceCalculationRequest {
  paperSize: PaperSize;
  colorMode: ColorMode;
  copies: number;
  pageCount: number;
}

export interface PriceCalculationResult {
  paperSize: PaperSize;
  colorMode: ColorMode;
  copies: number;
  pageCount: number;
  totalPagesToPrint: number;
  basePricePerPage: number; // in cents
  totalPrice: number;       // in cents
  currency: string;
  formattedTotalPrice: string; // e.g. "$1.50"
}

// Fallback pricing table (minor units / cents)
const DEFAULT_PRICING_TABLE: Record<PaperSize, Record<ColorMode, number>> = {
  [PaperSize.A4]: {
    [ColorMode.BW]: 10,   // $0.10
    [ColorMode.COLOR]: 50 // $0.50
  },
  [PaperSize.A3]: {
    [ColorMode.BW]: 25,   // $0.25
    [ColorMode.COLOR]: 100// $1.00
  },
  [PaperSize.A5]: {
    [ColorMode.BW]: 8,    // $0.08
    [ColorMode.COLOR]: 40 // $0.40
  },
};

export class PricingService {
  /**
   * Get price per page for paper size and color mode from DB or fallback table
   */
  static async getPricePerPage(paperSize: PaperSize, colorMode: ColorMode): Promise<number> {
    try {
      const rule = await prisma.pricingRule.findUnique({
        where: {
          paperSize_colorMode: {
            paperSize,
            colorMode,
          },
        },
      });

      if (rule && rule.isActive) {
        return rule.pricePerPage;
      }
    } catch {
      // Fallback if db table not yet accessible
    }

    const defaultPrice = DEFAULT_PRICING_TABLE[paperSize]?.[colorMode];
    if (defaultPrice === undefined) {
      throw new BadRequestError(`No pricing rule configured for ${paperSize} / ${colorMode}`);
    }
    return defaultPrice;
  }

  /**
   * Calculate total price deterministically in integer minor units (cents)
   */
  static async calculatePrice(req: PriceCalculationRequest): Promise<PriceCalculationResult> {
    const { paperSize, colorMode, copies, pageCount } = req;

    if (!copies || copies < 1) {
      throw new BadRequestError('Number of copies must be at least 1');
    }

    if (!pageCount || pageCount < 1) {
      throw new BadRequestError('Document page count must be at least 1');
    }

    const basePricePerPage = await this.getPricePerPage(paperSize, colorMode);
    const totalPagesToPrint = pageCount * copies;
    const totalPrice = totalPagesToPrint * basePricePerPage;

    return {
      paperSize,
      colorMode,
      copies,
      pageCount,
      totalPagesToPrint,
      basePricePerPage,
      totalPrice,
      currency: 'USD',
      formattedTotalPrice: `$${(totalPrice / 100).toFixed(2)}`,
    };
  }
}
