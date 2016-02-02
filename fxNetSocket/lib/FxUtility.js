/**
 * Created by Benson.Liao on 15/12/22.
 */
var logger = require('./FxLogger.js');
var debug = require('debug')('utility');
var fxStatus = require('./FxEnum.js').fxStatus;

function FxUtility() {

    /* Variables */
    this.js_auto_gc;
    this.js_auto_gc_enabled = false;

    /* Codes */
};
/**
 * action auto gc()
 */
FxUtility.prototype.autoReleaseGC = function () {
    this.js_auto_gc = setInterval(function() {
        gc && gc();

    },10000);
    this.js_auto_gc_enabled = true;
};
/**
 * action auto gc() stop
 * */
FxUtility.prototype.shutDownAutoGC = function () {

    clearInterval(this.js_auto_gc);
    this.js_auto_gc = null;
    this.js_auto_gc_enabled = false;
};


FxUtility.prototype.findOutSocketConnected = function (client, chunk, self) {
    //var socket = this;
    var request_headers = chunk.toString('utf8');
    var lines = request_headers.split("\r\n");
    // [?=\/] 結尾不包含
    var httpTag = lines[0].toString().match(/^GET (.+)[\/]? HTTP\/\d\.\d$/i);
    httpTag = (httpTag == null) ? lines[0].toString().match(/^GET (.+) HTTP\/\d\.\d$/i) + "/" : httpTag; // WS protocol namespace endpoint no '/'
    // FLASH SOCKET \0
    var unicodeNull = request_headers.match(/\0/g); // check endpoint
    var swfPolicy = request_headers.match("<policy-file-request/>") == null; // Flash Policy
    var iswebsocket = request_headers.match('websocket') != null; // Websocket Protocol

    //debug('LOG::Data received: ');

    if (unicodeNull != null && swfPolicy && client.mode != 'ws') {
        debug('[SOCKET_NET_CONNECTED]:');
        client.mode = fxStatus.flashSocket;

        if (typeof self != undefined && self != null) self.emit('message', client.read(request_headers));

    }else if (iswebsocket) {
        debug('[WEBSOCKET_CONNECTED]');

        client.mode = 'ws';

        if (typeof httpTag[0] != "undefined") client.namespace = httpTag[1]; // GET stream namespace

        client.handeshake(chunk);
        // -- WELCOME TO BENSON WEBSOCKET SOCKET SERVER -- //
        client.write(JSON.stringify({"NetStatusEvent": "NetConnect.Success"}));

        if (typeof self != undefined && self != null) self.emit('connection', client); //

        return fxStatus.websocket;
    }
    else if (client.mode === fxStatus.websocket)
    {
        debug('[WEBSOCKET_ROGER]');
        // check is a websocket framing

        var str = client.read(chunk);
        var opcode = client.protocol.opcode;

        debug("PROTOCOL::", opcode);
    }else
    {
        debug('[OTHER CONNECTED]');

        if (httpTag.length != 0 && iswebsocket == false)
        {
            client.mode = fxStatus.http;

            if (typeof self != undefined && self != null) self.emit("httpUpgrade", request_headers, client, lines);

            return fxStatus.http;
        }
    }

};



/***
 * aysnc foreach ARRAY.asyncEach(func(item, resume),func())
 * @param iterator
 * @param complete
 */
Array.prototype.asyncEach = function(iterator, complete) {
    var list    = this,
        n       = list.length,
        i       = -1,
        calls   = 0,
        looping = false;

    var iterate = function() {
        calls -= 1;
        i += 1;
        if (i === n) return;
        iterator(list[i], resume);
        if (typeof complete !== 'undefined' && complete !== null && n-1 === i) { complete(); } else { //resume();
         }
    };

    var loop = function() {
        if (looping) return;
        looping = true;
        while (calls > 0) iterate();
        looping = false;
    };

    var resume = function() {
        calls += 1;
        if (typeof setTimeout === 'undefined') loop();
        else setTimeout(iterate, 1);
    };
    resume();
};

module.exports = exports = new FxUtility();


