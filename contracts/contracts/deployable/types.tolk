struct Deployable {
    owner: address;
    ty: uint16;
    id: cell;
}

struct Initialize {
    data: cell;
    code: cell;
}

const ERROR_NOT_OWNER: int = 0x1;

