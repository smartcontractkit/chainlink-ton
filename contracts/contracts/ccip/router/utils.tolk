import "../../lib/deployable/namespace"
import "../accounts/deposit/types"

/// The Router's deposit account escrowing `token` sent by `user` for on-ramp transfers.
fun Router_onRampAccount(router: address, user: address, token: address, deployableCode: cell): AutoDeployAddress {
    return DepositAccount_calcAddress(deployableCode, DeployableNamespace_OnRampAccount, router, user, token);
}

/// The Router's deposit account receiving off-ramped `token` for `receiver`.
fun Router_offRampAccount(router: address, receiver: address, token: address, deployableCode: cell): AutoDeployAddress {
    return DepositAccount_calcAddress(deployableCode, DeployableNamespace_DepositAccount, router, receiver, token);
}
