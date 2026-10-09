import { Logger } from '../utils/logger';

export interface PrinterJobPayload {
  jobId: string;
  orderId: string;
  kioskId: string;
  fileUrl: string;
  copies: number;
  paperSize: string;
  colorMode: string;
}

export interface PrinterResponse {
  success: boolean;
  jobId: string;
  hardwareStatus: 'READY' | 'PRINTING' | 'ERROR';
  message: string;
  telemetry?: {
    trayLevel: number;
    tonerLevel: number;
    temperatureCelsius: number;
  };
}

export class MockPrinterAdapter {
  /**
   * Simulate sending print job to physical kiosk printer hardware
   */
  static async sendToPrinter(payload: PrinterJobPayload): Promise<PrinterResponse> {
    Logger.info(`[Printer Hardware Mock] Received job ${payload.jobId} at kiosk ${payload.kioskId}`, {
      copies: payload.copies,
      paperSize: payload.paperSize,
      colorMode: payload.colorMode,
    });

    // Simulated check for hardware fault simulation
    if (payload.fileUrl.includes('simulate-hardware-fail')) {
      return {
        success: false,
        jobId: payload.jobId,
        hardwareStatus: 'ERROR',
        message: 'Printer hardware paper jam detected',
        telemetry: {
          trayLevel: 0,
          tonerLevel: 85,
          temperatureCelsius: 48,
        },
      };
    }

    return {
      success: true,
      jobId: payload.jobId,
      hardwareStatus: 'PRINTING',
      message: 'Print job accepted by hardware queue',
      telemetry: {
        trayLevel: 95,
        tonerLevel: 90,
        temperatureCelsius: 32,
      },
    };
  }
}
