#!/usr/bin/env node

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const QRCode = require("qrcode");
const os = require("os");
const path = require("path");
const fs = require("fs");
const readline = require("readline");

const PORT = 8765;

const devices = new Map();
const transfers = new Map();
const pendingTerminalTransfers = new Map();

const DOWNLOAD_DIR = path.join(
    process.cwd(),
    "downloads"
);

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, {
        recursive: true
    });
}


// ======================================================
// HELPERS
// ======================================================

function makeId(length = 10) {

    return Math.random()
        .toString(36)
        .substring(2, 2 + length);

}


function formatSize(bytes) {

    if (!bytes || bytes <= 0)
        return "0 B";

    const units = [
        "B",
        "KB",
        "MB",
        "GB",
        "TB"
    ];

    const index = Math.min(
        Math.floor(
            Math.log(bytes) / Math.log(1024)
        ),
        units.length - 1
    );

    const value =
        bytes /
        Math.pow(1024, index);

    return (
        value.toFixed(
            index === 0 ? 0 : 1
        ) +
        " " +
        units[index]
    );

}


function sendJSON(ws, data) {

    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {

        ws.send(
            JSON.stringify(data)
        );

    }

}


function getDevice(id) {

    return devices.get(id);

}


function getLocalIP() {

    const interfaces =
        os.networkInterfaces();

    for (
        const name of Object.keys(interfaces)
    ) {

        for (
            const iface of interfaces[name]
        ) {

            if (
                iface.family === "IPv4" &&
                !iface.internal
            ) {

                return iface.address;

            }

        }

    }

    return "localhost";

}


// ======================================================
// DEVICES
// ======================================================

function broadcastDevices() {

    const list = [

        {
            id: "terminal",
            name: "💻 MagicDrop Host"
        },

        ...[
            ...devices.values()
        ].map(device => ({
            id: device.id,
            name: device.name
        }))

    ];


    const message = {

        type: "devices",

        devices: list

    };


    for (
        const device of devices.values()
    ) {

        sendJSON(
            device.ws,
            message
        );

    }

}


// ======================================================
// TARGETS
// ======================================================

function resolveTargets(targets) {

    if (!Array.isArray(targets)) {
        return [];
    }


    if (targets.includes("all")) {

        return [
            "terminal",
            ...devices.keys()
        ];

    }


    return targets.filter(id => {

        return (
            id === "terminal" ||
            devices.has(id)
        );

    });

}


// ======================================================
// TRANSFER CREATION
// ======================================================

function createTransfer(
    data,
    senderId,
    senderName
) {

    const transfer = {

        id: makeId(10),
        localId: data.localId || null,


        senderId,

        senderName,

        targets: data.targets || [],

        kind: data.kind,

        name: data.name || null,

        size: data.size || 0,

        mime: data.mime || "",

        text:
            data.text !== undefined
                ? data.text
                : null,

        filePath:
            data.filePath || null,

        accepted: new Set(),

        rejected: new Set(),

        receivedChunks: [],

        receivedBytes: 0,

        terminalWaiting: false,

        createdAt: Date.now()

    };


    transfers.set(
        transfer.id,
        transfer
    );


    return transfer;

}


// ======================================================
// SEND TRANSFER REQUEST
// ======================================================

function sendTransferRequest(
    transfer,
    targetId
) {

    // --------------------------------------------------
    // HOST / TERMINAL
    // --------------------------------------------------

    if (targetId === "terminal") {

        askTerminalApproval(
            transfer
        );

        return;

    }


    // --------------------------------------------------
    // BROWSER DEVICE
    // --------------------------------------------------

    const target =
        getDevice(targetId);

    if (!target)
        return;


    sendJSON(
        target.ws,
        {

            type:
                "incoming-transfer",

            transferId:
                transfer.id,

            senderId:
                transfer.senderId,

            senderName:
                transfer.senderName,

            kind:
                transfer.kind,

            name:
                transfer.name,

            size:
                transfer.size,

            mime:
                transfer.mime,

            text:
                transfer.text

        }
    );

}


// ======================================================
// TERMINAL INCOMING REQUEST
// ======================================================

function askTerminalApproval(
    transfer
) {

    console.log("");
    console.log(
        "📥 Incoming Transfer"
    );
    console.log("");

    console.log(
        `From: ${transfer.senderName}`
    );

    console.log(
        `Type: ${transfer.kind}`
    );


    if (
        transfer.kind === "text"
    ) {

        console.log(
            `Text: ${formatTerminalText(
                transfer.text
            )}`
        );

    } else {

        console.log(
            `File: ${transfer.name}`
        );

        console.log(
            `Size: ${formatSize(
                transfer.size
            )}`
        );

    }


    console.log("");

    console.log(
        `Transfer ID: ${transfer.id}`
    );

    console.log(
        "Accept? (y/n)"
    );

    console.log("");


    pendingTerminalTransfers.set(
        transfer.id,
        transfer
    );


    transfer.terminalWaiting = true;

}


// ======================================================
// TERMINAL APPROVE / REJECT
// ======================================================

function getOldestPendingTerminalTransfer() {

    for (
        const transfer
        of pendingTerminalTransfers.values()
    ) {

        return transfer;

    }

    return null;

}


function terminalAccept(
    transferId
) {

    const transfer =
        transfers.get(
            transferId
        );


    if (!transfer) {

        console.log(
            "❌ Transfer not found."
        );

        return;

    }


    pendingTerminalTransfers.delete(
        transferId
    );


    transfer.terminalWaiting =
        false;


    acceptTerminalTransfer(
        transfer
    );

}


function terminalReject(
    transferId
) {

    const transfer =
        transfers.get(
            transferId
        );


    if (!transfer) {

        console.log(
            "❌ Transfer not found."
        );

        return;

    }


    pendingTerminalTransfers.delete(
        transferId
    );


    transfer.terminalWaiting =
        false;


    rejectTerminalTransfer(
        transfer
    );

}


// ======================================================
// HOST ACCEPT
// ======================================================

function acceptTerminalTransfer(
    transfer
) {

    if (
        !transfer.targets.includes(
            "terminal"
        )
    ) {

        console.log(
            "❌ This transfer was not sent to the host."
        );

        return;

    }


    transfer.accepted.add(
        "terminal"
    );


    const sender =
        devices.get(
            transfer.senderId
        );


    if (!sender) {

        console.log(
            "❌ Sender disconnected."
        );

        return;

    }


    // --------------------------------------------------
    // TEXT
    // --------------------------------------------------

    if (
        transfer.kind === "text"
    ) {

        sendJSON(
            sender.ws,
            {

                type:
                    "transfer-accepted",

                transferId:
                    transfer.id,

                receiverId:
                    "terminal",

                receiverName:
                    "MagicDrop Host"

            }
        );


        console.log("");
        console.log(
            "💬 Received text:"
        );
        console.log("");

        console.log(
            transfer.text
        );

        console.log("");

        return;

    }


    // --------------------------------------------------
    // FILE
    // --------------------------------------------------

    transfer.hostReceiving =
        true;


    sendJSON(
        sender.ws,
        {

            type:
                "upload-approved",

            transferId:
                transfer.id,

            receiverId:
                "terminal",

            receiverName:
                "MagicDrop Host"

        }
    );


    console.log(
        "📥 Waiting for file upload..."
    );

}


// ======================================================
// HOST REJECT
// ======================================================

function rejectTerminalTransfer(
    transfer
) {

    transfer.rejected.add(
        "terminal"
    );


    const sender =
        devices.get(
            transfer.senderId
        );


    if (sender) {

        sendJSON(
            sender.ws,
            {

                type:
                    "transfer-rejected",

                transferId:
                    transfer.id,

                receiverId:
                    "terminal",

                receiverName:
                    "MagicDrop Host"

            }
        );

    }


    console.log(
        `❌ Rejected: ${transfer.id}`
    );

}


// ======================================================
// BROWSER ACCEPT
// ======================================================

function acceptTransfer(
    ws,
    data
) {

    const transfer =
        transfers.get(
            data.transferId
        );


    if (!transfer)
        return;


    const receiver =
        devices.get(
            ws.deviceId
        );


    if (!receiver)
        return;


    // Make sure receiver was actually
    // a target of this transfer.

    if (
        !transfer.targets.includes(
            receiver.id
        )
    ) {

        return;

    }


    transfer.accepted.add(
        receiver.id
    );


    const sender =
        devices.get(
            transfer.senderId
        );


    // ==================================================
    // TERMINAL WAS SENDER
    // ==================================================

    if (
        transfer.senderId === "terminal"
    ) {

        if (
            transfer.kind === "text"
        ) {

            sendJSON(
                receiver.ws,
                {

                    type:
                        "text-received",

                    transferId:
                        transfer.id,
                    
    localId: transfer.localId,


                    senderName:
                        transfer.senderName,

                    text:
                        transfer.text

                }
            );

            return;

        }


        sendTerminalFileToReceiver(
            transfer,
            receiver.id
        );

        return;

    }


    // ==================================================
    // BROWSER WAS SENDER
    // ==================================================

    if (sender) {

        sendJSON(
            sender.ws,
            {

                type:
                    "transfer-accepted",

                transferId:
                    transfer.id,
                

                receiverId:
                    receiver.id,

                receiverName:
                    receiver.name

            }
        );

    }


    // ==================================================
    // TEXT
    // ==================================================

    if (
        transfer.kind === "text"
    ) {

        sendJSON(
            receiver.ws,
            {

                type:
                    "text-received",

                transferId:
                    transfer.id,

                senderName:
                    transfer.senderName,

                text:
                    transfer.text

            }
        );

        return;

    }


    // ==================================================
    // FILE
    // ==================================================

    if (sender) {

        sendJSON(
            sender.ws,
            {

                type:
                    "upload-approved",

                transferId:
                    transfer.id,

                receiverId:
                    receiver.id,

                receiverName:
                    receiver.name

            }
        );

    }

}


// ======================================================
// BROWSER REJECT
// ======================================================

function rejectTransfer(
    ws,
    data
) {

    const transfer =
        transfers.get(
            data.transferId
        );


    if (!transfer)
        return;


    const receiver =
        devices.get(
            ws.deviceId
        );


    if (!receiver)
        return;


    if (
        !transfer.targets.includes(
            receiver.id
        )
    ) {

        return;

    }


    transfer.rejected.add(
        receiver.id
    );


    const sender =
        devices.get(
            transfer.senderId
        );


    if (sender) {

        sendJSON(
            sender.ws,
            {

                type:
                    "transfer-rejected",

                transferId:
                    transfer.id,

                receiverId:
                    receiver.id,

                receiverName:
                    receiver.name

            }
        );

    }

}


// ======================================================
// TERMINAL → BROWSER FILE
// ======================================================

function sendTerminalFileToReceiver(
    transfer,
    receiverId
) {

    if (!transfer.filePath)
        return;


    const receiver =
        devices.get(
            receiverId
        );


    if (!receiver)
        return;


    console.log(
        `📤 Sending ${transfer.name} → ${receiver.name}`
    );


    sendJSON(
        receiver.ws,
        {

            type:
                "file-start",

            transferId:
                transfer.id,

            name:
                transfer.name,

            size:
                transfer.size,

            mime:
                transfer.mime,

            senderName:
                "MagicDrop Host"

        }
    );


    const stream =
        fs.createReadStream(
            transfer.filePath,
            {
                highWaterMark:
                    64 * 1024
            }
        );


    stream.on(
        "data",
        chunk => {

            if (
                receiver.ws.readyState !==
                WebSocket.OPEN
            ) {

                stream.destroy();

                return;

            }


            receiver.ws.send(
                chunk
            );

        }
    );


    stream.on(
        "end",
        () => {

            sendJSON(
                receiver.ws,
                {

                    type:
                        "file-complete",

                    transferId:
                        transfer.id,

                    name:
                        transfer.name,

                    size:
                        transfer.size,

                    mime:
                        transfer.mime,

                    senderName:
                        "MagicDrop Host"

                }
            );


            console.log(
                `✅ Sent ${transfer.name} → ${receiver.name}`
            );

        }
    );


    stream.on(
        "error",
        error => {

            console.log(
                `❌ File error: ${error.message}`
            );

        }
    );

}


// ======================================================
// BROWSER → BROWSER / HOST BINARY
// ======================================================

function handleBinary(
    ws,
    buffer
) {

    const transferId =
        ws.activeUpload;


    if (!transferId)
        return;


    const transfer =
        transfers.get(
            transferId
        );


    if (!transfer)
        return;


    const chunk =
        Buffer.from(buffer);


    transfer.receivedChunks.push(
        chunk
    );


    transfer.receivedBytes +=
        chunk.length;


    // --------------------------------------------------
    // FORWARD TO APPROVED BROWSER CLIENTS
    // --------------------------------------------------

    for (
        const receiverId
        of transfer.accepted
    ) {

        if (
            receiverId === "terminal"
        ) {

            continue;

        }


        const receiver =
            devices.get(
                receiverId
            );


        if (!receiver)
            continue;


        if (
            receiver.ws.readyState ===
            WebSocket.OPEN
        ) {

            receiver.ws.send(
                chunk
            );

        }

    }

}


// ======================================================
// FINISH BROWSER UPLOAD
// ======================================================

function finishUpload(
    ws,
    data
) {

    const transfer =
        transfers.get(
            data.transferId
        );


    if (!transfer)
        return;


    // --------------------------------------------------
    // SAVE TO HOST
    // --------------------------------------------------

    if (
        transfer.accepted.has(
            "terminal"
        ) &&
        transfer.receivedChunks.length
    ) {

        const safeName =
            path.basename(
                transfer.name ||
                "received-file"
            );


        let outputPath =
            path.join(
                DOWNLOAD_DIR,
                safeName
            );


        // Prevent overwriting
        // existing files.

        if (fs.existsSync(outputPath)) {

            const ext =
                path.extname(safeName);

            const base =
                path.basename(
                    safeName,
                    ext
                );


            outputPath =
                path.join(
                    DOWNLOAD_DIR,
                    `${base}-${Date.now()}${ext}`
                );

        }


        const fileBuffer =
            Buffer.concat(
                transfer.receivedChunks
            );


        fs.writeFileSync(
            outputPath,
            fileBuffer
        );


        console.log("");
        console.log(
            `📥 File received: ${path.basename(
                outputPath
            )}`
        );

        console.log(
            `📁 Saved to: ${outputPath}`
        );

        console.log("");

    }


    // --------------------------------------------------
    // TELL BROWSER RECEIVERS
    // --------------------------------------------------

    for (
        const receiverId
        of transfer.accepted
    ) {

        if (
            receiverId === "terminal"
        ) {

            continue;

        }


        const receiver =
            devices.get(
                receiverId
            );


        if (!receiver)
            continue;


        sendJSON(
            receiver.ws,
            {

                type:
                    "file-complete",

                transferId:
                    transfer.id,

                name:
                    transfer.name,

                size:
                    transfer.size,

                mime:
                    transfer.mime,

                senderName:
                    transfer.senderName

            }
        );

    }


    sendJSON(
        ws,
        {

            type:
                "upload-complete",

            transferId:
                transfer.id

        }
    );


    transfer.receivedChunks =
        [];

    transfer.receivedBytes =
        0;


    ws.activeUpload =
        null;

}


// ======================================================
// UPLOAD START
// ======================================================

function startUpload(
    ws,
    data
) {

    const transfer =
        transfers.get(
            data.transferId
        );


    if (!transfer)
        return;


    // Only original sender
    // can upload.

    if (
        transfer.senderId !==
        ws.deviceId
    ) {

        return;

    }


    // Sender must have at least
    // one approved receiver.

    if (
        transfer.accepted.size === 0
    ) {

        return;

    }


    ws.activeUpload =
        data.transferId;

}


// ======================================================
// HANDLE TRANSFER REQUEST
// ======================================================

function handleTransferRequest(
    ws,
    data
) {

    if (!ws.deviceId)
        return;


    const sender =
        devices.get(
            ws.deviceId
        );


    if (!sender)
        return;


    const targets =
        resolveTargets(
            data.targets
        )
        .filter(
            id =>
                id !== sender.id
        );


    if (!targets.length) {

        sendJSON(
            ws,
            {

                type:
                    "error",

                message:
                    "No valid recipients selected."

            }
        );

        return;

    }


    const transfer =
        createTransfer(
            {
                ...data,
                targets
            },
            sender.id,
            sender.name
        );


    for (
        const targetId
        of targets
    ) {

        sendTransferRequest(
            transfer,
            targetId
        );

    }


    console.log(
        `Transfer request: ${sender.name} → ${targets.length} device(s)`
    );

}


// ======================================================
// TERMINAL TEXT
// ======================================================

function sendTerminalText(
    command
) {

    let text =
        command.trim();


    let targets;


    if (
        text.endsWith(
            " --all"
        )
    ) {

        text =
            text.substring(
                0,
                text.length - 6
            ).trim();


        targets = [
            ...devices.keys()
        ];

    } else {

        // send-text hello <deviceId>

        const parts =
            text.split(/\s+/);


        const possibleId =
            parts[parts.length - 1];


        if (
            devices.has(
                possibleId
            )
        ) {

            targets = [
                possibleId
            ];


            parts.pop();

            text =
                parts.join(" ");

        } else {

            targets = [
                ...devices.keys()
            ];

        }

    }


    if (!text) {

        console.log(
            "❌ Text is empty."
        );

        return;

    }


    if (!targets.length) {

        console.log(
            "❌ No devices connected."
        );

        return;

    }


    const transfer =
        createTransfer(
            {
                targets,
                kind: "text",
                text,
                size:
                    Buffer.byteLength(
                        text
                    )
            },
            "terminal",
            "MagicDrop Host"
        );


    for (
        const targetId
        of targets
    ) {

        sendTransferRequest(
            transfer,
            targetId
        );

    }


    console.log(
        `📤 Text waiting for approval from ${targets.length} device(s).`
    );

}


// ======================================================
// MIME
// ======================================================

function getMimeType(
    filePath
) {

    const ext =
        path.extname(
            filePath
        ).toLowerCase();


    const types = {

        ".jpg":
            "image/jpeg",

        ".jpeg":
            "image/jpeg",

        ".png":
            "image/png",

        ".gif":
            "image/gif",

        ".webp":
            "image/webp",

        ".bmp":
            "image/bmp",

        ".svg":
            "image/svg+xml",

        ".pdf":
            "application/pdf",

        ".mp4":
            "video/mp4",

        ".webm":
            "video/webm",

        ".mkv":
            "video/x-matroska",

        ".mp3":
            "audio/mpeg",

        ".wav":
            "audio/wav",

        ".zip":
            "application/zip",

        ".json":
            "application/json",

        ".txt":
            "text/plain",

        ".html":
            "text/html",

        ".css":
            "text/css",

        ".js":
            "text/javascript"

    };


    return (
        types[ext] ||
        "application/octet-stream"
    );

}


// ======================================================
// TERMINAL FILE
// ======================================================

function sendTerminalFile(
    command
) {

    let filePath =
        command.trim();


    let targets;


    // -----------------------------------------------
    // --all
    // -----------------------------------------------

    if (
        filePath.endsWith(
            " --all"
        )
    ) {

        filePath =
            filePath.substring(
                0,
                filePath.length - 6
            ).trim();


        targets = [
            ...devices.keys()
        ];

    } else {

        // -------------------------------------------
        // send file deviceId
        // -------------------------------------------

        const parts =
            filePath.split(/\s+/);


        const possibleId =
            parts[parts.length - 1];


        if (
            devices.has(
                possibleId
            )
        ) {

            targets = [
                possibleId
            ];


            parts.pop();


            filePath =
                parts.join(" ");

        } else {

            targets = [
                ...devices.keys()
            ];

        }

    }


    // Remove quotes around path.

    if (
        (
            filePath.startsWith('"') &&
            filePath.endsWith('"')
        ) ||
        (
            filePath.startsWith("'") &&
            filePath.endsWith("'")
        )
    ) {

        filePath =
            filePath.substring(
                1,
                filePath.length - 1
            );

    }


    if (
        !fs.existsSync(
            filePath
        )
    ) {

        console.log(
            "❌ File not found."
        );

        return;

    }


    const stat =
        fs.statSync(
            filePath
        );


    if (!stat.isFile()) {

        console.log(
            "❌ Not a file."
        );

        return;

    }


    if (!targets.length) {

        console.log(
            "❌ No devices connected."
        );

        return;

    }


    const name =
        path.basename(
            filePath
        );


    const mime =
        getMimeType(
            filePath
        );


    const transfer =
        createTransfer(
            {

                targets,

                kind:
                    mime.startsWith(
                        "image/"
                    )
                        ? "image"
                        : "file",

                name,

                size:
                    stat.size,

                mime,

                filePath

            },
            "terminal",
            "MagicDrop Host"
        );


    for (
        const targetId
        of targets
    ) {

        sendTransferRequest(
            transfer,
            targetId
        );

    }


    console.log(
        `📤 ${name} waiting for approval from ${targets.length} device(s).`
    );

}


// ======================================================
// TERMINAL TEXT PREVIEW
// ======================================================

function formatTerminalText(
    text
) {

    if (!text)
        return "";


    if (
        text.length <= 500
    ) {

        return text;

    }


    return (

        text.substring(
            0,
            300
        )

        +

        "\n...\n"

        +

        text.substring(
            text.length - 150
        )

    );

}


// ======================================================
// CLI
// ======================================================

function startCLI() {

    const rl =
        readline.createInterface({

            input:
                process.stdin,

            output:
                process.stdout,

            prompt:
                "md> "

        });


    console.log(`
Commands:

  devices
  send <file>
  send <file> <deviceId>
  send <file> --all

  send-text <text>
  send-text <text> <deviceId>
  send-text <text> --all

  accept <transferId>
  reject <transferId>

  y
  n

  help
  exit
`);


    rl.prompt();


    rl.on(
        "line",
        line => {

            const input =
                line.trim();


            // ==================================================
            // Y / N
            // ==================================================

            if (
                input.toLowerCase() === "y"
            ) {

                const transfer =
                    getOldestPendingTerminalTransfer();


                if (!transfer) {

                    console.log(
                        "No pending transfer."
                    );

                } else {

                    terminalAccept(
                        transfer.id
                    );

                }


                rl.prompt();

                return;

            }


            if (
                input.toLowerCase() === "n"
            ) {

                const transfer =
                    getOldestPendingTerminalTransfer();


                if (!transfer) {

                    console.log(
                        "No pending transfer."
                    );

                } else {

                    terminalReject(
                        transfer.id
                    );

                }


                rl.prompt();

                return;

            }


            if (!input) {

                rl.prompt();

                return;

            }


            // ==================================================
            // DEVICES
            // ==================================================

            if (
                input === "devices"
            ) {

                if (!devices.size) {

                    console.log(
                        "No devices connected."
                    );

                } else {

                    console.log("");

                    for (
                        const device
                        of devices.values()
                    ) {

                        console.log(
                            `${device.id}  ${device.name}`
                        );

                    }

                    console.log("");

                }

            }


            // ==================================================
            // ACCEPT ID
            // ==================================================

            else if (
                input.startsWith(
                    "accept "
                )
            ) {

                const id =
                    input
                        .substring(7)
                        .trim();


                terminalAccept(
                    id
                );

            }


            // ==================================================
            // REJECT ID
            // ==================================================

            else if (
                input.startsWith(
                    "reject "
                )
            ) {

                const id =
                    input
                        .substring(7)
                        .trim();


                terminalReject(
                    id
                );

            }


            // ==================================================
            // SEND TEXT
            // ==================================================

            else if (
                input.startsWith(
                    "send-text "
                )
            ) {

                sendTerminalText(
                    input.substring(10)
                );

            }


            // ==================================================
            // SEND FILE
            // ==================================================

            else if (
                input.startsWith(
                    "send "
                )
            ) {

                sendTerminalFile(
                    input.substring(5)
                );

            }


            // ==================================================
            // HELP
            // ==================================================

            else if (
                input === "help"
            ) {

                console.log(`
devices

send <file>
send <file> <deviceId>
send <file> --all

send-text <text>
send-text <text> <deviceId>
send-text <text> --all

accept <transferId>
reject <transferId>

y
n

exit
`);

            }


            // ==================================================
            // EXIT
            // ==================================================

            else if (
                input === "exit"
            ) {

                process.exit(0);

            }


            else {

                console.log(
                    "Unknown command. Type help."
                );

            }


            rl.prompt();

        }
    );

}


// ======================================================
// SERVER
// ======================================================

function startServer() {

    const app =
        express();


    const server =
        http.createServer(
            app
        );


    const wss =
        new WebSocket.Server({
            server
        });


    app.use(
        express.static(
            path.join(
                __dirname,
                "public"
            )
        )
    );


    // ==================================================
    // WEBSOCKET
    // ==================================================

    wss.on(
        "connection",
        ws => {

            console.log(
                "New device connected"
            );


            ws.on(
                "message",
                (message, isBinary) => {

                    // ==========================================
                    // BINARY
                    // ==========================================

                    if (isBinary) {

                        handleBinary(
                            ws,
                            message
                        );

                        return;

                    }


                    // ==========================================
                    // JSON
                    // ==========================================

                    let data;


                    try {

                        data =
                            JSON.parse(
                                message.toString()
                            );

                    } catch {

                        return;

                    }


                    // ==========================================
                    // JOIN
                    // ==========================================

                    if (
                        data.type ===
                        "join"
                    ) {

                        const id =
                            makeId(8);


                        const device = {

                            id,

                            name:
                                String(
                                    data.name ||
                                    "Unknown"
                                ).substring(
                                    0,
                                    30
                                ),

                            ws

                        };


                        devices.set(
                            id,
                            device
                        );


                        ws.deviceId =
                            id;


                        console.log(
                            `Connected: ${device.name} (${id})`
                        );


                        sendJSON(
                            ws,
                            {

                                type:
                                    "joined",

                                id,

                                name:
                                    device.name

                            }
                        );


                        broadcastDevices();


                        return;

                    }


                    // ==========================================
                    // TRANSFER REQUEST
                    // ==========================================

                    if (
                        data.type ===
                        "transfer-request"
                    ) {

                        handleTransferRequest(
                            ws,
                            data
                        );

                        return;

                    }


                    // ==========================================
                    // ACCEPT
                    // ==========================================

                    if (
                        data.type ===
                        "accept-transfer"
                    ) {

                        acceptTransfer(
                            ws,
                            data
                        );

                        return;

                    }


                    // ==========================================
                    // REJECT
                    // ==========================================

                    if (
                        data.type ===
                        "reject-transfer"
                    ) {

                        rejectTransfer(
                            ws,
                            data
                        );

                        return;

                    }


                    // ==========================================
                    // UPLOAD START
                    // ==========================================

                    if (
                        data.type ===
                        "upload-start"
                    ) {

                        startUpload(
                            ws,
                            data
                        );

                        return;

                    }


                    // ==========================================
                    // UPLOAD FINISH
                    // ==========================================

                    if (
                        data.type ===
                        "upload-finish"
                    ) {

                        finishUpload(
                            ws,
                            data
                        );

                        return;

                    }

                }
            );


            // ==================================================
            // DISCONNECT
            // ==================================================

            ws.on(
                "close",
                () => {

                    if (
                        ws.deviceId
                    ) {

                        const device =
                            devices.get(
                                ws.deviceId
                            );


                        if (device) {

                            console.log(
                                `Disconnected: ${device.name}`
                            );

                        }


                        devices.delete(
                            ws.deviceId
                        );


                        broadcastDevices();

                    }

                }
            );

        }
    );


    // ==================================================
    // START
    // ==================================================

    server.listen(
        PORT,
        "0.0.0.0",
        async () => {

            const ip =
                getLocalIP();


            const url =
                `http://${ip}:${PORT}`;


            console.log("");

            console.log(
                "✨ MagicDrop"
            );

            console.log("");

            console.log(
                `🌐 ${url}`
            );

            console.log("");

            console.log(
                "📱 Scan the QR code or open the URL."
            );

            console.log("");


            try {

                const qr =
                    await QRCode.toString(
                        url,
                        {
                            type:
                                "terminal",
                            small:
                                true
                        }
                    );


                console.log(qr);

            } catch {

                console.log(
                    "Could not generate QR code."
                );

            }


            console.log(
                `📁 Downloads: ${DOWNLOAD_DIR}`
            );

            console.log("");


            startCLI();

        }
    );

}


// ======================================================
// ENTRY POINT
// ======================================================

const command =
    process.argv[2];


if (
    command === "start"
) {

    startServer();

} else {

    console.log(`
✨ MagicDrop

Usage:

  md start
`);

    }
