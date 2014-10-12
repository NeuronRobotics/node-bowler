/* jshint node: true, esnext: true */

var packet = require('./packet');
var bowler_util = require('./util');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Q = require('q');
var gen_run = null;  // only load if necessary
var introspection_util = null; // only load if necessary
var CommandHandler = require('./command_handler').CommandHandler;
var BowlerNamespace = require('./extra_namespaces').BowlerNamespace;

// `dyio.bowler` namespace
// =======================

const BOWLER_HEADER_SIZE = 11;  // the size (in bytes) of the Bowler packet header (not including the RPC name)
const BOWLER_VERSION = 3;  // the version of the Bowler protocol implemented by this file
const BOWLER_SIZE_BYTE = 9;  // the byte index in the Bowler header where the packet size is stored

/* BOWLER_CHANNEL_MODES
 * --------------------
 *
 * This constant object maps between
 * the raw byte values and the string
 * human-readable names of the different
 * channel modes in the Bowler protocol.
 */
const BOWLER_CHANNEL_MODES = {
  0x00: 'no_change',
  0x01: 'off',
  0x02: 'digital_in',
  0x03: 'digital_out',
  0x04: 'analog_in',
  0x05: 'analog_out',
  0x06: 'pwm_out',
  0x07: 'servo_out',
  0x08: 'usart_tx',
  0x09: 'usart_rx',
  0x0A: 'spi_mosi',
  0x0B: 'spi_miso',
  0x0C: 'spi_clock',
  0x0D: 'spi_select',
  0x0E: 'count_in_int',
  0x0F: 'count_in_dir',
  0x10: 'count_in_home',
  0x11: 'count_out_int',
  0x12: 'count_out_dir',
  0x13: 'count_in_home',
  0x14: 'dc_motor_vel',
  0x15: 'dc_motor_dir',
  0x16: 'ppm_in'
};

/* BOWLER_METHODS
 * --------------
 *
 * This constant object maps between
 * raw byte values and human readable strings
 * (similar to the HTTP methods) and the
 * raw byte values used in Bowler packets.
 */
const BOWLER_METHODS = {
  0x00: 'status',
  0x10: 'get',
  0x20: 'post',
  0x30: 'critical',
  0x40: 'async'
};

/* BOWLER_METHODS_HR
 * -----------------
 *
 * This constant object maps between
 * human-readable strings and raw byte values
 * for the Bowler methods.  It is the inverse
 * version of `BOWLER_METHODS`.
 */
const BOWLER_METHODS_HR = {
  'status': 0x00,
  'get': 0x10,
  'post': 0x20,
  'critical': 0x30,
  'async': 0x40
};

/* BowlerDevice
 * ------------
 *
 * Inherits: events.EventEmitter
 * Constructor: function()
 *
 * BowlerDevice is the root class for all devices
 * which communicate using the Bowler protocol.
 * It holds basic functionality related to
 * parsing Bowler packets, dispatching events,
 * and building Bowler packets.  It acts as a hub,
 * tying together several other generic bowler-related
 * classes.  Any class inheriting this class must
 * either call this class's constructor, or
 * implement the default values for `_parsers`,
 * `supported_namespaces`, and the function
 * `BOWLER_PACKET_PARSER(src)` itself.
 */
var BowlerDevice = function() {
  /* ### supported_namespaces ###
   *
   * This object contains a map between
   * the indicies of the supported namespaces
   * and their human readable names.  This should
   * be populated with the `populate_supported_namespaces()`
   * methods after it is safe to communicate with
   * the Bowler device.  Note: namespace names should not
   * include the 'com.' part.
   */
  this.supported_namespaces = {
    0x00: 'bcs.core'
  };

  /* ### autobuild_on_first_use = false ###
   *
   * This property determines whether or not
   * we should should attempt use introspection
   * to determine the format of an RPC when
   * and unknown command is encountered.
   * By default this is off, as it requires
   * ECMA Harmony Proxies (both indirect and
   * direct should work).
   */
  this.autobuild_on_first_use = false;

  var self = this;

  this._introspector = null;

  this._mac_address_raw = 'broadcast';

  /* ### _parsers ###
   *
   * This object contains a nested
   * tree of objects containing the parsers
   * for incoming packets.  Each key in this object should
   * be a top-level namespace section (not including the 'com'
   * part). The value for each key should be another object containing
   * sub-namespaces, as well as parser methods with keys of the RPC
   * name string. By default, parsers for methods in the
   * com.bcs.core are included, and thus the `_parsers` variable
   * should not be overwritten unless you implement those parsers
   * yourself.
   */
  this._parsers = {};

  /* ### BOWLER_PACKET_PARSER(src) ###
   *
   * This method takes in a `PacketByteContainer`
   * object and processes it, extracting the
   * generic Bowler packet data.  It returns
   * the extracted data in the form of an object:
   *
   *    {
   *      version: uint,
   *      mac_address: "XX:XX:XX:XX:XX:XX"(string),
   *      method: BOWLER_METHODS(string),
   *      namespace: supported_namespaces(string),
   *      direction: uint(0|1),
   *      size: uint,
   *      crc: unit,
   *      rpc: "xxxx"(string),
   *      data: Buffer(the packet payload)
   *    }
   *
   * See also `BowlerDevice#parse_bowler_data(raw_bytes)`.
   */
  this.BOWLER_PACKET_PARSER = function(src) {
    res = {
      version: src.byte(0).toInt(),
      mac_address: src.bytes(1,6).format(function(raw) {
        res = "";
        for (var i = 0; i < raw.length; i++) res += raw[i].toString(16).toUpperCase();
        return res;
      }),
      method: src.byte(7).lookup_in(BOWLER_METHODS),
      namespace: src.byte(8).masked_with(0x7F).lookup_in(this.supported_namespaces),
      direction: src.byte(8).masked_with(0x01).toInt(),
      size: src.byte(9).toInt(),
      crc: src.byte(10).toInt(),
      rpc: src.bytes(11,14).toRawString(),
    };

    if (res.size > 4) {
      res.data = src.byte(15).to_end().getBuffer();
    } else {
      res.data = null;
    }

    return res;
  };

  this._command_handler = null;

  /* ### _builders ###
   *
   * This object contains a nested
   * tree of objects containing the builders
   * for outgoing packets.  Each key in this object should
   * be a top-level namespace section (not including the 'com'
   * part). The value for each key should be another object containing
   * sub-namespaces, as well as builder methods with keys of the RPC
   * name string. By default, parsers for methods in the
   * com.bcs.core are included, and thus the `_builders` variable
   * should not be overwritten unless you implement those parsers
   * yourself.
   */
  this._builders = {};

  /* ### _rpc_send_methods ###
   *
   * This object contains a nested tree of objects
   * containing the methods ('get', 'post', etc.) for
   * the outgoing packets for the various RPCs.  Similarly
   * to `_builders` and `_parsers`, each key in the object
   * should be a top-level namespace section (not including
   * the 'com' part).  The value for each key should be
   * another object containing subnamespaces as well as
   * methods for the various RPCs with keys of the RPC
   * name.  By default, method listings for each of the
   * default builders are provided, and thus the
   * `_rpc_send_methods` field should not be overwritten
   * unless you specify those method listings yourself.
   */
  this._rpc_send_methods = {};

  /* ### _rpc_recv_methods ###
   *
   * This object is similar to `_rpc_send_methods`,
   * except it contains the methods for received
   * packets instead.  Like the aforementioned
   * property, it consists of a nested tree of
   * objects representing namespaces.
   *
   * Unlike the aforementioned object, instead
   * of the values for RPCs being strings,
   * they are instead object which map
   * send methods (as the keys) to receive
   * methods (as the values).
   */
  this._rpc_recv_methods = {};

  this.supports_namespace(require('./extra_namespaces/bcs_core'));
  this.supports_namespace(require('./extra_namespaces/bcs_rpc'));
};

// TODO(directxman12): add note about how builder and parser functions should be structured

/* `BowlerDevice` emits lower-level Bowler
 * events, representing the various RPCs.
 * The event names take the form of
 * 'method:namespace#rpc'.  The callbacks
 * should take the form of
 * `function(formatted_packet, method, namespace, rpc)`.
 */
util.inherits(BowlerDevice, EventEmitter);

/* ### parse_packet_data(base_packet) ###
 *
 * This method takes in a partially formatted
 * Bowler packet (i.e. generic Bowler data has been
 * extracted, but packet-type-specific data has not).
 * It then dispatches to the specific parsing functions
 * to extra relevant data.  Parsing functions should be
 * stored in the `_parsers` variable inside classes
 * which use this method.The fully formatted packet object
 * is then returned, or Error if an error occurs.
 *
 * See also `parse_bowler_data(raw_bytes)`.
 */
BowlerDevice.prototype.parse_packet_data = function(base_packet) {
  if (!base_packet.namespace) {
    throw new Error('Received packet from unknown namespace!');
  }
  var namespace_list = base_packet.namespace.split('.');
  var parser = bowler_util.resolve_namespace_path(base_packet.namespace, base_packet.rpc, this._parsers, 'Error finding packet parser');

  var container = new packet.PacketByteContainer(base_packet.data);
  if (!(parser instanceof Function)) {
    // we have a multi-type RPC
    parser = parser[base_packet.method];
    if (!parser) throw new Error('Could not find a parser for the ' + base_packet.method + ' method for the RPC ' + base_packet.namespace + '#' + base_packet.rpc);
  }
  return parser(container);
};

/* ### parse_bowler_data(raw_bytes) ###
 *
 * This method takes in a `Buffer` of raw
 * bytes, and extracts generic Bowler packet
 * data, returning it as an object.
 *
 * See also `BOWLER_PACKET_PARSER(src)`.
 */
BowlerDevice.prototype.parse_bowler_data = function(raw_bytes) {
  var container = new packet.PacketByteContainer(raw_bytes);
  return this.BOWLER_PACKET_PARSER(container);
};

/* ### populate_supported_namespaces(callback) ###
 *
 * This method uses Bowler introspection to populate
 * the supported namespaces list.  It only looks at the
 * namespaces, and not the methods therein.  Support for
 * the Bowler introspection-style namespace listing is required.
 * This method should be called after the device has been properly
 * initialized (i.e. in your connect method, right before user commands
 * are sent), and requires support for the Bowler Introspection
 * namespace (bcs.core.rpc). It accepts a callback which is called in
 * case of error, or when the method has finished.
 *
 * callback: function(err)
 */
BowlerDevice.prototype.populate_supported_namespaces = function(cb) {
  if (!gen_run) {
    gen_run = require('gen-run');
    introspection_util = require('./util/introspection');
    this._introspector = new introspection_util.BowlerIntrospector(this);
  }

  var self = this;

  gen_run(this._introspector.namespaces(function (err, ns_info, ns_ind, num_ns) {
    if (err) {
      cb(err);
      return; // if we are called with an error, the callback will not be called again
    }

    self.supported_namespaces[ns_ind] = ns_info.name;

    if (ns_ind === num_ns-1) cb(null); // we're done
  }));
};

/* ### build_packet(method, namespace, rpc, ...args) ###
 *
 * This method builds a Bowler packet with the specified method,
 * namespace, and RPC.  All arguments should take string forms;
 * namespace and method will be converted into their Bowler-protocol
 * equivalents automatically.  Any additional arguments will be passed
 * to the builder for the given namespace and RPC.  A byte Buffer is returned
 * with the contents of the packet, ready to send.
 */
BowlerDevice.prototype.build_packet = function (method, namespace, command/*, ...args*/) {
  var builder = new packet.PacketAssembler();

  namespace = namespace || 'bcs.core';
  method = method || 'get';

  // build the prefix
  builder.byte(0).fromInt(BOWLER_VERSION); // protocol version
  builder.bytes(1, 6).fromRawUInt8Array(this.mac_address_bytes); // mac address
  builder.byte(7).fromInt(BOWLER_METHODS_HR[method]); // RPC method
  builder.byte(8).fromInt(this.supported_namespaces_hr[namespace]); // namespace id
  // the length of the packet (name + body) goes at byte 9

  // run the builder now so we can calculate the size of body
  var body_builder = bowler_util.resolve_namespace_path(namespace, command,
                                                        this._builders,
                                                        'Error finding packet builder');
  if (!(body_builder instanceof Function)) {
    // we have a multi-type RPC
    body_builder = body_builder[method];
    if (!body_builder) throw new Error('Could not find builder for the ' + method + ' method for the RPC ' + namespace + '#' + command);
  }

  var body_assembler = new packet.PacketAssembler(BOWLER_HEADER_SIZE+4); // should start at byte BOWLER_HEADER_SIZE

  // apply the body builder with any extra arguments from this method
  var builder_args = [body_assembler];
  builder_args = builder_args.concat(
      Array.prototype.slice.call(arguments, BowlerDevice.prototype.build_packet.length));
  body_builder.apply(this, builder_args);

  builder.byte(9).fromInt(body_assembler.length+4);

  var checksum = bowler_util.make_checksum(builder.assemble()); // the checksum should be based on bytes 0 - 9 (inclusive)
  builder.byte(10).fromInt(checksum);

  // add the RPC name
  builder.bytes(BOWLER_HEADER_SIZE, BOWLER_HEADER_SIZE+3).fromString(command);

  // add the main part of the body
  builder.append(body_assembler);

  return builder.assemble();
};

/* ### autopopulate_rpcs(callback) ###
 *
 * This method will use Bowler introspection to populate
 * the _builders and _parsers objects with supported
 * RPCs.  The method will not overwrite existing builders
 * and parsers.  Note that this method must be called after
 * the device has been initialized, and requires support
 * for the Bowler Introspection namespace (bcs.core.rpc).
 *
 * The callback is call when all RPCs have been populated,
 * or if there an error occurs.
 *
 * callback: function (err)
 */
BowlerDevice.prototype.autopopulate_rpcs = function (cb) {
  // check for support
  if (!('bcs.core.rpc' in this.supported_namespaces_hr)) {
    console.warn('The bcs.core.rpc namespace is not present, cannot introspect for RPCs');
    cb(new Error('Cannot perform autopopulation without support for introspection (the bcs.core.rpc namespace)'));
  }

  if (!gen_run) {
    gen_run = require('gen-run');
    introspection_util = require('./util/introspection');
    this._introspector = new introspection_util.BowlerIntrospector(this);
  }

  var self = this;

  gen_run(this._introspector.rpcs_in_namespaces(
      Object.keys(this.supported_namespaces_hr),
      function (err, rpc_info, rpc_ind, num_rpcs, ns_ind, num_ns) {
        if (err) {
          cb(err);
          return; // if we were called with the err, we don't need to worry about being called again
        }

        var recv_method_ns = bowler_util.resolve_namespace_path(rpc_info.namespace, null, self._rpc_recv_methods, 'Error resolving the receive method namespace');

        var parser_ns = bowler_util.resolve_namespace_path(rpc_info.namespace, null, self._parsers, 'Error resolving the parser namespace');
        if (!parser_ns[rpc_info.name] || !recv_method_ns[rpc_info.name][rpc_info.send.method]) {  // TODO: can an RPC have a send method that has more than one recv method?
          var recv_info = rpc_info.recv;
          var parser_func = function (src) {
            var buff = src.getBuffer();
            var res = { as_array: [] };
            var curr_start = 0;
            var type_counts = {};
            for (var i = 0; i < recv_info.args.length; i++) {
              var arg = recv_info.args[i];
              type_counts[arg] = type_counts[arg] + 1 || 0;
              var parsed = packet.data_types[arg].deserialize(buff, curr_start);

              if (Array.isArray(parsed)) {
                curr_start += parsed[1];
                parsed = parsed[0];
              }
              else {
                curr_start += packet.data_types[arg].width;
              }

              res.as_array.push(parsed);
              res[arg+'_'+type_counts[arg]] = parsed;
            }

            return res;
          };

          if (!parser_ns[rpc_info.name]) {
            parser_ns[rpc_info.name] = parser_func;
          }
          else {
            if (parser_ns[rpc_info.name] instanceof Function) {
              // we need to remake it as an object
              var old_parser_func = parser_ns[rpc_info.name];
              parser_ns[rpc_info.name] = { is_rpc: true };
              var recv_methods = recv_method_ns[rpc_info.name];
              var old_recv_method = recv_methods[Object.keys(recv_methods)[0]];
              parser_ns[rpc_info.name][old_recv_method] = old_parser_func;
            }

            parser_ns[rpc_info.name][rpc_info.recv.method] = parser_func;
          }
        }

        var send_method_ns = bowler_util.resolve_namespace_path(rpc_info.namespace, null, self._rpc_send_methods, 'Error resolving the send method namespace');

        var builder_ns = bowler_util.resolve_namespace_path(rpc_info.namespace, null, self._builders, 'Error resolving the builder namespace');
        if (!builder_ns[rpc_info.name] || (!Array.isArray(send_method_ns[rpc_info.name]) && send_method_ns[rpc_info.name] != rpc_info.send.method) || (Array.isArray(send_method_ns[rpc_info.name]) && send_method_ns[rpc_info.name].indexOf(rpc_info.send_method) < 0)) {
          var send_info = rpc_info.send;

          var make_bldr_func = function (ind) {
            return function (byte_rang) {
              return packet.data_types[send_info.args[ind]].serialize;
            };
          };

          var bldr_func = function (bldr/*, ...args*/) {
            var args = Array.prototype.slice.call(arguments, 1);
            var curr_start = 0;
            for (var i = 0; i < send_info.args.length; i++) {
              var data_type = packet.data_types[send_info.args[i]];
              var len = data_type.width || data_type.get_width(args[i]);
              bldr.bytes(curr_start, curr_start + len - 1).fromRawFunc(make_bldr_func(i), args[i]);
              curr_start += len;
            }
          };

          if (!builder_ns[rpc_info.name]) {
            builder_ns[rpc_info.name] = builder_func;
          }
          else {
            if (builder_ns[rpc_info.name] instanceof Function) {
              // we need to remake it as an object
              var old_builder_func = builder_ns[rpc_info.name];
              builder_ns[rpc_info.name] = { is_rpc: true };
              var old_send_method = send_method_ns[rpc_info.name];
              builder_ns[rpc_info.name][old_send_method] = old_builder_func;
            }

            builder_ns[rpc_info.name][rpc_info.send.method] = bldr_func;
          }
        }

        if (!send_method_ns[rpc_info.name]) {
          send_method_ns[rpc_info.name] = rpc_info.send.method;
        }
        else if (!Array.isArray(send_method_ns[rpc_info.name]) && send_method_ns[rpc_info.name] != rpc_info.send.method) {
          send_method_ns[rpc_info.name] = [send_method_ns[rpc_info.name], rpc_info.send.method];
        }
        else if (Array.isArray(send_method_ns[rpc_info.name]) && send_method_ns[rpc_info.name].indexOf(rpc_info.send.method) < 0) {
          send_method_ns[rpc_info.name].push(rpc_info.send.method);
        }

        if (!recv_method_ns[rpc_info.name]) {
          recv_method_ns[rpc_info.name] = {};
        }

        if (!recv_method_ns[rpc_info.name][rpc_info.send.method]) {
          recv_method_ns[rpc_info.name][rpc_info.send.method] = rpc_info.recv.method;
        }

        if (rpc_ind === num_rpcs-1 && ns_ind === num_ns-1) {
          cb(null); // we are done
        }
      }
  ));
};

/* ### supports_namespace(namespace) ###
 *
 * This method can be used by subclasses
 * of BowlerDevices if they wish to manually
 * specify parsers, builders, and send methods
 * for a namespace they support.
 *
 * The namespace parameter should be either
 * a namespace name in dot notation (without the
 * 'com' part), in which case it will be loaded
 * from under 'dyio/extra_namespaces/', or an
 * instance of a subclass of
 * `dyio.extra_namespaces.BowlerNamespace`.
 */
BowlerDevice.prototype.supports_namespace = function (ns) {
  if (!(ns instanceof BowlerNamespace)) {
    var ns_path = 'dyio/extra_namespaces/' + ns_name.split('.').join('/');
    ns = require(ns_path);
  }
  ns.import_into(this);
};

var BowlerDeviceProperties = {
  'command_to': {
    enumerable: true,
    configurable: false,
    get: function() { return this.command_handler; }
  },

  'command_handler': {
    enumerable: true,
    configurable: false,
    get: function() {
      if (!this._command_handler) {
        // TODO(directxman12): implement DynamicCommandHandler
        /*if (this.autobuild_on_first_use)
          this._command_handler = new DynamicCommandHandler(this);
        else*/
          this._command_handler = new CommandHandler(this);
      }
      return this._command_handler;
    }
  },

  'supported_namespaces_hr': {
    enumerable: true,
    configurable: false,
    get: function () {
      var supported_namespaces_hr = {};
      for (var nsid in this.supported_namespaces) {
        supported_namespaces_hr[this.supported_namespaces[nsid]] = nsid;
      }
      return supported_namespaces_hr;
    }
  },

  /* ### mac_address/mac_address_bytes ###
   *
   * This property gets or sets the target
   * MAC address for this BowlerDevice.  The
   * `mac_address` version will return either
   * the string 'broadcast' (the default value,
   * may be set as either 'broadcast' or 'FF:FF:FF:FF:FF:FF'),
   * or a ':'-separated string version of
   * the MAC address.  The `mac_address_bytes`
   * version will always return an array form
   * of the MAC address with six elements (one
   * for each byte).
   */
  'mac_address': {
    enumerable: true,
    configurable: false,
    get: function () {
      if (!this._mac_address_raw) {
        this._mac_address_raw = 'broadcast';
      }

      if (this._mac_address_raw != 'broadcast') {
        return this._mac_address_raw.map(function(b) { return b.toString(16).toUpperCase(); }).join(':');
      }
      else {
        return this._mac_address_raw;
      }
    },
    set: function (val) {
      if (val != 'broadcast' && val.toLowerCase() != 'ff:ff:ff:ff:ff:ff') {
        this._mac_address_raw = val.spli(':').map(function(b) { return parseInt(b, 16); });
      }
      else {
        this._mac_address_raw = 'broadcast';
      }
    }
  },

  'mac_address_bytes': {
    enumerable: true,
    configurable: false,
    get: function () {
      if (!this._mac_address_raw) {
        this._mac_address_raw = 'broadcast';
      }

      if (this._mac_address_raw == 'broadcast') {
        //return [255, 255, 255, 255, 255, 255];
        // use link-local instead
        return [0, 0, 0, 0, 0, 0];
      }
      else {
        return this._mac_address_raw;
      }
    },
    set: function (val) {
      var equals_broadcast = true;
      for (var i = 0; i < 6; i++) {
        if (val[i] != 255) {
          equals_broadcast = false;
          break;
        }
      }
      if (equals_broadcast) {
        this._mac_address_raw = 'broadcast';
      }
      else {
        this._mac_address_raw = val;
      }
    }
  }
};

for (var prop in BowlerDeviceProperties) {
  Object.defineProperty(BowlerDevice.prototype, prop, BowlerDeviceProperties[prop]);
}

module.exports = {
  BOWLER_HEADER_SIZE: BOWLER_HEADER_SIZE,
  BOWLER_VERSION: BOWLER_VERSION,
  BOWLER_SIZE_BYTE: BOWLER_SIZE_BYTE,
  BOWLER_CHANNEL_MODES: BOWLER_CHANNEL_MODES,
  BOWLER_METHODS: BOWLER_METHODS,
  BOWLER_METHODS_HR: BOWLER_METHODS_HR,
  BowlerDevice: BowlerDevice
};
