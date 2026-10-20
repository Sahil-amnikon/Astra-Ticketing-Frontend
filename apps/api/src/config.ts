import { z } from 'zod';
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const schema = z
  .object({
    API_HOST: z.enum(['0.0.0.0', '127.0.0.1']).default('0.0.0.0'),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z
      .string()
      .url()
      .refine((v) => /^postgres(ql)?:/.test(v)),
    REDIS_URL: z
      .string()
      .url()
      .refine((v) => /^rediss?:/.test(v)),
    APP_BASE_URL: z
      .string()
      .url()
      .refine((v) => /^https?:/.test(v)),
    ENABLE_API_DOCS: z.enum(['true', 'false']).default('false'),
    ENTRA_CLIENT_ID: z.preprocess(
      emptyToUndefined,
      z.string().uuid().optional(),
    ),
    ENTRA_CLIENT_SECRET: z.preprocess(
      emptyToUndefined,
      z.string().min(16).optional(),
    ),
    ENTRA_TENANT_ID: z.preprocess(
      emptyToUndefined,
      z.string().uuid().optional(),
    ),
    INITIAL_ADMIN_OBJECT_IDS: z.string().default(''),
    MAIL_CONFIG_KEY: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^[a-fA-F0-9]{64}$/)
        .optional(),
    ),
    WEB_GUIDANCE_ENABLED: z.enum(['true', 'false']).default('false'),
    WEB_GUIDANCE_PROVIDER: z.enum(['searxng', 'brave']).default('searxng'),
    BRAVE_SEARCH_API_KEY: z.preprocess(
      emptyToUndefined,
      z.string().min(20).optional(),
    ),
    CHANGE_EMAIL_ENABLED: z.enum(['true', 'false']).default('false'),
    CHANGE_EMAIL_SENDER: z.preprocess(
      emptyToUndefined,
      z.string().email().default('change@amnikontechnologies.com'),
    ),
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(900)
      .max(43200)
      .default(28800),
  })
  .superRefine((value, context) => {
    if (
      value.WEB_GUIDANCE_ENABLED === 'true' &&
      value.WEB_GUIDANCE_PROVIDER === 'brave' &&
      !value.BRAVE_SEARCH_API_KEY
    )
      context.addIssue({
        code: 'custom',
        path: ['BRAVE_SEARCH_API_KEY'],
        message: 'Web guidance requires a server-side search API key',
      });
    const entraValues = [
      value.ENTRA_CLIENT_ID,
      value.ENTRA_CLIENT_SECRET,
      value.ENTRA_TENANT_ID,
    ];
    const configured = entraValues.filter(Boolean).length;
    if (configured !== 0 && configured !== entraValues.length) {
      context.addIssue({
        code: 'custom',
        path: ['ENTRA_CLIENT_ID'],
        message: 'All Entra settings must be supplied together',
      });
    }
    if (
      configured === entraValues.length &&
      value.NODE_ENV === 'production' &&
      !value.APP_BASE_URL.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['APP_BASE_URL'],
        message: 'Entra authentication requires HTTPS in production',
      });
    }
    const invalidAdminId = value.INITIAL_ADMIN_OBJECT_IDS.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .find((entry) => !z.uuid().safeParse(entry).success);
    if (invalidAdminId) {
      context.addIssue({
        code: 'custom',
        path: ['INITIAL_ADMIN_OBJECT_IDS'],
        message: 'Initial administrators must be Entra object IDs',
      });
    }
    if (
      value.CHANGE_EMAIL_ENABLED === 'true' &&
      (!value.CHANGE_EMAIL_SENDER || configured !== 3)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['CHANGE_EMAIL_SENDER'],
        message: 'Change email requires Entra settings and a sender mailbox',
      });
    }
  });
export type Config = z.infer<typeof schema>;
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Field names only: validation inputs can contain credentials.
    throw new Error(
      `Invalid configuration: ${[...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ')}`,
    );
  }
  return result.data;
}
