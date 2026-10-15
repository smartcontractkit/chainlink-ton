// SPDX-License-Identifier: MIT
import "types"

const DeployableNamespace_CCIPSendExecutor: Namespace = 0;
const DeployableNamespace_ReceiveExecutor: Namespace = 1;
const DeployableNamespace_MerkleRoot: Namespace = 2;
const DeployableNamespace_TokenRegistry: Namespace = 3;
const DeployableNamespace_OffRampAccount: Namespace = 4;
const DeployableNamespace_OnRampAccount: Namespace = 5;

struct Namespaced<T> {
    namespace: Namespace;
    id: T;
}

type Namespace = uint32;

struct NamespacedDeployableDataProps<T> {
    namespace: Namespace;
    owner: address;
    id: T;
}

fun NamespacedDeployableData<T>(props: NamespacedDeployableDataProps<T>): cell {
    return Deployable<Namespaced<T>> {
        owner: props.owner,
        id: Namespaced<T> {
            namespace: props.namespace,
            id: props.id,
        },
    }.toCell();
}

/// Address of a contract deployed through the Deployable pattern by `props.owner`.
fun NamespacedDeployableAddress<T>(deployableCode: cell, props: NamespacedDeployableDataProps<T>): AutoDeployAddress {
    return AutoDeployAddress {
        stateInit: ContractState {
            code: deployableCode,
            data: NamespacedDeployableData<T>(props),
        },
    };
}
