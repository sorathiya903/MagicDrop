#!/usr/bin/env node

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const QRCode = require("qrcode");
const os = require("os");
const path = require("path");
const fs = require("fs");

const PORT = 8765;

const devices = new Map();
const transfers = new Map();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));


// =========================
// LOCAL IP
// =========================

function getLocalIP() {

    const interfaces = os.networkInterfaces();

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


// =========================
// SEND TO DEVICE
// =========================

function sendToDevice(id, data) {

    const device = devices.get(id);

    if (
        device &&
        device.ws.readyState === WebSocket.OPEN
    ) {

        device.ws.send(
            JSON.stringify(data)
        );

    }

}


// =========================
// BROADCAST DEVICES
// =========================

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

        if (
            device.ws.readyState ===
            WebSocket.OPEN
        ) {

            device.ws.send(
                JSON.stringify(message)
            );

        }

    }

}


// =========================
// WEBSOCKET
// =========================

wss.on("connection", ws => {

    console.log("New connection");


    ws.on("message", message => {

        let data;

        try {
            data = JSON.parse(message);
        } catch {
            return;
        }


        // =====================
        // JOIN
        // =====================

        if (data.type === "join") {

            const id =
                Math.random()
                    .toString(36)
                    .substring(2, 10);


            const device = {

                id,

                name:
                    data.name?.trim() ||
                    "Unknown",

                ws

            };


            devices.set(id, device);

            ws.deviceId = id;


            console.log(
                `Connected: ${device.name}`
            );


            ws.send(JSON.stringify({

                type: "joined",

                id,

                name: device.name

            }));


            broadcastDevices();

            return;
        }


        // =====================
        // TRANSFER REQUEST
        // =====================

        if (data.type === "transfer-request") {

            const sender =
                devices.get(ws.deviceId);

            if (!sender) return;


            const transferId =
                Math.random()
                    .toString(36)
                    .substring(2, 12);


            const transfer = {

                id: transferId,

                senderId: sender.id,

                senderName: sender.name,

                targets: data.targets || [],

                kind: data.kind,

                name: data.name || null,

                size: data.size || 0,

                mime: data.mime || null,

                text: data.text || null,

                accepted: new Set()

            };


            transfers.set(
                transferId,
                transfer
            );


            // Everyone
            if (data.targets?.includes("all")) {

                for (const device of devices.values()) {

                    if (device.id === sender.id)
                        continue;


                    sendToDevice(
                        device.id,
                        {
                            type: "incoming-transfer",

                            transferId,

                            senderId: sender.id,

                            senderName: sender.name,

                            kind: transfer.kind,

                            name: transfer.name,

                            size: transfer.size,

                            mime: transfer.mime,

                            text: transfer.text
                        }
                    );

                }

            }

            // Specific devices
            else {

                for (const targetId of data.targets) {

                    if (targetId === sender.id)
                        continue;


                    sendToDevice(
                        targetId,
                        {
                            type: "incoming-transfer",

                            transferId,

                            senderId: sender.id,

                            senderName: sender.name,

                            kind: transfer.kind,

                            name: transfer.name,

                            size: transfer.size,

                            mime: transfer.mime,

                            text: transfer.text
                        }
                    );

                }

            }

            return;
        }


        // =====================
        // ACCEPT
        // =====================

        if (data.type === "accept-transfer") {

            const transfer =
                transfers.get(data.transferId);

            if (!transfer)
                return;


            transfer.accepted.add(
                ws.deviceId
            );


            // TEXT
            if (transfer.kind === "text") {

                sendToDevice(
                    ws.deviceId,
                    {
                        type: "text-received",

                        transferId:
                            transfer.id,

                        senderName:
                            transfer.senderName,

                        text:
                            transfer.text
                    }
                );


                sendToDevice(
                    transfer.senderId,
                    {
                        type: "transfer-accepted",

                        transferId:
                            transfer.id,

                        receiverId:
                            ws.deviceId,

                        receiverName:
                            devices.get(ws.deviceId)
                                ?.name
                    }
                );

            }


            // FILE / IMAGE
            else {

                sendToDevice(
                    transfer.senderId,
                    {
                        type: "upload-approved",

                        transferId:
                            transfer.id,

                        receiverId:
                            ws.deviceId,

                        receiverName:
                            devices.get(ws.deviceId)
                                ?.name
                    }
                );

            }

            return;
        }


        // =====================
        // REJECT
        // =====================

        if (data.type === "reject-transfer") {

            const transfer =
                transfers.get(data.transferId);

            if (!transfer)
                return;


            sendToDevice(
                transfer.senderId,
                {
                    type: "transfer-rejected",

                    transferId:
                        transfer.id,

                    receiverName:
                        devices.get(ws.deviceId)
                            ?.name
                }
            );

            return;
        }

    });


    ws.on("close", () => {

        if (ws.deviceId) {

            console.log(
                `Disconnected: ${
                    devices.get(ws.deviceId)?.name
                }`
            );

            devices.delete(ws.deviceId);

            broadcastDevices();

        }

    });

});


// =========================
// START
// =========================

server.listen(
    PORT,
    "0.0.0.0",
    async () => {

        const ip = getLocalIP();

        const url =
            `http://${ip}:${PORT}`;


        console.log("");
        console.log("✨ MagicDrop");
        console.log("");
        console.log(
            `🌐 ${url}`
        );
        console.log("");


        try {

            const qr =
                await QRCode.toString(
                    url,
                    {
                        type: "terminal",
                        small: true
                    }
                );

            console.log(qr);

        } catch {

            console.log(
                "Could not generate QR code."
            );

        }

    });
