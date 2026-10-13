import "../../lib/deployable/namespace"
import "types"

/// The Router's deposit account escrowing `token` sent by `user` for on-ramp transfers.
fun Router_onRampAccount(router: address, user: address, token: address, deployableCode: cell): AutoDeployAddress {
    return NamespacedDeployableAddress<Router_DepositAccountID>(deployableCode, {
        namespace: DeployableNamespace_OnRampAccount,
        owner: router,
        id: Router_DepositAccountID { user, token },
    });
}

/// The Router's deposit account receiving off-ramped `token` for `receiver`.
fun Router_offRampAccount(router: address, receiver: address, token: address, deployableCode: cell): AutoDeployAddress {
    return NamespacedDeployableAddress<Router_DepositAccountID>(deployableCode, {
        namespace: DeployableNamespace_DepositAccount,
        owner: router,
        id: Router_DepositAccountID { user: receiver, token },
    });
}
