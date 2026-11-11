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
    ['/auth/login', 'post'],
    ['/auth/register', 'post'],
    ['/auth/refresh', 'post'],
    ['/auth/logout', 'post'],
  ] as const)('%s is public: no lock', (path, method) => {
    expect(operation(path, method)).toBeDefined();
    expect(operation(path, method)?.security).toBeUndefined();
  });

  it.each([
    ['/auth/me', 'get'],
    ['/users/librarians', 'post'],
    ['/users/managers', 'post'],
    ['/users/members', 'get'],
    ['/users/{id}/verify-deposit', 'patch'],
    ['/users/{id}/status', 'patch'],
    ['/users/{id}/reset-password', 'post'],
    ['/auth/password', 'patch'],
  ] as const)('%s requires the bearer token', (path, method) => {
    expect(operation(path, method)?.security).toEqual([{ bearer: [] }]);
  });

  it.each([
    ['/auth/login', 'LoginDto', ['email', 'password'], ['email', 'password']],
    [
      '/auth/register',
      'RegisterDto',
      ['email', 'username', 'password'],
      ['email', 'username', 'password', 'firstName', 'lastName', 'phone'],
    ],
    [
      '/users/librarians',
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
        .filter((p) => /^\/(auth|users|members)/.test(p))
        .sort(),
    ).toEqual([
      '/auth/login',
      '/auth/logout',
      '/auth/me',
      '/auth/password',
      '/auth/refresh',
      '/auth/register',
      '/users/librarians',
      '/users/managers',
      '/users/members',
      '/users/{id}/reset-password',
      '/users/{id}/status',
      '/users/{id}/verify-deposit',
    ]);
  });

  it('documents the member list query options', () => {
    const params = (operation('/users/members', 'get')?.parameters ?? []) as {
      name: string;
      in: string;
    }[];
    expect(
      params
        .filter((p) => p.in === 'query')
        .map((p) => p.name)
        .sort(),
    ).toEqual(['limit', 'membershipStatus', 'page', 'search']);
  });

  it('verify-deposit takes no body', () => {
    expect(
      operation('/users/{id}/verify-deposit', 'patch')?.requestBody,
    ).toBeUndefined();
  });

  it('documents the status and password-change bodies', () => {
    expect(bodySchema('/users/{id}/status', 'patch')).toBe(
      '#/components/schemas/SetAccountStatusDto',
    );
    expect(schema('SetAccountStatusDto').required).toEqual(['enabled']);
    expect(bodySchema('/auth/password', 'patch')).toBe(
      '#/components/schemas/ChangePasswordDto',
    );
    expect(schema('ChangePasswordDto').required).toEqual([
      'currentPassword',
      'newPassword',
    ]);
  });

  it('refresh and logout take the refresh token in the body', () => {
    for (const path of ['/auth/refresh', '/auth/logout']) {
      expect(bodySchema(path)).toBe('#/components/schemas/RefreshTokenDto');
    }
    expect(schema('RefreshTokenDto').required).toEqual(['refreshToken']);
  });

  it('creating a manager uses the same body as creating a librarian', () => {
    expect(bodySchema('/users/managers')).toBe(
      '#/components/schemas/CreateStaffDto',
    );
    expect(bodySchema('/users/librarians')).toBe(
      '#/components/schemas/CreateStaffDto',
    );
  });
});
