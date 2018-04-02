const FPS = {
    "60": 16,
    "30": 33,
    "10": 100
};

function FLVMuxer(delegate) {
    this.delegate   = delegate;
    /** flvHeader, metadata **/
    this.flvHeader  = new Buffer([0x46, 0x4C, 0x56, 0x01, 0x00, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x00]);
    /** NALU Header, AAC Header **/
    this.fileHeader = undefined;
    /** timestamp **/
    this.ts         = 0;
    this.vcount     = 0;
    this.acount     = 0;
    this.hasAudio   = this.delegate.config.audio_support;
    this.hasVideo   = true;
    this.fps        = FPS["10"];
}
/**
 * @param typeID
 * @param [msg]
 * @param [msg.timestamp]
 * @param [msg.streamID]
 * @param [msg.ctrl]
 * @param [msg.type]
 * @param [msg.body]
 */
FLVMuxer.prototype.encode = function (typeID, msg) {
    msg.streamID = 0;
    var packet;
    if (typeID === PacketType.PACKET_TYPE_METADATA) {
        packet = this.metadataEncode(msg);
    } else if (typeID === PacketType.PACKET_TYPE_AUDIO) {
        packet = this.audioEncode(msg);
    } else if (typeID === PacketType.PACKET_TYPE_VIDEO) {
        packet = this.videoEncode(msg);
    }

    if (this.hasAudio == false && typeID === PacketType.PACKET_TYPE_AUDIO) {

    } else {
        this.delegate.emit("onFlvSession", packet);
    }

    return packet;
};
/**
 * video
 * @param [msg]
 * @param [msg.timestamp]
 * @param [msg.streamID]
 * @param [msg.ctrl]
 * @param [msg.type]
 * @param [msg.body]
 */
FLVMuxer.prototype.videoEncode = function (msg) {
    var packet;
    var preTagSize;
    var body      = msg.body;
    var timestamp = msg.timestamp;
    var streamID  = msg.streamID;
    var payload   = undefined;
    if (this.hasAudio == false) timestamp = (this.fps - timestamp);
    this.ts += timestamp;
    timestamp = this.ts;
    packet =  Buffer.alloc(11, 0);
    packet[0] = 0x09;                            // 1bit tagType
    this.writeUInt24BE(packet, body.length, 1);  // 1-3 bit data len
    packet[4] = (timestamp >> 16) & 0xFF;
    packet[5] = (timestamp >> 8) & 0xFF;
    packet[6] = timestamp & 0xFF;
    packet[7] = (timestamp >> 24) & 0xFF;
    this.writeUInt24BE(packet, streamID, 8);            // 8-11 bit StreamID
    preTagSize = Buffer.alloc(4, 0);
    // this.writeUInt24BE(preTagSize, body.length + fileHeader.length, 1);
    preTagSize.writeUInt32BE(body.length + packet.length, 0);
    packet = Buffer.concat([packet, body, preTagSize], body.length + packet.length + preTagSize.length);

    if (this.vcount === 0) {
        payload = (typeof this.fileHeader == "undefined") ? this.flvHeader : this.fileHeader;
        this.fileHeader = Buffer.concat([payload, packet]);
    }

    this.vcount++;
    return packet;
};
/**
 * audio
 * @param [msg]
 * @param [msg.timestamp]
 * @param [msg.streamID]
 * @param [msg.ctrl]
 * @param [msg.type]
 * @param [msg.body]
 */
FLVMuxer.prototype.audioEncode = function (msg) {
    var packet;
    var preTagSize;
    var body      = msg.body;
    var timestamp = msg.timestamp;
    var streamID  = msg.streamID;
    var payload   = undefined;

    this.ts += timestamp;
    timestamp = this.ts;

    packet =  Buffer.alloc(11, 0);               // 1-4bit pre tag size
    packet[0] = 0x08;                            // 5bit tagType
    this.writeUInt24BE(packet, body.length, 1);  // 1-3 bit data len
    packet[4] = (timestamp >> 16) & 0xFF;
    packet[5] = (timestamp >> 8) & 0xFF;
    packet[6] = timestamp & 0xFF;
    packet[7] = (timestamp >> 24) & 0xFF;
    this.writeUInt24BE(packet, streamID, 8);            // 8-11 bit StreamID
    preTagSize = Buffer.alloc(4, 0);
    preTagSize.writeUInt32BE(body.length + packet.length, 0);
    packet = Buffer.concat([packet, body, preTagSize], body.length + packet.length + preTagSize.length);

    if (this.acount === 0) {
        payload = (typeof this.fileHeader == "undefined") ? this.flvHeader : this.fileHeader;
        this.fileHeader = Buffer.concat([payload, packet]);
    }

    this.acount++;

    return packet;
};
/**
 *
 * @param [msg]
 * @param [msg.timestamp]
 * @param [msg.streamID]
 * @param [msg.body]
 */
FLVMuxer.prototype.metadataEncode = function (msg) {

    var packet;
    var preTagSize;
    var body = msg.body;
    var timestamp = msg.timestamp;
    var streamID = msg.streamID;

    if (this.hasAudio === true) this.flvHeader[4] |= 1 << 2;
    if (this.hasVideo === true) this.flvHeader[4] |= 1;

    preTagSize    = Buffer.alloc(4, 0);
    var tagHeader = Buffer.alloc(11, 0);
    tagHeader[0] = 0x12; // 1bit tagType
    this.writeUInt24BE(tagHeader, body.length, 1);  // 2-4 bit DataLength
    tagHeader.writeUInt32BE(timestamp, 4);  // 5-8 bit timestamp
    this.writeUInt24BE(tagHeader, streamID, 9); // 9-11 bit StreamID
    preTagSize.writeUInt32BE(body.length + tagHeader.length, 0);
    packet = Buffer.concat([this.flvHeader, tagHeader, body, preTagSize], this.flvHeader.length + body.length + tagHeader.length + preTagSize.length);
    this.flvHeader = packet;
    return packet;
};
FLVMuxer.prototype.writeUInt24BE = function(buffer,value, offset) {
    buffer[offset + 2] = value & 0xff;
    buffer[offset + 1] = value >> 8;
    buffer[offset] = value >> 16;
};

const PacketType = {
    PACKET_TYPE_NONE : 				0x00,
    PACKET_TYPE_CHUNK_SIZE: 		0x01,
    PACKET_TYPE_BYTES_READ: 		0x03,
    PACKET_TYPE_CONTROL:			0x04,
    PACKET_TYPE_SERVERBW:			0x05,
    PACKET_TYPE_CLIENTBW:			0x06,
    PACKET_TYPE_AUDIO:				0x08,
    PACKET_TYPE_VIDEO:				0x09,
    /*
    PACKET_TYPE_FLEX_STREAM_SEND:	0x0f,
    PACKET_TYPE_FLEX_SHARED_OBJECT:	0x10,
    PACKET_TYPE_FLEX_MESSAGE:		0x11,
    */
    PACKET_TYPE_METADATA:			0x12,
    PACKET_TYPE_SHARED_OBJECT:		0x13,
    PACKET_TYPE_INVOKE:				0x14,
    PACKET_TYPE_FLV:				0x16

};


module.exports = exports = FLVMuxer;