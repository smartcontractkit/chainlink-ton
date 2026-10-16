import "../../lib/deployable/namespace"
import "../accounts/deposit/types"

fun onRampAccountAutodeployAddressForRouter(
    sender: address,
    token: address,
    router: address,
    deployableCode: cell,
): AutoDeployAddress {
    return calcAddressOfAccount(
        deployableCode,
        DeployableNamespace_OnRampAccount,
        router,
        sender,
        token,
    );
}
