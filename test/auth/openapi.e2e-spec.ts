import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { App } from 'supertest/types';
import { createTestApp } from './fixtures/test-app';

// The OpenAPI document that Apidog imports (served at /api/docs-json). Built
// with the same bearer setup as src/main.ts, so a change that would break the
// import (a lost body schema, a missing lock) fails here.
describe('OpenAPI document for Auth & Users (e2e)', () => {
  let app: INestApplication<App>;
  let doc: OpenAPIObject;

  const operation = (path: string, method: 'get' | 'post' | 'patch') =>
    doc.paths[path]?.[method];
  const bodySchema = (path: string, method: 'post' | 'patch' = 'post') =>
    (
      operation(path, method)?.requestBody as {
        content: Record<string, { schema: { $ref: string } }>;
      }
    )?.content['application/json']?.schema.$ref;
  const schema = (name: string) =>
    doc.components?.schemas?.[name] as {
      required?: string[];
      properties: Record<string, { format?: string }>;
    };

  beforeAll(async () => {
    ({ app } = await createTestApp([]));
    doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('declares bearer (JWT) authentication', () => {
    expect(doc.components?.securitySchemes?.bearer).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  it.each([
    ['/api/v1/auth/login', 'post'],
    ['/api/v1/auth/register', 'post'],
    ['/api/v1/auth/refresh', 'post'],
    ['/api/v1/auth/logout', 'post'],
  ] as const)('%s is public: no lock', (path, method) => {
    expect(operation(path, method)).toBeDefined();
    expect(operation(path, method)?.security).toBeUndefined();
  });

  it.each([
    ['/api/v1/auth/me', 'get'],
    ['/api/v1/users/librarians', 'post'],
    ['/api/v1/users/managers', 'post'],
    ['/api/v1/users/members', 'get'],
    ['/api/v1/users/{id}/verify-deposit', 'patch'],
    ['/api/v1/users/{id}/gold-membership', 'post'],
    ['/api/v1/users/{id}/status', 'patch'],
    ['/api/v1/users/{id}/reset-password', 'post'],
    ['/api/v1/auth/password', 'patch'],
    ['/api/v1/auth/email/send-code', 'post'],
    ['/api/v1/auth/email/verify', 'post'],
  ] as const)('%s requires the bearer token', (path, method) => {
    expect(operation(path, method)?.security).toEqual([{ bearer: [] }]);
  });

  it.each([
    ['/api/v1/auth/login', 'LoginDto', ['email', 'password'], ['email', 'password']],
    [
      '/api/v1/auth/register',
      'RegisterDto',
      ['email', 'username', 'password'],
      ['email', 'username', 'password', 'firstName', 'lastName', 'phone'],
    ],
    [
      '/api/v1/users/librarians',
      'CreateStaffDto',
      ['email', 'username', 'password', 'firstName', 'lastName'],
      ['email', 'username', 'password', 'firstName', 'lastName', 'phone'],
    ],
  ])('%s documents its body (%s)', (path, name, required, properties) => {
    expect(bodySchema(path)).toBe(`#/components/schemas/${name}`);
    expect(schema(name).required).toEqual(required);
    expect(Object.keys(schema(name).properties)).toEqual(properties);
    expect(schema(name).properties.password.format).toBe('password');
  });

  it('never documents a client-controlled role, status, id or deposit field', () => {
    const fields = ['LoginDto', 'RegisterDto', 'CreateStaffDto'].flatMap(
      (name) => Object.keys(schema(name).properties),
    );
    expect(fields).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^(role|roleId|status|id|membershipStatus|deposit\w*)$/,
        ),
      ]),
    );
  });

  it('has no leftover scaffold routes', () => {
    expect(
      Object.keys(doc.paths)
        .filter((p) => /^\/api\/v1\/(auth|users|members)/.test(p))
        .sort(),
    ).toEqual([
      '/api/v1/auth/email/send-code',
      '/api/v1/auth/email/verify',
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
      '/api/v1/auth/me',
      '/api/v1/auth/password',
      '/api/v1/auth/refresh',
      '/api/v1/auth/register',
      '/api/v1/users/librarians',
      '/api/v1/users/managers',
      '/api/v1/users/members',
      '/api/v1/users/{id}/gold-membership',
      '/api/v1/users/{id}/reset-password',
      '/api/v1/users/{id}/status',
      '/api/v1/users/{id}/verify-deposit',
    ]);
  });

  it('documents the member list query options', () => {
    const params = (operation('/api/v1/users/members', 'get')?.parameters ?? []) as {
      name: string;
      in: string;
    }[];
    expect(
      params
        .filter((p) => p.in === 'query')
        .map((p) => p.name)
        .sort(),
    ).toEqual([
      'emailVerified',
      'limit',
      'membershipStatus',
      'page',
      'search',
      'tier',
    ]);
  });

  it('email/verify documents a 6-digit code as its only field', () => {
    expect(bodySchema('/api/v1/auth/email/verify')).toBe(
      '#/components/schemas/VerifyEmailDto',
    );
    expect(Object.keys(schema('VerifyEmailDto').properties)).toEqual(['code']);
    expect(schema('VerifyEmailDto').required).toEqual(['code']);
  });

  it('verify-deposit takes no body', () => {
    expect(
      operation('/api/v1/users/{id}/verify-deposit', 'patch')?.requestBody,
    ).toBeUndefined();
  });

  it('documents the status and password-change bodies', () => {
    expect(bodySchema('/api/v1/users/{id}/status', 'patch')).toBe(
      '#/components/schemas/SetAccountStatusDto',
    );
    expect(schema('SetAccountStatusDto').required).toEqual(['enabled']);
    expect(bodySchema('/api/v1/auth/password', 'patch')).toBe(
      '#/components/schemas/ChangePasswordDto',
    );
    expect(schema('ChangePasswordDto').required).toEqual([
      'currentPassword',
      'newPassword',
    ]);
  });

  it('refresh and logout take the refresh token in the body', () => {
    for (const path of ['/api/v1/auth/refresh', '/api/v1/auth/logout']) {
      expect(bodySchema(path)).toBe('#/components/schemas/RefreshTokenDto');
    }
    expect(schema('RefreshTokenDto').required).toEqual(['refreshToken']);
  });

  it('creating a manager uses the same body as creating a librarian', () => {
    expect(bodySchema('/api/v1/users/managers')).toBe(
      '#/components/schemas/CreateStaffDto',
    );
    expect(bodySchema('/api/v1/users/librarians')).toBe(
      '#/components/schemas/CreateStaffDto',
    );
  });
});
