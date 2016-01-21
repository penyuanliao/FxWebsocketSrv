/**
 * Created by Benson.Liao on 15/12/9.
 * --always-compact: always full gc().
 * --expose-gc: manual gc().
 */

var fxNetSocket = require('./fxNetSocket');
var FxConnection = fxNetSocket.netConnection;
var outputStream = fxNetSocket.stdoutStream;
var parser = fxNetSocket.parser;
var utilities = fxNetSocket.utilities;
var logger = fxNetSocket.logger;
var fs  = require('fs');
var net  = require('net');
var evt = require('events');
var cfg = require('./config.js');
/** 所有視訊stream物件 **/
var liveStreams = {};
var isMaster = (process.argv.length > 3);
var server;
/** cluster start **/
/*var cluster = require('cluster');
 if (cluster.isMaster) {
 for (var i = 0; i < 3; i++) {
 cluster.fork();
 }
 }else{

 }*/
process.on('message', function(data , handle) {

    if (data == 0) {
        isMaster = false;

        console.log('[Runnable] Create cluster id:',data );

        var self = this;

        var srv = new FxConnection(handle);
        setupCluster(srv);
        server = srv;
    }
    else if ((typeof data.handle != 'undefined') && data.handle === 'socketSend'){
        socketSend(data.evt,data.spawnName);
    } else{
        var json = data;
        //console.log(json.namespace);
        var spawnName = json.namespace;
        var clients = server.getClients();
        var keys = Object.keys(clients);
        if (keys.length == 0) return;
        for (var i = 0 ; i < keys.length; i++) {
            var socket = clients[keys[i]];
            console.log(socket.namespace , spawnName);
            if (socket.isConnect == true) {
                if (socket.namespace == spawnName)
                {
                    var str = JSON.stringify({"NetStreamEvent":"NetStreamData",'data':json.data});
                    //console.log('INFO::::%s bytes', Buffer.byteLength(str));
                    //!!!! cpu very busy !!!
                    socket.write(str)
                }

            }
        }
        keys = null;
    }

});

var proc_pipe =  new net.Socket({ fd: 0 });
if (typeof  proc_pipe !== 'undefined') {

    proc_pipe.on('data', function (chunk) {
        console.log('chunk:', chunk);
    });
}

if (isMaster) initizatialSrv();

/** cluster ended **/

function initizatialSrv() {
    /** createLiveStreams **/
    createLiveStreams(cfg.appConfig.fileName);
    setInterval(observerTotoalUseMem,60000); // testing code 1.0 min

    utilities.autoReleaseGC(); //** 手動 1 sec gc

    var srv = new FxConnection(cfg.appConfig.port,{'cluster':4});
    setupCluster(srv);
    server = srv;
}

function setupCluster(srv) {
    srv.on('connection', function (socket) {
        console.log('clients:',socket.name);

        return;
        // 檢查 Stream List 建立
        if (typeof liveStreams != 'undefined' && liveStreams != null ) {
            var swpan = liveStreams[socket.namespace];

            if (typeof swpan == 'undefined' && swpan == null ) {
                // return;

                var confirm = verificationString(socket.namespace);
                // 特殊需求這邊本來應該return;如果連線指定伺服器啟動」
                console.log("rtmp://" + cfg.videoDomainName + socket.namespace , confirm);
                if (confirm) {
                    createLiveStreams(["rtmp://" + cfg.videoDomainName + socket.namespace]);
                }else
                {
                    srv.clientDestroy(socket);
                }
            }else
                rebootStream(swpan);

        }else {
            //todo 為建立狀態流程處理
            console.error("[ERROR]Stream not Create.");
        }
    });
    /** socket data event **/
    srv.on('message', function (data) {
        console.log('message :',data);
    });
    /** client socket destroy **/
    srv.on('disconnect', function (socket) {
        console.log('disconnect_fxconnect_client.');
        //socket.removeListener('connection', callback);
    });
    /** verification **/
    function verificationString(str) {
        var regexp = /(video\/[a-zA-Z]*\/video[0-9a-zA-Z]*)/i;
        var val = str.match(regexp);
        if (val !== null && typeof val !== 'undefined' && val[0] !== null) {
            return true;
        }else
            return false;
    }

    /**
     * client socket connection is http connect()
     * @param req: request
     * @param client: client socket
     * @param head: req header
     * **/
    srv.on('httpUpgrade', function (req, client, head) {

        console.log('## upgrade ##');

        var _get = head[0].split(" ");

        var socket = client.socket;

        if (_get[1] === "/") {

            fs.readFile('public/views/broadwayPlayer.html', function (err, data) {
                successfulHeader(200, socket, "html");
                socket.write(data);

                client.close();
            });
        }
        else if (_get[1] === "/favicon.ico") {
            failureHeader(404, socket, "ico");
            client.close();
        }
        else
        {
            successfulHeader(200, socket, "js");
            var fsstream = fs.createReadStream("public" + _get[1], {bufferSize: 1024 * 300, end:false});
            var fileLength = 0;
            fsstream.pipe(socket);

            fsstream.on('data', function (chunk) {
                fileLength += chunk.length;
            });
            fsstream.on('end', function () {
                //var file = Buffer.concat(list).toString();
                console.log("%s file size : %d kb",_get[1],fileLength/1024);
                //socket.write("content-length:%d\r\n", fileLength);

                //client.close();

            });
            fsstream.on('error', function (err) {
                console.log('fsStream error:', err);
            });

        }

    });
    /**
     * @param code: response header Status Code
     * @param socket: client socket
     * @param type: content-type
     * */
    function successfulHeader(code, socket, type) {

        var contentType = type === 'js' ? "application/javascript" : "text/html";

        var headers = parser.headers.responseHeader(code, {
            "Host": srv.app.address().address,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Connection": "Keep-Alive",
            "Keep-Alive": "timeout=3, max=10",
            "Access-Control-Allow-Origin": "*",
            "Content-Type": contentType
        });

        //socket.write("Content-Security-Policy: default-src 'self'; img-src *;object-src 'self' http://127.0.0.1; script-src 'self' http://127.0.0.1;\n");
        socket.write(headers);
    };
    /**
     * @param code: response header Status Code
     * @param socket: client socket
     * */
    function failureHeader(code, socket) {

        var headers = parser.headers.responseHeader(code, {
            "Connection": "close" });
        socket.write(headers);

    }

}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - //
// STREAM //
function createLiveStreams(fileName) {
    var sn = fileName;
    var spawned,_name;
    for (var i = 0; i < sn.length; i++) {
        // schema 2, domain 3, port 5, path 6,last path 7, file 8, querystring 9, hash 12
        _name = sn[i].toString().match(/^((rtmp[s]?):\/)?\/?([^:\/\s]+)(:([^\/]*))?((\/\w+)*\/)([\w\-\.]+[^#?\s]+)(\?([^#]*))?(#(.*))?$/i);
        if (typeof  _name[6] != 'undefined' && typeof _name[8] != 'undefined') {
            var pathname = _name[6] + _name[8];
            spawned = liveStreams[pathname] = new outputStream(sn[i]);
            spawned.name = pathname;
            spawned.on('streamData', swpanedUpdate);
            spawned.on('close', swpanedClosed);
            spawned = null;
        }else {
            throw "create Live Stream path error." + sn[i];
        }

    };


};
/** 重啟stream **/
function rebootStream(spawned,skip) {
    if ((spawned.running == false && spawned.STATUS >= 2) || skip == true) {
        console.log('>>rebootStream:', spawned.name);
        var spawn = liveStreams[spawned.name] = new outputStream( "rtmp://" + cfg.videoDomainName + spawned.name);
        spawn.idx = spawned.idx;
        spawn.name = spawned.name;
        spawn.on('streamData', swpanedUpdate);
        spawn.on('close', swpanedClosed);
        spawned.removeListener('streamData', swpanedUpdate);
        spawned.removeListener('close', swpanedClosed);
        spawned = null;
        server.eventDispatch(3);
    }
}
/** ffmpeg stream pull the data of a base64 **/

function swpanedUpdate(base64) {
    var spawnName = this.name;
    if (server.clusters[0]){
        server.clusters[0].send({'namespace':spawnName,'data':base64});
    }
};

function socketSend(evt, spawnName) {

    if (isMaster) {
        for (var i = 0; i < server.clusters.length; i++) {
            if (server.clusters[i])
            {
                server.clusters[i].send({'handle':'socketSend','evt':evt,'spawnName':spawnName});
            }

        }

    }else
    {
        var clients = server.getClients();
        var keys = Object.keys(clients);
        if (keys.length == 0) return;

        for (var i = 0 ; i < keys.length; i++) {
            var socket = clients[keys[i]];
            if (socket.isConnect == true) {
                if (socket.namespace === spawnName)
                    socket.write(JSON.stringify(evt));
            }

        }

        keys = null;
    };

}

/* ------- start testing logger ------- */
/** ffmpeg stream close **/
function swpanedClosed(code){

    socketSend({'NetStatusEvent': 'NetConnect.Failed'}, this.name);


    //** 監聽到自動關閉,重新啟動 code == 0 **/
    if (1) {
        console.log("listen swpaned Closed - ",this.name, " < REBOOTING >");
        rebootStream(this,true);
    }

    logger.reachabilityWithHostName(cfg.videoDomainName);

};
/** 觀察記憶體使用狀況 **/
function observerTotoalUseMem() {

    var keys = Object.keys(liveStreams);
    var pids = [];
    keys.asyncEach(function(element, resume) {
        resume();
        pids.push(liveStreams[element].ffmpeg.pid);
    }, function() {
        logger.logTotalMemoryUsage(pids);
    });

}
/* ------- ended testing logger ------- */

process.on('uncaughtException', function (err) {
    console.error(err.stack);
});