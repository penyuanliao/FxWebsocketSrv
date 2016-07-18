/**
 * Created by Benson.Liao on 15/12/9.
 * --always-compact: always full gc().
 * --expose-gc: manual gc().
 */
const debug              = require('debug')('Node:StreamServer'); //debug
const path               = require('path');
const util               = require('util');
const fs                 = require('fs');
const dgram              = require('dgram'); // UDP
const fxNetSocket        = require('fxNetSocket');
const clusterConstructor = fxNetSocket.clusterConstructor;
const outputStream       = fxNetSocket.stdoutStream;
const parser             = fxNetSocket.parser;
const pheaders           = parser.headers;
const utilities          = fxNetSocket.utilities;
const daemon             = fxNetSocket.daemon;
const NSLog              = fxNetSocket.logger.getInstance();
var cfg = require('../config.js');
var IPSec;
var secPath = path.dirname(__dirname) + "/configfile/SecurityProfile.json";
fs.readFile(secPath, 'utf8', function (err, data) {
    if (err) throw err; // we'll not consider error handling for now
    IPSec = JSON.parse(data);
});
const owner = require('./socketOwner.js');
/** 建立連線 **/
const TCP = process.binding("tcp_wrap").TCP;
const uv = process.binding('uv');
const net = require('net');
const evt = require('events');
const proc = require('child_process');
// heartbeat wait time before failover triggered in a cluster.
const heartbeatInterval = 5000;
const heartbeatThreshold = 12;
const adminProtocol = 'admin';


/** 多執行緒 **/
var isWorker = ('NODE_CDID' in process.env);
var isMaster = (isWorker === false);

//roundrobin conut
var roundrobinCount = 0;

util.inherits(StreamServer,clusterConstructor);

function StreamServer() {
    // StreamServer.super_.call(this);
    this.name = "StreamServer";
    this.author = "Benson.liao";
    this.connections = 0; //連線數量
    this.initProcessEvent(); //初始化process事件
    /** 所有視訊stream物件 **/
    this.liveStreams = {};
    /** 心跳系統等待次數紀錄 **/
    this.doWaiting = [];
    this.server; // TCP server listen
    /** 子程序物件 **/
    this.clusters = [];
    /** 橋接層連線socket物件 **/
    this.streamSockets = [];
    /** 管理層socket物件 **/
    this.owners = [];
    /**開啟管理連線**/
    this.ownersEnabled = false;
    /** 廣播層還是橋接層 **/
    this.clusterEnable = false;
    // this.vp6fStream();
    /** 橋接層是否開啟網頁測試 **/
    cfg.httpEnabled = false;
    utilities.autoReleaseGC();
};
StreamServer.prototype.onMessage = function (data) {
    StreamServer.super_.prototype.onMessage.apply(this,[data]);
};
// ================================= //
//          FFMPEG STREAM            //
// ================================= //
StreamServer.prototype.createLiveStreams = function(fileName) {
    var self = this;
    var sn = fileName;
    var length = sn.length;
    var spawned, _name, i;
    NSLog.log('info','Init createLiveStreams');
    for (i = 0; i < length; i++) {
        // schema 2, domain 3, port 5, path 6,last path 7, file 8, querystring 9, hash 12
        _name = sn[i].toString().match(/^((rtmp[s]?):\/)?\/?([^:\/\s]+)(:([^\/]*))?((\/\w+)*\/)([\w\-\.]+[^#?\s]+)(\?([^#]*))?(#(.*))?$/i);
        if (typeof  _name[6] != 'undefined' && typeof _name[8] != 'undefined') {
            var pathname = _name[6] + _name[8];

            var high = (_name[8].indexOf('hd') != -1);
            var standard = (_name[8].indexOf('sd') != -1);
            var customParams = {
                fps:high ? 30 : 10,
                maxrate:( high ? "800k" : (standard ? "500k" : "300k") )
            };

            spawned = this.liveStreams[pathname] = new outputStream(sn[i],cfg.stream_proc, customParams);
            spawned.name = pathname;
            spawned.on('streamData', swpanedUpdate);
            spawned.on('close', swpanedClosed);
            this.streamHeartbeat(spawned);
            spawned = null;
        }else {
            throw Error("create Live Stream path error." + sn[i]);
        };
    };

    /** ffmpeg stream pull the data of a base64 **/

    function swpanedUpdate(base64, info) {
        self.doWaiting[this.ffmpeg_pid] = 0;
        var spawnName = this.name;
        self.emit('streamData', spawnName, base64, info);

    };
    /** ffmpeg stream close **/
    function swpanedClosed(code){

        //self.socketSend({'NetStatusEvent': 'NetConnect.Failed'}, this.name);

        //** 監聽到自動關閉,重新啟動 code == 0 **/
        if (1) {
            console.error("listen swpaned Closed - ",this.name, " < REBOOTING >");
            self.rebootStream(this,true);
        }

    };

};

/** 心跳檢查ffmpeg **/
StreamServer.prototype.streamHeartbeat = function(spawned) {
    var self = this;
    const waitTime = heartbeatInterval;
    const pid = spawned.ffmpeg_pid.toString();

    if (!pid) {console.error('Child_process create to failure!!!')}

    this.doWaiting[pid]= 0;
    function todo() {
        debug('stream(%s %s) Heartbeat wait count:%d', spawned.name, pid, self.doWaiting[pid]);

        if (self.doWaiting[pid] >= heartbeatThreshold) { // One minute
            //TODO pro kill -9 pid
            proc.exec("kill -9 " + pid);
            delete self.doWaiting[pid];
        }else {
            self.doWaiting[pid]++;
            spawned.lookout = setTimeout(todo, waitTime);
        }
    }
    spawned.lookout = setTimeout(todo,waitTime);
};

/** 重啟stream **/
StreamServer.prototype.rebootStream = function(spawned,skip) {
    if ((spawned.running == false && spawned.STATUS >= 2) || skip == true) {
        var streamName = spawned.name.toString();
        clearTimeout(spawned.lookout);
        this.liveStreams[streamName].init();
        this.streamHeartbeat(spawned);
        debug('>> rebootStream:', streamName, this.liveStreams[streamName].ffmpeg_pid);
    };
};
StreamServer.prototype.socketSend = function(handle, spawnName) {

    for (var i = 0; i < this.clusters.length; i++) {
        if (this.clusters[i]) {
            this.clusters[i][0].send({'handle':handle,'evt':'socketSend','spawnName':spawnName});
        }

    }

};

/**
 * 分流處理
 * @param namespace
 * @returns {undefined}
 */
StreamServer.prototype.assign = function(namespace, cb) {
    var worker = undefined;
    var num = 0;
    var self = this;
    if (!self.clusters) {
        return;
    }

// url_param
    if (cfg.balance === "url_param") {
        cfg.assignRule.asyncEach(function (item, resume) {
            if (item.constructor === String) {
                console.log('string:id:', item);
                if (namespace.search(item) != -1) {
                    if (typeof cb !== 'undefined') {
                        worker = self.clusters[num][0];
                        if (cb) cb(worker);
                        return;
                    }
                }
            }
            if (item.constructor === Array) {
                var rule,
                    i = 0,
                    cunt = item.length;
                while (i < cunt) {
                    rule = item[i++];

                    if (namespace.search(rule) != -1) {

                        worker = self.clusters[num][0];

                        // console.log('work -', num, self.clusters.length);

                        if (cb) cb(worker);
                        return;
                    }
                }
            }
            num++;
            resume();
        }, function () {
            if (!worker || typeof worker == 'undefined'){
                debug('ERROR::not found Worker Server:', namespace);
                if (cb) cb(worker);
            }else {
            }

        });
    }
    else if (cfg.balance === "roundrobin") {

        worker = this.clusters[roundrobinCount++][0];

        if (roundrobinCount >= this.clusters.length) {
            roundrobinCount = 0;
        }

        if (cb) cb(worker);
    }else if (cfg.balance === "leastconn") {
        var cluster = this.clusters[0][0];

        if (!cluster) {
            console.error('Error not found Cluster server');
            return;
        }

        var stremNum = cluster.length;
        for (var n = 0; n < stremNum; n++) {
            //檢查最小連線數
            if (cluster.nodeInfo.connections < clusters[n][0].nodeInfo.connections){
                cluster = clusters[n][0];
            }
        }
        if (cb) cb(cluster);
    } else {
        console.error('Error not found Cluster server');
        if (cb) cb(undefined);
    }
};

// ================================= //
//            TCP SERVER             //
// ================================= //
StreamServer.prototype.setupClusterServer2 = function (opt) {

    var self = this;

    var tcp = new fxNetSocket.fxTCP();

    tcp.createServer(opt);

    tcp.on('onRead', function (nread, buffer, handle) {

        handle.readStop();
        var remoteInfo = {};
        handle.getsockname(remoteInfo);

        debug('Client to use the %s request Connections.', handle.mode ,handle.namespace);

        if (handle.wsProtocol == adminProtocol && self.ownersEnabled) {
            self.initSocket(handle, buffer);
            return;
        }

        if(handle.mode == 'ws' || handle.mode == 'socket' || handle.mode == 'flashsocket') {

            if(handle.namespace.indexOf("policy-file-request") != -1 ) {
                NSLog.log('warning','Clients(%s:%s) not uninvited ... to close().', remoteInfo.address, remoteInfo.port);
                handle.close();
                tcp.handleRelease(handle);
                return;
            }
            if (handle.namespace === "/testline/g1") {
                self.clusters[0][0].send({'evt':'c_init',data:buffer}, handle,{keepOpen:false});
                tcp.waithandleClose(5000);
                return;
            }

            //TODO fms vp6f sample
            console.log("handle.namespace : ",handle.namespace);
            //過濾不明的namesapce
            if (handle.namespace.substr(0,1) != "/") {
                handle.close();
                tcp.handleRelease(handle);
                handle = null;
                return;
            };

            if (handle.namespace === "/video/vp6f/video0/") {
                self.clusters[0][0].send({'evt':'c_init',data:buffer}, handle,{keepOpen:false});
                tcp.waithandleClose(handle,5000);
                return;
            }

            self.assign(handle.namespace, function (worker) {
                
                if (typeof worker === 'undefined') {
                    handle.close();
                    tcp.handleRelease(handle);
                }else{
                    worker.send({'evt':'c_init',data:buffer}, handle,{keepOpen:false});
                    tcp.waithandleClose(handle,5000);
                };

            });
        }else if (handle.mode == 'http' && cfg.httpEnabled){

            if (!cfg.broadcast) {
                var worker = self.clusters[0][0];

                if (typeof worker === 'undefined') return;
                worker.send({'evt':'c_init',data:buffer}, handle,{keepOpen:false});
                tcp.waithandleClose(handle,5000);
                return;
            }

            debug('The client(%s:%s) try http request but Not Support HTTP procotol.',remoteInfo.address, remoteInfo.port);
            handle.close();
            tcp.handleRelease(handle);
        }else {
            console.error('Not found client to use the %s request Connections!!', remoteInfo.address);
            handle.close();
            tcp.handleRelease(handle);
        }

    });

}
/**
 *
 * 建立tcp伺服器不使用node net
 * @param opt
 */
StreamServer.prototype.setupClusterServer = function(opt) {
    if (!opt) {
        opt = {'host':'0.0.0.0', 'port': 8080, 'closeWaitTime': 5000,'backlog':511};
    };
    var self = this;
    var err, tcp_handle;
    try {
        tcp_handle = new TCP();
        err = tcp_handle.bind(opt.host, cfg.appConfig.port);

        if (err) {
            throw new Error(err);
        };

        err = tcp_handle.listen(opt.backlog);

        if (err) {
            throw new Error(err);
        };

        tcp_handle.onconnection = function (err ,handle) {

            if (err) throw new Error("client not connect.");

            handle.onread = onread_url_param;
            handle.readStart(); //讀header封包
            //onread_roundrobin(handle); //平均分配資源
            handle.closeWaiting = setTimeout(function () {
                debug('CLOSE_WAIT - Wait 5 sec timeout.');
                handle.close();
            },opt.closeWaitTime);
        };

        this.server = tcp_handle;
    }
    catch (e) {
        debug('create server error:', e);
        tcp_handle.close();
    };

    /** reload request header and assign **/
    function onread_url_param(nread, buffer) {
        var handle = this;
        // nread > 0 read success
        if (nread < 0) return;

        if (nread === 0) {
            debug('not any data, keep waiting.');
            return;
        };
        // Error, end of file.
        if (nread === uv.UV_EOF) { debug('error UV_EOF: unexpected end of file.'); return;}

        clearTimeout(handle.closeWaiting); //socket error CLOSE_WAIT(passive close)

        var headers = pheaders.onReadTCPParser(buffer);
        var source = headers.source;
        var general = headers.general;
        var isBrowser = (typeof general != 'undefined');
        var mode = "";
        var namespace = undefined;
        if (general) {
            mode = general[0].match('HTTP/1.1') != null ? "http" : mode;
            mode = headers.iswebsocket  ? "ws" : mode;
            namespace = general[1];
        }else
        {
            mode = "socket";
            namespace = buffer.toString('utf8');
            namespace = namespace.replace("\0","");
            console.log('socket - namespace - ', namespace);
            source = namespace;

            /** switch services code start **/


            /** switch services code end**/
        }
        if ((buffer.byteLength == 0 || mode == "socket" || !headers) && !headers.swfPolicy) mode = "socket";
        if (headers.unicodeNull != null && headers.swfPolicy && mode != 'ws') mode = "flashsocket";

        if ((mode === 'ws' && isBrowser) || mode === 'socket' || mode === "flashsocket") {

            self.assign(namespace, function (worker) {

                if (typeof worker === 'undefined') {
                    handle.close();
                }else{
                    worker.send({'evt':'c_init',data:source}, handle,[{ track: false, process: false }]);
                };

            });

        }else if(mode === 'http' && isBrowser)
        {
            var worker = self.clusters[0][0];

            if (typeof worker === 'undefined') return;
            worker.send({'evt':'c_init',data:source}, handle,[{ track: false, process: false }]);
        }else {
            handle.close();
            handle.readStop();
            handle = null;
            return;
        }

        handle.readStop();
    };



};

// ================================= //
//      Create Child_Process         //
// ================================= //
/**
 * 建立子執行緒
 * @param opt {cluster:(String)<js filename>, clusterNum:(Number)<count>}
 */
StreamServer.prototype.setupCluster = function(opt) {
    if (typeof opt === 'undefined') {
        opt = { 'cluster': '', 'clusterNum': 0 };
    }

    /** cluster start - isMaster **/

    var num = Number(opt.clusterNum);

    if (isMaster && num != 0) { // isMaster
        for (var i = 0; i < num; i++) {

            // file , fork.settings, args
            var env = process.env;
            env.NODE_CDID = i;
            env.PORT = cfg.appConfig.port;
            if(cfg.broadcast == false)
                env.streamSource = cfg.streamSource.host;
            //var cluster = proc.fork(opt.cluster,{silent:false}, {env:env});
            var cluster = new daemon("" + opt.cluster,{silent:false}, {env:env}); //心跳系統
            cluster.init();
            cluster.name = 'channel_' + i;
            if (!this.clusters[i]) {
                this.clusters[i] = [];
            }
            this.clusters[i].push(cluster);
        };
    };
    /** cluster end - isMaster **/
};
StreamServer.prototype.initCluster = function(opt,id) {

    var env = process.env;
    env.NODE_CDID = (typeof id == 'undefined') ? this.clusters.length : id;
    env.PORT = cfg.appConfig.port;
    var cluster = new daemon(opt.cluster,{silent:false}, {env:env});
    cluster.init();
    cluster.name = 'channel_' + env.NODE_CDID;
    if (!this.clusters[id]) {
        this.clusters[id] = [];
    }
    this.clusters[id][0] = cluster;
};
StreamServer.prototype.setupFMSCluster = function (opt) {
    var env = process.env;
    env.NODE_CDID = (typeof id == 'undefined') ? this.clusters.length : id;
    env.PORT = cfg.appConfig.port;
    var cluster = new daemon(opt.cluster,{silent:false}, {env:env});
    cluster.init();
    cluster.name = 'channel_' + env.NODE_CDID;
    this.fmsSrv = cluster;
};

StreamServer.prototype.setupSingleServer = function () {
    var srv = new FxConnection(cfg.appConfig.port);
    srv.on('connection', function (socket) {
        debug('clients:',socket.name);
    });
};

// ================================= //
//        Client Connections         //
// ================================= //
StreamServer.prototype.initSocket = function (handle, buf) {
    //TODO Create Amini Socket
    var self = this;
    var sockOwner = new owner(handle, buf, this);
    var out = {};
    handle.getpeername(out);
    var key = out.address + ":" + out.port;
    sockOwner.name = key;
    this.owners[key] = sockOwner;
    sockOwner.on('close', function () {
        delete self.owners[key];
    });
};

StreamServer.prototype.createServer = function (clusterEnable) {
    this.clusterEnable = clusterEnable;
    if (this.clusterEnable) {
        // this.setupClusterServer(cfg.srvOptions);
        this.setupClusterServer2(cfg.srvOptions);
    }else
    {
        // todo single server
    }
};
// ================================= //
//  UDP broadcast Send Other Server  //
// ================================= //
StreamServer.prototype.setupTCPBroadcast = function () {
    console.log('startup setupTCPBroadcast');
    var self = this;
    var port = 10080;
    var bConnections = [];
    var srv = this.broadcastSrv = net.createServer(function (socket) {
        console.log('srv socket connection');
        socket.name = socket.remoteAddress + "\:" + socket.remotePort;
        bConnections[socket.name] = socket;

        socket.on('close', function () {
            socket.destroy();
            bConnections[socket.name] = null;
            delete bConnections[socket.name];
        });
        socket.on('error', function () {
            socket.destroy();
        });
        socket.on('data', function (data) {

            socket.namespace = data.toString('utf8');

            console.log(socket.namespace);
        });
    });
    
    srv.listen(port);

    this.on('streamData', function (namespace, data, info) {

        var json = {'evt':'streamData','namespace':namespace,'data':data};

        var keys = Object.keys(bConnections);

        for (var i = 0; i < keys.length; i++) {
            var sock = bConnections[keys[i]];
            if (!sock || sock == null) return;
            if (namespace == sock.namespace)
                sock.write(JSON.stringify(json) +'\0');
        }
    });

};
StreamServer.prototype.setupTCPMulticast = function () {

    console.log('startup setupTCPMulticast');

    // var self = this;
    var port = 10080;
    var host = '127.0.0.1';
    var connections = {};
    var json;
    fs.readFile('./configfile/info.json','utf8',function (err,data) {
        json = JSON.parse(data.toString('utf8'));
        setupChannel(json["videos"]);
    });

    var multi = [];

    function setupChannel(videos){
        console.log('startup setupChannel:',videos.length);

        for (var i = 0; i < videos.length; i++) {
            var namespace = videos[i];
            var sock = new net.Socket();
            sock.namespace = namespace;
            multi[namespace] = sock;
            sock.on('connect',function () {
                console.log('connect ',this.namespace);
                clearInterval(this.repeated);
                this.write(this.namespace);
            });
            sock.on('data',function (data) {
                // console.log('data',data.length);
            });
            sock.on('close',function () {
                console.log('setupChannel is close >>>>>');
                sock.repeated = setInterval(function () {
                    sock.connect(port, host);
                },10000);
            });
            sock.on('error',function (error) {
                sock.destroy();
            });

            sock.connect(port, host);

        }

    }

    var sockPath = path.join(cfg.unixSokConfig.path, cfg.unixSokConfig.filename);

    //delete file
    try {
        fs.unlinkSync(sockPath);
    }
    catch (e) {

    }

    //common gateway interface
    var cgiGUID = 0;
    var cgiSrv = net.createServer(function (socket) {
        socket.name = "sock_" + cgiGUID++;
        connections[socket.name] = socket;

        // multi.pipe(socket);
        socket.on('data', function (chunk) {
           var str = chunk.toString('utf8');
            if (typeof multi[str] != 'undefined') {
                console.log(' pipe:', str);
                socket.namespace = str;
                multi[str].pipe(socket);
            }
        });

        socket.on('close', function () {
            var tmp = cgiSrv.connections[socket.name];
            connections[socket.name] = null;
            delete connections[socket.name];
        });
        socket.on('error', function () {
            socket.destroy();
        });

    });

    cgiSrv.listen(sockPath);

    
};

// ================================= //
//  Connected form Broadcast Server  //
// ================================= //

/**
 * a new connection socket of live stream
 * @param host is specified remote address
 * @param port is specified remote port
 * @param namespace is specified path
 * @returns {*|Socket}
 */
var spawn = require('child_process').spawn;
StreamServer.prototype.addStreamSocket = function(host, port, namespace) {

    var self = this;
    // var sock = new socketClient( host, port, namespace, function (data) {
    //     self.emit('streamData', namespace, data);
    // });
    //
    // return sock;

    var env = process.env;
    env.NODE_CDID = 0;
    env.port = port;
    env.host = host;
    env.namespace = namespace;
    env.cpMode = 'spawn';
    var cluster;
    if ( env.cpMode != 'spawn') {
        cluster = proc.fork('./archSwitches/socketClient.js',{silent:false}, {env:env});
        cluster.on('message',function (data) {
            console.log(data);
        })
    }else {
        cluster = spawn('node',['./archSwitches/socketClient.js'],{env:env});
        cluster.vBuf = undefined;
        cluster.stdout.on('data',function (data) {
            self.emit('streamData', namespace, data);
        });
        cluster.stderr.on('data',function (data) {

        });
    }


    
    return cluster;
};
/***
 * socket classs
 * @param host <string>IPAddress
 * @param port <number>
 * @param namespace <string>
 * @param cb <function>
 */
function socketClient(host, port, namespace, cb) {
    this.toBufferData = true;
    this.isRetry = false;
    this.trytimeoutObj = 0;
    this.try_conut = 0;
    this.host = host;
    this.port = port;
    this.namespace = namespace;
    this.cb = cb;
    this.init(host,port, namespace);
}

socketClient.prototype = {
    init: function (host, port, namespace) {
        var waitTime = heartbeatInterval;
        var self = this;
        var sock = new net.Socket();
        sock.namespace = namespace;
        sock.chunkSize = 0;
        sock.chunkBuffer = undefined;
        sock.lookout = 0;
        sock.doWaiting = 0;

        sock.on('connect',onConnected);
        sock.on('data',onData);
        sock.on('end', onEnd);
        sock.on('drain',onDrain);
        sock.on('close',onClose);
        sock.on('error', onError);
        sock.connect(port, host);
        socketHeartbeat(sock);
        this.socket = sock;
        function onConnected() {
            NSLog.log('info','Connected to %s:%s', host, port,namespace);
            sock.write(namespace);
        }
        function onData(chunk) {
            sock.doWaiting = 0;
            if (!sock.chunkBuffer) {
                sock.chunkBuffer = new Buffer(chunk);
            }else {
                sock.chunkBuffer = Buffer.concat([sock.chunkBuffer, chunk], sock.chunkBuffer.length + chunk.length);
            }
            sock.chunkSize += chunk.length;

            var pos = sock.chunkBuffer.indexOf('\u0000');
            if (pos != -1) {
                var data = sock.chunkBuffer.slice(0, pos);

                pos++;//含/0
                sock.chunkSize -= pos;
                sock.chunkBuffer = sock.chunkBuffer.slice(pos, sock.chunkBuffer.length);

                if (data.length <= 0) return;

                if (self.toBufferData) {
                    if (self.cb && self.cb != null) self.cb(data);
                }else {
                    try {
                        var json = JSON.parse(data.toString('utf8'));
                        if (json.NetStreamEvent == "NetStreamData") {
                            if (self.cb && self.cb != null) self.cb(data);
                        }

                    }
                    catch (e) {
                        console.log('onData',data.length);
                    }
                }
            }//check pos ended
        };
        function onEnd() {
            debug('ended.');
        };
        function onDrain() {
            debug('onDrain.');
        };
        function onClose() {
            self.tryAgainLater();

        }
        function onError(err) {

            NSLog.log('info','socket(%s) %s', self.namespace, err);
            sock.destroy();
        }
        function socketHeartbeat(_socket) {
            function todo() {

                NSLog.log('trace','heartbeat %s:', _socket.namespace, _socket.doWaiting);

                if (_socket.doWaiting >= 6 ) {
                    NSLog.log('info' ,'The Socket connect is not responding to client.It need to be reconnect.');
                    _socket.destroy();
                    _socket.doWaiting = 0;
                }else {
                    _socket.doWaiting++;
                    _socket.lookout = setTimeout(todo, waitTime)
                }
            }

            _socket.lookout = setTimeout(todo, waitTime);
        }

    },
    tryAgainLater:function () {
        var self = this;
        NSLog.log('trace','Connect Stream %s to try again.', self.namespace);

        if (self.trytimeoutObj != 0) clearTimeout(self.trytimeoutObj);
        self.trytimeoutObj = setTimeout(function () {
            self.reconnect();

        },10000);

        if (self.try_conut >= 360) {
            clearTimeout(self.trytimeoutObj);
            clearTimeout(self.socket.lookout);
            self.trytimeoutObj = 0;
        }
    },
    dealloc: function () {
        this.socket.chunkSize = 0;
        delete this.socket.chunkBuffer;
        this.socket.chunkBuffer = null;
        clearTimeout(this.socket.lookout);
        clearTimeout(this.trytimeoutObj);
        this.socket = null;
    },
    reconnect: function () {
        this.socket.chunkSize = 0;
        delete this.socket.chunkBuffer;
        this.socket.chunkBuffer = null;
        clearTimeout(this.socket.lookout);
        clearTimeout(this.trytimeoutObj);
        this.try_conut++;
        this.socket = null;
        this.init(this.host, this.port, this.namespace);
    },
    replaceLine: function (opt) {
        this.host = opt.host;
        this.port = opt.port;

        this.try_conut = 0;

        this.tryAgainLater();
    }

}
/** 建立連線視訊資料來源 **/
StreamServer.prototype.createClientStream = function(fileName, host , port) {
    var sn = fileName;
    var length = sn.length;
    var i, _name;
    debug('Init createLiveStreams on %s:%s', host, port);
    for (i = 0; i < length; i++) {

        _name = sn[i].toString().match(/^((rtmp[s]?):\/)?\/?([^:\/\s]+)(:([^\/]*))?((\/\w+)*\/)([\w\-\.]+[^#?\s]+)(\?([^#]*))?(#(.*))?$/i);

        if (typeof  _name[6] != 'undefined' && typeof _name[8] != 'undefined') {
            var pathname = _name[6] + _name[8];
            // var socket = this.addStreamSocket(host, port, pathname);
            // this.streamSockets.push({'socket':socket,namespace:pathname});
        }

    }

    NSLog.log('trace','createLiveStreams is to completion.');
};





StreamServer.prototype.__defineSetter__('httpEnabled', function (enabled) {
   if (typeof enabled == "boolean") {
       cfg.httpEnabled = enabled;

   }
});
StreamServer.prototype.__defineSetter__('loadBalance', function (mode) {

    if (typeof mode === 'undefined' || mode == "" || mode == null) return;

    if (mode == "url_param") {
        cfg.balance = "url_param";
    }else if (mode.toLowerCase() == "roundrobin") {
        cfg.balance = "roundrobin";
    }else if (mode == "leastconn") {
        cfg.balance = "leastconn";
    }
});
StreamServer.prototype.clusterRestart = function (id) {
    if (this.clusters[id][0]) {
        this.clusters[id][0].restart();
    }else {
        this.initCluster(cfg.srvOptions.cluster, id);
    }
};
StreamServer.prototype.clusterConnections = function () {
    var list = [];
    for (var i = 0; i < this.clusters.length; i++) {
        var obj = this.clusters[i][0].nodeInfo.connections;
        list.push(obj);
    }
    return list;
};
StreamServer.prototype.ffmpegRestart = function (name) {
    if (this.liveStreams[name]) {
        const pid = this.liveStreams[name].ffmpeg_pid.toString();
        proc.exec("kill -9 " + pid);
        delete self.doWaiting[pid];
    }else {

    }
};
StreamServer.prototype.replaceSource = function (URL, cb) {

    var _name = URL.toString().match(/^((ws[s]?):\/\/)?\/?([^:\/\s]+)(:([^\/]*))?((\/\w+)*\/)([\w\-\.]+[^#?\s]+)(\?([^#]*))?(#(.*))?$/i);

    if (_name == null) {
        if (cb) cb('Invalid characters in a URL.');
        return;
    }

    if (typeof  _name[6] != 'undefined' && typeof _name[8] != 'undefined') {
        var pathname = _name[6] + _name[8];
        var ipv4 = _name[3].match(/\b((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.|$)){4}\b/i);

        if (ipv4 == null) {
            if (cb) cb('you have entered an invalid IP address!');
            return;
        }
        if (typeof _name[4] == 'undefined') _name[4] = 80;
        var leng = this.streamSockets.length;
        for (var i = 0; i < leng; i++) {
            var obj = this.streamSockets[i];
            if (obj.namespace == pathname) {
                obj.socket.replaceLine({host:ipv4, port:_name[4]});
            }

        }
    };
};
//sample
// StreamServer.prototype.vp6fStream = function() {
//     var self = this;
//     var vp6f = require('../vp6f/libvp62Cl.js');
//     this.libVP6f = new vp6f();
//     this.libVP6f.on("videoData", function (obj) {
//         // console.log('videoData:', obj.data.length);
//         self.clusters[0].send({'evt':'streamData','namespace':'/video/vp6f/video0/','data':obj.data.toString('base64')});
//     });
// };

module.exports = StreamServer;

