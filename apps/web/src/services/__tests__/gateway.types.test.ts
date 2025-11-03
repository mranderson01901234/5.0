import { describe, test, expectTypeOf } from 'vitest';
import type { MessagesResponse } from '@/types/api';

describe('Gateway types', () => {
  test('MessagesResponse shape', () => {
    const sample: MessagesResponse = { items: [], nextCursor: null };
    expectTypeOf(sample.items).toBeArray();
    expectTypeOf(sample.nextCursor).toEqualTypeOf<string | null | undefined>();
    
    // Verify items have correct shape
    if (sample.items.length > 0) {
      const item = sample.items[0];
      expectTypeOf(item.id).toBeString();
      expectTypeOf(item.role).toEqualTypeOf<'user' | 'assistant' | 'system'>();
      expectTypeOf(item.content).toBeString();
      expectTypeOf(item.ts).toBeNumber();
    }
  });
});

