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
    // console.log('request', request, peer);
    const requestStr = request.toString();
    const jsonRequest = JSON.parse(requestStr);
    // console.log('json request', jsonRequest);
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
                // console.log('received member list', receivedMemberList);
                break;
            }
            case 'message':
            {
                console.log('gossip triggers port');
                console.log('notAvailablePorts = ', port);
                sendMessageOtherPeers(port);

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
                // console.log('root request add', response && response.toString());
            }
        );
        rootConnection.request(
            bufFormat({
                cmd: 'fetch'
            }),
            rootPeer,
            (e, r) => {
                // const jsonResponse = JSON.parse(r.toString());
                if (jsonResponse.cmd === 'list')
                    receivedMemberList = jsonResponse.ports;
            }
        );
    }, 1000 * 3);


    setInterval(() => {
        // console.log('member list', receivedMemberList);
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

            console.log('port which triggers gossip');

            socketListener.request(
                bufFormat({
                    cmd: 'message',
                    port: rootPort
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



// 1 2 3 4
// 1 - 2 3 4
// 2 - 1 3 4 (in real life if empty ports)
// 3 - 1 2 4 (empty)
// 4 - 1 2 3 (empty)

function calculatePeers(port, offset = 3) {

    if (port === rootPort) {
        return [];
    }

    let ports = Object.keys(receivedMemberList);
    if (offset >= ports.length) {
        offset = ports.length - 1;
    }
    let index = ports.indexOf(port);
    let rightList = ports.slice(index + 1, offset);
    let leftList = [];
    if (rightList.length < offset) {
        let diff = offset - rightList.length;
        leftList.push(ports.slice(index - diff, diff));
    }
    return [].concat(leftList, rightList);
}


function findAvailablePorts(prevPort) {
    let prevPorts = calculatePeers(prevPort).join(prevPort);
    let curPorts = calculatePeers(port);
    let resultPorts = curPorts.reduce((resPorts, port) => {
        if (prevPorts.findIndex((el) => el === port)) {
            return resPorts;
        }
        resPorts.push(port);
        return resPorts;
    }, []);
    return resultPorts;
}


function sendMessageOtherPeers(prevPort) {
    const ports = findAvailablePorts(prevPort);

    for (let gossipPort of ports) {
        let peer = {
            port: gossipPort,
            host: 'localhost'
        };

        socketListener.request(
            bufFormat({
                cmd: 'message',
                prevPort: port // send curPort to the next peers
            }),
            peer,
            (error, response, peer) => {
                console.log('send message from peer = ', response && response.toString());
            }
        );
    }
}


function gossipAlgorithm(prevPort, offset = 3) {
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

    console.log('localPorts = ', localPorts);

    for (let gossipPort of localPorts) {

        let peer = {
            port: gossipPort,
            host: 'localhost'
        };

        socketListener.request(
            bufFormat({
                cmd: 'message',
                notAvailablePorts: notAvailableNodes
            }),
            peer,
            (error, response, peer) => {
                console.log('send message from peer = ', response && response.toString());
            }
        );
    }
};