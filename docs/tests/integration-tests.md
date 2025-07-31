# Chainlink-TON Integration Tests

<!-- TODO: Document the setup process for Chainlink-TON chain component integration tests -->

## Local Network Setup

By default, the integration tests automatically spawn a temporary network using **`mylocalton-docker`** via the Chainlink Testing Framework. This process takes approximately one minute. To accelerate development, you can run tests against a pre-existing local network instead.

### Running a Persistent Node

1. Follow the quickstart and setup instructions from the **[`mylocalton-docker` repository](https://www.google.com/search?q=%5Bhttps://github.com/neodix42/mylocalton-docker%5D\(https://github.com/neodix42/mylocalton-docker\))**. Additional guidance is also available in the **[Chainlink Testing Framework documentation](https://smartcontractkit.github.io/chainlink-testing-framework/framework/components/blockchains/ton.html)**.

2. From the `mylocalton-docker` directory, start the core network service by running:

```sh
docker-compose up genesis
```

### Using the Persistent Node

Once your local node is running, you can instruct the tests to use it by setting the following environment variable:

```sh
export USE_EXISTING_TON_NODE="true"
```

> **Important:** When using a persistent node, the network state is **not** reset automatically between test runs. You might want to use different IDs for each contract you're testing to avoid conflicts.

### Resetting the Network

To completely reset the local network and remove all persistent data, run the following command:

```sh
docker-compose down -v --rmi all
```
