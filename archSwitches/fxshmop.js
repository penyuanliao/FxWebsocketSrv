/**
 * Created by Benson.Liao on 2016/7/19.
 */
/**
 * info ipcs
 * remove ipcrm -m pid
 *
 * **/

// https://github.com/d3m3vilurr/node-shm.git
const shm = require('shm');

function fxshmop(shmkey) {
    if (typeof shmkey == 'number')
        this.shmkey = shmkey;
    else
        this.shmkey = 0x100000ff;

    this.shmid = 0;
    this.shmemSize = 1024 * 1024 * 1024; // 1G
    this.space = 1024 * 1024 * 10;

    this.shmid = this.createSHM(this.shmkey);

}
/***
 * a: read only
 * c: create
 * w: w & r
 * n: create a new mem segment
 * @param key
 */
fxshmop.prototype.createSHM = function (shmkey) {

    var shmid = undefined;

    shmid = shm.openSHM(shmkey, 'w', 0755, this.shmemSize);

    if (shmid == 0)
        shmid = shm.openSHM(shmkey, 'c', 0755, this.shmemSize);

    return shmid;
};
fxshmop.prototype.readSHM = function (index) {
    var start = this.space * index;
    var shmid = this.shmid;
    if (!shmid) {
        shmid = shm.openSHM(this.shmkey, 'w', 0755, this.shmemSize);
        this.shmid = shmid;
    }

    var leng = shm.readSHM(shmid,start,4).readUInt32BE(0);

    var buf = shm.readSHM(shmid,start+4, leng);

    return buf;
};
fxshmop.prototype.writeSHM = function (index, data, offset) {
    var start = this.space * index;
    if (typeof offset != 'number') offset = 0;

    var buf = undefined;
    if (typeof data == 'string') buf = new Buffer(data);
    if (Buffer.isBuffer(data)) buf = data;

    var len = new Buffer(4);
    len.writeUInt32BE(buf.length + offset,0);

    shm.writeSHM(this.shmid, len, start, len.length);
    shm.writeSHM(this.shmid, buf, start + 4 + offset, buf.length);

};
fxshmop.prototype.byteLength = function (index) {
    var start = this.space * index;
    var leng = shm.readSHM(this.shmid,start,4).readUInt32BE(0);

    return leng;
};

fxshmop.prototype.remove = function (shmid) {
    shm.deleteSHM(shmid);
    shm.closeSHM(shmid);
};


module.exports = exports = fxshmop;