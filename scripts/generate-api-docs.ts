#!/usr/bin/env node
/**
 * Generate API reference documentation from OpenAPI spec.
 *
 * This script creates a markdown file documenting all API endpoints extracted
 * from the OpenAPI spec. The file is included in the Docusaurus documentation
 * site under the "API Reference" section.
 *
 * Usage: npx tsx scripts/generate-api-docs.ts <spec-file> <output-file>
 * Default output: docs/api-reference.md
 */

import fs from 'fs';
import path from 'path';

interface OpenAPISpec {
  info: {
    title: string;
    version: string;
    description: string;
  };
  paths: Record<string, Record<string, any>>;
  tags?: Array<{ name: string; description: string }>;
}

const specFile = process.argv[2] || 'backend/openapi-generated.json';
const outputFile = process.argv[3] || 'docs/api-reference.md';

function loadSpec(): OpenAPISpec {
  if (!fs.existsSync(specFile)) {
    console.error(`✗ Spec file not found: ${specFile}`);
    process.exit(1);
  }

  const json = fs.readFileSync(specFile, 'utf-8');
  return JSON.parse(json);
}

function generateMarkdown(spec: OpenAPISpec): string {
  let md = `# API Reference

> Auto-generated from the OpenAPI specification in \`${specFile}\`.
>
> **Last updated:** ${new Date().toISOString()}

## Overview

${spec.info.description}

**API Version:** ${spec.info.version}

---

## Endpoints\n`;

  // Group by tag
  const tagMap: Record<string, Array<{ path: string; method: string; operation: any }>> = {};

  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (typeof operation !== 'object' || !operation || !('summary' in operation)) {
        continue;
      }

      const tag = (operation.tags?.[0] as string) || 'Other';
      if (!tagMap[tag]) {
        tagMap[tag] = [];
      }

      tagMap[tag].push({
        path,
        method: method.toUpperCase(),
        operation,
      });
    }
  }

  // Generate sections by tag
  for (const [tag, endpoints] of Object.entries(tagMap).sort()) {
    md += `\n### ${tag}\n`;

    const tagInfo = spec.tags?.find((t) => t.name === tag);
    if (tagInfo?.description) {
      md += `\n${tagInfo.description}\n`;
    }

    for (const { path, method, operation } of endpoints.sort((a, b) =>
      a.path.localeCompare(b.path),
    )) {
      md += `\n#### \`${method} ${path}\`\n`;

      if (operation.summary) {
        md += `\n${operation.summary}\n`;
      }

      if (operation.description) {
        md += `\n${operation.description}\n`;
      }

      // Parameters
      if (operation.parameters && operation.parameters.length > 0) {
        md += '\n**Parameters:**\n\n';
        md += '| Name | In | Type | Description |\n';
        md += '|------|----|----|-------------|\n';

        for (const param of operation.parameters) {
          const required = param.required ? '(required)' : '';
          md += `| ${param.name} | ${param.in} | ${param.schema?.type || 'object'} | ${param.description || ''} ${required} |\n`;
        }
      }

      // Request body
      if (operation.requestBody) {
        md += '\n**Request Body:**\n';

        const contentType = Object.keys(operation.requestBody.content || {})[0];
        if (contentType) {
          md += `\nContent-Type: \`${contentType}\`\n`;

          const schema = operation.requestBody.content[contentType]?.schema;
          if (schema) {
            md += '\n```json\n';
            md += JSON.stringify(schema, null, 2);
            md += '\n```\n';
          }
        }
      }

      // Responses
      if (operation.responses) {
        md += '\n**Responses:**\n\n';
        md += '| Status | Description |\n';
        md += '|--------|-------------|\n';

        for (const [status, response] of Object.entries(operation.responses)) {
          const description = typeof response === 'object' ? response?.description : response;
          md += `| \`${status}\` | ${description} |\n`;
        }
      }

      // Security
      if (operation.security) {
        md += '\n**Authentication:** Required\n';
      }
    }
  }

  md += `\n---\n\n## Generated Documentation\n\nThis API reference is auto-generated from the OpenAPI spec.\n\n`;
  md += `To regenerate this documentation, run:\n\n\`\`\`bash\nnpm run docs:api-generate\n\`\`\`\n`;

  return md;
}

console.log(`Loading OpenAPI spec from ${specFile}...`);
const spec = loadSpec();

console.log(`Generating API documentation with ${Object.keys(spec.paths || {}).length} endpoints...`);
const markdown = generateMarkdown(spec);

fs.writeFileSync(outputFile, markdown, 'utf-8');
console.log(`✓ API reference generated: ${outputFile}`);
