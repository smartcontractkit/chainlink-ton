# Chainlink TON - Smart Contracts - Benchmark

> [!NOTE]  
> The sandbox and blueprint framewroks specify different ways to benchmark gas consumption of tets but the documentation is not too good and there are some versions for which these methods are broken. This specific method works for versions 0.33.0 for ton/blueprint, 0.31.0 for ton/sandbox, and 29.7.0 for jest.

To capture metrics of the current implementation and store it as a snapshot locally, run:

```bash
BENCH_NEW="some snapshot label" npx jest
```

This will store a json file on the .snapshots directory.

To get a gas report which compares the highest gas cost for each operation obtained in the execution, run:

```bash
BENCH_DIFF=true npx jest
```

Note that the generated gas report is not extensive, as it only covers the highest gas cost for each method throughout the whole execution.




