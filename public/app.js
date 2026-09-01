const socket =
    new WebSocket(
        `ws://${location.host}`
    );


let myId = null;
let myName = null;

let selectedDevices = new Set();

let currentIncoming = null;


const joinScreen =
    document.getElementById("joinScreen");

const appScreen =
    document.getElementById("appScreen");

const deviceName =
    document.getElementById("deviceName");

const devicesContainer =
    document.getElementById("devices");

const textInput =
    document.getElementById("text");

const fileInput =
    document.getElementById("fileInput");

const transfers =
    document.getElementById("transfers");


// =========================
// JOIN
// =========================

document
    .getElementById("joinBtn")
    .addEventListener(
        "click",
        join
    );


function join() {

    const name =
        deviceName.value.trim() ||
        "Unknown";


    socket.send(JSON.stringify({

        type: "join",

        name

    }));

}


// =========================
// RECEIVE SERVER MESSAGE
// =========================

socket.addEventListener(
    "message",
    event => {

        const data =
            JSON.parse(event.data);


        // JOINED
        if (data.type === "joined") {

            myId = data.id;

            myName = data.name;


            joinScreen.hidden = true;

            appScreen.hidden = false;


            document
                .getElementById("myName")
                .textContent =
                    myName;

        }


        // DEVICES
        if (data.type === "devices") {

            showDevices(
                data.devices
            );

        }


        // INCOMING
        if (
            data.type ===
            "incoming-transfer"
        ) {

            showIncoming(data);

        }


        // ACCEPTED
        if (
            data.type ===
            "transfer-accepted"
        ) {

            addTransfer(

                `✅ Accepted by ${
                    data.receiverName
                }`

            );

        }


        // REJECTED
        if (
            data.type ===
            "transfer-rejected"
        ) {

            addTransfer(

                `❌ Rejected by ${
                    data.receiverName
                }`

            );

        }


        // TEXT RECEIVED
        if (
            data.type ===
            "text-received"
        ) {

            addTransfer(`

                💬 Text from
                <strong>
                    ${escapeHTML(
                        data.senderName
                    )}
                </strong>

                <div class="received-text">
                    ${escapeHTML(
                        data.text
                    )}
                </div>

            `);

        }


        // FILE UPLOAD APPROVED
        if (
            data.type ===
            "upload-approved"
        ) {

            addTransfer(

                `📤 ${
                    data.name ||
                    "File"
                } approved by ${
                    data.receiverName
                }`

            );

            // File upload will be
            // added in next step.

        }

    }
);


// =========================
// DEVICES
// =========================

function showDevices(devices) {

    devicesContainer.innerHTML = "";

    selectedDevices.clear();


    devices
        .filter(
            device =>
                device.id !== myId
        )
        .forEach(device => {

            const button =
                document.createElement(
                    "button"
                );


            button.textContent =
                `📱 ${device.name}`;


            button.onclick = () => {

                if (
                    selectedDevices.has(
                        device.id
                    )
                ) {

                    selectedDevices.delete(
                        device.id
                    );

                    button.classList.remove(
                        "selected"
                    );

                } else {

                    selectedDevices.add(
                        device.id
                    );

                    button.classList.add(
                        "selected"
                    );

                }

            };


            devicesContainer
                .appendChild(button);

        });


    // EVERYONE

    const all =
        document.createElement(
            "button"
        );


    all.textContent =
        "🚀 Everyone";


    all.onclick = () => {

        selectedDevices.clear();

        selectedDevices.add("all");


        document
            .querySelectorAll(
                "#devices button"
            )
            .forEach(
                btn =>
                    btn.classList.remove(
                        "selected"
                    )
            );

        all.classList.add(
            "selected"
        );

    };


    devicesContainer
        .appendChild(all);

}


// =========================
// GET TARGETS
// =========================

function getTargets() {

    return [
        ...selectedDevices
    ];

}


// =========================
// SEND TEXT
// =========================

document
    .getElementById("sendText")
    .addEventListener(
        "click",
        sendText
    );


function sendText() {

    const text =
        textInput.value;


    if (!text.trim()) {

        alert(
            "Write something first."
        );

        return;
    }


    const targets =
        getTargets();


    if (!targets.length) {

        alert(
            "Select a device first."
        );

        return;
    }


    socket.send(JSON.stringify({

        type:
            "transfer-request",

        targets,

        kind:
            "text",

        text,

        size:
            new Blob([text]).size

    }));


    addTransfer(
        "📤 Text sent for approval"
    );


    textInput.value = "";

}


// =========================
// SEND FILE
// =========================

document
    .getElementById("sendFile")
    .addEventListener(
        "click",
        sendFiles
    );


function sendFiles() {

    const files =
        [...fileInput.files];


    if (!files.length) {

        alert(
            "Select a file first."
        );

        return;
    }


    const targets =
        getTargets();


    if (!targets.length) {

        alert(
            "Select a device first."
        );

        return;
    }


    files.forEach(file => {

        socket.send(
            JSON.stringify({

                type:
                    "transfer-request",

                targets,

                kind:
                    file.type.startsWith(
                        "image/"
                    )
                        ? "image"
                        : "file",

                name:
                    file.name,

                size:
                    file.size,

                mime:
                    file.type

            })
        );

    });


    addTransfer(
        `📤 ${files.length} file(s) sent for approval`
    );


    fileInput.value = "";

}


// =========================
// INCOMING
// =========================

function showIncoming(data) {

    currentIncoming =
        data;


    document
        .getElementById(
            "incomingSender"
        )
        .textContent =
            data.senderName;


    const preview =
        document.getElementById(
            "incomingPreview"
        );


    if (data.kind === "text") {

        preview.innerHTML = `

            <div class="incoming-text">

                ${formatTextPreview(
                    data.text
                )}

            </div>

            <small>
                ${
                    data.size
                } bytes
            </small>

        `;

    }

    else if (
        data.kind === "image"
    ) {

        preview.innerHTML = `

            <div>
                🖼️
                <strong>
                    ${escapeHTML(
                        data.name
                    )}
                </strong>
            </div>

            <small>
                ${formatBytes(
                    data.size
                )}
            </small>

        `;

    }

    else {

        preview.innerHTML = `

            <div>
                📦
                <strong>
                    ${escapeHTML(
                        data.name
                    )}
                </strong>
            </div>

            <small>
                ${formatBytes(
                    data.size
                )}
            </small>

        `;

    }


    document
        .getElementById(
            "incomingModal"
        )
        .hidden = false;

}


// =========================
// ACCEPT
// =========================

document
    .getElementById("acceptBtn")
    .addEventListener(
        "click",
        () => {

            if (!currentIncoming)
                return;


            socket.send(
                JSON.stringify({

                    type:
                        "accept-transfer",

                    transferId:
                        currentIncoming
                            .transferId

                })
            );


            addTransfer(
                "✅ Transfer accepted"
            );


            closeIncoming();

        }
    );


// =========================
// REJECT
// =========================

document
    .getElementById("rejectBtn")
    .addEventListener(
        "click",
        () => {

            if (!currentIncoming)
                return;


            socket.send(
                JSON.stringify({

                    type:
                        "reject-transfer",

                    transferId:
                        currentIncoming
                            .transferId

                })
            );


            addTransfer(
                "❌ Transfer rejected"
            );


            closeIncoming();

        }
    );


// =========================
// CLOSE
// =========================

function closeIncoming() {

    currentIncoming = null;


    document
        .getElementById(
            "incomingModal"
        )
        .hidden = true;

}


// =========================
// TRANSFER LOG
// =========================

function addTransfer(html) {

    const item =
        document.createElement(
            "div"
        );


    item.className =
        "transfer";


    item.innerHTML =
        html;


    transfers.prepend(
        item
    );

}


// =========================
// LONG TEXT PREVIEW
// =========================

function formatTextPreview(text) {

    if (text.length <= 600) {

        return escapeHTML(text);

    }


    const start =
        text.substring(
            0,
            350
        );


    const end =
        text.substring(
            text.length - 200
        );


    return `

        <div>
            <strong>Starting...</strong>
        </div>

        <pre>
${escapeHTML(start)}
        </pre>

        <div>
            ...
        </div>

        <div>
            <strong>Ending...</strong>
        </div>

        <pre>
${escapeHTML(end)}
        </pre>

    `;

}


// =========================
// HELPERS
// =========================

function escapeHTML(text) {

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        text;

    return div.innerHTML;

}


function formatBytes(bytes) {

    if (!bytes)
        return "0 B";


    const units =
        [
            "B",
            "KB",
            "MB",
            "GB"
        ];


    const index =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );


    return (
        bytes /
        Math.pow(
            1024,
            index
        )
    ).toFixed(1)
    + " "
    + units[index];

            }
