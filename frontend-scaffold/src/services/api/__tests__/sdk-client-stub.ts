export class Configuration {
  constructor(_config?: Record<string, unknown>) {}
}

export class ApiClient {
  request = async (): Promise<unknown> => undefined;
}
