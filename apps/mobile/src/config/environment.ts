/**
 * Singleton application configuration.
 *
 * `env.ts` stays free of React Native imports so it can be unit-tested in a
 * plain Node environment; this module is the single place that binds the
 * validated configuration to the running platform.
 */

import { Platform } from 'react-native';
import { createAppEnvironment, readRawEnvironment } from './env';

/**
 * Resolved configuration for the running app.
 *
 * `createAppEnvironment` throws on invalid input, which surfaces immediately
 * on the startup screen instead of producing confusing network failures later.
 */
export const environment = createAppEnvironment(readRawEnvironment(), Platform.OS);
