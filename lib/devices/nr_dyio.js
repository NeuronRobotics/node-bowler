// jshint esnext: true

var util = require('util');
var bowler_util = require('../util');
var _serialport = require('serialport');
var SerialPort = require('serialport').SerialPort;
var gen_run = require('gen-run');

var bowler_device = require('../bowler_device');
var BowlerDevice = bowler_device.BowlerDevice;

// `dyio.devices.nr_dyio` Namespace
// ================================

var log_data = function (data) {
    dstr = "";
    var chr;
    for (var i = 0; i < bowler_device.BOWLER_HEADER_SIZE; i++) {
       chr = data[i];
       dstr += chr.toString() + ', ';
    }

    for (i = bowler_device.BOWLER_HEADER_SIZE; i < bowler_device.BOWLER_HEADER_SIZE+4; i++) {
       chr = data[i];
       dstr += String.fromCharCode(chr);
    }

    dstr += ', ';

    for (i = bowler_device.BOWLER_HEADER_SIZE+4; i < data.length; i++) {
       chr = data[i];
       if (chr > 32 && chr < 126) {
           dstr += String.fromCharCode(chr);
       } else if (chr == 32) {
           dstr += '[ ]';
       } else {
           dstr += '[ ' + chr.toString() + ' ]';
       }
    }
    return '[ ' + dstr + ' ]';
};

/* DyIO
 * ----
 *
 * Inherits: dyio.bowler_device.BowlerDevice
 * Constructor: function(serial[, opts])
 *
 * This class represents the DyIO device.
 * The constructor takes in a serial port
 * specification, as well as an options
 * object.
 *
 * The serial specification should be one
 * of the following:
 *
 * - a serialport.SerialPort object
 *   (or any object implementing a similar interface)
 * - a string for a serial port path
 * - an object containing options as
 *   would be passed to the constructor
 *   of serialport.SerialPort, with
 *   an additional path option specifying
 *   the path to the serial port
 *
 * Passing a serialport.SerialPort object is not
 * reccomended for normal serial ports, as this class
 * will call the proper function to construct a
 * parser that will split the incoming
 * byte stream into individual packet buffers.
 * If you do wish to pass a serialport.SerialPort,
 * please call the `bowler_serial_parser()` function
 * to generate a function to use as the 'parser'
 * option.
 *
 * The extra `opts` argument is an object that may
 * contain the following options:
 *
 * - introspect_namespaces: *[default: true]* use the `_nms` RPC to get the list of supported namespaces
 * - intropsect_rpcs: *[default: false]* use the RPCS in `bcs.rpc` to populate missing RPC information
 */
var DyIO = function(serial, opts) {
  DyIO.super_.call(this); // call the BowlerDevice constructor

  var serial_port = serial;
  if (serial_port instanceof SerialPort) {
    this._conn = serial_port;
  }
  else {
    var conn_opts = {};
    var conn_path = '';
    if (typeof serial_port == 'string') {
      conn_opts.baud = 115200;
      conn_path = serial_port;
    }
    else {
      conn_path = serial_port.path;
      delete serial_port.path;
      conn_opts = serial_port;
    }

    conn_opts.buffersize = 127;
    conn_opts.parser = bowler_serial_parser();

    this._conn = new SerialPort(conn_path, conn_opts);
  }

  if (!opts) opts = {};
  bowler_util.extend(opts, { introspect_namespaces: true, introspect_rpcs: false });
  this.introspect_namespaces = opts.introspect_namespaces;
  this.introspect_rpcs = opts.introspect_rpcs;

  var self = this;

  this._conn.on('data', function(raw_data) {
    //console.log('received data ' + log_data(raw_data));
    var bowler_packet = this.parse_bowler_data(raw_data);
    var full_packet = this.parse_packet_data(bowler_packet);
    full_packet.bowler_data = bowler_packet;
    var event_name = bowler_packet.method+':'+bowler_packet.namespace+'#'+bowler_packet.rpc;
    this.emit(event_name, full_packet, bowler_packet.method, bowler_packet.namespace, bowler_packet.rpc);
  }.bind(this));

  this._conn.on('error', function (err) {
    throw err;
  });

  this._bat_voltage = null;

  nrdyions = require('../extra_namespaces/neuronrobotics_dyio');
  this.supports_namespace(nrdyions);
};

// a DyIO is a BowlerDevice
util.inherits(DyIO, BowlerDevice);

DyIO.prototype.send_datagram = function(datagram) {
  //console.log('sending data ' + log_data(datagram));
  this._conn.write(datagram);
};

/* ### connect(callback[, heartbeat]) ###
 *
 * This method initiates a connection
 * to the physical DyIO, sending the
 * appropriate initial commands to set
 * up the device (power-on, heartbeat,
 * resync, etc).
 *
 * If a heartbeat interval is not specified,
 * it is assumed to be 3000ms.
 *
 * Then, code from the
 * supplied callback will be called
 * with the current DyIO object as
 * the argument.
 */
DyIO.prototype._connect = function*(cb, heartbeat) {
  console.log('connecting...');
  yield this._conn.open.bind(this._conn);
  console.log('serialport open!');
  // TODO(directxman12): do we need to call connect on the serialport
  //                     if not already open?
  if (heartbeat === null) {
    heartbeat = 3000;
  }
  // TODO: wrap_cb?

  // NB(directxman12): we have to introspect namespaces first,
  //                   otherwise anything outside bcs.core won't work
  if (this.introspect_namespaces) {
    console.log('fetching namespaces...');
    yield this.populate_supported_namespaces.bind(this);
    console.log('fetched namespaces!');
  } else {
    if (Object.keys(this.supported_namespaces).length === 1) {
      throw new Error('If you skip autofetching namespaces, you must add an entry for neuronrobotics.dyio yourself!');
    }
  }

  // power on
  yield this.command_to.neuronrobotics.dyio._pwr.get();
  console.log('power on!');

  if (heartbeat !== undefined && heartbeat !== 0) {
    // start heartbeat
    yield this.command_to.neuronrobotics.dyio.safe.post(true, heartbeat);
    console.log('heartbeat set!');

    // launch heartbeat
    setInterval(this.command_to._png.bind(this), heartbeat);
    console.log('heartbeat sender set!');
  }

  // resync (get voltage with _pwr[get],
  // get firmware with _rev, get info with info[get],
  // get channel modes and mac_address (requires raw resp)
  // with gacm)
  yield this.resync();
  console.log('resynced!');

  // perform reflection...
  /*if (this.introspect_rpcs) {
    this.autopopulate_rpcs();
    console.log('populated rpcs!');
  }
  if (this.introspect_namespaces || this.introspect_rpcs) {
    this.command_handler.repopulate();
    console.log('repopulated command handler!');
  }*/

  console.log('Connection complete!');
  cb.call(this);
};

DyIO.prototype.connect = function(cb, heartbeat) {
  gen_run(this._connect(cb, heartbeat));
};

DyIO.prototype.resync = function(callback) {
  var self = this;
  var res_func = function (cb) {
    self.command_to.neuronrobotics.dyio._pwr.get(function (power_res) {
      self._bat_voltage = { voltage: power_res.voltage, banks: power_res.banks };

      self.command_to.neuronrobotics._rev(function (firmware_res) {
        self.firmware_revision = { dyio: firmware_res.dyio,
                                   bootloader: firmware_res.bootloader };

        self.command_to.neuronrobotics.dyio.info.get(function (info_res) {
          self.info = info_res.info_string;
        });
      });
    });
  };

  if (callback === undefined) return res_func;
  else res_func(callback);
};

/* bowler_serial_parser()
 * ----------------------
 *
 * This method acts a closure around the
 * actual underlying function, which
 * reads in chunks of data (they should
 * be 127 bytes at most so we have room
 * in case of leftovers) and emits them
 * as buffers, where each buffer is a whole
 * Bowler packet.
 */
var bowler_serial_parser = function() {
  var bowler_data = null;
  var incoming_data = new Buffer(255);
  incoming_data.fill(0);
  var curr_ind = 0;
  var amt_left = 0;
  var amt_left_to_read = 0;

  return function(emitter, buffer) {
    console.log('amt left: ' + amt_left + ', curr ind: ' + curr_ind);
    amt_left += buffer.copy(incoming_data, curr_ind);

    // read in as many Bowler packets as possible
    // (where each Bowler packet is read at least up
    //  to the size byte)
    while (amt_left > bowler_device.BOWLER_SIZE_BYTE) {
      if (bowler_data === null) {
        var size = incoming_data.readUInt8(curr_ind+bowler_device.BOWLER_SIZE_BYTE);
        amt_left_to_read = bowler_device.BOWLER_HEADER_SIZE + size;
        bowler_data = new Buffer(amt_left_to_read);
      }

      if (amt_left_to_read > 0 && amt_left > 0) {
        var amt_to_read = amt_left_to_read;
        if (amt_to_read > amt_left) amt_to_read = amt_left;
        // TODO(directxman12): should we check to see how much was read?
        incoming_data.copy(bowler_data, bowler_data.length - amt_left_to_read, curr_ind, curr_ind+amt_to_read);
        amt_left -= amt_to_read;
        curr_ind += amt_to_read;
        amt_left_to_read -= amt_to_read;
      }

      // emit a new Bowler packet if we have read in a full packet's worth,
      // and reset the packet structure
      if (amt_left_to_read === 0 && bowler_data.length > 0) {
        emitter.emit('data', bowler_data);
        bowler_data = null;
      }
    }

    // copy left over data to the beginning of the buffer
    if (amt_left > 0) {
      // this uses memmove, so it's ok if it overlaps
      incoming_data.copy(incoming_data, 0, curr_ind, curr_ind+amt_left);
      curr_ind = amt_left;
    } else {
      curr_ind = 0;
    }
  };
};

module.exports = {
  DyIO: DyIO,
  bowler_serial_parser: bowler_serial_parser
};
