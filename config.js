/**
 * Created by Benson.Liao on 16/1/5.
 */
var config = module.exports = {};
config.appConfig = appParames();
config.env = process.env.NODE_ENV;
/**
 * host: ip4 - '0.0.0.0', ip6 - '::'
 *
 * Backlog: pending connections
 * **/
config.numCPUs = require('os').cpus().length;

if (config.env == 'development') {
    config.rtmpHostname = "183.182.79.162";
    config.stream_proc = "ffmpeg";
    config.srvOptions = {
        'host': '0.0.0.0',
        'port': config.appConfig.port,
        'closeWaitTime':5000, // Setting close_wait timeout
        'backlog': 511
    };
    config.forkOptions = {
        'webCluster':'',
        'webNum':0,
        'cluster': './FxClusterSrvlb.js',
        'clusterNum': 2
    };
}
else {
    if (!config.rtmpHostname) config.rtmpHostname = "192.168.1.171";
    config.stream_proc = "ffmpeg";
    config.srvOptions = {
        'host': '0.0.0.0',
        'port': config.appConfig.port,
        'closeWaitTime':5000, // Setting close_wait timeout
        'backlog': 511
    };
    config.forkOptions = {
        'webCluster':'',
        'webNum':0,
        'cluster': './FxClusterSrvlb.js',
        'clusterNum': 7 //config.numCPUs -1
    };
}
config.assignRule = [['daabb','daabc','daabd','daaib','daabg'], ['daace','daacf','daacde','daabdg'],['daabdh','daacdf','daadb','daacb'], ['daabh','daaib','daahb','daagb'], ['dabab','dabbb','daafb'], ['dabcb','dabfb','dabeb']];

//if (config.assignRule.length < config.forkOptions.num) throw new Error("assignRule != forkOptions.num");
config.rtmpPort = 1935;
config.videoDomainName = config.rtmpHostname + ":" + config.rtmpPort;
//todo define the balance
config.balance = 'url_param';//roundrobin

if (!config.broadcast)
    config.broadcast = false; //ffmpeg FMS streaming vp62 format H.264 broadcast
if (!config.streamSource)
    config.streamSource = {host:'127.0.0.1', port:9527}; // middleware - connect live streaming ip and port

/**
 * Application parameters
 * @param -p port
 * @param -f loadfile or remote link
 * **/
function appParames(){
    var args = {};
    process.argv.forEach(function(element, index, arr) {
        // Processing

        if (element === "-p") {
            var port = parseInt(process.argv[index + 1]);

            args["port"] = !isNaN(port) ? port : 8080;
        }else if (element === "-f") {
            var fileName = process.argv[index + 1];
            if (!fileName && typeof fileName != "undefined" && fileName !=0) {
                fileName = "";
                throw "fileName no definition.";
            }
            args["fileName"] = fileName.split(" ");
        }else if (element === "-v" ){
            var rtmpHost = process.argv[index + 1];
            if (!rtmpHost && typeof rtmpHost != "undefined" && rtmpHost !=0) {
                throw "RTMP Host no definition.";
            }else {
                config.rtmpHostname = rtmpHost;
            }
        }else if (element === "-broadcast") {
            console.log('-broadcast');
            config.broadcast = true;
        }else if (element === "-middleware") {
            var mwInfo = process.argv[index + 1];
            if (!mwInfo && typeof mwInfo != "undefined" && mwInfo !=0) {
                throw "middleware Host no definition.";
            }else {
                if (args.toString().indexOf("-broadcast") == -1) {
                    var arg = mwInfo.toString().split(":");
                    config.streamSource = {host:arg[0], port: arg[1]};
                }else {
                    throw "warning!! The '-middleware' can be not setting has to been disabled because your set '-broadcast'.";
                }
            };
        };

            });

    return args;
}