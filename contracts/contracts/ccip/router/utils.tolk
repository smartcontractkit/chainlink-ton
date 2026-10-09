import "../../lib/deployable/namespace"

fun onRampAccountAutodeployAddressForRouter(sender: address, router: address, deployableCode: cell): AutoDeployAddress {
    return AutoDeployAddress {
        stateInit: ContractState {
            code: deployableCode,
            data: NamespacedDeployableData<address>({
                namespace: DeployableNamespace_OnRampAccount,
                owner: router,
                id: sender,
            }),
        },
    };
}