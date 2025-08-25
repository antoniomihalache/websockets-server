const CONSTANTS = {
    HTTPS_PORT: process.env.PORT || 4430,
    ERRORS: ['uncaughtException', 'SIGINT', 'unhandledRejection'],
    METHOD: 'GET',
    VERSION: 13,
    CONNECTION: 'upgrade',
    UPGRADE: 'websocket',
    ALLOWED_ORIGINS: ['https://localhost:5500', 'https://127.0.0.1:5500', null],
    GUID: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',

    // Websocket rules
    MIN_FRAME_SIZE: 2,
    // websocket payload related constants
    SMALL_DATA_SIZE: 125,
    MEDIUM_DATA_SIZE: 65535,
    MEDIUM_DATA_FLAG: 126,
    LARGE_DATA_FLAG: 127,
    MEDIUM_SIZE_CONSPUTION: 2,
    LARGE_SIZE_CONSPUTION: 8,
    MASK_LENGTH: 4,
    // Websocket opcodes
    OPCODE_TEXT: 0x1,
    OPCODE_BINARY: 0x2,
    OPCODE_CLOSE: 0x8,
    OPCODE_PING: 0x9,
    OPCODE_PONG: 0xa
};

export default CONSTANTS;
