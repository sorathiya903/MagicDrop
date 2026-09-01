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

const DOWNLOAD_DIR =
    path.join(process.cwd(), "downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, {
        recursive: true
    });
}


// ==============================
// LOCAL IP
// ==============================
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


    transfer.receivedChunks.push(
        Buffer.from(buffer)
    );

    transfer.receivedBytes +=
        buffer.length;


    // =========================
    // SEND TO APPROVED CLIENTS
    // =========================

    for (
        const receiverId
        of transfer.accepted
    ) {

        // Host doesn't have WebSocket
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
                buffer
            );

        }

    }

}
function getLocalIP() {

    const interfaces =
        os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {

        for (const iface of interfaces[name]) {

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
function acceptTerminalTransfer(
    transferId
) {

    const transfer =
        transfers.get(transferId);

    if (!transfer) {

        console.log(
            "❌ Transfer not found."
        );

        return;
    }


    if (!transfer.targets.includes("terminal")) {

        console.log(
            "❌ This transfer is not for the host."
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
            "❌ Sender is no longer connected."
        );

        return;
    }


    sendJSON(sender.ws, {

        type:
            "transfer-accepted",

        transferId:
            transfer.id,

        receiverId:
            "terminal",

        receiverName:
            "MagicDrop Host"

    });


    // TEXT

    if (
        transfer.kind === "text"
    ) {

        console.log("");
        console.log("💬 Received text:");
        console.log("");

        console.log(
            transfer.text
        );

        console.log("");

        return;
    }


    // FILE

    transfer.hostReceiving = true;

    sendJSON(sender.ws, {

        type:
            "upload-approved",

        transferId:
            transfer.id,

        receiverId:
            "terminal",

        receiverName:
            "MagicDrop Host"

    });


    console.log(
        "📥 Waiting for file upload..."
    );

            }

function rejectTerminalTransfer(
    transferId
) {

    const transfer =
        transfers.get(transferId);

    if (!transfer) {

        console.log(
            "❌ Transfer not found."
        );

        return;
    }


    transfer.rejected.add(
        "terminal"
    );


    const sender =
        devices.get(
            transfer.senderId
        );


    if (sender) {

        sendJSON(sender.ws, {

            type:
                "transfer-rejected",

            transferId:
                transfer.id,

            receiverId:
                "terminal",

            receiverName:
                "MagicDrop Host"

        });

    }


    console.log(
        "❌ Transfer rejected."
    );

        }
function formatTerminalText(text) {

    if (!text)
        return "";

    if (text.length <= 500)
        return text;

    return (
        text.substring(0, 300) +
        "\n...\n" +
        text.substring(text.length - 150)
    );

        }
function handleTerminalIncoming(transfer) {

    console.log("");
    console.log("📥 Incoming Transfer");
    console.log("");
    console.log(
        `From: ${transfer.senderName}`
    );

    console.log(
        `Type: ${transfer.kind}`
    );

    if (transfer.kind === "text") {

        console.log(
            `Text: ${formatTerminalText(transfer.text)}`
        );

    } else {

        console.log(
            `File: ${transfer.name}`
        );

        console.log(
            `Size: ${formatSize(transfer.size)}`
        );

    }

    console.log("");

    console.log(
        `Transfer ID: ${transfer.id}`
    );

    console.log(
        "Accept? (y/n)"
    );

    transfer.terminalWaiting = true;

}

// ==============================
// SEND JSON
// ==============================

function sendJSON(ws, data) {

    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {
        ws.send(JSON.stringify(data));
    }

}


// ==============================
// BROADCAST DEVICES
// ==============================

function broadcastDevices() {

    const list =
        [...devices.values()].map(device => ({
            id: device.id,
            name: device.name
        }));

    const message = {
        type: "devices",
        devices: list
    };

    for (const device of devices.values()) {
        sendJSON(device.ws, message);
    }

}


// ==============================
// FIND DEVICE
// ==============================

function getDevice(id) {

    return devices.get(id);

}


// ==============================
// CREATE TRANSFER
// ==============================

function createTransfer(data, sender) {

    const transferId =
        Math.random()
            .toString(36)
            .substring(2, 12);

    const transfer = {

        id: transferId,

        senderId: sender.id,

        senderName: sender.name,

        targets: data.targets,

        kind: data.kind,

        name: data.name || null,

        size: data.size || 0,

        mime: data.mime || "",

        text: data.text || null,

        accepted: new Set(),

        rejected: new Set(),

        receivedChunks: [],

        receivedBytes: 0,

        terminalSource: false

    };

    transfers.set(
        transferId,
        transfer
    );

    return transfer;
}

function sendTransferRequest(
    transfer,
    targetId
) {

    // =========================
    // HOST / TERMINAL
    // =========================

    if (targetId === "terminal") {

        handleTerminalIncoming(transfer);

        return;
    }


    // =========================
    // NORMAL DEVICE
    // =========================

    const target =
        getDevice(targetId);

    if (!target)
        return;

    sendJSON(target.ws, {

        type: "incoming-transfer",

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

    });

    }

// ==============================
// TARGET LIST
// ==============================

function resolveTargets(targets) {

    if (
        targets.includes("all")
    ) {

        return [
            ...devices.keys()
        ];

    }

    return targets.filter(
        id => devices.has(id)
    );

}


// ==============================
// HANDLE TRANSFER REQUEST
// ==============================

function handleTransferRequest(
    ws,
    data
) {

    if (!ws.deviceId)
        return;

    const sender =
        devices.get(ws.deviceId);

    if (!sender)
        return;

    const targets =
        resolveTargets(
            data.targets || []
        )
        .filter(
            id =>
                id !== sender.id
        );

    if (!targets.length) {

        sendJSON(ws, {
            type: "error",
            message:
                "No valid recipients selected."
        });

        return;
    }


    const transfer =
        createTransfer(
            {
                ...data,
                targets
            },
            sender
        );


    for (const targetId of targets) {

        sendTransferRequest(
            transfer,
            targetId
        );

    }


    console.log(
        `Transfer request: ${sender.name} → ${targets.length} device(s)`
    );

}


// ==============================
// ACCEPT
// ==============================

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
        devices.get(ws.deviceId);

    if (!receiver)
        return;


    transfer.accepted.add(
        receiver.id
    );


    const sender =
        devices.get(
            transfer.senderId
        );


    if (sender) {

        sendJSON(sender.ws, {

            type:
                "transfer-accepted",

            transferId:
                transfer.id,

            receiverId:
                receiver.id,

            receiverName:
                receiver.name

        });

    }


    // Text can be delivered immediately.
    if (
        transfer.kind === "text"
    ) {

        sendJSON(
            receiver.ws,
            {

                type:
                    "text-received",

                senderName:
                    transfer.senderName,

                text:
                    transfer.text,

                transferId:
                    transfer.id

            }
        );

        return;
    }


    // Tell sender to begin binary upload.
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


// ==============================
// REJECT
// ==============================

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
        devices.get(ws.deviceId);

    if (!receiver)
        return;


    transfer.rejected.add(
        receiver.id
    );


    const sender =
        devices.get(
            transfer.senderId
        );


    if (sender) {

        sendJSON(sender.ws, {

            type:
                "transfer-rejected",

            transferId:
                transfer.id,

            receiverId:
                receiver.id,

            receiverName:
                receiver.name

        });

    }

}


// ==============================
// BINARY DATA
// ==============================

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


    transfer.receivedChunks.push(
        Buffer.from(buffer)
    );

    transfer.receivedBytes +=
        buffer.length;


    // Forward binary data to
    // every approved receiver.
    for (
        const receiverId
        of transfer.accepted
    ) {

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
                buffer
            );

        }

    }

}


// ==============================
// FINISH UPLOAD
// ==============================

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


    for (
        const receiverId
        of transfer.accepted
    ) {

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


    transfer.receivedChunks = [];

    transfer.receivedBytes = 0;

    ws.activeUpload = null;

}


// ==============================
// START SERVER
// ==============================

function startServer() {

    const app =
        express();

    const server =
        http.createServer(app);

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


    wss.on(
        "connection",
        ws => {

            console.log(
                "New device connected"
            );


            ws.on(
                "message",
                (message, isBinary) => {

                    // Binary upload
                    if (isBinary) {

                        handleBinary(
                            ws,
                            message
                        );

                        return;
                    }


                    let data;

                    try {

                        data =
                            JSON.parse(
                                message.toString()
                            );

                    } catch {

                        return;

                    }


                    // ======================
                    // JOIN
                    // ======================

                    if (
                        data.type ===
                        "join"
                    ) {

                        const id =
                            Math.random()
                                .toString(36)
                                .substring(
                                    2,
                                    10
                                );


                        const device = {

                            id,

                            name:
                                data.name ||
                                "Unknown",

                            ws

                        };


                        devices.set(
                            id,
                            device
                        );


                        ws.deviceId =
                            id;


                        console.log(
                            `Connected: ${device.name}`
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


                    // ======================
                    // TRANSFER REQUEST
                    // ======================

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


                    // ======================
                    // ACCEPT
                    // ======================

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


                    // ======================
                    // REJECT
                    // ======================

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


                    // ======================
                    // UPLOAD START
                    // ======================

                    if (
                        data.type ===
                        "upload-start"
                    ) {

                        const transfer =
                            transfers.get(
                                data.transferId
                            );

                        if (!transfer)
                            return;

                        ws.activeUpload =
                            data.transferId;

                        return;
                    }


                    // ======================
                    // UPLOAD FINISH
                    // ======================

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


            ws.on(
                "close",
                () => {

                    if (
                        ws.deviceId
                    ) {

                        devices.delete(
                            ws.deviceId
                        );

                        broadcastDevices();

                    }

                }
            );

        }
    );


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


// ==============================
// TERMINAL CLI
// ==============================

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
  send <file> --all
  send-text <text>
  send-text <text> --all
  help
  exit
`);


    rl.prompt();


    rl.on(
        "line",
        line => {

            const input =
                line.trim();


            if (!input)
                return rl.prompt();


            if (
                input === "devices"
            ) {

                if (!devices.size) {

                    console.log(
                        "No devices connected."
                    );

                } else {

                    for (
                        const device
                        of devices.values()
                    ) {

                        console.log(
                            `${device.id}  ${device.name}`
                        );

                    }

                }

            }


            else if (
                input === "help"
            ) {

                console.log(`
devices
send <file>
send <file> --all
send-text <text>
send-text <text> --all
exit
`);

            }


            else if (
                input === "exit"
            ) {

                process.exit(0);

            }


            else if (
                input.startsWith(
                    "send-text "
                )
            ) {

                sendTerminalText(
                    input.substring(
                        10
                    )
                );

            }


            else if (
                input.startsWith(
                    "send "
                )
            ) {

                sendTerminalFile(
                    input.substring(
                        5
                    )
                );

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


// ==============================
// TERMINAL TEXT
// ==============================

function sendTerminalText(
    command
) {

    const sendAll =
        command.endsWith(
            " --all"
        );


    const text =
        sendAll
            ? command.substring(
                0,
                command.length - 6
            )
            : command;


    if (!text.trim()) {

        console.log(
            "Text is empty."
        );

        return;
    }


    let targets;


    if (sendAll) {

        targets =
            [...devices.keys()];

    } else {

        targets =
            [...devices.keys()];

    }


    if (!targets.length) {

        console.log(
            "No devices connected."
        );

        return;
    }


    const transfer = {

        id:
            Math.random()
                .toString(36)
                .substring(
                    2,
                    12
                ),

        senderId:
            "terminal",

        senderName:
            "MagicDrop Host",

        kind:
            "text",

        text,

        size:
            Buffer.byteLength(
                text
            )

    };


    transfers.set(
        transfer.id,
        transfer
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
        `📤 Text sent for approval to ${targets.length} device(s).`
    );

}


// ==============================
// TERMINAL FILE
// ==============================

function sendTerminalFile(
    command
) {

    const sendAll =
        command.endsWith(
            " --all"
        );


    const filePath =
        sendAll
            ? command.substring(
                0,
                command.length - 6
            ).trim()
            : command.trim();


    if (
        !fs.existsSync(filePath)
    ) {

        console.log(
            "❌ File not found."
        );

        return;
    }


    const stat =
        fs.statSync(filePath);


    if (!stat.isFile()) {

        console.log(
            "❌ Not a file."
        );

        return;
    }


    const name =
        path.basename(filePath);


    const ext =
        path.extname(name)
            .toLowerCase();


    let mime =
        "application/octet-stream";


    if (
        [".jpg", ".jpeg"]
            .includes(ext)
    )
        mime = "image/jpeg";

    else if (
        ext === ".png"
    )
        mime = "image/png";

    else if (
        ext === ".gif"
    )
        mime = "image/gif";

    else if (
        ext === ".webp"
    )
        mime = "image/webp";

    else if (
        ext === ".pdf"
    )
        mime = "application/pdf";

    else if (
        ext === ".mp4"
    )
        mime = "video/mp4";


    const targets =
        [...devices.keys()];


    if (!targets.length) {

        console.log(
            "No devices connected."
        );

        return;
    }


    const transfer = {

        id:
            Math.random()
                .toString(36)
                .substring(
                    2,
                    12
                ),

        senderId:
            "terminal",

        senderName:
            "MagicDrop Host",

        kind:
            mime.startsWith("image/")
                ? "image"
                : "file",

        name,

        size:
            stat.size,

        mime,

        filePath,

        accepted:
            new Set(),

        rejected:
            new Set()

    };


    transfers.set(
        transfer.id,
        transfer
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
        `📤 ${name} waiting for approval.`
    );


    // Terminal file sending is completed
    // when the receiver approves it.
}


// ==============================
// START
// ==============================

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
