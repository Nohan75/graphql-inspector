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

**Duration**:
How long a captured request took: from when the page sent it to when its response had arrived, or to its failure. The wait before the request went on the network counts, which makes it longer than the time the Network panel gives in its Time column. A pending request has none.
_Avoid_: latency, response time, elapsed time

**Response size**:
The size in bytes of the response body of a captured request, uncompressed and whole, even when the panel only holds the beginning of a large body.
_Avoid_: weight, length, transferred size (what went over the network, compressed and with the headers)

**Request log**:
The captured requests of the inspected tab, in the order they were first reported, as the panel lists them. It only keeps the most recent ones.
_Avoid_: history, store

**Trace**:
What the request log was told during a session, in order: every report, the source it came from and the time it arrived at. Replayed into a request log, it gives the list the panel showed.
_Avoid_: recording (the act, not the result), dump, HAR (the format DevTools exports the network in)

**Query document**:
The GraphQL text carried by a captured request: one or more operations, plus the fragments they use. It may hold a mutation or a subscription as well as a query.
_Avoid_: query (ambiguous with the operation type), query string, query text

**Sub-query**:
A query document reduced to a single field of another one: that field with everything beneath it, and the chain of parents leading to it. It is valid whenever the original is.
_Avoid_: partial query, extract, snippet
