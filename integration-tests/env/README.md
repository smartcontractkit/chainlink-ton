## TON Development Environment

Running tests locally requires a running TON blockchain — and, in some cases, an EVM chain as well.

In **chainlink core** package, we have `memory.NewMemoryEnvironment`, which allows us to create an **in-memory environment** with both TON and EVM chains. However, this environment is tightly coupled to **CTF node provisioning**, making it inconvenient for local development. For example, you can’t easily spin up the environment once and reuse it for multiple tests — each setup takes around **2–3 minutes**. It’s also not possible to point it to a **devnet** or **testnet**, which is sometimes necessary to debug or test a change set against a real network.

This development environment wrapper improves that experience by:
- Using the in-memory environment when running tests in **CI**.
- Allowing developers to run tests locally against:
    - A **local TON stack** (via Docker Compose), or
    - The **TON devnet**, as well as other EVM chains.

The `test_environment.go` file includes a builder that makes it easy to create environments in different configurations.

---

### 🧩 Running a Local TON Stack

To start your local TON stack using Docker Compose:

```bash
./env.sh up
```

To stop it:

```bash
./env.sh down
```

---

### ⚙️ Environment Types

#### Local Environment (`local-env.toml`)

To point your tests to a locally running TON (the one created by `./env.sh`)  and EVM stack:

```go
env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().WithEVM().Local().Build(t)

```

`local-env.toml` contains the following configuration:

```toml
[[ton_blockchain]]
selector = "1399300952838017768"
name = "my_local_ton"
httpURL = "liteserver://E7XwFSQzNkcRepUC23J2nRpASXpnsEKmyyHYV4u/FZY=@127.0.0.1:40004"
deployerKey = ""
walletVersion = "V5R1"

[[evm_blockchain]]
selector = "16015286601757825753"
name = "ethereum_sepolia"
httpURL = "https://ethereum-sepolia-rpc.publicnode.com"
wssURL = "wss://ethereum-sepolia-rpc.publicnode.com"
deployerKey = ""
```

---

#### Testnet Environment (`testnet-env.toml`)

You can specify `testnet-env.toml` to configure devnet. Just copy paste the local-env.toml and replace with private keys and RPC endpoints. Next use the devenv in your tests: 

```go
env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().WithEVM().Testnet().Build(t)
```

---

#### Default (CTF) Environment

By default, the environment uses **CTF** where TON and EVM chains will spin up using test containers.

```go
env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().WithEVM().CTF().Build(t)
```

or simply:

```go
env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().WithEVM().Build(t)
```

---

### ✅ Summary

| Environment | Description                           | Use Case                                                                     |
|--------------|---------------------------------------|------------------------------------------------------------------------------|
| **In-memory (CTF)** | Ephemeral env, used in CI             | Automated tests in CI and local                                              |
| **Local (Docker)** | Full TON + EVM stack via Docker       | Faster automated tests running locally                                       |
| **Testnet / Devnet** | Connect to public devnets   | Faster automated tests running locally and real-network validation |

---

### Next steps

This is an initial implementation aimed at simplifying local development with TON. However, a more extensible approach would be to create a development environment for CCIP 1.6 that supports not only TON and EVM, but other chains as well. This environment should also be usable for running tests in CI and include JD integration with the appropriate functions to deploy and configure CCIP contracts on the selected chains using the tooling API.
