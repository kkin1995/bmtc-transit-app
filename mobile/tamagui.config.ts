/**
 * Tamagui Configuration
 *
 * Minimal configuration using @tamagui/config defaults
 * Provides design tokens, themes, and component configurations
 */

import { config } from '@tamagui/config/v3';
import { createTamagui } from 'tamagui';

const tamaguiConfig = createTamagui(config);

export type Conf = typeof tamaguiConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}

export default tamaguiConfig;
