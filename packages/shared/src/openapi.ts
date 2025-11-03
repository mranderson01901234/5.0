import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  ChatStreamRequestSchema,
  ChatStreamEventSchema,
  TokenEstimateRequestSchema,
  TokenEstimateResponseSchema,
} from './schemas.js';

function zodToOpenApiSchema(schema: any): any {
  if (schema._def?.typeName === 'ZodObject') {
    const shape = schema._def.shape();
    const properties: any = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = zodToOpenApiSchema(value as any);
      properties[key] = fieldSchema;
      if (!fieldSchema.nullable && !(value as any)._def?.defaultValue) {
        const def = (value as any)._def;
        if (!def?.isOptional) {
          required.push(key);
        }
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 && { required }),
    };
  }

  if (schema._def?.typeName === 'ZodArray') {
    return {
      type: 'array',
      items: zodToOpenApiSchema(schema._def.type),
    };
  }

  if (schema._def?.typeName === 'ZodEnum') {
    return {
      type: 'string',
      enum: schema._def.values,
    };
  }

  if (schema._def?.typeName === 'ZodOptional') {
    const inner = zodToOpenApiSchema(schema._def.innerType);
    return { ...inner, nullable: true };
  }

  if (schema._def?.typeName === 'ZodNumber') {
    return { type: 'number' };
  }

  if (schema._def?.typeName === 'ZodString') {
    return { type: 'string' };
  }

  if (schema._def?.typeName === 'ZodLiteral') {
    return { type: typeof schema._def.value, enum: [schema._def.value] };
  }

  if (schema._def?.typeName === 'ZodDefault') {
    return zodToOpenApiSchema(schema._def.innerType);
  }

  return { type: 'string' };
}

export function buildOpenApi(): any {
  return {
    openapi: '3.0.0',
    info: {
      title: 'LLM Gateway API',
      version: '1.0.0',
      description: 'High-speed chat backend with SSE streaming',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local development',
      },
    ],
    paths: {
      '/v1/chat/stream': {
        post: {
          summary: 'Stream chat completion',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: zodToOpenApiSchema(ChatStreamRequestSchema),
              },
            },
          },
          responses: {
            '200': {
              description: 'SSE stream',
              content: {
                'text/event-stream': {
                  schema: zodToOpenApiSchema(ChatStreamEventSchema),
                },
              },
            },
            '429': {
              description: 'Too many concurrent requests',
            },
          },
        },
      },
      '/v1/tokens/estimate': {
        post: {
          summary: 'Estimate token count',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: zodToOpenApiSchema(TokenEstimateRequestSchema),
              },
            },
          },
          responses: {
            '200': {
              description: 'Token estimate',
              content: {
                'application/json': {
                  schema: zodToOpenApiSchema(TokenEstimateResponseSchema),
                },
              },
            },
          },
        },
      },
      '/openapi.json': {
        get: {
          summary: 'OpenAPI specification',
          responses: {
            '200': {
              description: 'OpenAPI JSON',
              content: {
                'application/json': {},
              },
            },
          },
        },
      },
      '/v1/metrics': {
        get: {
          summary: 'Service metrics',
          responses: {
            '200': {
              description: 'Metrics',
              content: {
                'application/json': {},
              },
            },
          },
        },
      },
    },
  };
}

// Check if this file is being run directly
const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('openapi.js');
if (isMain) {
  const spec = buildOpenApi();
  const outputPath = join(process.cwd(), 'dist', 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(spec, null, 2));
  console.log(`OpenAPI spec written to ${outputPath}`);
}

