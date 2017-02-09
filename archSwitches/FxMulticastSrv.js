/**
 * Created by Benson.Liao on 2016/7/18.
 */

const net       = require('net');
const fs        = require('fs');
const shmop     = require('./fxshmop.js');
const shmkey    = 0x01000f00;

function FxMulticastSrv() {

    console.log('startup setupTCPMulticast');

    this.port = 10080;
    this.host = '127.0.0.1';
    this.connections = {};
    this.forks = undefined;
    this.info = undefined;
    this.shm = undefined;
    
    // this.initSHM();
    this.init();
}
FxMulticastSrv.setForks = function (forks) {
    this.forks = forks;
};
FxMulticastSrv.prototype.initSHM = function () {
    this.shm = new shmop(shmkey);
};
FxMulticastSrv.prototype.init = function () {

    var self = this;

    fs.readFile('./configfile/info.json','utf8',function (err, data) {
        var json = JSON.parse(data.toString('utf8'));
        self.info = json["videos"];
        self.setupChannel(json["videos"]);
    });
};


FxMulticastSrv.prototype.setupChannel = function (videos) {
    console.log('startup setupChannel:',videos.length);
    var self = this;

    for (var i = 0; i < videos.length; i++) {
        var namespace = videos[i];
        var sock = new net.Socket();
        sock.index = i;
        sock.namespace = namespace;
        sock.setMaxListeners(0);

        sock.on('connect', function () {
            console.log('connect ', this.namespace);
            clearInterval(this.repeated);

            sock.chunkBuf = undefined;

            this.write(this.namespace);

        });
        sock.on('data', function (chunk) {

            if (!sock.chunkBuf) {
                sock.chunkBuf = new Buffer(chunk);
            }else {
                sock.chunkBuf = Buffer.concat([sock.chunkBuf, chunk], sock.chunkBuf.length + chunk.length);
            }

            var pos = sock.chunkBuf.indexOf('\u0000');

            if (pos != -1) {
                var data = sock.chunkBuf.slice(0, pos);

                pos++;//含/0
                sock.chunkBuf = sock.chunkBuf.slice(pos, sock.chunkBuf.length);

                if (data.length <= 0) return;
                if (data[data.length - 1].toString('utf8') != '}') {
                    console.log('least string is :', data[data.length - 1].toString('utf8'));
                    return;
                }
                var json = JSON.parse(data.toString('utf8'));

                if (json.evt == "streamData") {
                    // self.sendStreamData({'evt': 'streamData', 'namespace': json.namespace, 'data': json.data});

                    for (var j = 0; j < fork.length; j++) {
                        var obj = data[j];
                        shm.writeSHM(sock.index, json.data);
                    }
                }
            };
        });
        sock.on('close', function () {
            sock.repeated = setInterval(function () {
                sock.connect(self.port, self.host);

            }, 10000);
        });
        sock.on('error', function (error) {
            sock.destroy();
        });

        sock.connect(this.port, this.host);
    }
};


module.exports = exports = FxMulticastSrv;

new FxMulticastSrv();