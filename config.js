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
        'backlog': 511
    };
    config.forkOptions = {
        'webCluster':'',
        'webNum':0,
        'cluster': './FxClusterSrvlb.js',
        'clusterNum': 2,
    };
}
else {
    config.rtmpHostname = "192.168.188.80";//
    config.stream_proc = "ffmpeg";
    config.srvOptions = {
        'host': '0.0.0.0',
        'port': config.appConfig.port,
        'backlog': 511
    };
    config.forkOptions = {
        'webCluster':'',
        'webNum':0,
        'cluster': './FxClusterSrvlb.js',
        'clusterNum': 7//config.numCPUs -1
    };
}
config.assignRule = [['daabb','daabc','daabd','daaib'], ['daace','daacf','daacde'],['daacdf','daadb','daacb'], ['daaib','daahb','daagb'], ['dabab','dabbb','daafb'], ['dabcb','dabfb','dabeb']];

//if (config.assignRule.length < config.forkOptions.num) throw new Error("assignRule != forkOptions.num");

config.rtmpPort = 1935;
config.videoDomainName = config.rtmpHostname + ":" + config.rtmpPort;
//todo define the balance
config.balance = 'url_param';//roundrobin



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
        }

            });

    return args;
}