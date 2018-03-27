/**
 * Created by Benson.Liao on 2016/5/5.
 */

const StreamServer  = require('./StreamServer.js');
const cfg           = require('../config.js');
const path          = require('path');
const NSLog         = require('fxNetSocket').logger.getInstance();

NSLog.configure({consoleEnabled:true,logFileEnabled:true, level:'trace', dateFormat:'[yyyy-MM-dd hh:mm:ss]',filePath:path.dirname(__dirname)+"/historyLog" , maximumFileSize: 1024 * 1024 * 100});

var stream = new StreamServer();
setupClusters(cfg.forkOptions);


if (!cfg.appConfig.fileName && cfg.broadcast) {
    throw Error('config not found fileName setting.');
    process.exit(0);
    return;
}

if (cfg.broadcast) {
    console.log("create LiveStream");
    stream.createLiveStreams(cfg.appConfig.fileName);

} else {
    console.log("create ClientStream");
}

stream.createServer(true);

stream.on('streamData', function (name, base64, info) {

    if (cfg.balance === "roundrobin") {
        for (var i = 0; i < stream.clusters.length; i++) {
            var cluster = stream.clusters[i][0];
            if (cluster) {
                cluster.send({'evt':'streamData','namespace':name,'data':base64, 'info':info});
            } else {
                throw Error("The cluster(assigned to " + name + ") was not found on this Server.");
            }
        }
    }else {
        stream.assign(name,"H264", function (cluster) {
            if (cluster) {
                cluster.send({'evt':'streamData','namespace':name,'data':base64, 'info':info});
            } else {
                throw Error("The cluster(assigned to " +  name + ") was not found on this Server.");
            }
        });
    }

});

/* ------- ended testing logger ------- */

process.on('uncaughtException', function (err) {
    NSLog.log(err.stack);
});

/*
* todo new cluster h264 & VP62
* */
function setupClusters(forkOptions) {
    if (forkOptions.constructor == Array) {
        for (var i = 0; i < cfg.forkOptions.length; i++) {
            if (cfg.forkOptions[i]["name"] == "H264"){
                stream.clusters = stream.setupCluster(cfg.forkOptions[i]);
            }
            if (cfg.forkOptions[i]["name"] == "VP62")
                stream.clusters2VP6 = stream.setupCluster(cfg.forkOptions[i]);
            if (cfg.forkOptions[i]["name"] == "FLV")
                stream.clusters2FLV = stream.setupCluster(cfg.forkOptions[i]);
        }
    }else if (forkOptions.constructor == Function ) {
        stream.setupCluster(cfg.forkOptions);
    }
}
