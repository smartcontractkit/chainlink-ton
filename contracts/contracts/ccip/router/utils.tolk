import "../../lib/deployable/namespace"
import "types"

struct Router {}

/// The Router's deposit account escrowing `token` sent by `user` for on-ramp transfers.
fun Router.senderAccount(router: address, user: address, token: address, deployableCode: cell): AutoDeployAddress {
    return NamespacedDeployableAddress<Router_DepositAccountID>(deployableCode, {
        namespace: DeployableNamespace_SenderAccount,
        owner: router,
        id: Router_DepositAccountID { user, token },
    });
}

/// The Router's deposit account receiving off-ramped `token` for `receiver`.
fun Router.receiverAccount(router: address, receiver: address, token: address, deployableCode: cell): AutoDeployAddress {
    return NamespacedDeployableAddress<Router_DepositAccountID>(deployableCode, {
        namespace: DeployableNamespace_ReceiverAccount,
        owner: router,
        id: Router_DepositAccountID { user: receiver, token },
    });
}
