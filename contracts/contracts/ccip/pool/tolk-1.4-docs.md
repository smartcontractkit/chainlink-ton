This update is mostly about making Tolk contracts understandable not only by humans, but also by all **tools around the ecosystem**.

Tolk already has a rich type system, auto-serialization, TON-specific concepts deeply integrated, and all the language features needed for smart contracts. In v1.4, we expose this knowledge outside the compiler:

1. ABI export — for toolchain, explorers, UI
2. TypeScript wrappers for Tolk contracts
3. Source maps that map TVM execution back to Tolk source, variables, stack layout, and call frames
4. Debugger marks that enable step-by-step debugging of fully-optimized production contracts
5. Several language enhancements (continue the direction of a general-purpose language)

ABI and source maps are the final pieces of my initial vision — exactly as I saw how all branches merge together, more than a year ago. So, let's explore how it looks like.



# The `contract` keyword

A contract file can now start with a `contract` declaration:

```tolk
contract Counter {
    author: "Tolk Team"
    version: "0.1"
    description: "A small counter contract"

    storage: ContractStorage
    incomingMessages: Increment | Reset
}

// ... all the rest of code unchanged:
// - types and declarations
// - onInternalMessage
// - get methods
```

## What does `contract` mean

The directive is not a runtime thing, it does not affect bytecode at all. It is a declaration for tooling: "this source file is a contract, and these are the public shapes that describe it."

You place `contract` in the same file with entrypoints: `onInternalMessage`, get methods, etc. If you have several contracts in a project (say, `JettonMinter` and `JettonWallet`) — you have several files with `onInternalMessage`, and you precede every file with a `contract` directive.

For example. File `JettonMinter.tolk` (it's now the preferred PascalCase naming: a contract's filename is equal to its name):

```tolk
import "..."
import "..."

contract JettonMinter {
    author: "..."
    storage: MinterStorage
    incomingMessages: MinterMessages
}

// you still declare internal types, as earlier
// think of it like "implementation"

struct MinterStorage {
   ... 
}

type MinterMessages = Message1 | Message2 | Message3

// you still declare entrypoints, as earlier
// think of it like "public interface"

fun onInternalMessage(in: InMessage) { ... }
fun onExternalMessage(body: slice) { ... }

get fun minterMethod1() { ... }
get fun minterMethod2() { ... }
```

So, is it a breaking change? No! Everything still works without `contract` — and with it. If you add `contract`:
- you emphasize that it's a contract file
- you get ABI support and TypeScript wrappers
- all the tooling can interact with your contract via ABI
- some importing rules become more strict, read below

## Declare ALL `get fun` in the same file

Before Tolk v1.4, it was possible (and somebody used it) to split `get fun` across multiple files:

```
// file: separate-getter.tolk
get fun method1() { ... }

// file: main.tolk
import "separate-getter"

get fun method2() { ... }
```

The `contract` prohibits this: all entrypoints must exist in the same file, they cannot be imported. This is for clarity: when you explore a contract file, you should see all its "interface" as a whole.

```
// file: MyContract.tolk
import "separate-getter"   // compilation error

contract MyContract { ... }
```

You'll see an error to place all entrypoints in `MyContract.tolk`.

So, rule1: keep `contract`, `onInternalMessage`, `onExternalMessage`, and `get fun` together — one file to expose the entire "interface".

## `import "MyContract"` does NOT import its entrypoints

Before Tolk v1.4, when you import a file with `get fun`, they become available implicitly. That's why managing multiple contracts in one project required accuracy: from "JettonMinter" you couldn't just import "JettonWallet", because it conflicted on `onInternalMessage` duplicate. You had to extract common parts to separate files (e.g. MinterStorage and WalletStorage in `storage.tolk`, all available messages, etc.).

With Tolk v1.4, this becomes simpler: `import "MyContract"` with `contract MyContract` inside does NOT expose entrypoints. User-defined types work as earlier, but `onInternalMessage` and `get fun` are logically "part of a contract" and are not visible outside.

This enables two interesting patterns.

Pattern 1. You have a contract, and you write scripts or tests as standalone files:

```
import "Counter"     // with `contract Counter`

// tests are written as get methods,
// they do not conflict with `get fun` of Counter.tolk

get fun `test increase does not overflow`() {
    // use symbols from "Counter.tolk" as expected
    val initial = Storage {
        value: 0
    };
}

// you can even declare `main` (TVM method_id=0),
// it does not conflict with `onInternalMessage`
fun main() {
    createMessage({
        body: CounterIncrement {
            // ...
        }
    })    
}
```

Pattern 2. You have multiple contracts, and you can import one from another — you see all declarations, but entrypoints do not conflict, they "belong" to each `contract` specifically.

```
// file: JettonWallet.tolk

contract JettonWallet { ... }

struct WalletStorage { ... }

struct MsgA { ... }
struct MsgB { ... }
type WalletMessages = MsgA | MsgB

fun onInternalMessage() { ... }

get fun walletMethod1() { ... }
```

```
// file: JettonMinter.tolk
import "JettonWallet"

contract JettonMinter { ... }

// use WalletStorage, MsgA, etc.

fun deployJW() {
    val initial = WalletStorage { ... };
    // ...
}

// and declare minter's entrypoints

fun onInternalMessage() { ... }

get fun minterMethod1() { ... }
```

All in all, `contract` specifier tells:
1. This file is a contract file, all its "public interface" exists solely in this file
2. This file, being imported, does not pollute outer scope with "public interface"

## What properties can be specified in `contract`

In practice, you'll specify `author`, `storage`, and `incomingMessages`. But generally, there are other fields which may also be useful:

```
contract SomeName {
    /// arbitrary string, exported to ABI as-is
    author: "Tolk team"

    /// arbitrary string (preferably semver), exported as-is
    version: "1.0"

    /// arbitrary string, exported as-is
    description: "..."

    /// tells what shape persistent on-chain data has
    storage: MyStorage

    /// specified if storage has another shape AT DEPLOYMENT
    /// (when calculating initial address);
    /// example: NFT, when at deployment it's {itemIndex,collectionAddr},
    /// and after initialization it's enriched with {owner,content};
    /// then PartialStruct has 2 fields, and MyStorage has 4
    storageAtDeployment: PartialStruct

    /// internal messages that are accepted by this contract;
    /// typically you use the same union as for `lazy` match
    incomingMessages: UnionOfStructs

    /// if your contract has `onExternalMessage`,
    /// you can specify which shape of a `slice` you expect;
    /// typically use that struct/union for `lazy` fromSlice
    incomingExternal: SomeStructOrUnion

    /// (rarely used, to override auto-calculated)
    /// outgoing internal messages that a contract may send;
    /// if not set, calculated by `createMessage` calls
    outgoingMessages: UnionOfStructs

    /// (rarely used, to override auto-calculated)
    /// outgoing external messages (aka "events") that may be emitted;
    /// if not set, calculated by `createExternalLogMessage` calls
    emittedEvents: UnionOfStructs

    /// (rarely used, to override auto-calculated)
    /// exception codes that may be thrown (should be a enum);
    /// if not set, calculated by `throw` / `assert` / etc.
    thrownErrors: SomeEnum

    /// additional types that should appear in ABI even if
    /// they are not reachable from storage/messages/getters;
    /// for example, to use them in TypeScript unit tests
    forceAbiExport: (type1, type2, ...)
}
```

As a conclusion, `contract` specifies some properties that cannot be inferred from source code — and combined with source code, are exported as a public ABI.

<br />

# Contract ABI export

Before, Tolk code was compiled into Fift and TVM bytecode, but external tools still had to guess a lot: what messages the contract accepts, what storage shape it uses, what get methods exist, and how client-side values should be represented.

Tolk v1.4 emits a machine-readable ABI JSON directly from Tolk sources.

## Goals of having ABI

ABI of a contract gives all necessary information for the following purposes:

```text
Tolk -> ABI -> TypeScript wrappers
               dynamic serialization
               stack layout info
               print any Tolk object to console
               render a contract in explorer
               build UI to send a message
               build UI to invoke a get method
               ...
```

## ABI JSON artifact

Being invoked from a command-line,

```bash
tolk -o out.fif Counter.tolk
```

The compiler outputs `out.abi.json` next to `out.fif`.

**This ABI contains:**

* contract name, author, version, description
* internal messages a contract accepts
* external messages, if any
* outgoing messages a contract sends by `createMessage`
* emitted events a contract writes by `createExternalLogMessage`
* storage shape a contract has
* storage at deployment for address calculation, if differs
* contract getters with parameters and returns
* exceptions a contract may throw
* user-defined declarations (structs, aliases, enums)
* a list of unique types where declarations point to
* Tolk compiler version

## Example of abi.json

`out.abi.json` looks like this:

```json
{
  "abi_schema_version": "1.0",
  "contract_name": "TolkCounter",
  "unique_types": [
    {"kind":"void"},
    {"kind":"int"},
    {"kind":"slice"},
    {"kind":"cell"},
    {"kind":"builder"},
    {"kind":"bool"},
    {"kind":"coins"},
    {"kind":"address"},
    {"kind":"intN","n":32},
    {"kind":"uintN","n":32},
    {"kind":"intN","n":64},
    {"kind":"uintN","n":64},
    {"kind":"StructRef","struct_name":"IncreaseCounter"},
    {"kind":"StructRef","struct_name":"ResetCounter"},
    {"kind":"StructRef","struct_name":"Storage"}
  ],
  "struct_instantiations": [
  ],
  "alias_instantiations": [
  ],
  "declarations": [
    {
      "kind": "struct",
      "name": "Storage",
      "ty_idx": 14,
      "fields": [
        {
          "name": "id",
          "ty_idx": 9
        },
        {
          "name": "counter",
          "ty_idx": 9
        }
      ]
    },
    {
      "kind": "struct",
      "name": "IncreaseCounter",
      "ty_idx": 12,
      "prefix": {
        "prefix_num": 2122802415,
        "prefix_len": 32
      },
      "fields": [
        {
          "name": "queryId",
          "ty_idx": 11
        },
        {
          "name": "increaseBy",
          "ty_idx": 9
        }
      ]
    },
    {
      "kind": "struct",
      "name": "ResetCounter",
      "ty_idx": 13,
      "prefix": {
        "prefix_num": 980758278,
        "prefix_len": 32
      },
      "fields": [
        {
          "name": "queryId",
          "ty_idx": 11
        }
      ]
    }
  ],
  "storage": {
    "storage_ty_idx": 14
  },
  "incoming_messages": [
    {
      "body_ty_idx": 12
    },
    {
      "body_ty_idx": 13
    }
  ],
  "incoming_external": [
  ],
  "outgoing_messages": [
  ],
  "emitted_events": [
  ],
  "get_methods": [
    {
      "tvm_method_id": 117456,
      "name": "currentCounter",
      "parameters": [
      ],
      "return_ty_idx": 1
    },
    {
      "tvm_method_id": 71937,
      "name": "initialId",
      "parameters": [
      ],
      "return_ty_idx": 1
    }
  ],
  "thrown_errors": [
    {
      "kind": "plain_int",
      "err_code": 65535
    }
  ],
  "compiler_name": "tolk",
  "compiler_version": "1.4.0"
}
```

Note: ABI is hard to read. For instance, it contains `unique_types`, which are referenced by indexes: `body_ty_idx`, `return_ty_idx`, etc. But JSON is not targeted to be read by eye: it's targeted for machine parsing.

## How the compiler calculates all these fields

Almost everything can be calculated automatically by contract's source code. For example:

* outgoing messages — by inspecting `createMessage` and `TBody` within it
* exceptions — by inspecting `throw` and `assert` with constants/enums
* getters — by `get fun`
* etc.

But some fields can NOT be automatically detected — those are provided in `contract` manually:

* author, description
* incoming messages
* shape of storage

A reasonable question: **why can't the compiler detect incoming messages**? The answer is: contract's code is not declarative, it's imperative. Yes, most likely, you use a union with `lazy` match. But generally, you can split this union into several; use manual parsing and opcodes; want to hide admin messages from ABI; etc. Same goes for storage: from the compiler's perspective, `MyStorage` is a regular struct, you call `fromCell` and `toCell` in arbitrary places, it does not differ from any other struct. That's why, instead of fragile heuristics, I decided to always require specifying those fields from the user's side. And it's also better for the reader.

## Doc comments as description

Place `/// doc comment` over every struct/field/enum — they go as "description" to ABI, and therefore will be rendered as TypeScript comments, in UI, etc.

```tolk
/// Persistent contract data
struct (0x12345678) ContractStorage {
    /// Current counter value
    counter: int32

    /// Contract owner
    owner: address
}

/// Reads current counter.
/// @param verbose whether to include debug info
get fun currentCounter(verbose: bool): (int32, cell?) {
    ...
}
```

The compiler parses only `///` comments. They must be placed strictly above declarations, they are not allowed to be inside regular code — use simple `//` comments there.

For the example above, ABI will contain descriptions:

```
  declarations: [
    {
      "kind": "struct",
      "name": "ContractStorage",
      "fields": [
        {
          "name": "counter",
          "ty_idx": 123,
          "description": "Current counter value"
        },
        {
          "name": "owner",
          "ty_idx": 124,
          "description": "Contract owner"
        }
      ]
    }
  ],
  "get_methods": [
    {
      "tvm_method_id": 117456,
      "name": "currentCounter",
      "parameters": [
        {
          "name": "verbose",
          "ty_idx": 125,
          "description": "whether to include debug info"
        }
      ],
      "return_ty_idx": 126,
      "description": "Reads current counter."
    }
  ],
```

A good manner is also to use descriptions for error codes. Then, in case of exceptions, UI and IDE will be able to provide details from a comment.

```
enum ErrCode {
    /// Sender is not allowed to perform this action.
    NotOwner = 401
}
```

## Special annotation `@abi.clientType`

Sometimes the on-chain type is intentionally low-level, but client tools should see a more convenient shape.

For example, `forwardPayload` in jettons is often just `slice`: we don't want to waste gas on validation and carrying a union. But for external clients (TypeScript, explorers, etc.) we want to expose it "inline payload or ref payload":

```tolk
struct AskToTransfer {
    // ...
    @abi.clientType(PayloadInline | PayloadInRef)
    forwardPayload: RemainingBitsAndRefs
}
```

The compiler still type-checks and serializes the real field as `RemainingBitsAndRefs`, but ABI emits it as a union (`client_ty_idx` in a field).

This is a way to hide "implementation details" while exposing schema-described public contract interface.

## Defining ABI for existing FunC contracts

Imagine, you have an existing FunC contract (deployed to mainnet, so you are not going to rewrite it), and you want to use TypeScript generator. What are required steps?

One might think, that he should write a JSON manually. But it's an incorrect path.

The answer is: **decribe FunC's interfaces in Tolk** and generate ABI from that fake contract.

```
contract SwapalkaInFunC {
    incomingMessages: A | B | C
    outgoingMessages: D | E | F
    storage: S
    thrownErrors: ErrCodes
}

// declare types mentioned in `contract`

struct (0x12345600) A { ... }
struct (0x12345601) B { ... }
// ...

enum ErrCodes {
     NotAdmin = 401,
     InsufficientBalance = 402,
     ...
}

// declare get methods and their types

struct CalcSwapCostReply {
    from: address
    to: address
    cost: coins
}

get fun calc_swap_cost(from: address): CalcSwapCostReply {
    // to satisfy the type system, we need to return something;
    // not very beautiful, but let it be this way for now
    return {
        from: FAKE_ADDR,
        to: FAKE_ADDR,
        cost: 0,
    }
}

// and an empty entrypoint

fun onInternalMessage() {
}
```

It's also a valid contract — without any body — and sufficient for ABI generation. Using `///` comments will enrich ABI with descriptions.

You might also notice why `outgoingMessages` and `thrownErrors` are useful. In practice, they are auto-calculated by `createMessage`, `throw`, etc. But in case you are "just describing ABI" they are the key. Also they are helpful if you are writing a proxy contract that does not `createMessage` itself — it sends an already composed message cell. Then you can describe types of those implicit messages for explorers/UI/etc.

## ABI in tonscan / tonviewer / TON Center / TonAPI / etc.

In the near future, we'll work with other teams to bring ABI support across TON ecosystem.

For instance, explorers have lots of heuristics and implicit conventions to render messages and transactions in UI. Ideally, this layer should be standartized and be fully based on ABI standard. ABI for existing contracts may be described in a way shown above.

## Side note: ABI is based on Tolk types, NOT on TL-B

Experienced FunC developers tend to ask questions like "How to generate a TL-B schema for a Tolk structure?". Or — alternatively — "we already have a TL-B codegenerator, so ABI should probably reuse TL-B tooling".

Such reasoning leads in the wrong direction — because the Tolk **type system** is designed as a **replacement for TL-B**.

There is no need to "provide a TL-B schema for a contract". Every Tolk `struct` **is already a schema**.

**TL-B and the Tolk type system are not equivalent**, even if they look similar at first glance.

Similarities include:

- `intN`, `uintN`, `bitsN`
- `Maybe` (nullable), `Either` (a two-component union)
- multiple constructors (declared structs + prefixes + unions)
- cells and typed cells

But the differences are essential.

TL-B supports the following (not expressible in Tolk):

- `~tilde`
- `{conditions}`
- dynamic `## n`

Tolk supports the following (not expressible in TL-B):

- type aliases
- enums
- inline unions (auto-generated prefix trees)
- tensors
- custom `packToBuilder` and `unpackFromSlice`
- `address?` as "internal or none" (not "maybe T")

Moreover: ABI is not only about serialization, but also about stack layout, because get methods work via the stack.

The conclusion is simple: to make ABI sufficient for all scenarios, **it must rely on the type system, not on TL-B**.

## How exactly types are represented in ABI

Type representation in ABI covers all nuances of the type system. Even though it might seem simple, there are lots of corner cases. For example:

- how are typed cells represented?
- how are generic structs and aliases described?
- how to serialize unions with prefix trees?
- how to read a union from a TVM stack?
- how to deal with `packToBuilder` and `unpackFromSlice`?

ABI gives extensive information to answer all these questions and do any interaction with a contract solely having its ABI.

Since this piece of information is very big, I will not include it in this description. Instead, I'll provide a comprehensive README in a separate repo, where ABI is used on the client side: in a TypeScript wrappers generator.



# TypeScript wrappers for Tolk contracts

Aside from the `ton-blockchain` repo, I have implemented a TypeScript generator based on ABI. The compiler emits ABI, the only source of truth:

```
Tolk -> ABI -> TypeScript wrappers
            -> Go wrappers
            -> Rust wrappers
            -> Python wrappers
            -> JSON marshalling
            -> Tolk declarations
```

Currently, only TypeScript generator is ready, but others are only a matter of time.

## Why TypeScript wrappers are needed

A contract in a blockchain is "the backend" layer. In practice, you have a dApp — frontend — that somehow interacts with a contract: sends messages, calls get methods, etc. In order to compose message cells and properly manipulate a TVM stack, you manually had to mirror your contract's "interface" in TypeScript — a boring and error-prone work. Now it's fully automated.

All in all, you use TypeScript for
- frontend and UI, to interact with contracts
- end-to-end tests, involving offchain and onchain
- cumbersome on-chain scripting

## What TypeScript wrappers contain

For every `contract`, a single `ContractName.gen.ts` file contains:

- all structs exposed as TS interfaces; each can be serialized to a builder and deserialized from a slice, identically to how Tolk compiler does it
- all type aliases as TS type aliases
- all enums exposed as TS enum-like objects (not TS enums, they don't support bigint)
- private helpers to compose address, StateInit, and sharding
- private helpers to manipulate TVM stack
- a class `ContractName` with high-level methods: send messages, compose message cells, call get methods

TypeScript generator supports all nuances of the Tolk type system, even generics and unions. This sounds simple, but when you think deeper, it becomes absolutely unobvious. For example, `int64` in Tolk translates to `bigint` in TypeScript. But how `int64 | int128` should look like? `bigint | bigint` makes no sense, then how?

Anyway, since I managed to solve all issues at the border between Tolk (statically typed, compiled) and TypeScript (dynamically typed, interpreted), wrappers for other languages look promising.

## How to use the TypeScript generator

Proceed to a dedicated repo:

https://github.com/ton-blockchain/tolk-abi-to-typescript

<br />

# Source maps and debugger

Tolk v1.4 introduces compiler-side **source maps**. For the end user, they are the foundation of:
- debugger
- coverage
- unwinding on TVM exception

All these features are released together with v1.4 in the toolchain (read below).

The goal is simple to say and very hard to implement:

*"Given a TVM execution point, determine the original Tolk source location, current function, call stack, initialized variables, and their values."*

The most curious thing about source maps: they work for **for fully-optimized production Tolk contracts**. No "disable optimizations" mode, no bytecode modification.

Tolk still inlines functions, folds constants, performs lazy deserialization, and emits optimized bytecode. Nevertheless, source maps provide all info to remap execution state back.

## Where source maps are useful

For example, a contract fails with exit code 9. Earlier, you had to manually explore TVM logs, study generated assembler, manually mapping assembler code to original Tolk sources (which is a very hard task), trying to reconstruct the original trace and what *actually* happened.

Now, you automatically have:

- an exact location of the exception
- call stack (including inlined functions!)
- all local variables in every call frame (including already disappeared from a stack!)
- all TVM registers
- all global variables
- all deserialized contents of typed cells

And again — this all works WITHOUT bytecode modification.

## Step-by-step debugger

Since we have an ability to calculate TVM state at every asm instruction (due to source maps), we introduce a real step-by-step debugger, working via DAP — Debugger Adapter Protocol — supported by all major IDEs.

You can just click "debug" in VS Code or JetBrains, and evaluate a request step by step:

- see all variables and how they change
- all `lazy` objects (even if their fields were not loaded yet!)
- step over, step into, step out (even into inlined functions!)
- use breakpoints and run to cursor
- stop on uncaught exception
- and more, exactly as you expect from a debugger

This provides awesome experience, compared to modern Web2 languages — but working inside TVM.

Moreover — you can take a transaction hash from a real mainnet, and debug it step-by-step — from a real network. A transaction failed in mainnet? No problem, just debug it in IDE (if you have sources of that contract, of course). That would be impossible if we used "disable optimizations" for debugging — but we do not, that's why it works.

## How exactly source maps and debugger work

The architecture of debugging fully-optimized contracts is very complicated. It involves tricks in the compiler, ABI core, patched Fift, patched TVM, and a standalone replayer that combines all artifacts and literally *emulates* (replays) transaction flow.

I will not explain this machinery here, in MR's description — otherwise, the description will become too large to be analyzed. Instead, I'll provide a dedicated document "How the debugger works" in the near future.

## How to try the debugger

The debugger comes a part of Acton toolchain. Read below.




# Several language enhancements

In Tolk v1.3 I introduced many new language features that are primarily not for contracts, but for libraries and frameworks. In a way, Tolk becomes more general-purpose language.

Tolk v1.4 also brings some improvements in this direction.

### Closures (lambdas with captures)

Lambdas without capturing already existed in Tolk. Now they can capture outer variables and really become first-class functions:

```tolk
fun makeAdder(delta: int): int -> int {
    return fun(value) {
        return value + delta;
    };
}

fun demo() {
    val add3 = makeAdder(3);
    return add3(10);   // 13
}
```

There is no special `use` or `[&]` syntax: capturing is done automatically.

Variables are captured by value, at the exact point where a lambda is created. Mutations become independent:

```tolk
fun demo() {
    var x = 10;

    val cb = fun() {
        return x + 1;
    };

    x = 20;
    return cb();   // 11, not 21
}
```

Lambdas and capturing work with generics, nesting, and smart casts. For instance, if `v` is smart-casted at the point where the lambda is created, the closure captures that narrowed type.

### Optional `void` parameters

Tolk already allowed `void` fields to be omitted in object literals:

```tolk
struct S {
    x: int
    marker: void
}

val s = S { x: 10 };   // marker is omitted
```

For instance, `body` of `createMessage` can be omitted, because its type defaults to `TBody = void`.

Now the same convention applies to function parameters.

If a trailing parameter has type `void`, it may be omitted:

```tolk
fun format<T1 = void, T2 = void>(msg: string, arg1: T1, arg2: T2) {
    ...
}

format("hello");
format("value is {}", 42);
format("pair is {} and {}", "str", beginCell());
```

This is especially convenient for generic helpers where "no argument" is represented by `void`, not by an artificial nullable wrapper or a pile of overloads.

### `void` inside unions for serialization

`T | void` is a valid union now, and it also can be (de)serialized. `void` here means "empty slice".

This allows to express "maybe zero bits" in serialization. Unlike `T | null`, which requires at least one bit (0 or 1+T), `T | void` means NOTHING or T.

For example:
- `int32 | void` — either int32 or nothing
- `A | B | C | void` — either empty slice, or some of those variants
- `int8 | null | void` — empty / 0 / 1+int8

In other words, `void` does not participate in prefix tree. On deserialization, it's a special case: if a slice is empty, `void` is saved. On serialization, if active variant is `void`, nothing is written.

Since it's a regular type, after deserialization, it can be tested with `someVar is void`, or `match (v) { int32 => ... void => ... }`, etc.

Using `Cell<OutAction> | void` we can describe an imperative chain of wallet-v5 payload "parse cells until refs exist" that is unrepresentable with TL-B.

### Numeric separators

Integer literals can now contain `_` separators:

```tolk
const A = 1_000_000;
const B = 0x_ABCD_EF01;
const C = 0b_1010_1011_0000;
```

### Enums are assignable to integers

Enums are distinct types, but enum values can now be assigned to integer variables without `as` cast:

```tolk
var x: int = Color.Red;
var y: int32 = VmExitCode.OutOfGasError;
```

This looks a bit strange for decorative enums like `Color`, but it is very convenient for enums that represent TVM exit codes, operation ids, modes, and other numeric constants.

This does not mean that enums silently become integers everywhere. For example:

```tolk
1 + Color.Blue;   // still an error
```

### Breaking change: only `bool` in conditions

This is the biggest language-level breaking change in v1.4.

Before, Tolk allowed integers in conditions:

```tolk
if (x) { ... }
while (coinsAmount) { ... }
assert (flags) throw 123;
```

Now conditions must be `bool`. Write explicitly:

```tolk
if (x != 0) { ... }
while (coinsAmount != 0) { ... }
assert (flags != 0) throw 123;
```

This applies to: `if`, `while`, `do while`, ternary condition, and `assert`.

Similarly, unary `!` accepts only `bool` now: use not `if (!num)`, but `if (num == 0)`.

While using integers as conditions is common in C-like languages, we decided to make it stricter.

Note: there is **no gas overhead**. Writing `x != 0` does not mean that the compiler blindly emits `0 NEQINT`. The lowering detects this pattern and strips the comparison off. The source code becomes more explicit, while bytecode stays efficient.

## `do while` scope is now conventional

The `do while` scoping has been aligned with other languages.

Before, the condition could see variables declared inside the loop body:

```tolk
do {
    var found = ...
} while (found);
```

Now this is an error:

```text
undefined symbol `found`
```

Declare the variable before the loop:

```tolk
var found: bool;
do {
    found = ...
} while (found);
```

To be honest, I changed this behavior due to AI agents: they argue on non-standard scoping while reading Tolk contracts, thinking it's an error. No languages (except FunC, and Tolk consequently) allow "leaking" loop's body to condition. So, this change removes this exception and makes `do while` consistent with block scopes everywhere else.

## Several bug fixes found through LLM fuzzing

Traditionally, we had some research and bug bounty reports targeting invalid compiler behavior in corner cases. Most of the findings are false positives, but some of them make sense and should be fixed. None of them could appear in real straightforward code, only in artificial scenarios you'd very unlikely face with.

For instance: 

- tricky recursive generics leading to infinite stack size
- more accurate handling of `never` type
- smart casts in loops up to a fixed control flow point
- mixture of generics and asm functions
- and similar

## Migrating from v1.3 to v1.4

As a conclusion, a quick migration guide:

1. Add `contract` directive above each `onInternalMessage`. If `get fun` are implicitly imported, you'll get an error. Then place them below: `contract` requires the whole public interface to be visible in one file. You can leave common implementation shared, but each contract must declare `get fun` independently.

2. Facing an error "can not use `int` as a boolean condition", replace `if (someNumber)` with `if (someNumber != 0)`. This applies to `if`, `while`, `assert`, and ternary.

3. Facing an error "undefined symbol `x`" in condition of `do while` body, move `x` lateinit declaration before the loop, as shown above.


<br />

# Acton: a unified toolchain for TON

Together with Tolk v1.4, we are releasing a **TON toolchain** named Acton.

## Modern replacement for blueprint

When Tolk appeared, it made FunC feel like the old world. Tolk is not just "a bit better" — it feels like a different era.

Now we are doing the same for the entire on-chain development stack.

We are releasing Acton — all-in-one toolchain for project management, testing, scripting, debugging, deployment, and more. Not a bunch of utilites — a full development environment built as one coherent system around Tolk.

## What features are bundled into Acton

* Project management. Contracts, unit tests, integration tests, and ready-to-use templates. 

* Native tests in Tolk — not in TypeScript. Not only unit tests — but chains of transactions. 50x faster than the current JS sandbox. Mutation testing, fuzzing testing, and even fork testing — loading account states from mainnet on demand.

* A real debugger. Test failed with exit code 9? Stop exactly at the exception, inspect the call stack, local variables, lazy fields, and more. 

* Faucet and deployment. Work with wallets locally, top-up on testnet with embedded faucet. On-chain scripts are also written in Tolk.

* Transaction visualization. Inspect transaction trees, messages, fees, storage changes — for every test, in a clean dev-oriented UI.

* IDE integration, linter, formatter, code coverage, gas profiling.

* AI-friendly. Skills and manuals available out of the box. Acton is a modern CLI tool that becomes an agent's runtime.

Note that everything became possible, because Tolk is not limited by contracts — it's now a general-purpose language. The type system, ABI, and source maps join together to provide the kernel. All other pieces — 100k+ lines of Rust code — were carefully written by my teammates.

## How to try Acton

**https://ton-blockchain.github.io/acton/**



# Related pull requests

- https://github.com/ton-blockchain/tolk-js/pull/19
- https://github.com/ton-blockchain/tolk-bench/pull/6
- https://github.com/ton-org/docs/pull/2150
- TypeScript generator: https://github.com/ton-blockchain/tolk-abi-to-typescript
- Agent skills: https://github.com/ton-blockchain/skills
- Acton contracts repo: https://github.com/ton-blockchain/acton-contracts
- Acton: https://ton-blockchain.github.io/acton/

