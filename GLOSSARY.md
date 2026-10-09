# GraphQL Inspector

A browser DevTools extension that captures the GraphQL requests a page sends and lets a developer inspect them.

## Language

**Query document**:
The GraphQL text carried by a captured request: one or more operations, plus the fragments they use. It may hold a mutation or a subscription as well as a query.
_Avoid_: query (ambiguous with the operation type), query string, query text

**Sub-query**:
A query document reduced to a single field of another one: that field with everything beneath it, and the chain of parents leading to it. It is valid whenever the original is.
_Avoid_: partial query, extract, snippet
