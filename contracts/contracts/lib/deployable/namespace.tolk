import "../../deployable/types"

const DeployableNamespace_CCIPSendExecutor: Namespace = 0;
const DeployableNamespace_ReceiveExecutor: Namespace = 1;
const DeployableNamespace_MerkleRoot: Namespace = 2;

fun Deployable<Namespaced<T>>.new(namespace: Namespace, owner: address, id: T): Cell<Deployable<Namespaced<T>>> {
    return Deployable<Namespaced<T>> {
        owner,
        id: Namespaced<T> {
            namespace,
            id,
        },
    }.toCell();
}

struct Namespaced<T> {
    namespace: Namespace;
    id: T;
}

type Namespace = uint32;
