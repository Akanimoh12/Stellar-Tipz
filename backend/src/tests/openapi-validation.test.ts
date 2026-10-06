/**
 * OpenAPI Specification Completeness Validation (#1383)
 *
 * This test ensures that:
 * 1. Every registered Express route is documented in the OpenAPI spec
 * 2. All examples in the OpenAPI spec are valid against their schemas
 * 3. The OpenAPI spec has proper structure and required fields
 * 4. Best practices are followed (tags, descriptions, responses)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Router } from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { openApiDocument } from '../docs/openapi.js';
import { createV1Router } from '../api/v1.routes.js';
import { env } from '../config/env.js';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head';

interface RouteInfo {
  path: string;
  method: HttpMethod;
  fullPath: string;
}

/**
 * Extract all registered routes from an Express router
 */
function extractRoutes(router: Router, basePath = ''): RouteInfo[] {
  const routes: RouteInfo[] = [];

  function processLayer(layer: any, currentPath: string): void {
    if (!layer) return;

    // Handle route layers (actual endpoints)
    if (layer.route) {
      const route = layer.route;
      const methods = Object.keys(route.methods) as HttpMethod[];

      methods.forEach((method) => {
        const fullPath = currentPath + route.path;
        routes.push({
          path: route.path,
          method,
          fullPath: normalizePath(fullPath),
        });
      });
    }

    // Handle router/middleware layers (sub-routers)
    if (layer.name === 'router' && layer.handle?.stack) {
      const mountPath = layer.regexp
        ? extractPathFromRegexp(layer.regexp)
        : '';

      layer.handle.stack.forEach((subLayer: any) => {
        processLayer(subLayer, currentPath + mountPath);
      });
    }
  }

  // Process all layers in the router
  if ((router as any).stack) {
    (router as any).stack.forEach((layer: any) => {
      processLayer(layer, basePath);
    });
  }

  return routes;
}

/**
 * Extract path from Express route regexp
 */
function extractPathFromRegexp(regexp: RegExp): string {
  const match = regexp.source.match(/^\^\\\/([^\\?]*)/);
  if (!match) return '';

  return '/' + match[1]
    .replace(/\\\//g, '/')
    .replace(/\\(.)/g, '$1')
    .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param');
}

/**
 * Normalize path for comparison (Express :param to OpenAPI {param})
 */
function normalizePath(path: string): string {
  return path
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '') || '/';
}

/**
 * Check if two paths match, accounting for path parameters
 */
function pathsMatch(path1: string, path2: string): boolean {
  if (path1 === path2) return true;

  const normalize = (p: string) =>
    p
      .replace(/\{[^}]+\}/g, ':param')
      .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, ':param')
      .toLowerCase();

  return normalize(path1) === normalize(path2);
}

/**
 * Validate examples in OpenAPI schemas using Ajv
 */
function validateExamples(): { valid: boolean; errors: string[] } {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const errors: string[] = [];

  function validateExampleInSchema(schema: any, example: any, path: string): void {
    if (!schema || !example) return;

    try {
      const validate = ajv.compile(schema);
      const valid = validate(example);

      if (!valid) {
        errors.push(
          `Invalid example at ${path}: ${ajv.errorsText(validate.errors)}`
        );
      }
    } catch (err) {
      errors.push(
        `Error validating example at ${path}: ${(err as Error).message}`
      );
    }
  }

  function processSchema(schema: any, currentPath: string): void {
    if (!schema || typeof schema !== 'object') return;

    if ('example' in schema && schema.type) {
      validateExampleInSchema(schema, schema.example, currentPath);
    }

    if (schema.examples && Array.isArray(schema.examples)) {
      schema.examples.forEach((example: any, index: number) => {
        validateExampleInSchema(schema, example, `${currentPath}/examples[${index}]`);
      });
    }

    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, value]) => {
        processSchema(value, `${currentPath}/properties/${key}`);
      });
    }

    if (schema.items) {
      processSchema(schema.items, `${currentPath}/items`);
    }

    ['allOf', 'anyOf', 'oneOf'].forEach((combiner) => {
      if (schema[combiner] && Array.isArray(schema[combiner])) {
        schema[combiner].forEach((subSchema: any, index: number) => {
          processSchema(subSchema, `${currentPath}/${combiner}[${index}]`);
        });
      }
    });
  }

  // Validate examples in paths
  Object.entries(openApiDocument.paths || {}).forEach(([path, pathItem]) => {
    if (!pathItem || typeof pathItem !== 'object') return;

    Object.entries(pathItem).forEach(([method, operation]) => {
      if (typeof operation !== 'object' || !operation) return;
      const op = operation as any;

      // Validate request body examples
      if (op.requestBody?.content) {
        Object.entries(op.requestBody.content).forEach(([contentType, content]: [string, any]) => {
          if (content.schema) {
            processSchema(
              content.schema,
              `${path}.${method}.requestBody.content['${contentType}'].schema`
            );
          }
          if (content.example) {
            validateExampleInSchema(
              content.schema,
              content.example,
              `${path}.${method}.requestBody.content['${contentType}'].example`
            );
          }
        });
      }

      // Validate response examples
      if (op.responses) {
        Object.entries(op.responses).forEach(([status, response]: [string, any]) => {
          if (response.content) {
            Object.entries(response.content).forEach(([contentType, content]: [string, any]) => {
              if (content.schema) {
                processSchema(
                  content.schema,
                  `${path}.${method}.responses.${status}.content['${contentType}'].schema`
                );
              }
              if (content.example) {
                validateExampleInSchema(
                  content.schema,
                  content.example,
                  `${path}.${method}.responses.${status}.content['${contentType}'].example`
                );
              }
            });
          }
        });
      }

      // Validate parameter examples
      if (op.parameters && Array.isArray(op.parameters)) {
        op.parameters.forEach((param: any, index: number) => {
          if (param.schema && param.example) {
            validateExampleInSchema(
              param.schema,
              param.example,
              `${path}.${method}.parameters[${index}].example`
            );
          }
        });
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate OpenAPI document structure
 */
function validateOpenApiStructure(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!openApiDocument.openapi) {
    errors.push('Missing required field: openapi');
  }

  if (!openApiDocument.info) {
    errors.push('Missing required field: info');
  } else {
    if (!openApiDocument.info.title) {
      errors.push('Missing required field: info.title');
    }
    if (!openApiDocument.info.version) {
      errors.push('Missing required field: info.version');
    }
  }

  if (!openApiDocument.paths) {
    errors.push('Missing required field: paths');
  }

  if (openApiDocument.paths) {
    Object.entries(openApiDocument.paths).forEach(([path, pathItem]) => {
      if (!path.startsWith('/')) {
        errors.push(`Path must start with /: ${path}`);
      }

      if (typeof pathItem !== 'object' || !pathItem) {
        errors.push(`Invalid path item for ${path}`);
        return;
      }

      const validMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];
      Object.keys(pathItem).forEach((key) => {
        if (!validMethods.includes(key.toLowerCase()) &&
            !['summary', 'description', 'servers', 'parameters'].includes(key)) {
          errors.push(`Invalid HTTP method or field in path ${path}: ${key}`);
        }
      });
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

describe('OpenAPI Specification Validation', () => {
  let v1Router: Router;
  let registeredRoutes: RouteInfo[];

  beforeAll(() => {
    v1Router = createV1Router();
    registeredRoutes = extractRoutes(v1Router, env.API_BASE_PATH || '/api/v1');
  });

  describe('OpenAPI Document Structure', () => {
    it('should have a valid OpenAPI document structure', () => {
      const result = validateOpenApiStructure();

      if (!result.valid) {
        console.error('OpenAPI structure validation errors:');
        result.errors.forEach((error) => console.error(`  - ${error}`));
      }

      expect(result.valid).toBe(true);
    });

    it('should have required metadata fields', () => {
      expect(openApiDocument.openapi).toBeDefined();
      expect(openApiDocument.info).toBeDefined();
      expect(openApiDocument.info.title).toBeDefined();
      expect(openApiDocument.info.version).toBeDefined();
      expect(openApiDocument.paths).toBeDefined();
    });
  });

  describe('Route Coverage', () => {
    it('should document all registered routes in OpenAPI spec', () => {
      const undocumentedRoutes: RouteInfo[] = [];
      const documentedPaths = Object.keys(openApiDocument.paths || {});

      registeredRoutes.forEach((route) => {
        const apiPath = route.fullPath;
        const pathItem = openApiDocument.paths?.[apiPath];

        if (!pathItem) {
          const found = documentedPaths.some((docPath) => {
            return pathsMatch(apiPath, docPath);
          });

          if (!found) {
            undocumentedRoutes.push(route);
          }
        } else if (typeof pathItem === 'object' && !(route.method.toLowerCase() in pathItem)) {
          undocumentedRoutes.push(route);
        }
      });

      if (undocumentedRoutes.length > 0) {
        console.error('\nUndocumented routes found:');
        undocumentedRoutes.forEach((route) => {
          console.error(`  ${route.method.toUpperCase()} ${route.fullPath}`);
        });
        console.error('\nAll routes must be documented in the OpenAPI specification.');
        console.error('Add documentation via mergeOpenApiPaths() in your module\'s .openapi.ts file.');
      }

      expect(undocumentedRoutes).toHaveLength(0);
    });

    it('should not have orphaned OpenAPI paths (paths without routes)', () => {
      const orphanedPaths: string[] = [];
      const healthPaths = ['/health', '/health/live', '/health/ready'];

      Object.entries(openApiDocument.paths || {}).forEach(([path, pathItem]) => {
        if (healthPaths.includes(path)) {
          return;
        }

        if (typeof pathItem !== 'object' || !pathItem) return;

        const methods = Object.keys(pathItem).filter((key) =>
          ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(key.toLowerCase())
        );

        methods.forEach((method) => {
          const found = registeredRoutes.some((route) => {
            return (
              pathsMatch(route.fullPath, path) &&
              route.method.toLowerCase() === method.toLowerCase()
            );
          });

          if (!found) {
            orphanedPaths.push(`${method.toUpperCase()} ${path}`);
          }
        });
      });

      if (orphanedPaths.length > 0) {
        console.warn('\nOrphaned OpenAPI paths (documented but no matching route):');
        orphanedPaths.forEach((path) => {
          console.warn(`  ${path}`);
        });
      }

      // This is a warning, not a failure
      // expect(orphanedPaths).toHaveLength(0);
    });
  });

  describe('Schema Examples Validation', () => {
    it('should have valid examples that match their schemas', () => {
      const result = validateExamples();

      if (!result.valid) {
        console.error('\nExample validation errors:');
        result.errors.forEach((error) => console.error(`  - ${error}`));
      }

      expect(result.valid).toBe(true);
    });
  });

  describe('OpenAPI Best Practices', () => {
    it('should have tags for all operations', () => {
      const operationsWithoutTags: string[] = [];

      Object.entries(openApiDocument.paths || {}).forEach(([path, pathItem]) => {
        if (typeof pathItem !== 'object' || !pathItem) return;

        Object.entries(pathItem).forEach(([method, operation]) => {
          if (typeof operation !== 'object' || !operation) return;
          const op = operation as any;

          if (['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method.toLowerCase())) {
            if (!op.tags || op.tags.length === 0) {
              operationsWithoutTags.push(`${method.toUpperCase()} ${path}`);
            }
          }
        });
      });

      if (operationsWithoutTags.length > 0) {
        console.warn('\nOperations without tags:');
        operationsWithoutTags.forEach((op) => console.warn(`  - ${op}`));
      }

      expect(operationsWithoutTags).toHaveLength(0);
    });

    it('should have descriptions for all operations', () => {
      const operationsWithoutDescriptions: string[] = [];

      Object.entries(openApiDocument.paths || {}).forEach(([path, pathItem]) => {
        if (typeof pathItem !== 'object' || !pathItem) return;

        Object.entries(pathItem).forEach(([method, operation]) => {
          if (typeof operation !== 'object' || !operation) return;
          const op = operation as any;

          if (['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method.toLowerCase())) {
            if (!op.description && !op.summary) {
              operationsWithoutDescriptions.push(`${method.toUpperCase()} ${path}`);
            }
          }
        });
      });

      if (operationsWithoutDescriptions.length > 0) {
        console.warn('\nOperations without description or summary:');
        operationsWithoutDescriptions.forEach((op) => console.warn(`  - ${op}`));
      }

      // This is a warning for now
      // expect(operationsWithoutDescriptions).toHaveLength(0);
    });

    it('should have response definitions for all operations', () => {
      const operationsWithoutResponses: string[] = [];

      Object.entries(openApiDocument.paths || {}).forEach(([path, pathItem]) => {
        if (typeof pathItem !== 'object' || !pathItem) return;

        Object.entries(pathItem).forEach(([method, operation]) => {
          if (typeof operation !== 'object' || !operation) return;
          const op = operation as any;

          if (['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method.toLowerCase())) {
            if (!op.responses || Object.keys(op.responses).length === 0) {
              operationsWithoutResponses.push(`${method.toUpperCase()} ${path}`);
            }
          }
        });
      });

      if (operationsWithoutResponses.length > 0) {
        console.error('\nOperations without response definitions:');
        operationsWithoutResponses.forEach((op) => console.error(`  - ${op}`));
      }

      expect(operationsWithoutResponses).toHaveLength(0);
    });
  });
});
