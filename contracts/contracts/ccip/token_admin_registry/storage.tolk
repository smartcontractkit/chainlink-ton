import "../../lib/access/ownable_2step"
import "types"

struct TokenAdminRegistry_Storage {
    id: uint32;
    ownable: Ownable2Step;
    entryDeployment: TokenAdminRegistry_EntryDeployment;
}

fun TokenAdminRegistry_Storage.load(): TokenAdminRegistry_Storage {
    return TokenAdminRegistry_Storage.fromCell(contract.getData());
}

fun TokenAdminRegistry_Storage.store(self) {
    contract.setData(self.toCell());
}
