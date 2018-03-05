const program = require('commander');
const udp = require('udp-request');

program.version('0.0.0')
    .option('-p, --port <n>', 'Port', parseInt)
    .parse(process.argv);

const port = program.port || 3000;
const isRoot = !program.port;

const socketListener = udp();

const memberList = {};

const addExpires = 1000 * 60 * 5;
const addMember = (port) => {
    memberList[port] = Date.now() + addExpires;
};


const checkExpires = () => {
    const now = Date.now();
    for (let port in memberList) {
        if (memberList[port] < now)
            delete memberList[port];
    }
};

const sendMessage = () => {
    return 'test message';
};

setInterval(checkExpires, 1000);

const bufFormat = (json) => (new Buffer(JSON.stringify(json)));
let receivedMemberList = {};

socketListener.on('request', (request, peer) => {
    console.log('request', request, peer);
    const requestStr = request.toString();
    const jsonRequest = JSON.parse(requestStr);
    console.log('json request', jsonRequest);
    if (isRoot) {
        const {
            cmd,
            port
        } = jsonRequest;
        switch (cmd) {
            case 'add':
            {
                addMember(port);
                break;
            }
            case 'fetch':
            {
                socketListener.response(bufFormat({
                    cmd: 'list',
                    ports: memberList,
                }), peer);
                break;
            }

        }
    } else {
        switch (jsonRequest.cmd) {
            case 'list':
            {
                receivedMemberList = jsonRequest.ports;
                console.log('received member list', receivedMemberList);
                break;
            }
            case 'gossipPeers':
            {
                const { notAvailablePorts } = jsonRequest;

                gossipAlgorithm(notAvailablePorts);

                break;
            }
        }

    }
});

socketListener.listen(port);

const rootPort = 3000;

if (!isRoot) {
    const rootPeer = {
        port: rootPort,
        host: 'localhost'
    };
    const rootConnection = udp();
    setInterval(() => {
        rootConnection.request(
            bufFormat({
                cmd: 'add',
                port
            }),
            rootPeer,
            (error, response, peer) => {
                console.log('root request add', response && response.toString());
            }
        );
        rootConnection.request(
            bufFormat({
                cmd: 'fetch'
            }),
            rootPeer,
            (e, r) => {
                const jsonResponse = JSON.parse(r.toString());
                if (jsonResponse.cmd === 'list')
                    receivedMemberList = jsonResponse.ports;
            }
        );
    }, 1000 * 3);


    setInterval(() => {
        console.log('member list', receivedMemberList);
    }, 1000 * 1.5);

}
else {
    // this works as an entry point
    // ROOT initiates an algorythm

    setInterval(() => {
        // choose random port to move forward gossip algorithm
        let ports = Object.keys(receivedMemberList);
        if (ports.length > 0) {
            let rndPort = Math.floor(Math.random() * ports.length);
            // gossipAlgorithm(rndPort, ports);

            let peer = {
                port: ports[rndPort],
                host: 'localhost'
            };

            socketListener.request(
                bufFormat({
                    cmd: 'message',
                    notAvailablePorts: {}
                }),
                peer,
                (error, response, peer) => {
                    console.log('send message from root', response && response.toString());
                }
            );
        }
    }, 5000);
}



// 1 2 3 4
// --------
// 1 - > 2 3
// 2 -> 3 4
// 3 -> 4 1
// 4 -> 1 2

function gossipAlgorithm(notAvailableNodes = {}, offset = 3) {
    const processPort = port;
    let ports = Object.keys(receivedMemberList);

    let indexPort = ports.indexOf(processPort);
    let curIndex = indexPort + 1;
    let count = 0;
    let localPorts = [];
    do {
        if (curIndex > ports.length - 1) {
            curIndex = 0;
        }

        let curPort = ports[curIndex];

        if (!notAvailableNodes[curPort]) {
            notAvailableNodes[curPort] = true;
            localPorts.push(curPort);
            count++;
        }

        curIndex++;
    }
    while (count < offset || curIndex !== indexPort);

    for (let gossipPort of localPorts) {

        let peer = {
            port: gossipPort,
            host: 'localhost'
        };

        socketListener.request(
            bufFormat({
                cmd: 'message',
                port,
                notAvailablePorts: notAvailableNodes
            }),
            peer,
            (error, response, peer) => {
                console.log('root request add', response && response.toString());
            }
        );
    }
};