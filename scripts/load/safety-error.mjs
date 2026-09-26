export class SafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = "SafetyError";
    this.exitCode = 2;
  }
}
