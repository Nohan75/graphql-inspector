import { describe, expect, it } from 'vitest';
import { graphqlErrors } from './graphql';

describe('the GraphQL errors of a response', () => {
  it('are the messages of its `errors`, in order', () => {
    const response = {
      data: null,
      errors: [{ message: 'Not authorised to rename this character.' }, { message: 'Field "name" is too long.' }],
    };

    expect(graphqlErrors(response)).toEqual([
      'Not authorised to rename this character.',
      'Field "name" is too long.',
    ]);
  });

  it('are there on a partial success, next to the data', () => {
    const response = {
      data: { episodes: [{ name: 'Pilot' }, null] },
      errors: [{ message: 'Episode 2 could not be loaded.', path: ['episodes', 1] }],
    };

    expect(graphqlErrors(response)).toEqual(['Episode 2 could not be loaded.']);
  });

  it('count even when one says nothing, or is not an object', () => {
    const response = { errors: [{ code: 'FORBIDDEN' }, 'Something went wrong', null] };

    expect(graphqlErrors(response)).toEqual([
      'Error without a message',
      'Something went wrong',
      'Error without a message',
    ]);
  });

  it.each([
    ['a response with data alone', { data: { viewer: { name: 'Ada' } } }],
    ['an empty list of errors', { data: {}, errors: [] }],
    ['`errors` that is not a list', { errors: 'Bad gateway' }],
    ['a response that is a list', [{ errors: [{ message: 'in a batch' }] }]],
    ['a response that is not JSON, or has not arrived', null],
    ['a response that is a bare value', 'Bad gateway'],
  ])('are none for %s', (_what, response) => {
    expect(graphqlErrors(response)).toEqual([]);
  });
});
