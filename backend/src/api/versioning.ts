import { Router } from 'express';

export type ApiVersionRegistration = {
  version: `v${number}`;
  router: Router;
};

/** Splits a configured path such as /api/v1 into its stable root and version. */
export function parseVersionedApiBasePath(apiBasePath: string): {
  rootPath: string;
  version: `v${number}`;
} {
  const normalized = `/${apiBasePath}`.replace(/\/+/g, '/').replace(/\/$/, '');
  const match = normalized.match(/^(.*)\/(v[1-9]\d*)$/);

  if (!match) {
    throw new Error(`API_BASE_PATH must end with a version segment such as /v1: ${apiBasePath}`);
  }

  return {
    rootPath: match[1] || '/',
    version: match[2] as `v${number}`,
  };
}

/** Builds a router that can serve any number of API versions side by side. */
export function createVersionedApiRouter(registrations: ApiVersionRegistration[]): Router {
  const router = Router();
  const mountedVersions = new Set<string>();

  for (const registration of registrations) {
    if (!/^v[1-9]\d*$/.test(registration.version)) {
      throw new Error(`Invalid API version: ${registration.version}`);
    }
    if (mountedVersions.has(registration.version)) {
      throw new Error(`API version ${registration.version} is registered more than once`);
    }

    mountedVersions.add(registration.version);
    router.use(`/${registration.version}`, registration.router);
  }

  return router;
}
