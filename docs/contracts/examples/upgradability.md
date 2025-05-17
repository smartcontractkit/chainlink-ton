# Upgradability

## Upgradable(Simple) Counter

This counter can be upgraded in-place, but the data layout must always stay the same.

```mermaid
---
config:
  "sequence":
    "noteAlign": "left"
---
sequenceDiagram
    actor Owner
    participant Counter as Counter Contract<br/>
    
    Note over Counter: Initial state:<br/>code: V1 (increment)<br/>counter: n<br/>version: 1

    Owner->>Counter: send Upgrade message<br/>(with V2 code)
    activate Counter
    Note over Counter: Verify sender is owner
    Note over Counter: Keep existing state:<br/>- id<br/>- counter<br/>- owner
    Note over Counter: Replace code<br/>V1 → V2
    Note over Counter: Update version: 1 → 2
    deactivate Counter

    Note over Counter: Same address<br/>New code (V2 - decrement)<br/>counter: n<br/>version: 2

    Owner->>Counter: send Step message
    activate Counter
    Counter->>Counter: Decrements counter<br/>(counter = n - 1)
    deactivate Counter
```

## Proxy Counter

This implements the proxy upgrade pattern usually used in EVM contracts. It supports migrating the data from one layout to a different one.

```mermaid
---
config:
  "sequence":
    "noteAlign": "left"
---
sequenceDiagram
    actor Owner
    participant Proxy as Proxy Counter
    participant CounterV1 as Counter V1<br/>(increment)
    participant CounterV2 as Counter V2<br/>(decrement)
    
    Note over Proxy,CounterV1: Initial setup:<br/>Proxy delegates to Counter V1<br/>proxy.version = 1
    
    Owner->>Proxy: send Upgrade message<br/>(with V2 code)
    activate Proxy
    Note over Proxy: Verify sender is owner
    Note over Proxy: Store upgrade code
    deactivate Proxy

    Owner->>Proxy: send CommitUpgrade message<br/>
    activate Proxy
    Note over Proxy: Verify sender is owner
    Proxy->>CounterV1: GetState message
    activate CounterV1
    deactivate Proxy
    activate CounterV1
    CounterV1->>Proxy: RequestedState message<br/>(with current state)
    activate Proxy
    deactivate CounterV1
    
    Note over Proxy: Create V2 init params:<br/>- owner<br/>- version<br/>- state to be migrated
    
    Note over Proxy: Update:<br/>- counterAddress → V2<br/>- version: 1 → 2
    Proxy->>CounterV2: Deploy with state v1
    activate CounterV2
    deactivate Proxy
    Note over CounterV2: Initialize
    Note over CounterV2: Migrate from <br/> StateV1 to StateV2
    CounterV2->>+Proxy: New version
    deactivate CounterV2
    Note over Proxy: version 2
    deactivate Proxy
    

    Note over Proxy,CounterV2: New setup:<br/>Proxy now delegates to Counter V2<br/>proxy.version = 2

    Owner->>Proxy: send Step message
    activate Proxy
    Proxy->>CounterV2: Forward Step message
    activate CounterV2
    deactivate Proxy
    Note over CounterV2: Decrements counter<br/>(counter = n - 1)
    deactivate CounterV2
```

## Upgradadable Counter

This supports in-place upgrades with state migration. When the contract is initialized, it is provided de previous state, and it can migrate it to the new layout.

```mermaid
---
config:
  "sequence":
    "noteAlign": "left"
---
sequenceDiagram
    actor Owner
    participant Counter as Counter Contract
    
    Note over Counter: Initial state:<br/>code: V1 (increment)<br/>state: StateV1 {<br/>- id: uint32<br/>- counter: uint32<br/>}<br/>version: 1

    Owner->>Counter: send Upgrade message<br/>(with V2 code)
    activate Counter
    Note over Counter: Verify sender is owner
    Note over Counter: Store upgrade code
    deactivate Counter

    Owner->>Counter: send CommitUpgrade message
    activate Counter
    Note over Counter: Verify sender is owner
    Note over Counter: Get current state
    deactivate Counter
    Note over Counter: Replace code<br/>V1 → V2
    Counter->>Counter: Replace data: <br/>init(Header, StateV1)
    activate Counter
    Note over Counter: Migrate state:<br/>StateV1 → StateV2 {<br/>- counter: uint64,<br/>- id: uint32<br/>}
    Note over Counter: Update version: 1 → 2
    deactivate Counter

    Note over Counter: New state:<br/>code: V2 (decrement)<br/>state: StateV2<br/>version: 2

    Owner->>Counter: send Step message
    activate Counter
    Note over Counter: Decrements counter<br/>(counter = n - 1)
    deactivate Counter
```
