# GraphQL Inspector

A browser DevTools extension that captures the GraphQL requests a page sends and lets a developer inspect them.

## Language

**Capture**:
Recording the GraphQL requests the inspected page sends, each with its response, so that the panel can list them.
_Avoid_: interception (the name of one part of it, in the page), sniffing

**Capture switch**:
Whether capture is on for a tab. It is off by default, on while a panel is open on that tab and off again when the panel closes.
_Avoid_: gate, toggle, activation

**Captured request**:
A GraphQL request the inspected page sent, as capture recorded it: what was sent and, once it has arrived, its response.
_Avoid_: entry, call

**Pending request**:
A captured request whose response has not arrived yet. It stops being pending when the response arrives, or when the wait for it is given up.
_Avoid_: in-flight request, open request

**Query document**:
The GraphQL text carried by a captured request: one or more operations, plus the fragments they use. It may hold a mutation or a subscription as well as a query.
_Avoid_: query (ambiguous with the operation type), query string, query text

**Sub-query**:
A query document reduced to a single field of another one: that field with everything beneath it, and the chain of parents leading to it. It is valid whenever the original is.
_Avoid_: partial query, extract, snippet
