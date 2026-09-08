import "../../lib/access/ownable_2step"

struct TokenAdminRegistry_Storage {
    id: uint32;
    ownable: Ownable2Step;
}

fun TokenAdminRegistry_Storage.load(): TokenAdminRegistry_Storage {
    return TokenAdminRegistry_Storage.fromCell(contract.getData());
}

fun TokenAdminRegistry_Storage.store(self) {
    contract.setData(self.toCell());
}
