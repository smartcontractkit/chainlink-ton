# SendExecutor

This is  a contract that will be used by the OnRamp to store incoming CCIPSend messages. CCIPSend message will be persisted in a sharded map by deploying `SendExecutor` contracts. This will be used to recover the message information in two situations:

1. When we get a bounced.
2. When we lockOrBurn tokens (as we won't be passing the whole ccipSend msg to the Token Pool).

This contracts will be initialized with an owner (the OnRamp) and an id that must fit in a bounced message (224 bits). We can calculate its address with this information. This message id will be autoincremented on every message processed.

This contract will accept two messages:

1. `init{data}`: store the data cell. Returns `stored{storageID, data}`
2. `consume{context}`: destroys the contract, returning its TON balance and `consumed{storageID, data, context}`
