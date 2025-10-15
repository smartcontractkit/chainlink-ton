// Gas amounts for inter-contract calls
// Calculated from gas-report.json with 10% safety margin
//
// Formula: compute_gas * 400 nanotons/gas + forward_fee + 10%
// Forward fees based on TON Config Param #25 (bits/cells)
//
// TODO: not sure if this is the best place. consider moving this to dynamic config or separate management layer

// OffRamp operations
// Commit: 24,201 gas (9.68M nanotons) + forward 12.59M nanotons + 10% = 24.5M nanotons
const OFFRAMP_COMMIT = ton("0.025");
// Execute: 15,928 gas (6.37M nanotons) + forward 12.59M nanotons + 10% = 20.8M nanotons
const OFFRAMP_EXECUTE = ton("0.021");
// DispatchValidated: 8,649 gas (3.46M nanotons) + forward 12.59M nanotons + 10% = 17.7M nanotons
const OFFRAMP_DISPATCH_VALIDATED = ton("0.017");
// CCIPReceiveConfirm: 6,698 gas (2.68M nanotons) + forward 12.59M nanotons + 10% = 16.8M nanotons
const OFFRAMP_CCIP_RECEIVE_CONFIRM = ton("0.016");
// UpdatePrices: 6,698 gas (2.68M nanotons) + forward 12.59M nanotons + 10% = 16.8M nanotons
const OFFRAMP_UPDATE_PRICES = ton("0.016");
// MerkleRoot deployment: 250,323 gas (100.13M nanotons) + forward 1.92M nanotons + 10% = 112.3M nanotons
const MERKLEROOT_DEPLOYMENT = ton("0.112");
// MerkleRoot validate: 250,323 gas (100.13M nanotons) + forward 1.92M nanotons + 10% = 112.3M nanotons
const MERKLEROOT_VALIDATE = ton("0.112");

// Router operations
// Jetton transfer forward amount: must cover entire OnRamp→Executor flow
// = ONRAMP_EXECUTOR_DEPLOY + EXECUTOR_WITHDRAW_JETTONS + EXECUTOR_GET_VALIDATED_FEE + gas margins
// = 0.014 + 0.035 + 0.020 + ~0.016 = ~0.085
const ROUTER_JETTON_TRANSFER = ton("0.090");

// OnRamp operations
// Executor deploy: 2,935 gas (1.17M nanotons) + forward 11.47M nanotons + 10% = 13.9M nanotons
const ONRAMP_EXECUTOR_DEPLOY = ton("0.014");
// Jetton withdraw: must cover JettonWallet gas (~0.01) + forwardTonAmount (0.010) + margins = 0.03
const ONRAMP_JETTON_WITHDRAW = ton("0.030");
// Jetton forward: amount sent to executor with jetton transfer
const ONRAMP_JETTON_FORWARD = ton("0.010");

// Executor operations
// Executor → OnRamp.withdrawJettons: must cover ONRAMP_JETTON_WITHDRAW + OnRamp gas
const EXECUTOR_WITHDRAW_JETTONS = ton("0.035");
// Executor → FeeQuoter.getValidatedFEE
const EXECUTOR_GET_VALIDATED_FEE = ton("0.020");

// MerkleRoot operations
// Dispatch: 8,649 gas (3.46M nanotons) + forward 12.59M nanotons + 10% = 17.7M nanotons
const MERKLEROOT_DISPATCH = ton("0.017");

