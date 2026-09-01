#!/usr/bin/env node

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const QRCode = require("qrcode");
const os = require("os");
const path = require("path");
const readline = require("readline");

const PORT = 8765;

// Connected devices
const devices = new Map();


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


function startServer() {

    const app = express();

    const server = http.createServer(app);

    const wss = new WebSocket.Server({
        server
    });


    app.use(express.static(
        path.join(__dirname, "public")
    ));


    wss.on("connection", ws => {

        console.log("New device connected");

        ws.on("message", message => {

            let data;

            try {
                data = JSON.parse(message);
            } catch {
                return;
            }


            // Device joining
            if (data.type === "join") {

                const id =
                    Math.random()
                        .toString(36)
                        .substring(2, 10);


                const device = {
                    id,
                    name: data.name || "Unknown",
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
            }


            // More message types will be added here
            // later.
        });


        ws.on("close", () => {

            if (ws.deviceId) {

                devices.delete(ws.deviceId);

                broadcastDevices();
            }

        });

    });


    server.listen(PORT, "0.0.0.0", async () => {

        const ip = getLocalIP();

        const url =
            `http://${ip}:${PORT}`;


        console.log("");
        console.log("✨ MagicDrop");
        console.log("");
        console.log(`🌐 ${url}`);
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

        } catch (error) {

            console.log(
                "Could not generate QR code."
            );

        }

    });

}


function broadcastDevices() {

    const list =
        [...devices.values()].map(device => ({
            id: device.id,
            name: device.name
        }));


    const message =
        JSON.stringify({
            type: "devices",
            devices: list
        });


    for (const device of devices.values()) {

        if (device.ws.readyState === WebSocket.OPEN) {

            device.ws.send(message);
        }

    }

}


// -------------------------
// CLI
// -------------------------

const command =
    process.argv[2];


if (command === "start") {

    startServer();

} else {

    console.log(`
✨ MagicDrop

Usage:

  md start

Coming soon:

  md devices
  md send <file>
  md send <file> --all
`);

}
