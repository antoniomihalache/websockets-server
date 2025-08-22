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
    MEDIUM_DATA_FLAG: 126,
    LARGE_DATA_FLAG: 127,
    MEDIUM_SIZE_CONSPUTION: 2,
    LARGE_SIZE_CONSPUTION: 8,
    MASK_LENGTH: 4
};

export default CONSTANTS;
