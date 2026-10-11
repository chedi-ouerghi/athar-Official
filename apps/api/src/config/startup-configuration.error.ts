/**
 * Raised when a configuration value is valid but cannot be honoured by this
 * build, so the process must refuse to start.
 *
 * It differs from `EnvironmentValidationError` (a value is malformed or out of
 * range) in that nothing is wrong with the value itself: the setting asks for
 * something that does not exist yet, such as `TABLE_MODE=hardware`. `main.ts`
 * prints its message verbatim, so the message must be written for an operator:
 * it states what is unavailable and the exact setting to change.
 */
export class StartupConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StartupConfigurationError';
  }
}
