import type { Greeting } from '@/types';

export function shout(text: string): string {
  return text.toUpperCase();
}

export function quiet(greeting: Greeting): string {
  return greeting.text.toLowerCase();
}
