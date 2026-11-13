import "../../lib/access/ownable_2step"

struct (0xb743059a) TokenAdminRegistry_Storage_V1_7_0 {
    id: uint32;
    ownable: Ownable2Step;
}

fun TokenAdminRegistry_Storage_V1_7_0.load(): TokenAdminRegistry_Storage_V1_7_0 {
    return TokenAdminRegistry_Storage_V1_7_0.fromCell(contract.getData());
}

fun TokenAdminRegistry_Storage_V1_7_0.store(self) {
    contract.setData(self.toCell());
}
