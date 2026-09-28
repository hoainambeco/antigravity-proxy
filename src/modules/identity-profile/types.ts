import { z } from 'zod';

export const DeviceProfileSchema = z.record(z.string(), z.unknown());
export type DeviceProfile = z.infer<typeof DeviceProfileSchema>;

export const DeviceProfileVersionSchema = z.number().int().nonnegative();
export type DeviceProfileVersion = z.infer<typeof DeviceProfileVersionSchema>;
