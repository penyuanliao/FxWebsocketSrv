/**
 * Created by Benson.Liao on 15/12/9.
 * --always-compact: always full gc().
 * --expose-gc: manual gc().
 */
const debug = require('debug')('FxClusterlb'); //debug
const fxNetSocket = require('fxNetSocket');
const outputStream = fxNetSocket.stdoutStream;
const parser = fxNetSocket.parser;
const pheaders = parser.headers;
const utilities = fxNetSocket.utilities;
const logger = fxNetSocket.logger;
const daemon = fxNetSocket.daemon;
/** 建立連線 **/
const TCP = process.binding("tcp_wrap").TCP;
const uv = process.binding('uv');
const fs  = require('fs');
const net  = require('net');
const evt = require('events');
const cfg = require('./config.js');
const proc = require('child_process');
/** 所有視訊stream物件 **/
var liveStreams = {};
var doWaiting = []; //心跳系統等待次數紀錄
/** 多執行緒 **/
var isWorker = ('NODE_CDID' in process.env);
var isMaster = (isWorker === false);
var server;
var clusters = [];

if (isMaster) initizatialSrv();

/** cluster ended **/
function initizatialSrv() {
    /** createLiveStreams **/
    createLiveStreams(cfg.appConfig.fileName);
    //setInterval(observerTotoalUseMem, 60000); // testing code 1.0 min

    utilities.autoReleaseGC(); //** 手動 1 sec gc

    // 1. setup child process fork
    setupCluster(cfg.forkOptions);
    // 2. create listen 80 port server
    createServer(cfg.srvOptions);

}
/**
 * 建立tcp伺服器不使用node net
 * @param opt
 */
function createServer(opt) {
    if (!opt) {
        opt = {'host':'0.0.0.0', 'port': 8080,'backlog':511};
    };
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
        };

        server = tcp_handle;
    }
    catch (e) {
        debug('create server error:', e);
        tcp_handle.close();
    };

};
/** _handle Equal Division **/
function onread_roundrobin(client_handle) {
    var worker = clusters.shift();
    worker.send({'evt':'c_equal_division'}, client_handle,[{ track: false, process: false }]);
    clusters.push(worker);
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

    var headers = pheaders.onReadTCPParser(buffer);
    var source = headers.source;
    var general = headers.general;
    var isBrowser = (typeof general != 'undefined');
    var mode = "";
    mode = general[0].match('HTTP/1.1') != null ? "http" : mode;
    mode = headers.iswebsocket  ? "ws" : mode;

    if (mode === 'ws' && isBrowser) {

        assign(general[1], function (worker) {

            if (typeof worker === 'undefined') {
                handle.close();
            }else{

                worker.send({'evt':'c_init',data:source}, handle,[{ track: false, process: false }]);
            };

        });

    }else if(mode === 'http' && isBrowser)
    {
        var worker = clusters[0];

        if (typeof worker === 'undefined') return;
        worker.send({'evt':'c_init',data:source}, handle,[{ track: false, process: false }]);
    }

    handle.readStop();
};
/**
 * 建立子執行緒
 * @param opt {cluster:(String)<js filename>, clusterNum:(Number)<count>}
 */
function setupCluster(opt) {
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
            //var cluster = proc.fork(opt.cluster,{silent:false}, {env:env});
            var cluster = new daemon(opt.cluster,{silent:false}, {env:env}); //心跳系統
            cluster.init();
            cluster.name = 'ch_' + i;
            clusters.push(cluster);
        };
    };
    /** cluster end - isMaster **/
}
/**
 * 分流處理
 * @param namespace
 * @returns {undefined}
 */
function assign(namespace,cb) {
    var worker = undefined;

    var maximum = clusters.length-1;
    var stremNum = cfg.appConfig.fileName.length;
    var avg = parseInt(maximum / stremNum);
    var num = 0;
// url_param
    if (cfg.balance === "url_param") {
        cfg.assignRule.asyncEach(function (item, resume) {
            if (item.constructor === String) {
                console.log('string:id:', item);
                if (namespace.search(item) != -1) {
                    if (typeof cb !== 'undefined') {
                        if (cb) cb(clusters[num]);
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
                        if (cb) cb(clusters[num]);
                        return;
                    }
                }
            }
            num++;
            resume();
        }, function () {
            debug('ERROR::not found Worker Server:', namespace);
            if (cb) cb(undefined);
        });
    }
    else if (cfg.balance === "roundrobin") {
        num = 0;
        if (namespace.search('daabb') != -1) worker = clusters[++num];
        if (namespace.search('daabc') != -1) worker = clusters[++num];
        if (namespace.search('daabd') != -1) worker = clusters[++num];
        if (namespace.search('daabg') != -1) worker = clusters[++num];
        if (namespace.search('daabh') != -1) worker = clusters[++num];
        if (namespace.search('daabdg') != -1) worker = clusters[++num];
        if (namespace.search('daabdh') != -1) worker = clusters[++num];
        if (cb) cb(worker);
    }
}

// ================================= //
//          FFMPEG STREAM            //
// ================================= //
function createLiveStreams(fileName) {
    var sn = fileName;
    var length = sn.length;
    var spawned, _name, i;
    debug('Init createLiveStreams');
    for (i = 0; i < length; i++) {
        // schema 2, domain 3, port 5, path 6,last path 7, file 8, querystring 9, hash 12
        _name = sn[i].toString().match(/^((rtmp[s]?):\/)?\/?([^:\/\s]+)(:([^\/]*))?((\/\w+)*\/)([\w\-\.]+[^#?\s]+)(\?([^#]*))?(#(.*))?$/i);
        if (typeof  _name[6] != 'undefined' && typeof _name[8] != 'undefined') {
            var pathname = _name[6] + _name[8];
            spawned = liveStreams[pathname] = new outputStream(sn[i],cfg.stream_proc);
            spawned.name = pathname;
            spawned.on('streamData', swpanedUpdate);
            spawned.on('close', swpanedClosed);
            streamHeartbeat(spawned);
            spawned = null;
        }else {
            throw "create Live Stream path error." + sn[i];
        };
    };
};

/** 心跳檢查ffmpeg **/

function streamHeartbeat(spawned) {
    const waitTime = 5000;
    const pid = spawned.ffmpeg_pid.toString();
    doWaiting[pid]= 0;
    function todo() {
        // debug('stream(%s %s) Heartbeat wait count:%d', spawned.name, pid, doWaiting[pid]);

        if (doWaiting[pid] >= 12) { // One minute
            //TODO pro kill -9 pid
            proc.exec("kill -9 " + pid);
            delete doWaiting[pid];
        }else {
            doWaiting[pid]++;
            spawned.lookout = setTimeout(todo,waitTime);
        }
    }
    spawned.lookout = setTimeout(todo,waitTime);
}


/** 重啟stream **/
function rebootStream(spawned,skip) {
    if ((spawned.running == false && spawned.STATUS >= 2) || skip == true) {
        var streamName = spawned.name.toString();
        clearTimeout(spawned.lookout);
        liveStreams[streamName].init();
        streamHeartbeat(spawned);
        debug('>> rebootStream:', streamName, liveStreams[streamName].ffmpeg_pid);
    };
}
/** ffmpeg stream pull the data of a base64 **/

function swpanedUpdate(base64) {
    doWaiting[this.ffmpeg_pid] = 0;
    var spawnName = this.name;
    assign(spawnName, function (worker) {
        if (worker) {
            worker.send({'evt':'streamData','namespace':spawnName,'data':base64});
        }
    });

};

function socketSend(handle, spawnName) {

    for (var i = 0; i < clusters.length; i++) {
        if (clusters[i]) {
            clusters[i].send({'handle':handle,'evt':'socketSend','spawnName':spawnName});
        }

    }

}

/* ------- start testing logger ------- */
/** ffmpeg stream close **/
function swpanedClosed(code){

    //** 監聽到自動關閉,重新啟動 code == 0 **/
    if (1) {
        debug("listen swpaned Closed - ",this.name, " < REBOOTING >");
        rebootStream(this,true);
    }

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

/** process state **/
process.on('uncaughtException', function (err) {
    console.error(err.stack);
});

process.on("exit", function () {
    console.log("Main Thread exit.");
    var n = clusters.length;
    while (n-- > 0) {
        clusters[n].stop();
    };

});
process.on("SIGQUIT", function () {
    console.log("user quit node process");
    while (n-- > 0) {
        clusters[n].stop();
    };
    process.exit(0);
});

