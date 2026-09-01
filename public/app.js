const socket =
    new WebSocket(
        `ws://${location.host}`
    );


let myId = null;
let myName = null;
let selectedDevice = null;


const joinScreen =
    document.getElementById("joinScreen");

const appScreen =
    document.getElementById("appScreen");

const deviceName =
    document.getElementById("deviceName");

const devicesContainer =
    document.getElementById("devices");


document
    .getElementById("joinBtn")
    .addEventListener("click", join);


function join() {

    const name =
        deviceName.value.trim() ||
        "Unknown";


    socket.send(JSON.stringify({
        type: "join",
        name
    }));

}


socket.addEventListener("message", event => {

    const data =
        JSON.parse(event.data);


    if (data.type === "joined") {

        myId = data.id;

        myName = data.name;


        joinScreen.hidden = true;

        appScreen.hidden = false;


        document
            .getElementById("myName")
            .textContent = myName;

    }


    if (data.type === "devices") {

        showDevices(data.devices);

    }

});


function showDevices(devices) {

    devicesContainer.innerHTML = "";


    devices
        .filter(device => device.id !== myId)
        .forEach(device => {

            const button =
                document.createElement("button");


            button.textContent =
                `📱 ${device.name}`;


            button.onclick = () => {

                selectedDevice =
                    device.id;


                document
                    .querySelectorAll(
                        "#devices button"
                    )
                    .forEach(btn =>
                        btn.classList.remove(
                            "selected"
                        )
                    );


                button.classList.add(
                    "selected"
                );

            };


            devicesContainer
                .appendChild(button);

        });


    const all =
        document.createElement("button");

    all.textContent =
        "🚀 Everyone";

    all.onclick = () => {

        selectedDevice = "all";

    };


    devicesContainer
        .appendChild(all);
}
