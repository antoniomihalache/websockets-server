import CONSTANTS from './websocket_constants.js';
import crypto from 'crypto';

function isOriginAllowed(origin) {
    return CONSTANTS.ALLOWED_ORIGINS.includes(origin);
}

function check(socket, upgradeHeaderCheck, connectionHeaderCheck, methodCheck, originCheck) {
    if (upgradeHeaderCheck && connectionHeaderCheck && methodCheck && originCheck) {
        return true;
    } else {
        const message = `400 bad request. the HTTP headers do not comply with the RFC6455 spec`;
        const messageLength = message.length;
        const response =
            `HTTP/1.1 400 Bad Request\r\n` +
            `Content-Type: text/plain\r\n` +
            `Content-Length: ${messageLength}\r\n` +
            `\r\n` +
            message;
        socket.write(response);
        socket.end(); // close the TCP connection and keep the server running
    }
}

// define server opening handshake headers function
function createUpgradeHeaders(clientKey) {
    // generate server acccept key
    let serverKey = generateServerKey(clientKey);
    const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${serverKey}`
    ];

    const upgradeHeaders = headers.join('\r\n') + '\r\n\r\n';
    return upgradeHeaders;
}

function generateServerKey(clientKey) {
    let data = clientKey + CONSTANTS.GUID;
    const hash = crypto.createHash('sha1');
    hash.update(data);
    // digest the data into base64
    return hash.digest('base64');
}

export default {
    isOriginAllowed,
    check,
    createUpgradeHeaders
};
