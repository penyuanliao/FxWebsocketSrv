const util = require("util");
const stream = require("stream");
const Readable = stream.Readable;

util.inherits(FxBufferPool, Readable);

/**
 *
 * @param options
 * @constructor FxBufferPool
 * @constructs read
 */
function FxBufferPool(options) {

    this.bufLen = 0;

    Readable.call(this, options);
}

FxBufferPool.prototype._read = function (n) {
    // redundant? see update below
    console.log('read--',n);
};
FxBufferPool.prototype.stoped = function () {
    // this.push(null);
};
FxBufferPool.prototype.push = function (chunk) {
    this.bufLen += chunk.byteLength;
    FxBufferPool.super_.prototype.push.apply(this, arguments);
};

FxBufferPool.prototype.read = function (n) {
    this.bufLen -= n;
    return FxBufferPool.super_.prototype.read.apply(this, arguments);
};
FxBufferPool.prototype.valid = function (n) {
  return this.bufLen >= n;
};
module.exports = exports = FxBufferPool;