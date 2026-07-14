export class AppError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthorized = () => new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
export const forbidden = () => new AppError(403, 'FORBIDDEN', 'This action is not permitted');
export const notFound = () => new AppError(404, 'NOT_FOUND', 'Resource not found');
