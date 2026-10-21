import { z } from 'zod';
import type { Config } from '../config/env.js';
import { assert } from '../errors.js';

const identitySchema = z.object({
  version: z.literal(2), issuer: z.string().url(), audience: z.string(),
  user: z.object({ id: z.string().min(1).max(128), name: z.string().optional(), role: z.enum(['user', 'professional', 'admin']), status: z.literal('active') }),
  emailVerified: z.literal(true), sessionActive: z.literal(true), providers: z.array(z.string()),
  professional: z.object({ status: z.enum(['verified', 'pending', 'rejected', 'revoked']) }).optional(),
  validUntil: z.string().datetime(), tokenExpiresAt: z.string().datetime(),
});
export type Identity = z.infer<typeof identitySchema>;
const capabilitySchema = identitySchema.omit({ sessionActive: true, providers: true, tokenExpiresAt: true });
export type AuthorCapability = z.infer<typeof capabilitySchema>;
export function validateIdentity(data: unknown, config: Pick<Config, 'MAIN_AUTH_ORIGIN' | 'AUTH_CLIENT_ID'>): Identity {
  const parsed = identitySchema.safeParse(data);
  assert(parsed.success, 401, 'Main sign-in or account verification is unavailable.');
  const identity = parsed.data;
  const valid = Date.parse(identity.validUntil);
  const expiry = Date.parse(identity.tokenExpiresAt);
  assert(identity.issuer === config.MAIN_AUTH_ORIGIN && identity.audience === config.AUTH_CLIENT_ID,
    401, 'This session was not issued for Books.');
  assert(valid > Date.now() && valid <= Date.now() + 30500 && valid <= expiry,
    401, 'Your session has expired. Sign in again.');
  return identity;
}
export function validateCapability(data: unknown, config: Pick<Config, 'MAIN_AUTH_ORIGIN' | 'AUTH_CLIENT_ID'>): AuthorCapability {
  const parsed = capabilitySchema.safeParse(data);
  assert(parsed.success, 401, 'Main professional verification is unavailable.');
  const capability = parsed.data;
  assert(capability.issuer === config.MAIN_AUTH_ORIGIN && capability.audience === config.AUTH_CLIENT_ID &&
    Date.parse(capability.validUntil) > Date.now() && Date.parse(capability.validUntil) <= Date.now() + 30500,
    401, 'Main professional verification has expired or is not for Books.');
  return capability;
}
export function verified(identity: Pick<Identity, 'user' | 'professional'>) {
  assert(identity.user.role === 'professional' && identity.professional?.status === 'verified',
    403, 'Only verified vet professionals can upload documents.');
}
