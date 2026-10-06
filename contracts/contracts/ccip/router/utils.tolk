import "../../lib/deployable/namespace"

fun _onRampAccountAddress(sender: address, token: address, router: address, deployableCode: cell): AutoDeployAddress {
    return AutoDeployAddress {
        stateInit: ContractState {
            code: deployableCode,
            data: NamespacedDeployableData<OnRampAccountID>({
                namespace: DeployableNamespace_OnRampAccount,
                owner: router,
                id: OnRampAccountID{
                    sender,
                    token,
                },
            }),
        },
    };
}

struct OnRampAccountID {
    sender: address,
    token: address,
}