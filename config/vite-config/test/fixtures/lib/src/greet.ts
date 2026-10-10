import type { Greeting } from '@/types';
import { shout } from './nested/deep';

/** Greets loudly. */
export function greet(name: string): Greeting {
  return { text: shout(`hello ${name}`) };
}
