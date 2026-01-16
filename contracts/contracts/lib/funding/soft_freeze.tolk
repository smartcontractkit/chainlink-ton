// -- Freeze protection against value leakage --
// This package serves to prevent contracts with leaky message handlers from
// draining. It ensures balance consumption remains limited to rent.


// getFacilityId(stringCrc32(com.chainlink.ton.lib.funding.SoftFreeze))
const SoftFreeze_FACILITY_ID = 70;
const SoftFreeze_ERROR_CODE = SoftFreeze_FACILITY_ID * 100;

enum SoftFreeze_Error {
    BelowOperationalBalance = SoftFreeze_ERROR_CODE; // only the owner may call this function when soft frozen.
}


// A soft freeze mechanism that restricts permissionless operations
// when the contract's balance falls below a defined threshold.
// Only the owner can perform operations when soft frozen.
struct SoftFreeze {
    // Allowed to bypass freeze checks
    owner: () -> address,
}

// Throws if balance is below threshold and sender is not owner.
@inline
fun SoftFreeze.requireOperationalBalance(self, sender: address, threshold: coins) {
    if (contract.getOriginalBalance() < threshold) {
        assert (sender == self.owner()) throw (SoftFreeze_Error.BelowOperationalBalance as int);
    };
}