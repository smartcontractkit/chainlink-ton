## Running E2E Tests Locally

The E2E tests require a running PostgreSQL instance and that the `chainlink` repository is available.

**1. Start PostgreSQL (if not already running):**

   If you have Docker installed, you can start a PostgreSQL container with the required configuration using the following command:

   ```bash
   docker run --rm --name ccip-ton-e2e-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=chainlink_test -p 5432:5432 postgres:14