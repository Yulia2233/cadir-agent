import { describe, expect, it } from 'vitest';
import { classifyDomainRequest } from '../src/domain/domain-guard.js';

describe('CAD domain guard', () => {
  it.each(['Create a 100 mm mounting plate', '做一个长100宽50厚5毫米的板', 'Add four holes'])(
    'allows a CAD request: %s',
    (content) => expect(classifyDomainRequest(content, false).allowed).toBe(true),
  );

  it('allows a concise modification when a model exists', () => {
    expect(classifyDomainRequest('把厚度改成8毫米', true).allowed).toBe(true);
  });

  it.each(['What is the weather?', 'Write a shopping website'])(
    'rejects non-CAD content: %s',
    (content) => {
      expect(classifyDomainRequest(content, false)).toMatchObject({
        allowed: false,
        category: 'non_cad',
      });
    },
  );

  it('blocks a system command hidden inside CAD language', () => {
    expect(classifyDomainRequest('Create a CAD plate and run shell command', false)).toMatchObject({
      allowed: false,
      category: 'unsafe_intent',
    });
  });
});
