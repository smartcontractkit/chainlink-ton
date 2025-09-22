# TON Logpoller Query Interface

## Query Flow

```mermaid
sequenceDiagram
    participant Client
    participant QueryBuilder
    participant LogStore
    participant pgLogStore
    participant queryParser
    participant inMemoryLogs

    Client->>QueryBuilder: NewQuery()
    Client->>QueryBuilder: WithSource(addr)
    Client->>QueryBuilder: WithEventSig(sig)
    Client->>QueryBuilder: WithBocBytes(...)
    Client->>QueryBuilder: WithBocBits(...)
    Client->>QueryBuilder: WithLimitAndSort(...)

    Client->>QueryBuilder: Execute()
    QueryBuilder->>LogStore: QueryLogs(LogQuery)

    alt PostgreSQL Store
        LogStore->>pgLogStore: QueryLogs(LogQuery)
        pgLogStore->>queryParser: newQueryParser()
        queryParser->>pgLogStore: SQL, args
        pgLogStore->>pgLogStore: Execute SQL Query
        pgLogStore-->>LogStore: logs, hasMore, nextCursor
    else In-Memory Store
        LogStore->>inMemoryLogs: QueryLogs(LogQuery)
        inMemoryLogs->>inMemoryLogs: Apply in-memory filtering & sorting
        inMemoryLogs-->>LogStore: logs, hasMore, nextCursor
    end

    LogStore-->>QueryBuilder: logs, hasMore, nextCursor
    QueryBuilder-->>Client: logs, hasMore, nextCursor
```

## TON Specific Features

### Filter Types
- **Byte Filter**: Filter on specific byte values in BOC-encoded data
- **Bit Filter**: Filter on bit-level patterns within data
- **Field Filter**: Filter on structured fields (timestamp, block height, etc.)

### Usage Examples

```go
// Byte filtering on BOC data
logs, hasMore, nextCursor, err := service.NewQuery().
    WithSource(contractAddr).
    WithEventSig(eventSig).
    WithBocBytes(
        query.SkipBytes(4),                                     // Skip header
        query.MatchBytes(32, query.WithCondition(value, primitives.Eq)), // Filter 32-byte value
    ).
    Execute(ctx)

// Field filtering
logs, hasMore, nextCursor, err := service.NewQuery().
    WithFields(query.Timestamp(ts, primitives.Gte)).           // Timestamp filter
    Execute(ctx)

// Bit filtering
logs, hasMore, nextCursor, err := service.NewQuery().
    WithSource(contractAddr).
    WithBocBits(
        query.SkipBits(32),                                    // Skip 32 bits
        query.MatchBit(true),                                  // Match single bit
        query.MatchBits([]byte{0xFF}),                        // Match bit pattern
    ).
    Execute(ctx)

// Combined filtering
logs, hasMore, nextCursor, err := service.NewQuery().
    WithSource(contractAddr).
    WithEventSig(eventSig).
    WithFields(query.Timestamp(ts, primitives.Gte)).
    WithBocBytes(query.SkipBytes(4), query.MatchBytes(8, query.WithCondition(data, primitives.Eq))).
    WithLimitAndSort(commonquery.LimitAndSort{Limit: 100}).
    Execute(ctx)
```
