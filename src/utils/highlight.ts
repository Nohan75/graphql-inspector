/**
 * Tokenize a GraphQL query string into an array of {type, text} tokens
 * for syntax highlighting.
 */

export type TokenType =
  | 'keyword'
  | 'type'
  | 'field'
  | 'string'
  | 'variable'
  | 'brace'
  | 'comment'
  | 'plain';

export interface Token {
  type: TokenType;
  text: string;
}

const GQL_KEYWORDS = [
  'query',
  'mutation',
  'subscription',
  'fragment',
  'on',
  'true',
  'false',
  'null',
];

/**
 * Tokenize one line of GraphQL source.
 */
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Comment
    if (line[i] === '#') {
      tokens.push({ type: 'comment', text: line.slice(i) });
      break;
    }

    // String literal
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === '\\') { j += 2; continue; }
        if (line[j] === '"') { j++; break; }
        j++;
      }
      tokens.push({ type: 'string', text: line.slice(i, j) });
      i = j;
      continue;
    }

    // Variable $name
    if (line[i] === '$') {
      let j = i + 1;
      while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++;
      tokens.push({ type: 'variable', text: line.slice(i, j) });
      i = j;
      continue;
    }

    // Braces / parens / brackets
    if ('{}()[]'.includes(line[i])) {
      tokens.push({ type: 'brace', text: line[i] });
      i++;
      continue;
    }

    // Word (keyword, type, field)
    if (/[A-Za-z_]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);

      let type: TokenType;
      if (GQL_KEYWORDS.includes(word.toLowerCase())) {
        type = 'keyword';
      } else if (/^[A-Z]/.test(word)) {
        type = 'type';
      } else {
        type = 'field';
      }
      tokens.push({ type, text: word });
      i = j;
      continue;
    }

    // Colon and other punctuation
    if (':!'.includes(line[i])) {
      tokens.push({ type: 'plain', text: line[i] });
      i++;
      continue;
    }

    // Whitespace and everything else
    let j = i;
    while (
      j < line.length &&
      !'#"${}()[]'.includes(line[j]) &&
      !/[A-Za-z_]/.test(line[j]) &&
      !':!'.includes(line[j])
    ) {
      j++;
    }
    if (j === i) j = i + 1;
    tokens.push({ type: 'plain', text: line.slice(i, j) });
    i = j;
  }

  return tokens;
}

export const tokenClassMap: Record<TokenType, string> = {
  keyword: 'syn-keyword',
  type: 'syn-type',
  field: 'syn-field',
  string: 'syn-string',
  variable: 'syn-variable',
  brace: 'syn-brace',
  comment: 'syn-comment',
  plain: '',
};
