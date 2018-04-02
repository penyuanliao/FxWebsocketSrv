const net = require("net");
const util = require("util");
const EventEmitter = require("events");
const FxBufferPool = require("./FxBufferPool.js");
const log = require("fxNodeRtmp").RTMP.AMFLOG;
const amfUtils = require("fxNodeRtmp").amfUtils;
const Crypto = require("crypto");

const SHA256 = 32;
const RTMP_SIG_SIZE = 1536;
const MESSAGE_FORMAT_0 = 0;
const MESSAGE_FORMAT_1 = 1;
const MESSAGE_FORMAT_2 = 2;
const RandomCrud = new Buffer([
    0xf0, 0xee, 0xc2, 0x4a, 0x80, 0x68, 0xbe, 0xe8,
    0x2e, 0x00, 0xd0, 0xd1, 0x02, 0x9e, 0x7e, 0x57,
    0x6e, 0xec, 0x5d, 0x2d, 0x29, 0x80, 0x6f, 0xab,
    0x93, 0xb8, 0xe6, 0x36, 0xcf, 0xeb, 0x31, 0xae
]);
var GenuineFMSConst = "Genuine Adobe Flash Media Server 001";
var GenuineFMSConstCrud = Buffer.concat([new Buffer(GenuineFMSConst, "utf8"), RandomCrud]);

var GenuineFPConst = "Genuine Adobe Flash Player 001";
var GenuineFPConstCrud = Buffer.concat([new Buffer(GenuineFPConst, "utf8"), RandomCrud]);


util.inherits(NodeMediaServer, EventEmitter);

function NodeMediaServer() {
    EventEmitter.call(this);

    this.hasStarting = false;

    this.buf = undefined;
    this.readStream = new FxBufferPool();

    this.readStream.push(new Buffer([1]));
    this.readStream.push(new Buffer([2,3,4,5]));
    console.log(this.readStream.read(5));
    this.readStream.push(new Buffer([2,3,4,5]));


    this.server = this.createServer();
}
NodeMediaServer.prototype.createServer = function () {
    var server = net.createServer(this.onConnection.bind(this));
    server.listen({port:1935}, function () {
        console.log('listen');
    });
    return server;
};
NodeMediaServer.prototype.onConnection = function (socket) {
    console.log('onconnection');
    var self = this;
    socket.hsState = [false, false];
    var handshakeHandle = function handshakeHandle(chunk) {
        console.log("onData:",chunk.length);
        self.readStream.push(chunk);
        if (!socket.hsState[0]) {
            socket.hsState[0] = self.C0C1Handshake(self.readStream, socket);
        } else if (!socket.hsState[1]) {
            socket.hsState[1] = self.C2Handshake(self.readStream, socket);
        }
        if (socket.hsState[0] == true && socket.hsState[1] == true) {
            socket.removeListener("data", handshakeHandle);
            socket.on("data", messageHandle);
            if (self.readStream.bufLen !== 0) {
                self.parseRTMPMessage(self.readStream, socket);
            }
        }
    };
    var messageHandle = function messageHandle(chunk) {
        self.readStream.push(chunk);
    };
    socket.on("data", handshakeHandle);

};

NodeMediaServer.prototype.C0C1Handshake = function (stream, socket) {
    var buf = stream.read(1537);
    if (!buf || buf == null) {
        return false;
    }
    console.log("rtmp handshake [start]");
    var C0C1   = buf;
    var type   = C0C1.slice(0, 1);
    var other  = C0C1.slice(1, C0C1.length);
    var messageFormat = this.generateS0S1S2(other);
    var output;

    if (messageFormat == MESSAGE_FORMAT_0) {
        output = Buffer.concat([type, C0C1, C0C1])
    } else {
        // output = Buffer.concat([type, generateS1(messageFormat), generateS2(messageFormat, other)]);
    }
    socket.write(output);
    return true;
};
NodeMediaServer.prototype.C2Handshake = function (stream, socket) {
    var buf = stream.read(1536);
    if (!buf || buf == null) {
        return false;
    }
    console.log("rtmp handshake [done]");
    return true;

};
NodeMediaServer.prototype.parseRTMPMessage = function (stream, socket) {
    var message = {};
    var msgHeader = undefined;
    var prevChunk = null;
    var offset = 0;
    var basicHeader;
    var buf;
    if (stream.valid(1) == false) return;
    basicHeader = stream.read(1);
    message.fmt = basicHeader.readUInt8(0) >> 6;
    message.csid = basicHeader.readUInt8(0) && 0x3F;
    console.log('fmt:%s, csid:%s', message.fmt, message.csid);
    if (message.csid === 0) {
        if (stream.valid(1) == false) {
        }

    } else if (message.csid === 1) {

    }

};

NodeMediaServer.prototype.generateS0S1S2 = function (data) {
    var sdl    = getServerOffset(data.slice(772, 776));
    var msg    = Buffer.concat([data.slice(sdl + SHA256)], 1504);
    var csig   = createHmac(msg, GenuineFMSConst);
    var psig   = data.slice(sdl, sdl + SHA256);

    if (csig.equals(psig)) return MESSAGE_FORMAT_2;

    sdl = getClientOffset(data.slice(8, 12));
    msg = Buffer.concat([data.slice(0, sdl), data.slice(sdl + SHA256)], 1504);
    csig = createHmac(msg, GenuineFMSConst);
    psig   = data.slice(sdl, sdl + SHA256);

    if (csig.equals(psig)) return MESSAGE_FORMAT_1;

    return MESSAGE_FORMAT_0;

};
NodeMediaServer.prototype.generateS1 = function () {
    
};

function getServerOffset(buf) {
    var offset = buf[0] + buf[1] + buf[2] + buf[3];
    offset = (offset % 728) + 726;
    return offset;
}
function getClientOffset(buf) {
    var offset = buf[0] + buf[1] + buf[2] + buf[3];
    offset = (offset % 728) + 12;
    return offset;
}
function createHmac(data, key) {
    var hmac = Crypto.createHmac("sha256", key);
    hmac.update(data);
    return hmac.digest();
}


module.exports = exports = NodeMediaServer;

new NodeMediaServer();