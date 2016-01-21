/**
 * Created by Benson.Liao on 16/1/5.
 */
var config = module.exports = {};
config.env = process.env.NODE_ENV;
if (config.env == 'development') {
    config.rtmpHostname = "183.182.79.162";
    config.stream_proc = "ffmpeg";
}
else {
    config.rtmpHostname = "192.168.188.72";
    config.stream_proc = "ffmpegv258";
}
config.rtmpPort = 1935;
config.videoDomainName = config.rtmpHostname + ":" + config.rtmpPort;
config.numCPUs = require('os').cpus().length;


config.appConfig = appParames();

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
        }

    });

    return args;
}